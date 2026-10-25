import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {FakeTerminal} from '../test/fakeTerminal';
import {setTermBackend} from './termApi';
import {TermSession, startEventRouter, stopEventRouter} from './session';
import {toggleLog, showLogs} from './tabActions';
import {tabMenuItems} from './tabMenu';

// ─── Todo #121: 세션 로그 (log:changed, StartLog/StopLog) ─────────────────────

let api: any, fake: FakeTerminal, handlers: Record<string, (...a: any[]) => void>;
const req = {host: 'h', port: 22, login: 'u', pass: '', encoding: 'UTF-8', jump: ''};
function make() {
    const s = new TermSession(3, {createTerminal: o => (fake = new FakeTerminal(o)) as any, addons: false});
    s.open(document.createElement('div'));
    return s;
}

describe('세션 로그 (SL)', () => {
    beforeEach(() => {
        handlers = {};
        api = {
            Connect: vi.fn().mockResolvedValue('ssh'), Send: vi.fn().mockResolvedValue(undefined), Resize: vi.fn(), CloseTab: vi.fn(),
            StartLog: vi.fn(async (id: number) => { handlers['log:changed'](id, 'C:\\logs\\h.log'); return 'C:\\logs\\h.log'; }),
            StopLog: vi.fn(async (id: number) => { handlers['log:changed'](id, ''); }),
            ShowLogs: vi.fn().mockResolvedValue(undefined),
        };
        setTermBackend(api, {EventsOn: (name: string, fn: any) => { handlers[name] = fn; return () => delete handlers[name]; }} as any);
        startEventRouter();
    });
    afterEach(() => { stopEventRouter(); setTermBackend(null); });

    it('SL-01: log:changed → 탭의 로그 경로, 알림 리스너, 화면 안내', async () => {
        const s = make();
        await s.connect({...req});
        const seen: (string | undefined)[] = [];
        s.onLog(p => seen.push(p));
        handlers['log:changed'](3, 'D:\\a.log');
        expect(s.log).toBe('D:\\a.log');
        expect(fake.text()).toContain('로그 기록 시작: D:\\a.log');
        handlers['log:changed'](3, '');
        expect(s.log).toBeUndefined();
        expect(fake.text()).toContain('로그 기록을 멈췄습니다');
        expect(seen).toEqual(['D:\\a.log', undefined]);
        s.dispose();
    });

    it('SL-02: 연결 중 자동 로그 시작은 화면을 지운 뒤 한 번 안내', async () => {
        const s = make();
        api.Connect.mockImplementationOnce(async (id: number) => { handlers['log:changed'](id, 'D:\\auto.log'); return 'ssh'; });
        await s.connect({...req});
        expect(s.log).toBe('D:\\auto.log');
        const text = fake.text();
        expect(text.match(/로그 기록/g)).toHaveLength(1);
        expect(text).toContain('로그 기록 중: D:\\auto.log');
        s.dispose();
    });

    it('SL-03: toggleLog — 시작/중지, 연결 안 됨이면 안내만', async () => {
        const s = make();
        await toggleLog(s);
        expect(api.StartLog).not.toHaveBeenCalled();
        expect(fake.text()).toContain('연결된 터미널에서만 로그를 기록할 수 있습니다');
        await s.connect({...req});
        await toggleLog(s);
        expect(api.StartLog).toHaveBeenCalledWith(3);
        expect(s.log).toBe('C:\\logs\\h.log');
        await toggleLog(s);
        expect(api.StopLog).toHaveBeenCalledWith(3);
        expect(s.log).toBeUndefined();
        s.dispose();
    });

    it('SL-04: StartLog 실패 → 화면에 오류', async () => {
        const s = make();
        await s.connect({...req});
        api.StartLog.mockRejectedValueOnce(new Error('폴더를 만들 수 없습니다'));
        await toggleLog(s);
        expect(fake.text()).toContain('폴더를 만들 수 없습니다');
        s.dispose();
    });

    it('SL-05: 로그 폴더 열기', async () => {
        const s = make();
        await showLogs(s);
        expect(api.ShowLogs).toHaveBeenCalledWith(3);
        s.dispose();
    });

    it('SL-06: 탭 메뉴 — 로그 시작/중지 문구, 연결 안 됐고 로그도 없으면 비활성', () => {
        const base = {state: 'on', proto: 'ssh', hasReq: true, encoding: 'UTF-8'};
        expect(tabMenuItems({...base, log: false}, 1).find(i => i.act === 'log')!.label).toBe('로그 기록 시작');
        expect(tabMenuItems({...base, log: true}, 1).find(i => i.act === 'log')!.label).toBe('로그 기록 중지');
        expect(tabMenuItems({...base, state: 'idle', log: false}, 1).find(i => i.act === 'log')!.disabled).toBe(true);
        expect(tabMenuItems({...base, state: 'idle', log: true}, 1).find(i => i.act === 'log')!.disabled).toBeFalsy();
        expect(tabMenuItems({...base, log: false}, 1).find(i => i.act === 'logs')!.label).toBe('로그 폴더 열기');
    });
});
