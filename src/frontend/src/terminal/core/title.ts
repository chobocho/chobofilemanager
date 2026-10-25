// The window title while the Terminal view is shown (Todo #124, choboTerm
// title.ts): the app's title and the active tab's connection.

export interface TitleTab {
    state: string;
    proto?: string;
    encoding?: string;
    req?: {host: string; port: number};
    docker?: {name: string; src: {label: string}};
}

export function terminalTitle(base: string, t: TitleTab | undefined): string {
    if (!t || t.state === 'idle') return base;
    if (t.docker) return `${base} - ${t.docker.name} @ ${t.docker.src.label} (docker)`;
    if (!t.req) return base;
    if (t.proto === 'local') return `${base} - ${t.req.host} (로컬)`;
    if (t.proto === 'serial') return `${base} - ${t.req.host} ${t.req.port} baud [${t.encoding}]`;
    const where = `${t.req.host}:${t.req.port}`;
    return `${base} - ${t.state === 'ftp' ? `ftp://${where}` : where} [${t.encoding}]`;
}
