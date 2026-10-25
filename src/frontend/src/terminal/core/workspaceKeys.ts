// The keys the terminal workspace handles itself (Todo #126): one table for
// "is this ours?" (xterm must not turn it into input; see look.ts
// isWorkspaceKey) and "what does it do?" (TerminalWorkspace runs the action).

import {splitKeyDir} from './layout';

export const WORKSPACE_ACTIONS = [
    'splitRight', 'splitDown', 'newTab', 'closeTab', 'nextTab', 'prevTab',
    'search', 'sessions', 'prefs', 'macros', 'log', 'memo', 'files', 'forwards', 'containers', 'console',
    'copy', 'paste', 'disconnect', 'encoding', 'help', 'fontUp', 'fontDown', 'fontReset',
] as const;

export type WorkspaceAction = typeof WORKSPACE_ACTIONS[number];

type KeyLike = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'> & {code?: string};

/** Ctrl+Shift+letter. */
const LETTERS: Record<string, WorkspaceAction> = {
    T: 'newTab', N: 'newTab', W: 'closeTab', S: 'search', H: 'sessions', O: 'prefs', M: 'macros',
    L: 'log', B: 'memo', F: 'files', P: 'forwards', J: 'containers', K: 'console',
    C: 'copy', V: 'paste', D: 'disconnect', E: 'encoding',
};

/** Ctrl+key, no Shift or Alt: the font size. */
const FONT: Record<string, WorkspaceAction> = {'=': 'fontUp', '+': 'fontUp', '-': 'fontDown', '0': 'fontReset'};

export function workspaceAction(ev: KeyLike): WorkspaceAction | undefined {
    const dir = splitKeyDir({ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey, code: ev.code ?? ''});
    if (dir) return dir === 'row' ? 'splitRight' : 'splitDown';
    const k = ev.key.length === 1 ? ev.key.toUpperCase() : ev.key;
    if (ev.ctrlKey && !ev.altKey && (k === 'Tab' || k === 'PageUp' || k === 'PageDown')) {
        return k === 'PageUp' || (k === 'Tab' && ev.shiftKey) ? 'prevTab' : 'nextTab';
    }
    if (ev.ctrlKey && ev.shiftKey && !ev.altKey && LETTERS[k]) return LETTERS[k];
    if (k === 'F1' && !ev.ctrlKey && !ev.altKey && !ev.shiftKey) return 'help';
    if (ev.ctrlKey && !ev.altKey && !ev.shiftKey && FONT[ev.key]) return FONT[ev.key];
    return undefined;
}
