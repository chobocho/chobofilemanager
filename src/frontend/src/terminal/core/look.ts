// xterm options from the terminal settings (font, theme, cursor, scrollback).
// The visual part of choboTerm's look.ts, and the terminal's translucency
// (Todo #124): "window" fades the terminal view, text included; "background"
// makes the terminal backgrounds see-through and keeps the text solid.

import type {ITerminalOptions} from '@xterm/xterm';
import {fontFamily} from './cjkwidth';
import {themeByName} from './themes';
import {settings as saved, type TermSettings} from './settings';
import {workspaceAction} from './workspaceKeys';

export interface Translucency {
    mode: string; // 'off' | 'window' | 'background'
    opacity: number; // percent
    gpu: boolean;
}

let translucency: Translucency = {mode: 'off', opacity: 100, gpu: false};

const isLinux = typeof navigator !== 'undefined' && /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);

export function seeThroughOn() {
    return translucency.mode !== 'off' && translucency.opacity < 100;
}

/** "배경만": terminal backgrounds are see-through, text stays solid. */
export function glassOn() {
    return seeThroughOn() && translucency.mode === 'background';
}

/** Shows translucency (the saved setting, or the one being tried in Settings) with page classes. */
export function applyTranslucency(mode: string, opacity: number, gpu: boolean) {
    if (isLinux) mode = 'off'; // the window can't be see-through there
    translucency = {mode, opacity, gpu};
    const body = document.body.classList;
    body.toggle('term-seethrough', seeThroughOn());
    body.toggle('term-glass', glassOn());
    body.toggle('term-fade', seeThroughOn() && mode === 'window');
    document.documentElement.style.setProperty('--term-fade', String(opacity / 100));
}

/** Shows the translucency the settings keep (off, 85% when not set). */
export function applySavedTranslucency(s: TermSettings = saved) {
    applyTranslucency(s.translucency || 'off', s.opacity || 85, s.glassGpu);
}

export function resetTranslucencyForTest() {
    applyTranslucency('off', 100, false);
}

/** #rrggbb with the background opacity, for see-through terminals. */
export function seeThrough(color: string): string {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(color);
    if (!m) return color;
    const [r, g, b] = m.slice(1).map(h => parseInt(h, 16));
    return `rgba(${r}, ${g}, ${b}, ${translucency.opacity / 100})`;
}

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
/** A key the workspace handles itself (core/workspaceKeys.ts): xterm must not turn it into input. */
export function isWorkspaceKey(ev: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'> & {code?: string}): boolean {
    return workspaceAction(ev) !== undefined;
}

/** Alt+arrow moves between panes — only in a split tab; otherwise the program gets it. */
export function isPaneMoveKey(ev: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey'>): boolean {
    return ev.altKey && !ev.ctrlKey && !ev.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key);
}
