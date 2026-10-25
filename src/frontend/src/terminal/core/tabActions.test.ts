import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {FakeTerminal} from '../test/fakeTerminal';
import {setTermBackend} from './termApi';
import {TermSession} from './session';
import {Reconnector} from './reconnect';
import {applyEncoding, applyLook, toggleEncoding, chooseTheme, loadTabTheme, sendBreak, disconnectSession, applySettingsAll} from './tabActions';
import {tabMenuItems} from './tabMenu';
import {resetSettingsForTest, settings} from './settings';
import {themeByName} from './themes';
import {WIDE, NARROW} from './cjkwidth';

// ─── Todo #121: 탭 동작 (인코딩, 테마, Break, 연결 끊기) + 탭 메뉴 항목 ───

let api: any, fake: FakeTerminal;
function session(proto = 'ssh') {
    api.Connect.mockResolvedValueOnce(proto);
    const s = new TermSession(1, {createTerminal: o => (fake = new FakeTerminal(o)) as any, addons: false});
    (fake.unicode as any).versions = [NARROW, WIDE];
    s.open(document.createElement('div'));
    return s;
}
const req = {host: 'h', port: 22, login: 'u', pass: '', encoding: 'UTF-8', jump: ''};

describe('tabActions (TA)', () => {
    beforeEach(() => {
        resetSettingsForTest();
        api = {
            Connect: vi.fn(), Send: vi.fn().mockResolvedValue(undefined), Resize: vi.fn(), CloseTab: vi.fn(),
            SetEncoding: vi.fn((_id: number, e: string) => Promise.resolve(e)),
            SetTabTheme: vi.fn().mockResolvedValue(true), TabTheme: vi.fn().mockResolvedValue('dracula'),
            SendBreak: vi.fn().mockResolvedValue(undefined), Disconnect: vi.fn().mockResolvedValue(undefined),
        };
        setTermBackend(api, {EventsOn: () => () => {}} as any);
    });
    afterEach(() => setTermBackend(null));

    it('TA-01: EUC-KR은 넓은 폭(모호 폭 2칸)과 EUC-KR 글꼴, UTF-8은 좁은 폭', () => {
        const s = session();
        applyEncoding(s, 'EUC-KR');
        expect(s.encoding).toBe('EUC-KR');
        expect(fake.unicode.activeVersion).toBe(WIDE);
        expect(String(fake.options.fontFamily)).toContain(settings.fontEucKr);
        applyEncoding(s, 'UTF-8');
        expect(fake.unicode.activeVersion).toBe(NARROW);
    });

    it('TA-02: 인코딩 전환 — Go에 바꾸고, 다음 재접속에도 유지, 안내 출력', async () => {
        const s = session();
        await s.connect({...req});
        await toggleEncoding(s);
        expect(api.SetEncoding).toHaveBeenCalledWith(1, 'EUC-KR');
        expect(s.encoding).toBe('EUC-KR');
        expect(s.req?.encoding).toBe('EUC-KR');
        expect(fake.text()).toContain('인코딩: EUC-KR');
    });

    it('TA-03: 로컬 셸은 UTF-8 고정 — 전환 안 함', async () => {
        const s = session('local');
        await s.connect({...req, host: 'cmd', port: 0});
        await toggleEncoding(s);
        expect(api.SetEncoding).not.toHaveBeenCalled();
        expect(fake.text()).toContain('로컬 셸은 UTF-8만 씁니다');
    });

    it('TA-04: 테마 — 서버별로 저장(SetTabTheme), 빈 이름은 설정의 기본 테마', async () => {
        const s = session();
        await chooseTheme(s, 'dracula');
        expect(api.SetTabTheme).toHaveBeenCalledWith(1, 'dracula');
        expect(fake.options.theme).toEqual(themeByName('dracula').theme);
        await chooseTheme(s, '');
        expect(fake.options.theme).toEqual(themeByName(settings.theme).theme);
    });

    it('TA-05: 연결 후 이 서버에 저장된 테마 적용', async () => {
        const s = session();
        await s.connect({...req});
        await loadTabTheme(s);
        expect(s.theme).toBe('dracula');
        expect(fake.options.theme).toEqual(themeByName('dracula').theme);
    });

    it('TA-06: Break 신호 (시리얼)', async () => {
        const s = session('serial');
        await sendBreak(s);
        expect(api.SendBreak).toHaveBeenCalledWith(1);
        expect(fake.text()).toContain('Break 신호를 보냈습니다');
    });

    it('TA-07: 연결 끊기 — 예약된 재접속 취소, Disconnect, idle, 안내', async () => {
        const s = session();
        await s.connect({...req});
        const rc = new Reconnector(s, {autoReconnect: () => true});
        s.handleClosed('끊김', true);
        s['setState']('on'); // 재접속이 붙은 상태를 흉내
        await disconnectSession(s, rc);
        expect(rc.retrying).toBe(false);
        expect(api.Disconnect).toHaveBeenCalledWith(1);
        expect(s.state).toBe('idle');
        expect(fake.text()).toContain('[연결을 끊었습니다] Enter: 다시 접속');
    });

    it('TA-08: applyLook — 글꼴 크기/커서/스크롤백 설정 반영', () => {
        const s = session();
        settings.fontSize = 19;
        settings.scrollback = 1234;
        applyLook(s);
        expect(fake.options.fontSize).toBe(19);
        expect(fake.options.scrollback).toBe(1234);
    });

    it('TA-09: 설정 확인 후 — 모든 탭에 모양 적용, 강조 다시 계산', () => {
        const s = session();
        const hl = {schedule: vi.fn(), reset: vi.fn()};
        s.highlighter = hl;
        settings.fontSize = 22;
        applySettingsAll([s]);
        expect(fake.options.fontSize).toBe(22);
        expect(hl.reset).toHaveBeenCalled();
    });

    it('TA-10: 출력을 그린 뒤 강조 예약', () => {
        const s = session();
        const hl = {schedule: vi.fn(), reset: vi.fn()};
        s.highlighter = hl;
        s.receive(btoa('error here')); // term:data는 base64
        expect(hl.schedule).toHaveBeenCalled();
    });
});

describe('tabMenuItems (TA)', () => {
    const acts = (items: {act: string; hidden?: boolean}[]) => items.filter(i => !i.hidden).map(i => i.act);

    it('TA-20: 연결된 SSH 탭 메뉴', () => {
        const items = tabMenuItems({state: 'on', proto: 'ssh', hasReq: true, encoding: 'UTF-8'}, 1);
        expect(acts(items)).toEqual(['reconnect', 'duplicate', 'splitRight', 'splitDown', 'theme', 'files', 'encoding', 'memo', 'log', 'logs', 'saveSession', 'disconnect', 'sep', 'close']);
        expect(items.find(i => i.act === 'encoding')!.label).toBe('인코딩: EUC-KR로 전환');
        expect(items.find(i => i.act === 'close')!.label).toBe('탭 닫기');
    });

    it('TA-21: 연결 안 됨 — 다시 연결/복제는 이전 연결이 있을 때만, 끊기 비활성', () => {
        const fresh = tabMenuItems({state: 'idle', proto: '', hasReq: false, encoding: 'UTF-8'}, 1);
        expect(fresh.find(i => i.act === 'reconnect')!.disabled).toBe(true);
        expect(fresh.find(i => i.act === 'duplicate')!.disabled).toBe(true);
        expect(fresh.find(i => i.act === 'disconnect')!.disabled).toBe(true);
        expect(fresh.find(i => i.act === 'saveSession')!.disabled).toBe(true);
    });

    it('TA-22: 시리얼은 Break, 로컬 셸은 인코딩 전환 비활성, 분할 창은 "분할 창 닫기"', () => {
        expect(acts(tabMenuItems({state: 'on', proto: 'serial', hasReq: true, encoding: 'UTF-8'}, 1))).toContain('break');
        expect(tabMenuItems({state: 'on', proto: 'local', hasReq: true, encoding: 'UTF-8'}, 1).find(i => i.act === 'encoding')!.disabled).toBe(true);
        expect(tabMenuItems({state: 'on', proto: 'ssh', hasReq: true, encoding: 'EUC-KR'}, 2).find(i => i.act === 'close')!.label).toBe('분할 창 닫기');
        expect(tabMenuItems({state: 'on', proto: 'ssh', hasReq: true, encoding: 'EUC-KR'}, 1).find(i => i.act === 'encoding')!.label).toBe('인코딩: UTF-8로 전환');
    });
});

describe('테마 테스트 전제 (TA)', () => {
    it('TA-30: 테스트에 쓰는 테마는 실제로 있고 기본 테마와 다름', () => {
        expect(themeByName('dracula').name).toBe('dracula');
        expect(themeByName('dracula').theme).not.toEqual(themeByName(settings.theme).theme);
    });
});
