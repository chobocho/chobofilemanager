import {describe, it, expect, beforeEach} from 'vitest';
import {prefsForm, readPrefs, writePrefs, previewLines} from './prefs';
import {defaultSettings, resetSettingsForTest, settings} from './settings';
import {paletteOf, themeByName} from './themes';

// ─── Todo #121: 설정 창 — 입력값 읽기/검사/저장 (choboTerm prefs.ts) ───────

describe('prefs (PF)', () => {
    beforeEach(() => resetSettingsForTest());

    it('PF-01: 설정 → 입력값 (붙여넣기 확인·일반 텍스트 로그는 반대로 저장된 값)', () => {
        const f = prefsForm({...defaultSettings(), pasteNoConfirm: true, logRaw: false, fontSize: 17});
        expect(f.fontSize).toBe('17');
        expect(f.pasteConfirm).toBe(false);
        expect(f.logPlain).toBe(true);
        expect(f.theme).toBe('choboterm');
        expect(f.hlRed).toContain('error');
    });

    it('PF-02: 없는 테마 이름은 기본 테마로', () => {
        expect(prefsForm({...defaultSettings(), theme: 'nope'}).theme).toBe(themeByName('nope').name);
    });

    it('PF-03: 숫자 범위 검사 — 글꼴 8~40, 스크롤백 1000~100000, 연결 유지 0~3600', () => {
        const f = prefsForm(defaultSettings());
        expect(readPrefs({...f, fontSize: '7'})).toEqual({error: '글꼴 크기: 8~40 사이의 숫자를 입력하세요', field: 'fontSize'});
        expect(readPrefs({...f, fontSize: '12.5'})).toMatchObject({field: 'fontSize'});
        expect(readPrefs({...f, scrollback: '999'})).toMatchObject({error: '스크롤백: 1000~100000 사이의 숫자를 입력하세요', field: 'scrollback'});
        expect(readPrefs({...f, keepAlive: '-1'})).toMatchObject({field: 'keepAlive'});
        expect(readPrefs({...f, keepAlive: ' 0 '})).toMatchObject({values: {keepAlive: 0}});
    });

    it('PF-04: 맞는 입력 → 저장할 값 (반대 의미 되돌림, 앞뒤 공백 제거)', () => {
        const f = {...prefsForm(defaultSettings()), fontSize: '20', pasteConfirm: false, logPlain: false, logDir: ' D:\\logs ', hlGreen: ' ok '};
        const r = readPrefs(f);
        expect('values' in r).toBe(true);
        const v = (r as any).values;
        expect(v.fontSize).toBe(20);
        expect(v.pasteNoConfirm).toBe(true);
        expect(v.logRaw).toBe(true);
        expect(v.logDir).toBe('D:\\logs');
        expect(v.highlight.green).toBe('ok');
    });

    it('PF-05: writePrefs — 설정에 반영 (다른 값은 유지)', () => {
        settings.macros = [{key: 'F1', text: 'x'}];
        const r = readPrefs({...prefsForm(settings), theme: 'dracula', cursorStyle: 'bar'}) as any;
        writePrefs(r.values);
        expect(settings.theme).toBe('dracula');
        expect(settings.cursorStyle).toBe('bar');
        expect(settings.macros).toHaveLength(1);
    });

    it('PF-06: 테마 미리보기 — 프롬프트·ls·오류/경고/완료 줄, 16색', () => {
        const p = previewLines('dracula');
        const pal = paletteOf(themeByName('dracula').theme);
        expect(p.background).toBe(themeByName('dracula').theme.background);
        expect(p.lines[0].map(x => x.text).join('')).toBe('user@busan:~/src$ ls -l');
        expect(p.lines[0][0].color).toBe(pal[10]);
        expect(p.lines[2].map(x => x.text).join('')).toBe('오류: 경고 완료');
        expect(p.swatches).toHaveLength(16);
    });
});
