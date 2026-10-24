// Split panes of a terminal tab as a tree (Todo #121, choboTerm split.ts ported).
// The React view keeps every pane mounted under one parent and places it with
// the rectangles computed here, so splitting never re-creates a terminal.

export type SplitDir = 'row' | 'col'; // row: side by side, col: one above the other

export type Layout =
    | {type: 'pane'; id: number}
    | {type: 'split'; dir: SplitDir; ratio: number; a: Layout; b: Layout};

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export const leaf = (id: number): Layout => ({type: 'pane', id});

/** Puts newId next to id (right of it for row, below it for col), halving its space. */
export function splitAt(l: Layout, id: number, newId: number, dir: SplitDir): Layout {
    if (l.type === 'pane') return l.id === id ? {type: 'split', dir, ratio: 0.5, a: l, b: leaf(newId)} : l;
    return {...l, a: splitAt(l.a, id, newId, dir), b: splitAt(l.b, id, newId, dir)};
}

/** Takes id out; the part left over takes the split's place. null when nothing is left. */
export function removeLeaf(l: Layout, id: number): Layout | null {
    if (l.type === 'pane') return l.id === id ? null : l;
    const a = removeLeaf(l.a, id);
    const b = removeLeaf(l.b, id);
    if (!a) return b;
    if (!b) return a;
    return a === l.a && b === l.b ? l : {...l, a, b};
}

export function leaves(l: Layout): number[] {
    return l.type === 'pane' ? [l.id] : [...leaves(l.a), ...leaves(l.b)];
}

/** Each pane's rectangle as fractions of the tab area. */
export function paneRects(l: Layout, r: Rect = {x: 0, y: 0, w: 1, h: 1}, out: Record<number, Rect> = {}): Record<number, Rect> {
    if (l.type === 'pane') {
        out[l.id] = r;
        return out;
    }
    const [ra, rb] = splitRect(l, r);
    paneRects(l.a, ra, out);
    paneRects(l.b, rb, out);
    return out;
}

function splitRect(l: Extract<Layout, {type: 'split'}>, r: Rect): [Rect, Rect] {
    if (l.dir === 'row') {
        const wa = r.w * l.ratio;
        return [{x: r.x, y: r.y, w: wa, h: r.h}, {x: r.x + wa, y: r.y, w: r.w - wa, h: r.h}];
    }
    const ha = r.h * l.ratio;
    return [{x: r.x, y: r.y, w: r.w, h: ha}, {x: r.x, y: r.y + ha, w: r.w, h: r.h - ha}];
}

export interface Gutter extends Rect {
    dir: SplitDir;
    /** a/b steps from the root to the split (identifies it for setRatio). */
    path: string;
    /** The split's own rectangle, for turning a mouse position into a ratio. */
    area: Rect;
}

/** The dividers: a line (zero width or height) between the two halves of each split. */
export function gutters(l: Layout, r: Rect = {x: 0, y: 0, w: 1, h: 1}, path = '', out: Gutter[] = []): Gutter[] {
    if (l.type === 'pane') return out;
    const [ra, rb] = splitRect(l, r);
    if (l.dir === 'row') out.push({dir: 'row', path, area: r, x: ra.x + ra.w, y: r.y, w: 0, h: r.h});
    else out.push({dir: 'col', path, area: r, x: r.x, y: ra.y + ra.h, w: r.w, h: 0});
    gutters(l.a, ra, path + 'a', out);
    gutters(l.b, rb, path + 'b', out);
    return out;
}

/** Sets the ratio of the split at path (kept between 10% and 90%). */
export function setRatio(l: Layout, path: string, ratio: number): Layout {
    if (l.type === 'pane') return l;
    if (path === '') return {...l, ratio: Math.max(0.1, Math.min(0.9, ratio))};
    return path[0] === 'a' ? {...l, a: setRatio(l.a, path.slice(1), ratio)} : {...l, b: setRatio(l.b, path.slice(1), ratio)};
}

/** The nearest pane beyond id's edge in the direction (dx, dy). */
export function nearestPane(l: Layout, id: number, dx: number, dy: number): number | undefined {
    const rects = paneRects(l);
    const c = rects[id];
    if (!c) return undefined;
    const eps = 1e-9;
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    let best: number | undefined;
    let bestDist = Infinity;
    for (const [k, r] of Object.entries(rects)) {
        const other = Number(k);
        if (other === id) continue;
        const beyond = dx < 0 ? r.x + r.w <= c.x + eps : dx > 0 ? r.x >= c.x + c.w - eps
            : dy < 0 ? r.y + r.h <= c.y + eps : r.y >= c.y + c.h - eps;
        if (!beyond) continue;
        const dist = Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy);
        if (dist < bestDist) {
            best = other;
            bestDist = dist;
        }
    }
    return best;
}

/**
 * Ctrl+Shift+\ (a "|": side by side) and Ctrl+Shift+- (one above the other) split
 * the pane, as in tmux. By physical key, so ₩ on Korean keyboards works too.
 */
export function splitKeyDir(ev: Pick<KeyboardEvent, 'ctrlKey' | 'shiftKey' | 'altKey' | 'code'>): SplitDir | undefined {
    if (!ev.ctrlKey || !ev.shiftKey || ev.altKey) return undefined;
    if (ev.code === 'Backslash' || ev.code === 'IntlYen') return 'row';
    if (ev.code === 'Minus') return 'col';
    return undefined;
}

export const ARROWS: Record<string, [number, number]> = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
