import {describe, it, expect} from 'vitest';
import {shellKind, cdCommand, runCommand, quoteForShell, clampDockHeight, DOCK_ID_BASE, DOCK_SHELLS, localPathFromCwd} from './dock';

// ─── Todo #122: 터미널 도크 — 셸별 cd·경로 따옴표, 높이 ─────────────────────

const BS = String.fromCharCode(92);
const win = (...parts: string[]) => parts.join(BS); // C:\work\a b

describe('dock (DK)', () => {
    it('DK-01: 셸 종류 — cmd / PowerShell / WSL·bash', () => {
        expect(shellKind('cmd')).toBe('cmd');
        expect(shellKind('CMD.exe')).toBe('cmd');
        expect(shellKind('powershell')).toBe('ps');
        expect(shellKind('pwsh')).toBe('ps');
        expect(shellKind('wsl -d Ubuntu')).toBe('posix');
        expect(DOCK_SHELLS.map(s => s.host)).toEqual(['cmd', 'powershell', 'wsl']);
    });

    it('DK-02: cmd — 드라이브까지 바꾸는 cd /d "경로"', () => {
        expect(cdCommand('cmd', win('C:', 'work', 'a b'))).toBe(`cd /d "${win('C:', 'work', 'a b')}"\r`);
    });

    it('DK-03: PowerShell — Set-Location -LiteralPath, 작은따옴표는 두 번', () => {
        expect(cdCommand('powershell', win('C:', "it's"))).toBe(`Set-Location -LiteralPath '${win('C:', "it''s")}'\r`);
    });

    it('DK-04: WSL — Windows 경로는 wslpath로 바꿔서, 리눅스 경로는 그대로', () => {
        expect(cdCommand('wsl', win('D:', 'src'))).toBe(`cd "$(wslpath '${win('D:', 'src')}')"\r`);
        expect(cdCommand('wsl', "/home/me/it's")).toBe(`cd '/home/me/it'\\''s'\r`);
    });

    it('DK-05: 경로 붙여넣기 — 공백·특수 문자가 있을 때만 따옴표', () => {
        expect(quoteForShell('cmd', 'x.txt')).toBe('x.txt');
        expect(quoteForShell('cmd', 'a b.txt')).toBe('"a b.txt"');
        expect(quoteForShell('cmd', 'a&b.txt')).toBe('"a&b.txt"');
        expect(quoteForShell('powershell', 'a b.txt')).toBe("'a b.txt'");
        expect(quoteForShell('powershell', "it's.txt")).toBe("'it''s.txt'");
        expect(quoteForShell('wsl', 'a b.txt')).toBe("'a b.txt'");
        expect(quoteForShell('wsl', win('C:', 'a.txt'))).toBe(`"$(wslpath '${win('C:', 'a.txt')}')"`);
    });

    it('DK-06: 높이 — 최소 100px, 전체에서 120px은 패널 몫', () => {
        expect(clampDockHeight(50, 800)).toBe(100);
        expect(clampDockHeight(300, 800)).toBe(300);
        expect(clampDockHeight(790, 800)).toBe(680);
        expect(clampDockHeight(300, 150)).toBe(100); // 창이 아주 작아도 최소
        expect(clampDockHeight(Number.NaN, 800)).toBe(260);
    });

    it('DK-07: 도크 탭 id는 작업 공간 탭 id와 겹치지 않는 범위', () => {
        expect(DOCK_ID_BASE).toBeGreaterThanOrEqual(1_000_000);
    });

    it('DK-08: 셸이 알려 준 폴더(OSC 7) → 이 PC의 경로 (Windows 셸, WSL /mnt/드라이브), 그 밖은 없음', () => {
        expect(localPathFromCwd('/C:/work/a b')).toBe(win('C:', 'work', 'a b'));
        expect(localPathFromCwd('C:/Users')).toBe(win('C:', 'Users'));
        expect(localPathFromCwd('/mnt/d/src')).toBe(win('D:', 'src'));
        expect(localPathFromCwd('/mnt/c')).toBe('C:' + BS);
        expect(localPathFromCwd(win('C:', 'work', 'x'))).toBe(win('C:', 'work', 'x')); // cmd의 OSC 9;9
        expect(localPathFromCwd('/home/me')).toBeUndefined();
        expect(localPathFromCwd(undefined)).toBeUndefined();
    });

    // Todo #136-2: Enter로 실행 권한 파일 실행 — 그 폴더로 cd 후 실행, Enter까지
    it('DK-RUN: 실행 명령 — 셸별 cd + 실행', () => {
        expect(runCommand('bash', '/home/me/bin', '/home/me/bin/run.sh')).toBe(`cd '/home/me/bin' && /home/me/bin/run.sh\r`);
        expect(runCommand('zsh', "/home/me/it's", "/home/me/it's/a b")).toBe(`cd '/home/me/it'\\''s' && '/home/me/it'\\''s/a b'\r`);
        expect(runCommand('cmd', win('C:', 'w'), win('C:', 'w', 'a.exe'))).toBe(`cd /d "${win('C:', 'w')}" && ${win('C:', 'w', 'a.exe')}\r`);
        expect(runCommand('powershell', win('C:', 'w'), win('C:', 'w', 'a b.exe'))).toBe(`Set-Location -LiteralPath '${win('C:', 'w')}'; & '${win('C:', 'w', 'a b.exe')}'\r`);
    });
});
