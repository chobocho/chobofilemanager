// Diagnostics (Todo #124, choboTerm debug.ts): with CHOBOTERM_DEBUG=1 or a
// debug.on file next to the exe, lines go to debug.log via the Go side.
// Messages logged before the Go side answers are kept, then sent or dropped.

import {termApi} from './termApi';

let enabled: boolean | undefined;
let early: string[] = [];
const restore: (() => void)[] = [];

export function dbg(msg: string) {
    if (enabled) termApi.DebugLog(msg).catch(() => undefined);
    else if (enabled === undefined && early.length < 500) early.push(`(early) ${msg}`);
}

export function debugOn() {
    return enabled === true;
}

function str(v: unknown): string {
    if (v instanceof Error) return `${v.name}: ${v.message}\n${v.stack ?? ''}`;
    if (typeof v === 'string') return v;
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}

/** Asks the Go side once; when on, sends what was kept and watches console warnings and page errors. */
export async function installDebug() {
    if (enabled !== undefined) return;
    enabled = await Promise.resolve(termApi.DebugEnabled()).then(Boolean, () => false);
    const kept = early;
    early = [];
    if (!enabled) return;
    kept.forEach(m => termApi.DebugLog(m).catch(() => undefined));
    for (const level of ['warn', 'error'] as const) {
        const orig = console[level];
        console[level] = (...args: unknown[]) => {
            orig.apply(console, args);
            dbg(`console.${level}: ${args.map(str).join(' ')}`);
        };
        restore.push(() => { console[level] = orig; });
    }
    const onError = (ev: ErrorEvent) => dbg(`window.error: ${ev.message} at ${ev.filename}:${ev.lineno}:${ev.colno} ${str(ev.error)}`);
    const onRejection = (ev: PromiseRejectionEvent) => dbg(`unhandledrejection: ${str(ev.reason)}`);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    restore.push(() => {
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
    });
}

export function resetDebugForTest() {
    restore.splice(0).forEach(f => f());
    enabled = undefined;
    early = [];
}
