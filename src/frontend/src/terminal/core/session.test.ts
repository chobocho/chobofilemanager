import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {FakeTerminal} from '../test/fakeTerminal';
import {setTermBackend} from './termApi';
import {TermSession, decodeTermData, startEventRouter, stopEventRouter, sessionById} from './session';

// ─── Todo #119: terminal session core (ported from choboTerm tabs.ts / connection.ts) ───

type Handler = (...args: any[]) => void;

function backend() {
    const handlers = new Map<string, Handler>();
    const api = {
        Connect: vi.fn().mockResolvedValue('ssh'),
        Send: vi.fn().mockResolvedValue(undefined),
        Resize: vi.fn().mockResolvedValue(undefined),
        CloseTab: vi.fn().mockResolvedValue(undefined),
        Disconnect: vi.fn().mockResolvedValue(undefined),
        TabTheme: vi.fn().mockResolvedValue(''),
        SetEncoding: vi.fn().mockResolvedValue(undefined),
    };
    const runtime = {
        EventsOn: vi.fn((name: string, cb: Handler) => {
            handlers.set(name, cb);
            return () => handlers.delete(name);
        }),
        ClipboardSetText: vi.fn().mockResolvedValue(true),
        ClipboardGetText: vi.fn().mockResolvedValue(''),
        BrowserOpenURL: vi.fn(),
    };
    setTermBackend(api as any, runtime as any);
    const emit = (name: string, ...args: any[]) => handlers.get(name)?.(...args);
    return {api, runtime, emit, handlers};
}

let fake: FakeTerminal;
function newSession(id = 1) {
    const s = new TermSession(id, {createTerminal: opts => (fake = new FakeTerminal(opts)) as any, addons: false});
    s.open(document.createElement('div'));
    return s;
}

const b64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));

describe('decodeTermData (TS)', () => {
    it('TS-01: base64 문자열을 원래 바이트로 (0x00, 0xFF, 한글 UTF-8 포함)', () => {
        const bytes = [0, 0x41, 0xff, 0xed, 0x95, 0x9c];
        expect(Array.from(decodeTermData(b64(bytes)))).toEqual(bytes);
    });
    it('TS-02: Uint8Array는 그대로 (웹 모드)', () => {
        const u = new Uint8Array([1, 2, 3]);
        expect(decodeTermData(u)).toBe(u);
    });
});

describe('TermSession (TS)', () => {
    let be: ReturnType<typeof backend>;
    beforeEach(() => {
        be = backend();
        startEventRouter();
    });
    afterEach(() => {
        stopEventRouter();
        setTermBackend(null);
    });

    it('TS-10: 연결 전에는 입력을 보내지 않음, 연결 후 Send', async () => {
        const s = newSession();
        fake.type('ls\r');
        expect(be.api.Send).not.toHaveBeenCalled();
        await s.connect({host: 'h', port: 22, login: 'u', pass: '', encoding: '', jump: ''});
        expect(s.state).toBe('on');
        fake.type('ls\r');
        await vi.waitFor(() => expect(be.api.Send).toHaveBeenCalledWith(1, 'ls\r'));
    });

    it('TS-11: Connect 요청에 현재 터미널 크기가 들어감', async () => {
        const s = newSession();
        fake.resize(120, 40);
        await s.connect({host: 'h', port: 22, login: '', pass: '', encoding: '', jump: ''});
        expect(be.api.Connect).toHaveBeenCalledWith(1, expect.objectContaining({cols: 120, rows: 40}));
    });

    it('TS-12: 입력 순서 보장 — 보내는 중 들어온 입력은 다음 Send로 합쳐짐', async () => {
        const s = newSession();
        await s.connect({host: 'h', port: 22, login: '', pass: '', encoding: '', jump: ''});
        let release!: () => void;
        be.api.Send.mockImplementationOnce(() => new Promise<void>(r => (release = r)));
        fake.type('a');
        fake.type('b');
        fake.type('c');
        expect(be.api.Send).toHaveBeenCalledTimes(1);
        expect(be.api.Send).toHaveBeenLastCalledWith(1, 'a');
        release();
        await vi.waitFor(() => expect(be.api.Send).toHaveBeenCalledTimes(2));
        expect(be.api.Send).toHaveBeenLastCalledWith(1, 'bc');
    });

    it('TS-13: Send 실패해도 이후 입력은 계속 보냄', async () => {
        const s = newSession();
        await s.connect({host: 'h', port: 22, login: '', pass: '', encoding: '', jump: ''});
        be.api.Send.mockRejectedValueOnce(new Error('gone'));
        fake.type('x');
        await vi.waitFor(() => expect(be.api.Send).toHaveBeenCalledTimes(1));
        await new Promise(r => setTimeout(r, 0));
        fake.type('y');
        await vi.waitFor(() => expect(be.api.Send).toHaveBeenLastCalledWith(1, 'y'));
    });

    it('TS-14: term:data는 해당 탭에만 기록, 다른 탭은 무시', async () => {
        const s1 = newSession(1);
        const f1 = fake;
        const s2 = newSession(2);
        const f2 = fake;
        be.emit('term:data', 2, b64([0x68, 0x69]));
        expect(f2.text()).toBe('hi');
        expect(f1.text()).toBe('');
        be.emit('term:data', 99, b64([0x7a])); // 없는 탭
        s1.dispose();
        s2.dispose();
    });

    it('TS-15: term:open은 화면을 한 번만 지움 (세션 첫 출력보다 늦게 와도 출력은 유지)', async () => {
        const s = newSession();
        const p = s.connect({host: 'h', port: 22, login: '', pass: '', encoding: 'EUC-KR', jump: ''});
        be.emit('term:open', 1, 'EUC-KR');
        be.emit('term:data', 1, b64([0x41]));
        await p;
        expect(fake.resets).toBe(1);
        expect(fake.text()).toBe('A');
        expect(s.encoding).toBe('EUC-KR');
    });

    it('TS-16: 로컬 셸은 UTF-8, FTP는 ftp 상태', async () => {
        be.api.Connect.mockResolvedValueOnce('local');
        const s = newSession();
        await s.connect({host: 'cmd', port: 0, login: '', pass: '', encoding: 'EUC-KR', jump: ''});
        expect(s.encoding).toBe('UTF-8');
        expect(s.proto).toBe('local');
        be.api.Connect.mockResolvedValueOnce('ftp');
        const f = newSession(2);
        await f.connect({host: 'ftp.x', port: 21, login: '', pass: '', encoding: '', jump: ''});
        expect(f.state).toBe('ftp');
    });

    it('TS-17: 연결 실패 시 idle로 되돌리고 예외 전파', async () => {
        be.api.Connect.mockRejectedValueOnce(new Error('refused'));
        const s = newSession();
        await expect(s.connect({host: 'h', port: 22, login: '', pass: '', encoding: '', jump: ''})).rejects.toThrow('refused');
        expect(s.state).toBe('idle');
    });

    it('TS-18: 연결 중 크기 변경은 Resize, 연결 전에는 보내지 않음', async () => {
        const s = newSession();
        fake.resize(100, 30);
        expect(be.api.Resize).not.toHaveBeenCalled();
        await s.connect({host: 'h', port: 22, login: '', pass: '', encoding: '', jump: ''});
        fake.resize(90, 20);
        expect(be.api.Resize).toHaveBeenCalledWith(1, 90, 20);
    });

    it('TS-19: term:closed → idle, 메시지 표시, 리스너에 lost 전달', async () => {
        const s = newSession();
        const closed = vi.fn();
        s.onClosed(closed);
        await s.connect({host: 'h', port: 22, login: '', pass: '', encoding: '', jump: ''});
        be.emit('term:closed', 1, '연결이 끊어졌습니다', true);
        expect(s.state).toBe('idle');
        expect(closed).toHaveBeenCalledWith('연결이 끊어졌습니다', true);
    });

    it('TS-20: OSC 52는 클립보드에 쓰기만 (읽기 요청 ? 는 무시)', () => {
        newSession();
        // OSC 52 payload: base64 of the UTF-8 bytes
        fake.osc(52, 'c;' + btoa(String.fromCharCode(...new TextEncoder().encode('복사됨'))));
        expect(be.runtime.ClipboardSetText).toHaveBeenCalledWith('복사됨');
        fake.osc(52, 'c;?');
        expect(be.runtime.ClipboardSetText).toHaveBeenCalledTimes(1);
    });

    it('TS-21: OSC 7로 셸의 현재 폴더 추적 (퍼센트 인코딩 해제)', () => {
        const s = newSession();
        fake.osc(7, 'file://host/home/u/my%20dir');
        expect(s.cwd).toBe('/home/u/my dir');
    });

    it('TS-22: 제목 변경 추적', () => {
        const s = newSession();
        const titled = vi.fn();
        s.onTitle(titled);
        fake.setTitle('vim a.txt');
        expect(s.title).toBe('vim a.txt');
        expect(titled).toHaveBeenCalledWith('vim a.txt');
    });

    it('TS-23: close는 CloseTab + 터미널 폐기 + 라우팅 해제', async () => {
        const s = newSession(5);
        expect(sessionById(5)).toBe(s);
        await s.close();
        expect(be.api.CloseTab).toHaveBeenCalledWith(5);
        expect(fake.disposed).toBe(true);
        expect(sessionById(5)).toBeUndefined();
    });

    it('TS-24: 연결 중 탭이 닫히면 열린 연결을 정리하고 오류', async () => {
        let resolve!: (p: string) => void;
        be.api.Connect.mockImplementationOnce(() => new Promise<string>(r => (resolve = r)));
        const s = newSession(7);
        const p = s.connect({host: 'h', port: 22, login: '', pass: '', encoding: '', jump: ''});
        s.dispose();
        resolve('ssh');
        await expect(p).rejects.toThrow();
        expect(be.api.CloseTab).toHaveBeenCalledWith(7);
    });

    it('TS-25: 상태 변경 알림', async () => {
        const s = newSession();
        const states: string[] = [];
        s.onState(st => states.push(st));
        await s.connect({host: 'h', port: 22, login: '', pass: '', encoding: '', jump: ''});
        expect(states).toEqual(['connecting', 'on']);
    });
});

describe('TermSession + 실제 xterm (TS)', () => {
    it('TS-30: 실제 Terminal에 애드온(fit/web-links/search/CJK 폭) 로드 — jsdom에서도 예외 없음', async () => {
        const {Terminal} = await import('@xterm/xterm');
        setTermBackend({} as any, {EventsOn: () => () => {}} as any);
        const s = new TermSession(41, {createTerminal: o => new Terminal(o), addons: true});
        const el = document.createElement('div');
        document.body.appendChild(el);
        s.open(el);
        await vi.waitFor(() => expect(s.term.unicode.versions).toContain('11-cjk'));
        expect(el.querySelector('.xterm')).toBeTruthy();
        s.dispose();
        el.remove();
        setTermBackend(null);
    });
});
