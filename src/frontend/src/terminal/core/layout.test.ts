import {describe, it, expect} from 'vitest';
import {leaf, splitAt, removeLeaf, paneRects, gutters, setRatio, nearestPane, leaves, splitKeyDir} from './layout';

// ─── Todo #121: 분할 레이아웃 (tmux식, choboTerm split.ts 이식 — 트리 + 좌표 계산) ───

describe('layout (LY)', () => {
    it('LY-01: 분할 — row는 오른쪽, col은 아래에 새 칸, 반반', () => {
        const l = splitAt(leaf(1), 1, 2, 'row');
        expect(leaves(l)).toEqual([1, 2]);
        expect(paneRects(l)).toEqual({1: {x: 0, y: 0, w: 0.5, h: 1}, 2: {x: 0.5, y: 0, w: 0.5, h: 1}});
        const c = splitAt(leaf(1), 1, 2, 'col');
        expect(paneRects(c)[2]).toEqual({x: 0, y: 0.5, w: 1, h: 0.5});
    });

    it('LY-02: 중첩 분할 — 해당 칸만 다시 나눔', () => {
        let l = splitAt(leaf(1), 1, 2, 'row');
        l = splitAt(l, 2, 3, 'col');
        const r = paneRects(l);
        expect(r[1]).toEqual({x: 0, y: 0, w: 0.5, h: 1});
        expect(r[2]).toEqual({x: 0.5, y: 0, w: 0.5, h: 0.5});
        expect(r[3]).toEqual({x: 0.5, y: 0.5, w: 0.5, h: 0.5});
    });

    it('LY-03: 칸 제거 — 남은 쪽이 분할 자리를 차지, 마지막 칸이면 null', () => {
        let l = splitAt(leaf(1), 1, 2, 'row');
        l = splitAt(l, 2, 3, 'col');
        const without2 = removeLeaf(l, 2)!;
        expect(leaves(without2)).toEqual([1, 3]);
        expect(paneRects(without2)[3]).toEqual({x: 0.5, y: 0, w: 0.5, h: 1});
        expect(removeLeaf(leaf(1), 1)).toBeNull();
        expect(removeLeaf(leaf(1), 9)).toEqual(leaf(1));
    });

    it('LY-04: 경계선 위치와 비율 조정(10%~90%로 제한)', () => {
        const l = splitAt(leaf(1), 1, 2, 'row');
        const g = gutters(l);
        expect(g).toHaveLength(1);
        expect(g[0]).toMatchObject({dir: 'row', x: 0.5, y: 0, h: 1});
        const moved = setRatio(l, g[0].path, 0.7);
        expect(paneRects(moved)[1].w).toBeCloseTo(0.7);
        expect(paneRects(setRatio(l, g[0].path, 0.99))[1].w).toBeCloseTo(0.9);
        expect(paneRects(setRatio(l, g[0].path, 0))[1].w).toBeCloseTo(0.1);
    });

    it('LY-05: Alt+방향키 — 그 방향의 가장 가까운 칸', () => {
        let l = splitAt(leaf(1), 1, 2, 'row');
        l = splitAt(l, 2, 3, 'col'); // 1 | 2/3
        expect(nearestPane(l, 1, 1, 0)).toBe(2);   // 오른쪽: 2와 3 중 가까운 쪽(위)
        expect(nearestPane(l, 3, -1, 0)).toBe(1);
        expect(nearestPane(l, 2, 0, 1)).toBe(3);
        expect(nearestPane(l, 3, 0, -1)).toBe(2);
        expect(nearestPane(l, 1, -1, 0)).toBeUndefined();
    });

    it('LY-06: 분할 단축키 — 물리 키 기준 (한국어 키보드 ₩ 포함)', () => {
        expect(splitKeyDir({ctrlKey: true, shiftKey: true, altKey: false, code: 'Backslash'})).toBe('row');
        expect(splitKeyDir({ctrlKey: true, shiftKey: true, altKey: false, code: 'IntlYen'})).toBe('row');
        expect(splitKeyDir({ctrlKey: true, shiftKey: true, altKey: false, code: 'Minus'})).toBe('col');
        expect(splitKeyDir({ctrlKey: true, shiftKey: false, altKey: false, code: 'Minus'})).toBeUndefined();
    });
});
