// Calls into the Go terminal backend (internal/termapp, bound next to the file
// manager as window.go.termapp.App) and subscriptions to the events it emits.
// Everything in the terminal code goes through here, so tests can replace one
// object instead of the Wails globals.

type AnyFn = (...args: any[]) => any;

export interface TermApi {
    [method: string]: AnyFn;
}

export interface TermRuntime {
    EventsOn(name: string, cb: AnyFn): () => void;
    ClipboardSetText(text: string): Promise<boolean>;
    ClipboardGetText(): Promise<string>;
    BrowserOpenURL(url: string): void;
}

declare global {
    interface Window {
        go?: {termapp?: {App?: TermApi}};
        runtime?: any;
    }
}

let apiOverride: TermApi | null = null;
let runtimeOverride: TermRuntime | null = null;

/** Replaces the backend (tests, browser preview). Pass null to restore. */
export function setTermBackend(api: TermApi | null, runtime: TermRuntime | null = null) {
    apiOverride = api;
    runtimeOverride = runtime;
}

const missing = (name: string) => () => Promise.reject(new Error(`terminal backend unavailable: ${name}`));

/** The bound Go methods (Connect, Send, Resize, CloseTab, ...). */
export const termApi: TermApi = new Proxy({} as TermApi, {
    get(_t, name: string) {
        const api = apiOverride ?? window.go?.termapp?.App;
        const fn = api?.[name];
        return typeof fn === 'function' ? fn.bind(api) : missing(name);
    },
});

function runtime(): TermRuntime | null {
    return runtimeOverride ?? (window.runtime as TermRuntime | undefined) ?? null;
}

/** Subscribes to a Go event; returns the unsubscribe function. */
export function onTermEvent(name: string, cb: AnyFn): () => void {
    const rt = runtime();
    if (!rt?.EventsOn) return () => {};
    const off = rt.EventsOn(name, cb);
    return typeof off === 'function' ? off : () => {};
}

export function clipboardSetText(text: string): Promise<boolean> {
    return runtime()?.ClipboardSetText?.(text) ?? Promise.resolve(false);
}

export function clipboardGetText(): Promise<string> {
    return runtime()?.ClipboardGetText?.() ?? Promise.resolve('');
}

export function browserOpenURL(url: string) {
    runtime()?.BrowserOpenURL?.(url);
}
