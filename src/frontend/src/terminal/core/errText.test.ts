import {describe, it, expect} from 'vitest';
import {errText} from './errText';
import {applySavedTranslucency, resetTranslucencyForTest} from './look';
import {resetSettingsForTest, settings} from './settings';

// ─── Todo #126: 여러 곳에 흩어져 있던 도우미를 한 곳으로 ─────────────────────────

describe('공용 도우미 (UT)', () => {
    it('UT-01: errText — Error는 메시지, Go가 보낸 문자열은 그대로', () => {
        expect(errText(new Error('연결 끊김'))).toBe('연결 끊김');
        expect(errText('Host를 입력하세요')).toBe('Host를 입력하세요');
        expect(errText({message: 'x'})).toBe('x');
        expect(errText(undefined)).toBe('undefined');
        expect(errText(null)).toBe('null');
    });

    it('UT-02: applySavedTranslucency — 저장된 설정으로 (기본값 off·85)', () => {
        resetSettingsForTest();
        settings.translucency = 'window';
        settings.opacity = 70;
        applySavedTranslucency();
        expect(document.body.classList.contains('term-fade')).toBe(true);
        expect(document.documentElement.style.getPropertyValue('--term-fade')).toBe('0.7');
        settings.translucency = '';
        applySavedTranslucency();
        expect(document.body.classList.contains('term-fade')).toBe(false);
        resetTranslucencyForTest();
    });
});
