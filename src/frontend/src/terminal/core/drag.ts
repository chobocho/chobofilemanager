// Dragging with the mouse outside the element too (Todo #126): the split
// gutters and the dock's top edge. move gets every mousemove until the button
// is released; returns a function that stops early.

export function startWindowDrag(move: (ev: MouseEvent) => void, onEnd?: () => void): () => void {
    const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        onEnd?.();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return up;
}

/** A 0..1 ratio as a CSS percentage with two decimals. */
export function pct(v: number): string {
    return `${Math.round(v * 10000) / 100}%`;
}

/** A layout rectangle (ratios) as absolute-position CSS. */
export function rectStyle(r: {x: number; y: number; w: number; h: number}) {
    return {left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h)};
}
