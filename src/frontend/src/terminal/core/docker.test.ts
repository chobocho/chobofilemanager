import {describe, it, expect} from 'vitest';
import {placeKey, engineOf, withEngine, dockerLabel, dockerTooltip, portPlan, LOCAL_SOURCE, sourceOfTab} from './docker';

// ─── Todo #124: 도커 컨테이너 — 엔진(곳마다 기억), 탭 이름, 포트 열기 계획 ─────

const srv = {tab: 3, label: 'me@srv', host: 'srv', port: 22};

describe('docker (DC)', () => {
    it('DC-01: 곳 키 — 서버는 host:port, 이 PC는 local', () => {
        expect(placeKey(srv)).toBe('srv:22');
        expect(placeKey(LOCAL_SOURCE)).toBe('local');
        expect(LOCAL_SOURCE).toEqual({tab: 0, label: '이 PC'});
    });

    it('DC-02: 엔진 — 정한 곳만 기억, 자동("")은 지움', () => {
        let m = withEngine({}, srv, 'podman');
        expect(m).toEqual({'srv:22': 'podman'});
        expect(engineOf(m, srv)).toBe('podman');
        expect(engineOf(m, LOCAL_SOURCE)).toBe('');
        m = withEngine(m, srv, '');
        expect(m).toEqual({});
    });

    it('DC-03: 탭 이름·툴팁 — 셸 🐳, 로그 📜', () => {
        const d = {src: srv, id: 'abc', name: 'web', mode: 'shell'};
        expect(dockerLabel(d)).toBe('🐳 web');
        expect(dockerLabel({...d, mode: 'logs'})).toBe('📜 web');
        expect(dockerTooltip(d)).toBe('docker exec: web @ me@srv');
        expect(dockerTooltip({...d, mode: 'logs'})).toBe('docker logs: web @ me@srv');
    });

    it('DC-04: 연결된 SSH 탭 → 컨테이너가 있는 곳', () => {
        expect(sourceOfTab(3, {state: 'on', proto: 'ssh', req: {host: 'srv', port: 22, login: 'me'}})).toEqual(srv);
        expect(sourceOfTab(3, {state: 'on', proto: 'telnet', req: {host: 'srv', port: 23, login: ''}})).toBeUndefined();
        expect(sourceOfTab(3, {state: 'idle', proto: 'ssh', req: {host: 'srv', port: 22, login: ''}})).toBeUndefined();
    });

    it('DC-05: 포트 열기 계획 — 이 PC는 바로, 서버는 같은 포트 -L (있으면 재사용, 다른 규칙이면 안내)', () => {
        const p = {port: 8080, to: '80/tcp', ip: '0.0.0.0'};
        expect(portPlan(LOCAL_SOURCE, p, [])).toEqual({kind: 'open'});
        expect(portPlan(srv, p, [])).toEqual({kind: 'add', forward: {type: 'L', bindAddr: '', bindPort: 8080, host: '127.0.0.1', port: 8080}});
        expect(portPlan(srv, {...p, ip: '10.0.0.5'}, [])).toMatchObject({forward: {host: '10.0.0.5'}});
        const same = {id: 1, type: 'L', bindAddr: '', bindPort: 8080, host: '127.0.0.1', port: 8080, error: '', conns: 0, standby: false};
        expect(portPlan(srv, p, [same])).toEqual({kind: 'open'});
        expect(portPlan(srv, p, [{...same, port: 9999}])).toMatchObject({kind: 'busy'});
        expect(portPlan(srv, p, [{...same, type: 'D'}])).toMatchObject({kind: 'busy'});
        expect(portPlan(srv, p, [{...same, type: 'R'}])).toMatchObject({kind: 'add'}); // -R은 이 PC 포트를 쓰지 않음
    });
});
