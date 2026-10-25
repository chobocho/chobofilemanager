// The Settings window's fields (Todo #121, choboTerm prefs.ts): settings →
// what the form shows, the form → checked values, and the theme preview.
// Translucency, the web server, updates, the cat and the language come with
// the stage that ports them (Todo #124).

import {saveSettings, type TermSettings} from './settings';
import {paletteOf, themeByName} from './themes';

export interface PrefsForm {
    fontSize: string;
    fontUtf8: string;
    fontEucKr: string;
    theme: string;
    cursorStyle: string;
    cursorBlink: boolean;
    scrollback: string;
    keepAlive: string;
    autoReconnect: boolean;
    pasteConfirm: boolean;
    logAuto: boolean;
    logPlain: boolean;
    logTime: boolean;
    logDir: string;
    hlOn: boolean;
    hlRed: string;
    hlYellow: string;
    hlGreen: string;
    language: string; // '' = the system's, 'ko', 'en'
    translucency: string;
    opacity: string;
    glassGpu: boolean;
    updateCheck: boolean;
    cat: boolean;
    ftpButton: boolean;
}

export type PrefsValues = Pick<TermSettings, 'fontSize' | 'fontUtf8' | 'fontEucKr' | 'theme' | 'cursorStyle' | 'cursorBlink' | 'scrollback' |
    'keepAlive' | 'autoReconnect' | 'pasteNoConfirm' | 'logAuto' | 'logRaw' | 'logTime' | 'logDir' | 'highlight' | 'language' | 'translucency' | 'opacity' | 'glassGpu' | 'updateCheck' | 'cat' | 'hideFtpButton'>;

export function prefsForm(s: TermSettings): PrefsForm {
    return {
        fontSize: String(s.fontSize),
        fontUtf8: s.fontUtf8,
        fontEucKr: s.fontEucKr,
        theme: themeByName(s.theme).name,
        cursorStyle: s.cursorStyle || 'block',
        cursorBlink: s.cursorBlink,
        scrollback: String(s.scrollback),
        keepAlive: String(s.keepAlive),
        autoReconnect: s.autoReconnect,
        pasteConfirm: !s.pasteNoConfirm,
        logAuto: s.logAuto,
        logPlain: !s.logRaw,
        logTime: s.logTime,
        logDir: s.logDir,
        hlOn: s.highlight?.on ?? false,
        hlRed: s.highlight?.red ?? '',
        hlYellow: s.highlight?.yellow ?? '',
        hlGreen: s.highlight?.green ?? '',
        language: s.language || '',
        translucency: s.translucency || 'off',
        opacity: String(s.opacity || 85),
        glassGpu: !!s.glassGpu,
        updateCheck: !!s.updateCheck,
        cat: s.cat !== false,
        ftpButton: !s.hideFtpButton,
    };
}

const RANGES = {
    fontSize: [8, 40, '글꼴 크기'],
    scrollback: [1000, 100000, '스크롤백'],
    keepAlive: [0, 3600, '연결 유지 간격'],
} as const;

/** Checks the numbers; the first bad field and its message, or the values to save. */
export function readPrefs(f: PrefsForm): {values: PrefsValues} | {error: string; field: keyof PrefsForm} {
    const nums: Record<string, number> = {};
    for (const [field, [min, max, what]] of Object.entries(RANGES)) {
        const n = Number(String(f[field as keyof PrefsForm]).trim());
        if (!Number.isInteger(n) || n < min || n > max) {
            return {error: `${what}: ${min}~${max} 사이의 숫자를 입력하세요`, field: field as keyof PrefsForm};
        }
        nums[field] = n;
    }
    return {
        values: {
            fontSize: nums.fontSize,
            fontUtf8: f.fontUtf8,
            fontEucKr: f.fontEucKr,
            theme: f.theme,
            cursorStyle: f.cursorStyle,
            cursorBlink: f.cursorBlink,
            scrollback: nums.scrollback,
            keepAlive: nums.keepAlive,
            autoReconnect: f.autoReconnect,
            pasteNoConfirm: !f.pasteConfirm,
            logAuto: f.logAuto,
            logRaw: !f.logPlain,
            logTime: f.logTime,
            logDir: f.logDir.trim(),
            highlight: {on: f.hlOn, red: f.hlRed.trim(), yellow: f.hlYellow.trim(), green: f.hlGreen.trim()},
            language: f.language,
            translucency: f.translucency,
            opacity: Number(f.opacity) || 85,
            glassGpu: f.glassGpu,
            updateCheck: f.updateCheck,
            cat: f.cat,
            hideFtpButton: !f.ftpButton,
        },
    };
}

export function writePrefs(v: PrefsValues) {
    saveSettings(s => Object.assign(s, v));
}

export interface Preview {
    background: string;
    foreground: string;
    lines: {text: string; color?: string}[][];
    swatches: string[];
}

/** A prompt, an ls line and error/warning/done words in the theme's colors, and its 16 colors. */
export function previewLines(name: string): Preview {
    const t = themeByName(name).theme;
    const p = paletteOf(t);
    const seg = (text: string, color?: string) => ({text, color});
    return {
        background: t.background ?? '#000000',
        foreground: t.foreground ?? '#ffffff',
        lines: [
            [seg('user@busan', p[10]), seg(':'), seg('~/src', p[12]), seg('$ ls -l')],
            [seg('drwxr-xr-x  '), seg('docs', p[12]), seg('  '), seg('run.sh', p[10]), seg('  '), seg('a.tar.gz', p[9]), seg('  '), seg('link', p[14])],
            [seg('오류: ', p[1]), seg('경고 ', p[3]), seg('완료', p[2])],
        ],
        swatches: p,
    };
}
