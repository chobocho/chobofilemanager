// The remote file window's model (Todo #123, choboTerm files.ts): a folder
// listing with a ".." row, the keyboard row and the picked rows, bookmarks
// and recently left folders. Pure functions; the store runs the Go calls.

export interface FileEntry {
    name: string;
    isDir: boolean;
    size: number;
    modTime: string;
}

export interface RemoteView {
    cwd: string;
    home: string;
    entries: FileEntry[];
    selected: number; // the row with the keyboard focus
    picked: Set<number>; // selected rows (Ctrl/Shift+click)
    anchor: number; // where a Shift selection starts
    recent: string[]; // folders left, newest first
}

export interface XferProgress {
    name: string;
    done: number;
    total: number;
    upload: boolean;
}

const MAX_RECENT = 8;

/** The ".." row at the top of every folder but "/". */
export const UP: FileEntry = Object.freeze({name: '..', isDir: true, size: 0, modTime: ''}) as FileEntry;

export const isUp = (e: FileEntry | undefined) => e === UP;

export function formatSize(n: number): string {
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let v = n / 1024;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
    }
    return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function joinPath(dir: string, name: string) {
    return dir.endsWith('/') ? dir + name : `${dir}/${name}`;
}

export function parentPath(dir: string) {
    const trimmed = dir.replace(/\/+$/, '');
    const i = trimmed.lastIndexOf('/');
    return i <= 0 ? '/' : trimmed.slice(0, i);
}

/** A folder as it is compared and saved: without a trailing slash (but "/"). */
export function folderKey(dir: string) {
    return dir.replace(/\/+$/, '') || '/';
}

export function remember(recent: string[], dir: string): string[] {
    const key = folderKey(dir);
    return [key, ...recent.filter(d => d !== key)].slice(0, MAX_RECENT);
}

export function emptyView(home: string, cwd = home): RemoteView {
    return {cwd, home, entries: [], selected: -1, picked: new Set(), anchor: -1, recent: []};
}

/** v after listing dir: names (if given) are picked, otherwise the first real entry. */
export function listed(v: RemoteView, dir: string, list: FileEntry[], names?: string[]): RemoteView {
    const entries = dir === '/' ? [...list] : [UP, ...list];
    const recent = folderKey(v.cwd) !== folderKey(dir) && v.cwd ? remember(v.recent, v.cwd) : v.recent;
    const picked = new Set<number>();
    let selected = entries.length > 1 && entries[0] === UP ? 1 : entries.length > 0 ? 0 : -1;
    if (names?.length) {
        entries.forEach((e, i) => e !== UP && names.includes(e.name) && picked.add(i));
        if (picked.size) selected = Math.min(...picked);
    } else if (selected >= 0) {
        picked.add(selected);
    }
    return {...v, cwd: dir, entries, recent, picked, selected, anchor: selected};
}

/** Moves the focus to row i; 'one' picks only it, 'toggle' adds/removes it, 'range' picks from the anchor. */
export function select(v: RemoteView, i: number, mode: 'one' | 'toggle' | 'range' = 'one'): RemoteView {
    i = Math.max(-1, Math.min(i, v.entries.length - 1));
    if (i < 0) return {...v, selected: i, picked: new Set()};
    if (mode === 'toggle') {
        const picked = new Set(v.picked);
        if (picked.has(i)) picked.delete(i);
        else picked.add(i);
        return {...v, selected: i, picked, anchor: i};
    }
    if (mode === 'range' && v.anchor >= 0) {
        const picked = new Set<number>();
        const [a, b] = v.anchor < i ? [v.anchor, i] : [i, v.anchor];
        for (let j = a; j <= b; j++) picked.add(j);
        return {...v, selected: i, picked};
    }
    return {...v, selected: i, picked: new Set([i]), anchor: i};
}

export function selectAll(v: RemoteView): RemoteView {
    return {...v, picked: new Set(v.entries.flatMap((e, i) => (e === UP ? [] : [i])))};
}

/** The picked entries in list order (the focused row if nothing is picked). Never the ".." row. */
export function pickedEntries(v: RemoteView): FileEntry[] {
    const idx = v.picked.size > 0 ? [...v.picked].sort((a, b) => a - b) : [v.selected];
    return idx.map(i => v.entries[i]).filter((e): e is FileEntry => !!e && e !== UP);
}

/** The one picked entry if it is a file the viewer can open. */
export function viewable(v: RemoteView): FileEntry | undefined {
    const list = pickedEntries(v);
    return list.length === 1 && !list[0].isDir ? list[0] : undefined;
}

/** After deleting list: the entry to select (the one after them, or before them at the end). */
export function keepAfterDelete(v: RemoteView, list: FileEntry[]): string | undefined {
    const gone = new Set(list);
    const last = v.entries.indexOf(list[list.length - 1]);
    const keep = v.entries.slice(last + 1).find(e => !gone.has(e)) ??
        v.entries.slice(0, last).reverse().find(e => !gone.has(e) && e !== UP);
    return keep?.name;
}

export function deleteMessage(list: FileEntry[]): string {
    const dirs = list.filter(e => e.isDir).length;
    const what = list.length === 1 ? `"${list[0].name}"` : `${list.length}개 항목`;
    return `${what}을(를) 서버에서 삭제할까요? 되돌릴 수 없습니다.` +
        (dirs > 0 ? '\n폴더는 안에 있는 파일과 폴더까지 모두 삭제됩니다.' : '');
}

/** "512 B / 1.0 KB (50%) · 3.0 KB/s"; secs is how long the transfer has run. */
export function transferText(p: XferProgress, secs: number): string {
    const pct = p.total > 0 ? Math.min(100, (p.done / p.total) * 100) : 0;
    const rate = secs > 0.5 ? ` · ${formatSize(p.done / secs)}/s` : '';
    return p.total > 0
        ? `${formatSize(p.done)} / ${formatSize(p.total)} (${pct.toFixed(0)}%)${rate}`
        : `${formatSize(p.done)}${rate}`;
}

export function transferPercent(p: XferProgress): number {
    return p.total > 0 ? Math.round(Math.min(100, (p.done / p.total) * 100)) : 0;
}
