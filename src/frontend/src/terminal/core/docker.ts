// Docker containers (Todo #124, choboTerm containers.ts): where they are (an
// SSH tab's server or this PC), the engine chosen per place, the label of a
// container's tab, and how to open a published port in the browser.

import type {ForwardStatus, Forward} from './forwards';

/** Where containers are: an SSH tab's server, or this PC (tab 0). */
export interface DockerSource {
    tab: number;
    label: string;
    host?: string;
    port?: number;
}

/** A container's shell or log in a tab. */
export interface DockerTab {
    src: DockerSource;
    id: string;
    name: string;
    mode: string; // 'shell' | 'logs'
}

export interface PublishedPort {
    port: number;
    to: string;
    ip: string;
}

export const LOCAL_SOURCE: DockerSource = {tab: 0, label: '이 PC'};

/** The settings key of a place: the SSH server as host:port, or this PC. */
export function placeKey(src: DockerSource): string {
    return src.tab ? `${src.host ?? src.label}:${src.port ?? 22}` : 'local';
}

/** The engine chosen for src: "" (docker, else podman), "docker" or "podman". */
export function engineOf(engines: Record<string, string> | undefined, src: DockerSource): string {
    return engines?.[placeKey(src)] ?? '';
}

/** engines with src's choice; automatic ("") is not kept. */
export function withEngine(engines: Record<string, string> | undefined, src: DockerSource, engine: string) {
    const m = {...(engines ?? {})};
    if (engine) m[placeKey(src)] = engine;
    else delete m[placeKey(src)];
    return m;
}

export const dockerLabel = (d: DockerTab) => `${d.mode === 'logs' ? '📜' : '🐳'} ${d.name}`;
export const dockerTooltip = (d: DockerTab) => `${d.mode === 'logs' ? 'docker logs' : 'docker exec'}: ${d.name} @ ${d.src.label}`;

/** A connected SSH tab as a place with containers, or undefined. */
export function sourceOfTab(id: number, t: {state: string; proto: string; req?: {host: string; port: number; login: string}}): DockerSource | undefined {
    if (t.state !== 'on' || t.proto !== 'ssh' || !t.req) return undefined;
    return {tab: id, label: `${t.req.login ? t.req.login + '@' : ''}${t.req.host}`, host: t.req.host, port: Number(t.req.port)};
}

/**
 * How to open published port p: on this PC directly; on a server through a
 * local forward of the same port — reusing one that exists, or refusing when
 * another rule takes that port of this PC.
 */
export function portPlan(src: DockerSource, p: PublishedPort, rules: ForwardStatus[]):
    {kind: 'open'} | {kind: 'add'; forward: Forward} | {kind: 'busy'; message: string} {
    if (!src.tab) return {kind: 'open'};
    const same = rules.find(r => r.type !== 'R' && r.bindPort === p.port);
    if (same && (same.type !== 'L' || same.port !== p.port || same.error)) {
        return {kind: 'busy', message: `이 PC의 포트 ${p.port}는 이미 다른 포워딩 규칙이 씁니다. 포트 포워딩 창(Ctrl+Shift+P)에서 확인하세요.`};
    }
    if (same) return {kind: 'open'};
    const host = p.ip === '0.0.0.0' ? '127.0.0.1' : p.ip;
    return {kind: 'add', forward: {type: 'L', bindAddr: '', bindPort: p.port, host, port: p.port}};
}
