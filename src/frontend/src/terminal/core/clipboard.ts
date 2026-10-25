// Copying the selection and pasting into a tab (Todo #124, choboTerm
// clipboard.ts and the copy/paste parts of tabs.ts). Pasting several lines
// asks first: each line break is an Enter and may run a command.

import {settings} from './settings';
import {clipboardSetText, clipboardGetText} from './termApi';
import type {TermSession} from './session';

export const MIN_FONT = 8;
export const MAX_FONT = 40;
export const DEFAULT_FONT = 15;

export interface PasteRequest {
    text: string;
    paste: () => void;
}

/** Several lines are pasted only after asking (Settings can turn the question off). */
export function needsPasteConfirm(text: string): boolean {
    return !settings.pasteNoConfirm && /[\r\n]/.test(text);
}

export function copySelection(s: TermSession) {
    const text = s.term.getSelection?.() ?? '';
    if (text) clipboardSetText(text).catch(() => undefined);
}

/** Pastes text into a connected tab; ask gets the request when it needs a yes first. */
export function pasteText(s: TermSession, text: string, ask: (r: PasteRequest) => void) {
    if (!text || s.state !== 'on') return;
    const paste = () => s.term.paste(text);
    if (needsPasteConfirm(text)) ask({text, paste});
    else paste();
}

export async function pasteClipboard(s: TermSession, ask: (r: PasteRequest) => void) {
    pasteText(s, await clipboardGetText().catch(() => ''), ask);
}

const isLinux = typeof navigator !== 'undefined' && /Linux/.test(navigator.userAgent);

/**
 * In a Windows local shell (cmd, WSL...) Ctrl+V pastes, as in Windows Terminal
 * (Win+V, the clipboard history, sends Ctrl+V too). Letting the key through
 * makes the browser fire a paste event, which goes through the multi-line
 * check. Full-screen programs (vim, nano) get ^V.
 */
export function isLocalPasteKey(s: TermSession, ev: Pick<KeyboardEvent, 'type' | 'key' | 'code' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>): boolean {
    const alt = (s.term as any).buffer?.active?.type === 'alternate';
    return ev.type === 'keydown' && !isLinux && s.proto === 'local' && s.state === 'on' && !alt &&
        ev.ctrlKey && !ev.shiftKey && !ev.altKey && !ev.metaKey && (ev.code === 'KeyV' || ev.key.toLowerCase() === 'v');
}

/** The font size after a change: +1/-1, or 'reset' to the default; kept within 8~40. */
export function nextFontSize(current: number, change: number | 'reset'): number {
    const n = change === 'reset' ? DEFAULT_FONT : current + change;
    return Math.max(MIN_FONT, Math.min(MAX_FONT, Math.round(n)));
}
