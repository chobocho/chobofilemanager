// One terminal: an xterm instance and the Go session behind its tab id.
// Ported from choboTerm (tabs.ts createTab, connection.ts connectTab/sendInput
// and the term:* event handlers) without the DOM chrome (tab chips, panes),
// which the React components own. Retry/reconnect, logging and files come later.

import type {ITerminalOptions, Terminal} from '@xterm/xterm';
import {clipboardSetText, onTermEvent, termApi} from './termApi';
import type {Reconnector} from './reconnect';

export type TermState = 'idle' | 'connecting' | 'on' | 'ftp';

export interface ConnectRequest {
    host: string;
    port: number;
    login: string;
    pass: string;
    encoding: string;
    jump: string;
    cols?: number;
    rows?: number;
}

export interface SessionDeps {
    /** Builds the xterm (tests pass a fake; the default loads @xterm/xterm). */
    createTerminal: (opts: ITerminalOptions) => Terminal;
    /** Load fit/search/unicode/web-links addons (off in tests). */
    addons?: boolean;
    options?: ITerminalOptions;
}

type Listener<T extends any[]> = (...args: T) => void;

const sessions = new Map<number, TermSession>();

export function sessionById(id: number): TermSession | undefined {
    return sessions.get(id);
}

/** term:data carries base64 in the Wails window and raw bytes for web clients. */
export function decodeTermData(data: string | Uint8Array): Uint8Array {
    if (typeof data !== 'string') return data;
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

let routerOff: (() => void)[] = [];

/** Subscribes once to the Go events and routes them to the session of each tab id. */
export function startEventRouter() {
    if (routerOff.length) return;
    routerOff = [
        onTermEvent('term:open', (id: number, encoding: string) => sessions.get(id)?.handleOpen(encoding)),
        onTermEvent('term:data', (id: number, data: string | Uint8Array) => sessions.get(id)?.receive(data)),
        onTermEvent('term:closed', (id: number, msg: string, lost: boolean) => sessions.get(id)?.handleClosed(msg, lost)),
    ];
}

export function stopEventRouter() {
    routerOff.forEach(off => off());
    routerOff = [];
}

export class TermSession {
    readonly id: number;
    readonly term: Terminal;
    state: TermState = 'idle';
    proto = '';
    encoding = 'UTF-8';
    title = '';
    /** Color theme chosen for this tab's server ('' / undefined: the Settings theme). */
    theme: string | undefined;
    /** The shell's folder reported with OSC 7 (file://host/path). */
    cwd: string | undefined;
    req: ConnectRequest | undefined;
    /** Automatic reconnect of this tab (set by the view that owns the pane). */
    reconnector: Reconnector | undefined;

    private outbox = '';
    private sending = false;
    private fresh = false;
    private disposed = false;
    private fitAddon: {fit(): void} | null = null;
    private searchAddon: {findNext(q: string, o?: any): boolean; findPrevious(q: string, o?: any): boolean; clearDecorations(): void} | null = null;
    private stateListeners = new Set<Listener<[TermState]>>();
    private titleListeners = new Set<Listener<[string]>>();
    private closedListeners = new Set<Listener<[string, boolean]>>();
    private outputListeners = new Set<Listener<[]>>();
    private idleInputListeners = new Set<Listener<[string]>>();

    constructor(id: number, private deps: SessionDeps) {
        this.id = id;
        this.term = deps.createTerminal({allowProposedApi: true, ...(deps.options ?? {})});
        sessions.set(id, this);
        this.wire();
    }

    private wire() {
        const term = this.term;
        // Programs that use the mouse themselves (edit, vim, tmux) copy with OSC 52:
        // "c;<base64>". Only setting is honored; a program can't read the clipboard ("?").
        term.parser.registerOscHandler(52, data => {
            const b64 = data.slice(data.indexOf(';') + 1);
            if (b64 === '?' || b64.length > 4_000_000) return true;
            try {
                const text = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
                if (text) clipboardSetText(text).catch(() => undefined);
            } catch {
                // bad data: ignored
            }
            return true;
        });
        // Shells can report their folder as OSC 7 file://host/path (e.g. with vte.sh).
        term.parser.registerOscHandler(7, data => {
            const m = /^file:\/\/[^/]*(\/.*)$/.exec(data);
            if (m) {
                try {
                    this.cwd = decodeURIComponent(m[1]);
                } catch {
                    this.cwd = m[1];
                }
            }
            return true;
        });
        term.onTitleChange(title => {
            this.title = title;
            this.titleListeners.forEach(l => l(title));
        });
        term.onData(data => {
            if (this.state === 'on') void this.sendInput(data);
            else this.idleInputListeners.forEach(l => l(data)); // e.g. Enter reopens the Connect dialog
        });
        term.onResize(({cols, rows}) => {
            if (this.state === 'on') termApi.Resize(this.id, cols, rows).catch(() => undefined);
        });
    }

    /** Puts the terminal into el (and loads the addons, outside tests). */
    open(el: HTMLElement) {
        this.term.open(el);
        if (this.deps.addons) void this.loadAddons();
    }

    private async loadAddons() {
        const [{FitAddon}, {WebLinksAddon}, {SearchAddon}, cjk] = await Promise.all([
            import('@xterm/addon-fit'),
            import('@xterm/addon-web-links'),
            import('@xterm/addon-search'),
            import('./cjkwidth'),
        ]);
        if (this.disposed) return;
        const fit = new FitAddon();
        this.term.loadAddon(fit);
        this.term.loadAddon(new WebLinksAddon());
        const search = new SearchAddon();
        this.term.loadAddon(search);
        this.searchAddon = search;
        cjk.loadUnicodeWidths(this.term);
        this.fitAddon = fit;
        this.fit();
    }

    fit() {
        try {
            this.fitAddon?.fit();
        } catch {
            // not laid out yet
        }
    }

    focus() {
        this.term.focus();
    }

    /** Selects the next (or previous) match of query; false when there is none. */
    find(query: string, backwards = false, opts: {caseSensitive?: boolean; regex?: boolean} = {}): boolean {
        if (!this.searchAddon || !query) return false;
        const o = {caseSensitive: !!opts.caseSensitive, regex: !!opts.regex};
        return backwards ? this.searchAddon.findPrevious(query, o) : this.searchAddon.findNext(query, o);
    }

    clearSearch() {
        this.searchAddon?.clearDecorations();
        this.term.clearSelection?.();
    }

    private setState(s: TermState) {
        this.state = s;
        this.stateListeners.forEach(l => l(s));
    }

    onState(l: Listener<[TermState]>) {
        this.stateListeners.add(l);
        return () => this.stateListeners.delete(l);
    }
    onTitle(l: Listener<[string]>) {
        this.titleListeners.add(l);
        return () => this.titleListeners.delete(l);
    }
    onClosed(l: Listener<[string, boolean]>) {
        this.closedListeners.add(l);
        return () => this.closedListeners.delete(l);
    }
    /** Output arrived (the tab chip shows activity when it isn't the active tab). */
    onOutput(l: Listener<[]>) {
        this.outputListeners.add(l);
        return () => this.outputListeners.delete(l);
    }
    /** Keys typed while no session is connected. */
    onIdleInput(l: Listener<[string]>) {
        this.idleInputListeners.add(l);
        return () => this.idleInputListeners.delete(l);
    }

    /**
     * Opens the session. Returns the protocol ("ssh", "telnet", "local", "serial", "ftp").
     * The screen is cleared when Go says the session starts (term:open), not after
     * the call returns: the first output can arrive before that.
     */
    async connect(req: ConnectRequest, keepScreen = false): Promise<string> {
        req.cols = this.term.cols;
        req.rows = this.term.rows;
        this.fresh = !keepScreen;
        this.setState('connecting');
        let protocol: string;
        try {
            protocol = await termApi.Connect(this.id, req);
        } catch (e) {
            this.fresh = false;
            this.setState('idle');
            throw e;
        }
        if (this.disposed) {
            termApi.CloseTab(this.id).catch(() => undefined); // closed while connecting
            throw new Error('탭이 닫혔습니다');
        }
        this.req = req;
        this.proto = protocol;
        if (protocol === 'local') req.encoding = 'UTF-8'; // the pseudo console speaks UTF-8 only
        this.handleOpen(req.encoding || 'UTF-8');
        this.encoding = req.encoding || 'UTF-8';
        this.setState(protocol === 'ftp' ? 'ftp' : 'on');
        return protocol;
    }

    /** term:open: a session starts in this tab; clear the screen once. */
    handleOpen(encoding: string) {
        if (encoding) this.encoding = encoding;
        if (!this.fresh) return;
        this.fresh = false;
        this.term.reset();
    }

    /** term:data: output of the session. */
    receive(data: string | Uint8Array) {
        this.term.write(decodeTermData(data));
        this.outputListeners.forEach(l => l());
    }

    /** Disconnected on purpose: idle without the term:closed handling (no reconnect). */
    markIdle() {
        this.setState('idle');
    }

    /** term:closed: the session ended; lost means the connection broke. */
    handleClosed(msg: string, lost: boolean) {
        this.setState('idle');
        this.closedListeners.forEach(l => l(msg, lost));
    }

    /**
     * Wails runs each Go call on its own goroutine, so calls made back to back can
     * reach the server out of order. One Send at a time keeps the order; input
     * typed meanwhile goes in the next one.
     */
    async sendInput(data: string) {
        this.outbox += data;
        if (this.sending) return;
        this.sending = true;
        try {
            while (this.outbox) {
                const chunk = this.outbox;
                this.outbox = '';
                await termApi.Send(this.id, chunk);
            }
        } catch {
            this.outbox = '';
        } finally {
            this.sending = false;
        }
    }

    async disconnect() {
        await termApi.Disconnect(this.id).catch(() => undefined);
    }

    /** Stops routing and frees the terminal (the Go tab stays; see close). */
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        sessions.delete(this.id);
        this.term.dispose();
    }

    /** Closes the tab: the Go side drops the session, then the terminal is freed. */
    async close() {
        this.dispose();
        await termApi.CloseTab(this.id).catch(() => undefined);
    }
}
