import {describe, it, expect} from 'vitest';
import {sshOption, sshCommand, forwardStatus, FORWARD_HINTS} from './forwards';

// ─── Todo #124: SSH 포트 포워딩 — ssh 명령 표기, 상태 문구 ─────────────────────

const L = {type: 'L', bindAddr: '127.0.0.1', bindPort: 8888, host: 'localhost', port: 80};
const D = {type: 'D', bindAddr: '127.0.0.1', bindPort: 1080, host: '', port: 0};

describe('forwards (FW)', () => {
    it('FW-01: 규칙 → ssh 옵션 (-L/-R/-D), IPv6는 대괄호', () => {
        expect(sshOption(L)).toBe('-L 127.0.0.1:8888:localhost:80');
        expect(sshOption({...L, type: 'R', bindAddr: 'localhost'})).toBe('-R localhost:8888:localhost:80');
        expect(sshOption(D)).toBe('-D 127.0.0.1:1080');
        expect(sshOption({...L, bindAddr: '::1', host: 'fe80::1'})).toBe('-L [::1]:8888:[fe80::1]:80');
    });

    it('FW-02: 같은 연결을 여는 ssh 명령 — 규칙들, -J, -p, user@host', () => {
        const conn = {host: 'srv', port: 2222, login: 'me', jump: 'b@bastion', pass: '', encoding: ''};
        expect(sshCommand(conn, [L, D])).toBe('ssh -L 127.0.0.1:8888:localhost:80 -D 127.0.0.1:1080 -J b@bastion -p 2222 me@srv');
        expect(sshCommand({...conn, port: 22, login: '', jump: ''}, [])).toBe('ssh srv');
        expect(sshCommand(undefined, [L])).toBe('');
    });

    it('FW-03: 상태 — 오류 / 대기(다른 탭) / 수신 중(연결 수)', () => {
        expect(forwardStatus({...L, id: 1, error: '포트 사용 중', conns: 0, standby: false})).toMatchObject({kind: 'bad', text: '오류: 포트 사용 중'});
        expect(forwardStatus({...L, id: 1, error: '', conns: 0, standby: true})).toMatchObject({kind: 'wait', text: '대기 (다른 탭에서 수신 중)'});
        expect(forwardStatus({...L, id: 1, error: '', conns: 3, standby: false})).toMatchObject({kind: 'ok', text: '수신 중 · 연결 3'});
        expect(forwardStatus({...L, id: 1, error: '', conns: 0, standby: false}).text).toBe('수신 중');
    });

    it('FW-04: 종류별 설명', () => {
        expect(Object.keys(FORWARD_HINTS)).toEqual(['L', 'R', 'D']);
        expect(FORWARD_HINTS.D).toContain('SOCKS5');
    });
});
