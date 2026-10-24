import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {FakeTerminal} from '../test/fakeTerminal';
import {setTermBackend} from './termApi';
import {TermSession} from './session';
import {Reconnector, RETRY_DELAYS, MAX_RETRIES} from './reconnect';

// ─── Todo #120: 자동 재접속 (choboTerm connection.ts scheduleRetry/retryNow 이식) ───

let api: any, fake: FakeTerminal;
const req = {host: 'srv', port: 22, login: 'u', pass: '', encoding: 'UTF-8', jump: ''};

async function connected(auto = true) {
    const s = new TermSession(1, {createTerminal: o => (fake = new FakeTerminal(o)) as any, addons: false});
    s.open(document.createElement('div'));
    await s.connect({...req});
    const rc = new Reconnector(s, {autoReconnect: () => auto});
    s.onClosed((m, lost) => rc.handleClosed(m, lost));
    s.onIdleInput(d => rc.onIdleKey(d));
    return {s, rc};
}

describe('Reconnector (RC)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        api = {Connect: vi.fn().mockResolvedValue('ssh'), CloseTab: vi.fn(), Send: vi.fn(), Resize: vi.fn()};
        setTermBackend(api, {EventsOn: () => () => {}} as any);
    });
    afterEach(() => {
        vi.useRealTimers();
        setTermBackend(null);
    });

    it('RC-01: 연결이 끊기면(lost) 3초 후 화면을 유지한 채 다시 연결', async () => {
        const {s, rc} = await connected();
        s.handleClosed('연결이 끊어졌습니다', true);
        expect(rc.retrying).toBe(true);
        expect(fake.text()).toContain('3초 후 다시 연결합니다 (1/10)');
        expect(fake.text()).toContain('Enter: 지금 연결 · Esc: 취소');
        await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0] * 1000);
        expect(api.Connect).toHaveBeenCalledTimes(2);
        expect(s.state).toBe('on');
        expect(fake.text()).toContain('다시 연결했습니다');
        expect(fake.resets).toBe(1); // keepScreen: 두 번째 연결은 화면을 지우지 않음
    });

    it('RC-02: 재접속 실패 시 다음 간격(5, 10, 20, 30, 30 ...)으로 계속, 10번 넘으면 중단', async () => {
        const {s, rc} = await connected();
        api.Connect.mockRejectedValue(new Error('refused'));
        s.handleClosed('끊김', true);
        for (let a = 1; a <= MAX_RETRIES; a++) {
            const secs = RETRY_DELAYS[Math.min(a - 1, RETRY_DELAYS.length - 1)];
            expect(fake.text()).toContain(`${secs}초 후 다시 연결합니다 (${a}/${MAX_RETRIES})`);
            await vi.advanceTimersByTimeAsync(secs * 1000);
        }
        expect(rc.retrying).toBe(false);
        expect(fake.text()).toContain(`${MAX_RETRIES}번 시도했지만 연결하지 못했습니다`);
    });

    it('RC-03: 대기 중 Enter → 바로 연결, Esc → 취소', async () => {
        const {s, rc} = await connected();
        s.handleClosed('끊김', true);
        expect(rc.onIdleKey('\r')).toBe(true);
        await vi.advanceTimersByTimeAsync(0);
        expect(api.Connect).toHaveBeenCalledTimes(2);

        s.handleClosed('또 끊김', true);
        expect(rc.onIdleKey('\x1b')).toBe(true);
        expect(rc.retrying).toBe(false);
        expect(fake.text()).toContain('자동 재접속을 취소했습니다');
        await vi.advanceTimersByTimeAsync(60_000);
        expect(api.Connect).toHaveBeenCalledTimes(2);
    });

    it('RC-04: 서버가 정상 종료(lost=false)하거나 자동 재접속이 꺼져 있으면 안내만', async () => {
        const {s, rc} = await connected(false);
        s.handleClosed('세션이 끝났습니다', true);
        expect(rc.retrying).toBe(false);
        expect(fake.text()).toContain('[세션이 끝났습니다] Enter: 다시 접속');
        const b = await connected(true);
        b.s.handleClosed('logout', false);
        expect(b.rc.retrying).toBe(false);
    });

    it('RC-05: 재접속 대기가 아닐 때 키는 소비하지 않음 (대화상자 열기는 호출 측)', async () => {
        const {rc} = await connected();
        expect(rc.onIdleKey('\r')).toBe(false);
    });

    it('RC-06: dispose하면 예약된 재접속 취소', async () => {
        const {s, rc} = await connected();
        s.handleClosed('끊김', true);
        rc.dispose();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(api.Connect).toHaveBeenCalledTimes(1);
    });
});
