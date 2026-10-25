// Lua scripts running in a tab and the Lua console (Todo #124, choboTerm
// luaconsole.ts): times, the box heading and the tab badge, the lines kept,
// and the console's input history. The store runs the Go calls.

export interface Script {
    name: string;
    started: number; // ms since the epoch
    console: boolean;
}

export interface Busy {
    id: number; // the ConsoleEval request
    started: number;
}

export interface Line {
    text: string;
    cls?: string; // 'in' | 'val' | 'err' | 'hint'
}

export interface BoxState {
    state: 'run' | 'console' | 'done' | 'stopped' | 'failed';
    name: string;
    started: number;
    ms?: number; // how long it ran, once it ended
    busy?: Busy;
}

export const VISIBLE_LINES = 200;
const LOG_MAX = 22000;
const LOG_KEEP = 20000; // trimmed in batches, not a line at a time

export const CONSOLE_HINT = 'send · expect · sleep · screen · print · open_url · open_folder 사용 가능. 식을 입력하면 값을 보여 줍니다 (Lua 5.1).';

export function elapsedText(ms: number): string {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    const mmss = `${m}:${String(sec).padStart(2, '0')}`;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : mmss;
}

/** The ▶ badge on the tab chip: the running script's (or console input's) time so far. */
export function scriptBadge(s: Script | null | undefined, busy: Busy | undefined, now: number): {text: string; title: string} | null {
    if (!s) return null;
    if (s.console) {
        return busy
            ? {text: `▶ ${elapsedText(now - busy.started)}`, title: 'Lua 콘솔: 실행 중 (Ctrl+C: 중지)'}
            : {text: 'Lua', title: 'Lua 콘솔 (Ctrl+Shift+K)'};
    }
    return {text: `▶ ${elapsedText(now - s.started)}`, title: `Lua 스크립트 실행 중: ${s.name}\n탭 우클릭 → 스크립트 중지`};
}

export function boxHead(b: BoxState, now: number): string {
    const ran = elapsedText(b.ms ?? 0);
    switch (b.state) {
        case 'console':
            return b.busy ? `▶ ${b.name} · 실행 중 ${elapsedText(now - b.busy.started)}` : b.name;
        case 'run':
            return `▶ ${b.name} · ${elapsedText(now - b.started)}`;
        case 'done':
            return `✔ ${b.name} · 끝 · ${ran}`;
        case 'stopped':
            return `■ ${b.name} · 멈춤 · ${ran}`;
        default:
            return `✖ ${b.name} · ${ran}`;
    }
}

/** Adds text (split into lines): the box shows the last VISIBLE_LINES, the log keeps more for saving. */
export function addLines<T extends {lines: Line[]; log: string[]}>(box: T, text: string, cls = ''): T {
    const add = text.split('\n');
    const lines = [...box.lines, ...add.map(t => (cls ? {text: t, cls} : {text: t}))].slice(-VISIBLE_LINES);
    let log = [...box.log, ...add];
    if (log.length > LOG_MAX) log = log.slice(log.length - LOG_KEEP);
    return {...box, lines, log};
}

/**
 * ↑ (dir -1) on the first line or ↓ (dir 1) on the last line of the input
 * goes through earlier inputs; null when the key should move the caret instead.
 */
export function historyStep(history: string[], pos: number, dir: -1 | 1, caretLine: number, lineCount: number): {pos: number; text: string} | null {
    if (dir < 0 && (caretLine !== 0 || pos <= 0)) return null;
    if (dir > 0 && (caretLine !== lineCount - 1 || pos >= history.length)) return null;
    const next = pos + dir;
    return {pos: next, text: history[next] ?? ''};
}
