import {describe, it, expect, vi} from 'vitest';
import {startWindowDrag, pct, rectStyle} from './drag';

// ─── Todo #126: 끌기·칸 좌표 도우미 (분할 경계선과 도크가 함께 씀) ────────────────

describe('drag (DR)', () => {
    it('DR-01: 버튼을 놓을 때까지 창 전체의 mousemove, 놓으면 끝', () => {
        const move = vi.fn(), end = vi.fn();
        startWindowDrag(move, end);
        window.dispatchEvent(new MouseEvent('mousemove', {clientX: 5}));
        window.dispatchEvent(new MouseEvent('mouseup'));
        window.dispatchEvent(new MouseEvent('mousemove', {clientX: 9}));
        expect(move).toHaveBeenCalledTimes(1);
        expect(end).toHaveBeenCalledTimes(1);
    });

    it('DR-02: 돌려받은 함수로 일찍 멈춤', () => {
        const move = vi.fn();
        const stop = startWindowDrag(move);
        stop();
        window.dispatchEvent(new MouseEvent('mousemove'));
        expect(move).not.toHaveBeenCalled();
    });

    it('DR-03: 비율 → 퍼센트, 칸 좌표 → 위치 스타일', () => {
        expect(pct(0.5)).toBe('50%');
        expect(pct(1 / 3)).toBe('33.33%');
        expect(rectStyle({x: 0, y: 0.5, w: 0.25, h: 0.5})).toEqual({left: '0%', top: '50%', width: '25%', height: '50%'});
    });
});
