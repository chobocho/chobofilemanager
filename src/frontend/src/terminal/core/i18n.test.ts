import {describe, it, expect, afterEach} from 'vitest';
import {tr, setLang, currentLang, startI18n, stopI18n, resolveLang} from './i18n';

// ─── Todo #124: 영어 화면 (choboTerm i18n.ts) — 터미널 영역만 번역 ─────────────

afterEach(() => { stopI18n(); setLang('ko'); document.body.innerHTML = ''; });

describe('i18n (IN)', () => {
    it('IN-01: 한국어면 그대로, 영어면 사전의 낱말', () => {
        expect(tr('연결')).toBe('연결');
        setLang('en');
        expect(currentLang()).toBe('en');
        expect(tr('연결')).toBe('Connection');
        expect(tr('  취소  ')).toBe('  Cancel  '); // 앞뒤 공백 유지
        expect(tr('ssh srv')).toBe('ssh srv'); // 한글이 없으면 그대로
        expect(tr('사전에 없는 말')).toBe('사전에 없는 말');
    });

    it('IN-02: {} 자리 — 순서대로, 바뀐 순서는 {0} {1}', () => {
        setLang('en');
        expect(tr('"prod" 전체 열기')).toBe('Open all of "prod"');
        expect(tr('EUC-KR로 읽을 수 없는 글자가 3개 있습니다. 다른 인코딩을 골라 보세요.')).toBe("3 characters can't be read as EUC-KR. Try another encoding.");
    });

    it('IN-03: 여러 줄은 줄마다, Lua 위치 앞머리는 두고 메시지만', () => {
        setLang('en');
        expect(tr('연결\n취소')).toBe('Connection\nCancel');
        expect(tr('console:1: 연결되어 있지 않습니다')).toBe('console:1: Not connected');
        expect(tr('a.lua:3: send: 연결되어 있지 않습니다')).toBe('a.lua:3: send: Not connected');
    });

    it('IN-04: 언어 고르기 — 설정이 우선, 비면 Go가 정한 언어, 그 밖은 한국어', () => {
        expect(resolveLang('en', 'ko')).toBe('en');
        expect(resolveLang('', 'en')).toBe('en');
        expect(resolveLang('', 'fr')).toBe('ko');
        expect(resolveLang(undefined, undefined)).toBe('ko');
    });

    it('IN-05: 화면 번역 — 터미널 영역(글자·title·placeholder)만, 파일 관리자와 터미널 출력은 그대로', async () => {
        document.body.innerHTML = `
          <div id="fm">취소</div>
          <div data-terminal-root><button title="닫기 (Esc)">취소</button><input placeholder="연결"><div class="xterm">취소</div></div>
          <ul data-term-i18n><li>연결</li></ul>`;
        startI18n('en');
        const root = document.querySelector('[data-terminal-root]')!;
        expect(document.getElementById('fm')!.textContent).toBe('취소');
        expect(root.querySelector('button')!.textContent).toBe('Cancel');
        expect(root.querySelector('button')!.getAttribute('title')).toBe('Close (Esc)');
        expect(root.querySelector('input')!.getAttribute('placeholder')).toBe('Connection');
        expect(root.querySelector('.xterm')!.textContent).toBe('취소');
        expect(document.querySelector('[data-term-i18n] li')!.textContent).toBe('Connection');
        // 나중에 생긴 글자도
        const span = document.createElement('span');
        span.textContent = '연결';
        root.appendChild(span);
        await new Promise(r => setTimeout(r, 0));
        expect(span.textContent).toBe('Connection');
        const fm = document.createElement('span');
        fm.textContent = '연결';
        document.getElementById('fm')!.appendChild(fm);
        await new Promise(r => setTimeout(r, 0));
        expect(fm.textContent).toBe('연결');
    });

    it('IN-06: 한국어로 시작하면 아무것도 바꾸지 않음', () => {
        document.body.innerHTML = '<div data-terminal-root>취소</div>';
        startI18n('ko');
        expect(document.body.textContent).toBe('취소');
        expect(document.documentElement.lang).toBe('ko');
    });
});
