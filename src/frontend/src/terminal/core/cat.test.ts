import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {mountCat, type CatHandle} from './cat';
import {setTermBackend} from './termApi';
import {resetSettingsForTest, settings} from './settings';

// ─── Todo #124: 고양이 (choboTerm cat.ts) — 보이기/숨기기, 클릭하면 Lua, 정리 ──────

let api: any, cat: CatHandle | undefined, focusActive: any;
beforeEach(() => {
    resetSettingsForTest();
    settings.catIntro = true; // 처음 안내는 따로 확인
    (Element.prototype as any).setPointerCapture ??= () => {};
    (Element.prototype as any).releasePointerCapture ??= () => {};
    api = {
        EvalLua: vi.fn().mockResolvedValue({output: '야옹', value: '3', error: '', ms: 4, open: []}),
        OpenTarget: vi.fn().mockResolvedValue({target: 'https://github.com', inPage: false}),
        SaveSettings: vi.fn().mockResolvedValue(undefined),
    };
    setTermBackend(api, {EventsOn: () => () => {}, BrowserOpenURL: vi.fn(), ClipboardSetText: vi.fn().mockResolvedValue(true)} as any);
    focusActive = vi.fn();
    cat = mountCat({floor: () => document.body, cursorTerm: () => undefined, focusActive});
});
afterEach(() => {
    cat?.dispose();
    setTermBackend(null);
    vi.useRealTimers();
});

const catEl = () => document.getElementById('cat') as HTMLElement;
function click(el: HTMLElement) {
    el.dispatchEvent(new PointerEvent('pointerdown', {button: 0, clientX: 10, clientY: 10, pointerId: 1, bubbles: true}));
    el.dispatchEvent(new PointerEvent('pointerup', {button: 0, clientX: 10, clientY: 10, pointerId: 1, bubbles: true}));
}

describe('고양이 (CT)', () => {
    it('CT-01: 설정을 따라 보이기/숨기기, 움직임 상태를 data-act로', () => {
        settings.cat = true;
        cat!.apply();
        expect(catEl().hidden).toBe(false);
        expect(catEl().dataset.act).toMatch(/^\w+:\d+$/);
        expect(catEl().title).toContain('클릭하면 Lua 실행');
        settings.cat = false;
        cat!.apply();
        expect(catEl().hidden).toBe(true);
    });

    it('CT-02: 클릭 → Lua 상자, Ctrl+Enter 실행 → 결과 창(> 코드, 출력, = 값, -- ms)', async () => {
        settings.cat = true;
        cat!.apply();
        click(catEl());
        const box = document.getElementById('catBubble')!;
        expect(box.hidden).toBe(false);
        const input = box.querySelector('textarea')!;
        input.value = 'print("야옹")\n1 + 2';
        input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', ctrlKey: true, bubbles: true}));
        await vi.waitFor(() => expect(api.EvalLua).toHaveBeenCalledWith('print("야옹")\n1 + 2'));
        const log = document.querySelector('#luaResult .log') as HTMLTextAreaElement;
        await vi.waitFor(() => expect(log.value).toBe('> print("야옹")\n  1 + 2\n야옹\n= 3\n-- 4ms'));
        expect(document.getElementById('luaResult')!.hidden).toBe(false);
    });

    it('CT-03: 웹 주소·폴더는 Lua 대신 열기 (OpenTarget)', async () => {
        settings.cat = true;
        cat!.apply();
        click(catEl());
        const input = document.querySelector('#catBubble textarea') as HTMLTextAreaElement;
        input.value = '열기 github.com';
        (document.querySelector('#catBubble .run') as HTMLButtonElement).click();
        await vi.waitFor(() => expect(api.OpenTarget).toHaveBeenCalledWith('url', 'github.com'));
        expect(api.EvalLua).not.toHaveBeenCalled();
    });

    it('CT-04: 처음이면 안내 말풍선, "지금 숨기기"는 고양이를 끄고 기억', async () => {
        vi.useFakeTimers();
        settings.cat = true;
        settings.catIntro = false;
        cat!.apply();
        vi.advanceTimersByTime(1600);
        const box = document.getElementById('catBubble')!;
        expect(box.textContent).toContain('저를 클릭하면 Lua 코드를 실행할 수 있어요');
        (box.querySelector('.hide') as HTMLButtonElement).click();
        expect(settings.cat).toBe(false);
        expect(settings.catIntro).toBe(true);
        expect(catEl().hidden).toBe(true);
    });

    it('CT-05: dispose → 고양이·말풍선·결과 창이 페이지에서 사라짐', () => {
        settings.cat = true;
        cat!.apply();
        cat!.dispose();
        cat = undefined;
        expect(document.getElementById('cat')).toBeNull();
        expect(document.getElementById('catBubble')).toBeNull();
        expect(document.getElementById('luaResult')).toBeNull();
        // 남은 리스너가 없어야 함: 키를 눌러도 오류 없음
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'a'}));
    });

    it('CT-06: Lua 상자 닫기 → 터미널로 포커스', () => {
        settings.cat = true;
        cat!.apply();
        click(catEl());
        (document.querySelector('#catBubble .close') as HTMLButtonElement).click();
        expect(document.getElementById('catBubble')!.hidden).toBe(true);
        expect(focusActive).toHaveBeenCalled();
    });
});
