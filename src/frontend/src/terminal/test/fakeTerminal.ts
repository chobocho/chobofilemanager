// A stand-in for @xterm/xterm's Terminal in jsdom tests (jsdom has no canvas or
// layout, so the real renderer can't run). It records what the code under test
// does and lets the test play the user (typing, resizing) and the shell (OSC).

type Listener<T> = (e: T) => void;

function emitter<T>() {
    const ls = new Set<Listener<T>>();
    const on = (l: Listener<T>) => {
        ls.add(l);
        return {dispose: () => ls.delete(l)};
    };
    const fire = (e: T) => ls.forEach(l => l(e));
    return {on, fire};
}

export class FakeTerminal {
    options: Record<string, any>;
    cols = 80;
    rows = 24;
    written: (string | Uint8Array)[] = [];
    opened: HTMLElement | null = null;
    disposed = false;
    resets = 0;
    focused = 0;
    addons: any[] = [];
    oscHandlers = new Map<number, (data: string) => boolean>();
    keyHandler: ((ev: KeyboardEvent) => boolean) | null = null;
    unicode = {activeVersion: '6', register: () => {}};

    private dataE = emitter<string>();
    private resizeE = emitter<{cols: number; rows: number}>();
    private titleE = emitter<string>();

    onData = this.dataE.on;
    onResize = this.resizeE.on;
    onTitleChange = this.titleE.on;
    onRender = () => ({dispose() {}});
    parser = {
        registerOscHandler: (id: number, h: (data: string) => boolean) => {
            this.oscHandlers.set(id, h);
            return {dispose: () => this.oscHandlers.delete(id)};
        },
    };

    constructor(options: Record<string, any> = {}) {
        this.options = {...options};
    }

    loadAddon(a: any) {
        this.addons.push(a);
        a.activate?.(this);
    }
    open(el: HTMLElement) {
        this.opened = el;
        const root = document.createElement('div');
        root.className = 'xterm';
        const ta = document.createElement('textarea');
        ta.className = 'xterm-helper-textarea';
        root.appendChild(ta);
        el.appendChild(root);
    }
    write(data: string | Uint8Array, cb?: () => void) {
        this.written.push(data);
        cb?.();
    }
    reset() {
        this.resets++;
        this.written = [];
    }
    focus() {
        this.focused++;
    }
    attachCustomKeyEventHandler(h: (ev: KeyboardEvent) => boolean) {
        this.keyHandler = h;
    }
    dispose() {
        this.disposed = true;
    }
    resize(cols: number, rows: number) {
        this.cols = cols;
        this.rows = rows;
        this.resizeE.fire({cols, rows});
    }

    // ── test controls ──
    type(data: string) {
        this.dataE.fire(data);
    }
    osc(id: number, data: string) {
        return this.oscHandlers.get(id)?.(data);
    }
    setTitle(t: string) {
        this.titleE.fire(t);
    }
    /** Everything written so far as text (bytes decoded as UTF-8). */
    text(): string {
        return this.written.map(w => (typeof w === 'string' ? w : new TextDecoder().decode(w))).join('');
    }
}
