// Saved sessions: list filtering, rows and texts of the session manager and
// the "Save session" window (Todo #121, choboTerm sessions.ts).

export interface Saved {
    id: string;
    name: string;
    group: string;
    host: string;
    port: number;
    login: string;
    encoding: string;
    pass: string;
    jump: string;
}

/** What the "Save session" window saves: a connection (and the session it came from). */
export interface SessionDraft {
    host: string;
    port: number;
    login: string;
    encoding: string;
    pass: string;
    jump: string;
    session?: Saved;
}

/** The manager's form, as typed. */
export interface SessionForm {
    name: string;
    group: string;
    host: string;
    port: string;
    login: string;
    pass: string;
    encoding: string;
    jump: string;
}

export interface Row {
    head?: string;
    session?: Saved;
}

/** Every space-separated word must appear in the name, host, group or login. */
export function filterSessions<T extends Saved>(all: T[], query: string): T[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter(x => {
        const text = [x.name, x.host, x.group, x.login].join(' ').toLowerCase();
        return words.every(w => text.includes(w));
    });
}

/** List rows: a heading before each group; a session not saved yet (id '') is "새 세션". */
export function sessionRows(shown: Saved[]): Row[] {
    const rows: Row[] = [];
    let head: string | undefined;
    for (const x of shown) {
        const g = x.id === '' ? '새 세션' : x.group || '그룹 없음';
        if (g !== head) {
            head = g;
            rows.push({head: '★ ' + g});
        }
        rows.push({session: x});
    }
    return rows;
}

export function sessionMeta(x: Saved): string {
    if (x.port > 0) return `${x.login ? x.login + '@' : ''}${x.host}:${x.port}`;
    return x.host ? '로컬 셸' : '';
}

export function sessionWhere(d: SessionDraft): string {
    if (!(d.port > 0)) return `${d.host} (로컬 셸)`;
    const user = d.login ? d.login + '@' : '';
    return `${user}${d.host}:${d.port} · ${d.encoding || 'UTF-8'}${d.jump ? ` · Jump ${d.jump}` : ''}`;
}

export function groupsOf(all: Saved[]): string[] {
    return [...new Set(all.map(x => x.group).filter(Boolean))];
}

/** The result of an import; null when the file pick was cancelled. */
export function importMessage(r: {added: number; skipped: number}): string | null {
    if (r.added + r.skipped === 0) return null;
    return `${r.added}개를 가져왔습니다` + (r.skipped ? ` (이미 있는 ${r.skipped}개는 건너뜀)` : '');
}

export function fieldsToSaved(f: SessionForm, id = ''): Saved {
    const host = f.host.trim();
    return {
        id,
        name: f.name.trim() || host,
        group: f.group.trim(),
        host,
        port: Number(f.port) || 0,
        login: f.login,
        pass: f.pass,
        encoding: f.encoding || 'UTF-8',
        jump: f.jump.trim(),
    };
}

export function blankSession(): Saved {
    return {id: '', name: '', group: '', host: '', port: 22, login: '', encoding: 'UTF-8', pass: '', jump: ''};
}
