// SSH port forwarding (Todo #124, choboTerm forwards.ts): rules as ssh options,
// the ssh command line that opens the same connection, and a rule's state.
// Rules are saved per host by the Go side and start again on the next connection.

export interface Forward {
    type: string; // 'L' | 'R' | 'D'
    bindAddr: string;
    bindPort: number;
    host: string;
    port: number;
}

export interface ForwardStatus extends Forward {
    id: number;
    error: string;
    conns: number;
    standby: boolean;
}

export const FORWARD_HINTS: Record<string, string> = {
    L: '로컬(-L): 이 PC의 수신 포트로 들어온 연결을 서버를 거쳐 대상으로 보냅니다. 대상은 서버에서 본 주소입니다 (예: localhost:5432).',
    R: '원격(-R): 서버의 수신 포트로 들어온 연결을 이 PC를 거쳐 대상으로 보냅니다. 대상은 이 PC에서 본 주소입니다.',
    D: '동적(-D): 이 PC의 수신 포트가 SOCKS5 프록시가 됩니다. 브라우저 등에서 프록시로 지정하면 서버를 거쳐 접속합니다.',
};

// An IPv6 address needs brackets inside ssh's colon-separated specs.
const sshAddr = (a: string) => (a.includes(':') ? `[${a}]` : a);

/** The rule as an ssh option, e.g. "-L 127.0.0.1:8888:localhost:8888". */
export function sshOption(f: Forward): string {
    const bind = `${sshAddr(f.bindAddr)}:${f.bindPort}`;
    return f.type === 'D' ? `-D ${bind}` : `-${f.type} ${bind}:${sshAddr(f.host)}:${f.port}`;
}

/** The ssh command line that opens the same connection with all rules. */
export function sshCommand(conn: {host: string; port: number; login: string; jump: string} | undefined, rules: Forward[]): string {
    if (!conn) return '';
    const parts = ['ssh', ...rules.map(sshOption)];
    if (conn.jump) parts.push('-J', conn.jump);
    if (conn.port && conn.port !== 22) parts.push('-p', String(conn.port));
    parts.push(conn.login ? `${conn.login}@${conn.host}` : conn.host);
    return parts.join(' ');
}

export function forwardStatus(f: ForwardStatus): {kind: 'bad' | 'wait' | 'ok'; text: string; title: string} {
    if (f.error) return {kind: 'bad', text: `오류: ${f.error}`, title: f.error};
    if (f.standby) {
        return {kind: 'wait', text: '대기 (다른 탭에서 수신 중)',
            title: '같은 서버에 접속한 다른 탭이 이 포워딩을 맡고 있습니다. 그 탭의 접속이 끊기면 이 탭이 이어받습니다.'};
    }
    return {kind: 'ok', text: f.conns > 0 ? `수신 중 · 연결 ${f.conns}` : '수신 중',
        title: f.conns > 0 ? `이 규칙을 통해 열려 있는 연결 ${f.conns}개` : '열린 연결 없음 (새 연결을 기다리는 중)'};
}
