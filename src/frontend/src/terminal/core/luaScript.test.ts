import {describe, it, expect} from 'vitest';
import {elapsedText, scriptBadge, boxHead, addLines, historyStep, VISIBLE_LINES} from './luaScript';

// ─── Todo #124: Lua 스크립트·콘솔 — 시간·제목·줄 보관·입력 기록 ────────────────

describe('luaScript (LS)', () => {
    it('LS-01: 경과 시간 m:ss, 한 시간 넘으면 h:mm:ss', () => {
        expect(elapsedText(0)).toBe('0:00');
        expect(elapsedText(65_000)).toBe('1:05');
        expect(elapsedText(3_725_000)).toBe('1:02:05');
    });

    it('LS-02: 탭 배지 — 스크립트 ▶ 시간, 콘솔은 Lua (실행 중이면 ▶)', () => {
        expect(scriptBadge({name: 'a.lua', started: 1000, console: false}, undefined, 61_000)).toEqual({text: '▶ 1:00', title: 'Lua 스크립트 실행 중: a.lua\n탭 우클릭 → 스크립트 중지'});
        expect(scriptBadge({name: '콘솔', started: 0, console: true}, undefined, 5000)?.text).toBe('Lua');
        expect(scriptBadge({name: '콘솔', started: 0, console: true}, {id: 1, started: 1000}, 3000)?.text).toBe('▶ 0:02');
        expect(scriptBadge(null, undefined, 0)).toBeNull();
    });

    it('LS-03: 상자 제목 — 실행 중 / 콘솔 / 끝 / 멈춤 / 오류', () => {
        expect(boxHead({state: 'run', name: 'a.lua', started: 0}, 2000)).toBe('▶ a.lua · 0:02');
        expect(boxHead({state: 'console', name: 'Lua 콘솔', started: 0}, 0)).toBe('Lua 콘솔');
        expect(boxHead({state: 'console', name: 'Lua 콘솔', started: 0, busy: {id: 1, started: 0}}, 3000)).toBe('▶ Lua 콘솔 · 실행 중 0:03');
        expect(boxHead({state: 'done', name: 'a.lua', started: 0, ms: 4000}, 0)).toBe('✔ a.lua · 끝 · 0:04');
        expect(boxHead({state: 'stopped', name: 'a.lua', started: 0, ms: 1000}, 0)).toBe('■ a.lua · 멈춤 · 0:01');
        expect(boxHead({state: 'failed', name: 'a.lua', started: 0, ms: 1000}, 0)).toBe('✖ a.lua · 0:01');
    });

    it('LS-04: 줄 추가 — 여러 줄은 나눔, 화면엔 마지막 200줄, 저장용 기록은 22000 넘으면 20000으로', () => {
        let box = {lines: [] as any[], log: [] as string[]};
        box = addLines(box, 'a\nb', 'err');
        expect(box.lines).toEqual([{text: 'a', cls: 'err'}, {text: 'b', cls: 'err'}]);
        expect(box.log).toEqual(['a', 'b']);
        for (let i = 0; i < 300; i++) box = addLines(box, `l${i}`);
        expect(box.lines).toHaveLength(VISIBLE_LINES);
        expect(box.lines[VISIBLE_LINES - 1].text).toBe('l299');
        box = {...box, log: Array.from({length: 22000}, (_, i) => String(i))};
        box = addLines(box, 'x');
        expect(box.log).toHaveLength(20000);
        expect(box.log[box.log.length - 1]).toBe('x');
    });

    it('LS-05: 입력 기록 ↑↓ — 첫 줄/끝 줄에서만, 끝에서 ↓는 빈 입력', () => {
        const h = ['one', 'two'];
        expect(historyStep(h, 2, -1, 0, 1)).toEqual({pos: 1, text: 'two'});
        expect(historyStep(h, 1, -1, 0, 1)).toEqual({pos: 0, text: 'one'});
        expect(historyStep(h, 0, -1, 0, 1)).toBeNull();
        expect(historyStep(h, 1, 1, 0, 1)).toEqual({pos: 2, text: ''});
        expect(historyStep(h, 2, 1, 0, 1)).toBeNull();
        expect(historyStep(h, 2, -1, 1, 2)).toBeNull(); // 커서가 둘째 줄 → 일반 이동
    });
});
