import {describe, it, expect} from 'vitest';
import {shellKind, cdCommand, quoteForShell, clampDockHeight, DOCK_ID_BASE, DOCK_SHELLS} from './dock';

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
});
