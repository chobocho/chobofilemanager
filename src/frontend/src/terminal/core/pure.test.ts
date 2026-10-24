import {describe, it, expect, vi, beforeEach} from 'vitest';
import {Terminal} from '@xterm/xterm';
import {loadUnicodeWidths, NARROW, WIDE, fontFamily, FONTS} from './cjkwidth';
import {THEMES, themeByName, paletteOf} from './themes';
import {splitWords, loadRules} from './highlight';
import {settings, resetSettingsForTest, loadSettings, saveSettings, defaultSettings} from './settings';
import {setTermBackend} from './termApi';

// ─── Todo #119: choboTerm 순수 모듈 (cjkwidth, themes, highlight, settings) ───

describe('cjkwidth (PU)', () => {
    it('PU-01: 실제 xterm에 등록 — WIDE는 모호 폭 문자를 2칸, NARROW는 1칸', () => {
        const term = new Terminal({allowProposedApi: true});
        loadUnicodeWidths(term);
        expect(term.unicode.versions).toContain(NARROW);
        expect(term.unicode.versions).toContain(WIDE);
        const svc = (term as any)._core.unicodeService;
        term.unicode.activeVersion = NARROW;
        expect(svc.getStringCellWidth('①─★')).toBe(3);
        term.unicode.activeVersion = WIDE;
        expect(svc.getStringCellWidth('①─★')).toBe(6);
        // 한글은 어느 쪽이든 2칸, ASCII는 1칸
        expect(svc.getStringCellWidth('한a')).toBe(3);
        term.dispose();
    });

    it('PU-02: 글꼴 목록과 패밀리 문자열', () => {
        expect(FONTS.some(f => f.name === 'D2Coding')).toBe(true);
        expect(fontFamily('D2Coding', false)).toContain('D2Coding');
    });
});

describe('themes (PU)', () => {
    it('PU-10: 모든 테마는 16색 팔레트와 배경/전경을 가짐', () => {
        for (const t of THEMES) {
            expect(t.theme.background, t.name).toBeTruthy();
            expect(t.theme.foreground, t.name).toBeTruthy();
            expect(paletteOf(t.theme).every(Boolean), t.name).toBe(true);
        }
    });
    it('PU-11: 없는 이름은 기본 테마', () => {
        expect(themeByName('nope')).toBe(THEMES[0]);
        expect(themeByName(THEMES[1].name)).toBe(THEMES[1]);
    });
});

describe('highlight (PU)', () => {
    it('PU-20: 쉼표/줄바꿈으로 단어 분리', () => {
        expect(splitWords('a, b\n 오류 ,, ')).toEqual(['a', 'b', '오류']);
    });
    it('PU-21: 규칙 로드 — 꺼져 있으면 예외 없이 비움', () => {
        resetSettingsForTest();
        settings.highlight.on = false;
        expect(() => loadRules()).not.toThrow();
        settings.highlight.on = true;
        expect(() => loadRules()).not.toThrow();
    });
});

describe('settings (PU)', () => {
    beforeEach(() => resetSettingsForTest());

    it('PU-30: Go 설정을 읽어 기본값 위에 덮어씀 (빠진 필드는 기본값)', async () => {
        setTermBackend({GetSettings: vi.fn().mockResolvedValue({fontSize: 20, theme: 'solarized'})} as any);
        const s = await loadSettings();
        expect(s.fontSize).toBe(20);
        expect(s.theme).toBe('solarized');
        expect(s.scrollback).toBe(defaultSettings().scrollback);
        expect(s.macros).toEqual([]);
        setTermBackend(null);
    });

    it('PU-31: 읽기 실패 시 기본값 유지', async () => {
        setTermBackend({GetSettings: vi.fn().mockRejectedValue(new Error('x'))} as any);
        const s = await loadSettings();
        expect(s.fontSize).toBe(15);
        setTermBackend(null);
    });

    it('PU-32: 연속 변경은 300ms 뒤 한 번만 저장', async () => {
        vi.useFakeTimers();
        try {
            const SaveSettings = vi.fn().mockResolvedValue(undefined);
            setTermBackend({SaveSettings} as any);
            saveSettings(s => (s.fontSize = 16));
            saveSettings(s => (s.fontSize = 17));
            expect(SaveSettings).not.toHaveBeenCalled();
            vi.advanceTimersByTime(300);
            expect(SaveSettings).toHaveBeenCalledTimes(1);
            expect(SaveSettings.mock.calls[0][0].fontSize).toBe(17);
        } finally {
            vi.useRealTimers();
            setTermBackend(null);
        }
    });
});
