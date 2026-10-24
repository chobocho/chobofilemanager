// Automatic reconnect after a broken connection, ported from choboTerm's
// connection.ts (scheduleRetry / retryNow / cancelRetry / reconnectHint).

import type {TermSession} from './session';

export const RETRY_DELAYS = [3, 5, 10, 20, 30]; // seconds; the last one repeats
export const MAX_RETRIES = 10;

export interface ReconnectOptions {
    autoReconnect: () => boolean;
}

export class Reconnector {
    private retry: {attempt: number; timer: number} | null = null;
    private reconnecting = false;
    private disposed = false;

    constructor(private session: TermSession, private opts: ReconnectOptions) {}

    get retrying(): boolean {
        return this.retry !== null;
    }

    private write(s: string) {
        this.session.term.write(s);
    }

    /** "[why] Enter: 다시 접속" — the tab is idle and Enter opens the Connect dialog. */
    hint(why: string) {
        this.write(`\x1b[33m[${why}] Enter: 다시 접속\x1b[0m\r\n`);
    }

    /** term:closed. lost: the connection broke (not ended by the server). */
    handleClosed(msg: string, lost: boolean) {
        if (lost && this.opts.autoReconnect() && this.session.req) {
            this.schedule(1, msg);
        } else {
            this.write('\r\n');
            this.hint(msg);
        }
    }

    private schedule(attempt: number, why: string) {
        this.cancel();
        const reason = `\r\n\x1b[33m[${why.replace(/\n/g, '\r\n')}]\r\n`;
        if (attempt > MAX_RETRIES) {
            this.write(`${reason}[${MAX_RETRIES}번 시도했지만 연결하지 못했습니다] Enter: 다시 접속\x1b[0m\r\n`);
            return;
        }
        const secs = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];
        this.write(`${reason}[${secs}초 후 다시 연결합니다 (${attempt}/${MAX_RETRIES})] Enter: 지금 연결 · Esc: 취소\x1b[0m\r\n`);
        this.retry = {attempt, timer: window.setTimeout(() => void this.retryNow(), secs * 1000)};
    }

    cancel() {
        if (!this.retry) return;
        clearTimeout(this.retry.timer);
        this.retry = null;
    }

    async retryNow() {
        const attempt = this.retry?.attempt ?? 1;
        this.cancel();
        const s = this.session;
        if (this.disposed || !s.req || s.state !== 'idle') return;
        this.reconnecting = true;
        this.write(`\x1b[90m다시 연결하는 중... ${s.req.host}:${s.req.port}\x1b[0m\r\n`);
        try {
            await s.connect({...s.req}, true);
            this.write('\x1b[32m[다시 연결했습니다]\x1b[0m\r\n');
        } catch (e) {
            if (!this.disposed && s.state === 'idle') this.schedule(attempt + 1, String((e as Error)?.message ?? e));
        } finally {
            this.reconnecting = false;
        }
    }

    /** Keys typed while idle. Returns true when the reconnect logic used the key. */
    onIdleKey(data: string): boolean {
        if (this.reconnecting) return true;
        if (!this.retry) return false;
        if (data === '\r') {
            void this.retryNow();
            return true;
        }
        if (data === '\x1b') {
            this.cancel();
            this.hint('자동 재접속을 취소했습니다');
            return true;
        }
        return true;
    }

    dispose() {
        this.disposed = true;
        this.cancel();
    }
}
