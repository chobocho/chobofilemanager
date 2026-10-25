import {describe, it, expect, afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

// ─── Lua 결과 창 닫기: CSS의 display가 [hidden]을 덮어 창이 안 사라지던 버그 ──────────

// vitest는 CSS를 비워 import하므로 파일을 직접 읽음 (cwd = src/frontend)
const css = readFileSync(resolve('src/terminal/styles/cat.css'), 'utf8');
let style: HTMLStyleElement | undefined, el: HTMLElement | undefined;
afterEach(() => { style?.remove(); el?.remove(); });

describe('Lua 결과 창 CSS (CC)', () => {
    it('CC-01: hidden이면 .dialog 모양이어도 display:none', () => {
        style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
        el = document.createElement('div');
        el.id = 'luaResult';
        el.className = 'dialog';
        document.body.appendChild(el);
        expect(getComputedStyle(el).display).toBe('flex');
        el.hidden = true;
        expect(getComputedStyle(el).display).toBe('none');
    });
});
