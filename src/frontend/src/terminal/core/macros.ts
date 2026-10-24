// Macros: named texts sent to the terminal, from the macro window
// (Ctrl+Shift+M) or with the function key bound to them (Todo #121,
// choboTerm macros.ts). Lua macros run with the Lua console (Todo #124).

import {settings} from './settings';
import type {TermSession} from './session';

export interface Macro {
    name: string;
    key: string;
    text: string;
    kind: string; // '' = text, 'lua' = Lua script
}

/** Keys a macro can be bound to. F1 alone is help. */
export const MACRO_KEYS: string[] = [];
for (const mod of ['', 'Shift+', 'Ctrl+']) {
    for (let i = 1; i <= 12; i++) {
        if (mod || i > 1) MACRO_KEYS.push(`${mod}F${i}`);
    }
}

type KeyLike = Pick<KeyboardEvent, 'type' | 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>;

/** The key name of a keydown ("F5", "Shift+F5", "Ctrl+F5"), or "" if a macro can't use it. */
export function keyName(ev: KeyLike): string {
    if (ev.type !== 'keydown' || !/^F([1-9]|1[0-2])$/.test(ev.key) || ev.altKey || ev.metaKey) return '';
    if (ev.ctrlKey && ev.shiftKey) return '';
    return (ev.ctrlKey ? 'Ctrl+' : ev.shiftKey ? 'Shift+' : '') + ev.key;
}

/** The macro bound to this keydown, if any. Unbound function keys still reach the terminal. */
export function macroForKey(ev: KeyLike): Macro | undefined {
    const k = keyName(ev);
    return k ? (settings.macros as Macro[]).find(m => m.key === k) : undefined;
}

/**
 * The text a macro sends: a line break is Enter, and \n \r \t \e \xHH \\
 * are escapes (\e is Esc, \xHH any byte such as \x03 for Ctrl+C).
 */
export function expandMacro(text: string): string {
    return text.replace(/\r\n|\n|\r|\\(x[0-9a-fA-F]{2}|[nrte\\])/g, (_all, esc?: string) => {
        if (!esc) return '\r';
        switch (esc[0]) {
            case 'n':
            case 'r':
                return '\r';
            case 't':
                return '\t';
            case 'e':
                return '\x1b';
            case 'x':
                return String.fromCharCode(parseInt(esc.slice(1), 16));
            default:
                return '\\';
        }
    });
}

export function macroLabel(m: Macro): string {
    return m.name || m.text.split(/\r?\n/)[0] || '(이름 없음)';
}

/** The key choices for m: a key another macro has is shown with its name and can't be picked. */
export function keyOptions(all: Macro[], m: Macro | undefined) {
    return [
        {value: '', label: '(없음)', disabled: false},
        ...MACRO_KEYS.map(k => {
            const owner = all.find(o => o.key === k && o !== m);
            return {value: k, label: owner ? `${k} - ${macroLabel(owner)}` : k, disabled: !!owner};
        }),
    ];
}

const notice = (s: TermSession, msg: string) => s.term.write(`\r\n\x1b[36m[${msg}]\x1b[0m\r\n`);

export function sendMacro(s: TermSession, m: Macro) {
    if (s.state !== 'on') return notice(s, '연결되어 있지 않습니다');
    if (m.kind === 'lua') return notice(s, 'Lua 매크로는 Lua 콘솔과 함께 지원됩니다');
    const text = expandMacro(m.text);
    if (text) void s.sendInput(text);
}
