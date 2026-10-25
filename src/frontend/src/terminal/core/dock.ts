// The terminal dock under the file panels (Todo #122): a local shell started
// in the active panel's folder, which can follow the panel (cd) and take
// paths pasted from it. These are the shell-specific texts it types.

/** Dock tab ids: far above the Terminal view's tab ids, which count from 1. */
export const DOCK_ID_BASE = 1_000_000;

export const DOCK_SHELLS = [
    {host: 'cmd', label: '명령 프롬프트 (cmd)'},
    {host: 'powershell', label: 'PowerShell'},
    {host: 'wsl', label: 'WSL'},
];

export const DEFAULT_DOCK_HEIGHT = 260;
const MIN_HEIGHT = 100;
const PANEL_MIN = 120; // the file panels keep at least this much

export type ShellKind = 'cmd' | 'ps' | 'posix';

export function shellKind(host: string): ShellKind {
    const name = host.trim().split(/\s+/)[0].toLowerCase().replace(/\.exe$/, '');
    if (name === 'cmd') return 'cmd';
    if (name === 'powershell' || name === 'pwsh') return 'ps';
    return 'posix';
}

const isWindowsPath = (p: string) => /^[A-Za-z]:[\\/]|^\\\\/.test(p);
const needsQuotes = (p: string) => /[\s&()^%!;,'"`$<>|]/.test(p);
const single = (p: string) => `'${p.replace(/'/g, `'\\''`)}'`;
const wslpath = (p: string) => `"$(wslpath ${single(p)})"`;

/** The command that moves the shell into path (Enter included). */
export function cdCommand(host: string, path: string): string {
    switch (shellKind(host)) {
        case 'cmd':
            return `cd /d "${path}"\r`;
        case 'ps':
            return `Set-Location -LiteralPath '${path.replace(/'/g, "''")}'\r`;
        default:
            return `cd ${isWindowsPath(path) ? wslpath(path) : single(path)}\r`;
    }
}

/** Runs the program at path from its folder dir (Enter included) — Enter on an executable file (Todo #136-2). */
export function runCommand(host: string, dir: string, path: string): string {
    const cd = cdCommand(host, dir).replace(/\r$/, '');
    if (shellKind(host) === 'ps') return `${cd}; & ${quoteForShell(host, path)}\r`;
    return `${cd} && ${quoteForShell(host, path)}\r`;
}

/** A file name or path as the shell should read it: quoted only when needed. */
export function quoteForShell(host: string, path: string): string {
    switch (shellKind(host)) {
        case 'cmd':
            return needsQuotes(path) ? `"${path}"` : path;
        case 'ps':
            return needsQuotes(path) ? `'${path.replace(/'/g, "''")}'` : path;
        default:
            if (isWindowsPath(path)) return wslpath(path);
            return needsQuotes(path) ? single(path) : path;
    }
}

/**
 * The folder a shell reported (OSC 7) as a path of this PC: "/C:/work" from a
 * Windows shell, "/mnt/c/work" from WSL. Other paths (a Linux home) are not
 * folders of this PC: undefined.
 */
export function localPathFromCwd(cwd: string | undefined): string | undefined {
    if (!cwd) return undefined;
    let m = /^\/?([A-Za-z]):([\\/].*)?$/.exec(cwd);
    if (m) return `${m[1].toUpperCase()}:${(m[2] ?? '/').replace(/\//g, '\\')}`;
    m = /^\/mnt\/([a-z])(\/.*)?$/i.exec(cwd);
    if (m) return `${m[1].toUpperCase()}:${(m[2] ?? '/').replace(/\//g, '\\')}`;
    return undefined;
}

export function clampDockHeight(h: number, total: number): number {
    if (!Number.isFinite(h)) return DEFAULT_DOCK_HEIGHT;
    return Math.max(MIN_HEIGHT, Math.min(h, total - PANEL_MIN));
}
