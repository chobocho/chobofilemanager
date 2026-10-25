// xterm options from the terminal settings (font, theme, cursor, scrollback).
// The visual part of choboTerm's look.ts that doesn't touch the page chrome;
// translucency and the WebGL renderer come later.

import type {ITerminalOptions} from '@xterm/xterm';
import {fontFamily} from './cjkwidth';
import {themeByName} from './themes';
import type {TermSettings} from './settings';
import {splitKeyDir} from './layout';

export function lookOptions(s: TermSettings, wide = false): ITerminalOptions {
    return {
        fontFamily: fontFamily(wide ? s.fontEucKr : s.fontUtf8, wide),
        fontSize: s.fontSize,
        theme: themeByName(s.theme).theme,
        cursorStyle: (s.cursorStyle as ITerminalOptions['cursorStyle']) || 'block',
        cursorBlink: s.cursorBlink,
        scrollback: s.scrollback,
    };
}

// Keys the terminal workspace handles itself; xterm must not turn them into input.
export function isWorkspaceKey(ev: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'> & {code?: string}): boolean {
    const k = ev.key.length === 1 ? ev.key.toUpperCase() : ev.key;
    if (splitKeyDir({ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey, code: ev.code ?? ''})) return true;
    if (ev.ctrlKey && ev.shiftKey && (k === 'T' || k === 'W' || k === 'S' || k === 'H' || k === 'O' || k === 'M' || k === 'L' || k === 'B' || k === 'F' || k === 'P')) return true;
    if (ev.ctrlKey && (k === 'Tab' || k === 'PageUp' || k === 'PageDown')) return true;
    return false;
}

/** Alt+arrow moves between panes — only in a split tab; otherwise the program gets it. */
export function isPaneMoveKey(ev: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey'>): boolean {
    return ev.altKey && !ev.ctrlKey && !ev.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key);
}
