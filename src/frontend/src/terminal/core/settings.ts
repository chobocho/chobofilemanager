// Terminal preferences, stored by the Go side (internal/config) in
// ~/.chobocho-commander/term/settings.json. Ported from choboTerm's settings.ts;
// the generated Go model type is replaced by a structural one so this module
// doesn't depend on wailsjs/go (generated, not in the repository).

import {termApi} from './termApi';

export interface TermSettings {
    fontSize: number;
    fontUtf8: string;
    fontEucKr: string;
    theme: string;
    cursorStyle: string;
    cursorBlink: boolean;
    scrollback: number;
    translucency: string;
    opacity: number;
    glassGpu: boolean;
    pasteNoConfirm: boolean;
    keepAlive: number;
    autoReconnect: boolean;
    logAuto: boolean;
    logDir: string;
    logRaw: boolean;
    logTime: boolean;
    consoleHeight: number;
    updateCheck: boolean;
    cat: boolean;
    catIntro: boolean;
    hideFtpButton: boolean;
    dockerEngines: Record<string, string>;
    language: string;
    highlight: {on: boolean; red: string; yellow: string; green: string};
    macros: any[];
    [key: string]: any;
}

export function defaultSettings(): TermSettings {
    return {
        fontSize: 15,
        fontUtf8: 'D2Coding',
        fontEucKr: 'GulimChe',
        theme: 'choboterm',
        cursorStyle: 'block',
        cursorBlink: true,
        scrollback: 5000,
        translucency: 'off',
        opacity: 85,
        glassGpu: false,
        pasteNoConfirm: false,
        keepAlive: 60,
        autoReconnect: true,
        logAuto: false,
        logDir: '',
        logRaw: false,
        logTime: true,
        consoleHeight: 0,
        updateCheck: false,
        cat: true,
        catIntro: false,
        hideFtpButton: false,
        dockerEngines: {},
        language: '',
        highlight: {
            on: true,
            red: 'error, errors, fail, failed, failure, fatal, denied, refused, exception, panic, critical, 오류, 에러, 실패',
            yellow: 'warn, warning, warnings, timeout, deprecated, 경고',
            green: 'success, successful, succeeded, passed, 성공, 완료',
        },
        macros: [],
    };
}

export let settings: TermSettings = defaultSettings();

let timer = 0;

// Who shows a setting outside the terminal (the file manager's toolbar) hears of changes.
const listeners = new Set<() => void>();
export function onSettingsChange(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}
const changed = () => listeners.forEach(fn => fn());

export async function loadSettings(): Promise<TermSettings> {
    try {
        const s = await termApi.GetSettings();
        if (s && typeof s === 'object') settings = {...defaultSettings(), ...s};
        settings.macros ??= [];
    } catch {
        // Keep the defaults.
    }
    changed();
    return settings;
}

/** Changes settings and writes them shortly after (several quick changes are written once). */
export function saveSettings(change: (s: TermSettings) => void) {
    change(settings);
    changed();
    clearTimeout(timer);
    timer = window.setTimeout(() => {
        termApi.SaveSettings(settings).catch(() => undefined);
    }, 300);
}

/** Tests: start from the defaults again. */
export function resetSettingsForTest() {
    settings = defaultSettings();
    clearTimeout(timer);
}
