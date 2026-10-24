// Rules of the Connect dialog, ported from choboTerm (connectdialog.ts and the
// tab labels in connection.ts) as plain functions the React dialog uses.

import type {ConnectRequest} from './session';

// Host field texts that run a program on this PC instead of connecting (see localshell.go).
const LOCAL_SHELL = /^(cmd|powershell|pwsh|wsl)(\.exe)?(\s|$)/i;
// Host field texts that open a serial port; the Port field is then the speed (see serial.go).
const SERIAL_PORT = /^(com[1-9]\d*|\/dev\/\S+)(\s|$)/i;

export const DEFAULT_BAUD = '115200';
export const BAUDS = [300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
export const ENCODINGS = ['UTF-8', 'EUC-KR'];

export function isLocal(host: string): boolean {
    return LOCAL_SHELL.test(host.trim());
}

export function isSerial(host: string): boolean {
    return !isLocal(host) && SERIAL_PORT.test(host.trim());
}

/** What the dialog shows next to the Host field. Other ports are detected from the server greeting. */
export function protocolLabel(host: string, port: string): string {
    if (isLocal(host)) return '로컬 셸';
    if (isSerial(host)) return '시리얼';
    const p = Number(port);
    return p === 22 ? 'SSH' : p === 21 ? 'FTP' : p === 990 ? 'FTPS' : p === 23 ? 'Telnet' : '자동 감지';
}

export interface HostEntry {
    host: string;
    port: number;
    login: string;
    encoding: string;
    pass: string;
    jump?: string;
}

export interface SavedSession extends HostEntry {
    id: string;
    name: string;
    group: string;
}

export interface ListEntry extends HostEntry {
    label?: string;
    fromConfig?: boolean;
    session?: SavedSession;
}

/** Saved sessions, history, then ~/.ssh/config names, local shells and serial ports not already listed. */
export function buildEntries(
    history: HostEntry[] | null,
    sessions: SavedSession[] | null,
    configHosts: {host: string; hostName: string; port: number; login: string}[] | null,
    shells: {name: string; label: string}[] | null,
    ports: {name: string; label: string}[] | null,
): ListEntry[] {
    const h = history ?? [], s = sessions ?? [], c = configHosts ?? [], ls = shells ?? [], sp = ports ?? [];
    const saved = new Set(s.map(x => `${x.host}:${x.port}`));
    const listed = new Set<string>([...s.map(x => x.host), ...h.map(x => x.host)]);
    const out: ListEntry[] = [
        ...s.map(x => ({host: x.host, port: x.port, login: x.login, encoding: x.encoding, pass: x.pass, jump: x.jump, label: x.name, session: x})),
        ...h.filter(x => !saved.has(`${x.host}:${x.port}`)),
    ];
    for (const x of c) {
        if (listed.has(x.host)) continue;
        listed.add(x.host);
        out.push({host: x.host, port: x.port, login: x.login, encoding: 'UTF-8', pass: '', fromConfig: true});
    }
    for (const x of ls) {
        if (listed.has(x.name)) continue;
        listed.add(x.name);
        out.push({host: x.name, port: 0, login: '', encoding: 'UTF-8', pass: '', label: x.label});
    }
    for (const x of sp) {
        if (listed.has(x.name)) continue;
        listed.add(x.name);
        out.push({host: x.name, port: Number(DEFAULT_BAUD), login: '', encoding: 'UTF-8', pass: '', label: x.label});
    }
    return out;
}

export function filterEntries(entries: ListEntry[], text: string): ListEntry[] {
    const q = text.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e => [e.host, e.label ?? '', e.login].some(v => v.toLowerCase().includes(q)));
}

export interface DialogFields {
    host: string;
    port: string;
    login: string;
    pass: string;
    encoding: string;
    jump: string;
}

/** The request sent to Connect for what is typed in the dialog. */
export function buildRequest(f: DialogFields): ConnectRequest {
    const host = f.host.trim();
    if (isLocal(host)) return {host, port: 0, login: '', pass: '', encoding: 'UTF-8', jump: ''};
    if (isSerial(host)) return {host, port: Number(f.port) || Number(DEFAULT_BAUD), login: '', pass: '', encoding: f.encoding, jump: ''};
    return {host, port: Number(f.port) || 22, login: f.login, pass: f.pass, encoding: f.encoding, jump: f.jump.trim()};
}

/** The tab chip text: the saved session's name, else the host (with the port when it isn't the usual one). */
export function tabLabel(req: ConnectRequest, proto: string, sessionName?: string): string {
    if (sessionName) return sessionName;
    if (proto === 'local') return req.host;
    if (proto === 'serial') return req.host.split(/\s/)[0];
    return [21, 22, 23].includes(Number(req.port)) ? req.host : `${req.host}:${req.port}`;
}

export function tabTooltip(req: ConnectRequest, proto: string): string {
    if (proto === 'local') return `로컬 셸: ${req.host}`;
    if (proto === 'serial') return `시리얼: ${req.host} (${req.port} baud)`;
    return `${proto || 'telnet'}://${req.login ? req.login + '@' : ''}${req.host}:${req.port}`;
}
