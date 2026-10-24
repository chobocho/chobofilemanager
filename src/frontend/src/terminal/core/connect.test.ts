import {describe, it, expect} from 'vitest';
import {isLocal, isSerial, protocolLabel, buildEntries, filterEntries, buildRequest, tabLabel, tabTooltip, DEFAULT_BAUD} from './connect';

// ─── Todo #120: Connect 대화상자 규칙 (choboTerm connectdialog.ts / connection.ts 이식) ───

describe('호스트 종류 (CN)', () => {
    it('CN-01: 로컬 셸 — cmd/powershell/pwsh/wsl (+.exe, 인자)', () => {
        for (const h of ['cmd', 'CMD.exe', 'powershell', 'pwsh -NoLogo', 'wsl', 'wsl -d Ubuntu']) expect(isLocal(h), h).toBe(true);
        for (const h of ['cmdhost', 'server', 'wslx', '']) expect(isLocal(h), h).toBe(false);
    });
    it('CN-02: 시리얼 — COMn, /dev/...', () => {
        for (const h of ['COM1', 'com12', '/dev/ttyUSB0', 'COM3 8N1']) expect(isSerial(h), h).toBe(true);
        for (const h of ['COM0', 'compute', 'dev/tty']) expect(isSerial(h), h).toBe(false);
    });
    it('CN-03: 프로토콜 표시 — 포트로 판단, 그 외 자동 감지', () => {
        expect(protocolLabel('cmd', '22')).toBe('로컬 셸');
        expect(protocolLabel('COM1', '115200')).toBe('시리얼');
        expect(protocolLabel('h', '22')).toBe('SSH');
        expect(protocolLabel('h', '23')).toBe('Telnet');
        expect(protocolLabel('h', '21')).toBe('FTP');
        expect(protocolLabel('h', '990')).toBe('FTPS');
        expect(protocolLabel('h', '2222')).toBe('자동 감지');
    });
});

describe('호스트 목록 (CN)', () => {
    const history = [{host: 'a.com', port: 22, login: 'u', encoding: 'UTF-8', pass: '', jump: ''}, {host: 'cmd', port: 0, login: '', encoding: 'UTF-8', pass: '', jump: ''}];
    const sessions = [{id: 's1', name: '운영', group: 'G', host: 'a.com', port: 22, login: 'root', encoding: 'UTF-8', pass: 'x', jump: ''}];
    const configHosts = [{host: 'web', hostName: '10.0.0.1', port: 22, login: 'deploy'}, {host: 'a.com', hostName: '', port: 22, login: ''}];
    const shells = [{name: 'cmd', label: '명령 프롬프트'}, {name: 'pwsh', label: 'PowerShell 7'}];
    const ports = [{name: 'COM3', label: 'USB Serial (COM3)'}];

    it('CN-10: 순서 — 저장 세션, 히스토리(세션과 겹치면 제외), ssh_config, 로컬 셸, 시리얼 (중복 제거)', () => {
        const e = buildEntries(history, sessions, configHosts, shells, ports);
        expect(e.map(x => x.label ?? x.host)).toEqual(['운영', 'cmd', 'web', 'PowerShell 7', 'USB Serial (COM3)']);
        expect(e[0].session?.id).toBe('s1');
        expect(e.find(x => x.host === 'web')?.fromConfig).toBe(true);
        expect(e.find(x => x.host === 'COM3')?.port).toBe(Number(DEFAULT_BAUD));
    });

    it('CN-11: null 목록도 처리', () => {
        expect(buildEntries(null as any, null as any, null as any, null as any, null as any)).toEqual([]);
    });

    it('CN-12: 입력한 글자로 필터 (호스트/표시 이름/로그인, 대소문자 무시)', () => {
        const e = buildEntries(history, sessions, configHosts, shells, ports);
        expect(filterEntries(e, 'POW').map(x => x.host)).toEqual(['pwsh']);
        expect(filterEntries(e, 'deploy').map(x => x.host)).toEqual(['web']);
        expect(filterEntries(e, '').length).toBe(e.length);
    });
});

describe('연결 요청 / 탭 이름 (CN)', () => {
    it('CN-20: 로컬 셸은 포트 0, UTF-8, 로그인/점프 없음', () => {
        expect(buildRequest({host: ' cmd ', port: '22', login: 'u', pass: 'p', encoding: 'EUC-KR', jump: 'j'}))
            .toEqual({host: 'cmd', port: 0, login: '', pass: '', encoding: 'UTF-8', jump: ''});
    });
    it('CN-21: 시리얼은 포트=속도, 로그인/점프 없음', () => {
        expect(buildRequest({host: 'COM3', port: '9600', login: 'u', pass: 'p', encoding: 'EUC-KR', jump: 'j'}))
            .toEqual({host: 'COM3', port: 9600, login: '', pass: '', encoding: 'EUC-KR', jump: ''});
    });
    it('CN-22: SSH는 그대로, 포트 숫자화, 점프 공백 제거', () => {
        expect(buildRequest({host: 'a.com', port: '2222', login: 'u', pass: 'p', encoding: 'UTF-8', jump: ' bastion '}))
            .toEqual({host: 'a.com', port: 2222, login: 'u', pass: 'p', encoding: 'UTF-8', jump: 'bastion'});
    });
    it('CN-23: 탭 이름 — 세션 이름 우선, 표준 포트는 생략, 로컬은 명령, 시리얼은 포트 이름', () => {
        const req = {host: 'a.com', port: 22, login: 'u', pass: '', encoding: '', jump: ''};
        expect(tabLabel(req, 'ssh')).toBe('a.com');
        expect(tabLabel({...req, port: 2222}, 'ssh')).toBe('a.com:2222');
        expect(tabLabel(req, 'ssh', '운영')).toBe('운영');
        expect(tabLabel({...req, host: 'pwsh -NoLogo', port: 0}, 'local')).toBe('pwsh -NoLogo');
        expect(tabLabel({...req, host: 'COM3 8N1', port: 9600}, 'serial')).toBe('COM3');
    });
    it('CN-24: 탭 설명 — scheme://login@host:port, 로컬/시리얼 설명', () => {
        const req = {host: 'a.com', port: 22, login: 'u', pass: '', encoding: '', jump: ''};
        expect(tabTooltip(req, 'ssh')).toBe('ssh://u@a.com:22');
        expect(tabTooltip({...req, login: ''}, 'telnet')).toBe('telnet://a.com:22');
        expect(tabTooltip({...req, host: 'cmd', port: 0}, 'local')).toBe('로컬 셸: cmd');
        expect(tabTooltip({...req, host: 'COM3', port: 9600}, 'serial')).toBe('시리얼: COM3 (9600 baud)');
    });
});
