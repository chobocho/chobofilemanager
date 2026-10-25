import {describe, it, expect} from 'vitest';
import {workspaceAction, WORKSPACE_ACTIONS, passesThroughInput} from './workspaceKeys';
import {isWorkspaceKey} from './look';

// ─── Todo #126: 작업 공간 단축키 표 하나 — 판별(isWorkspaceKey)과 실행(작업 공간)이 같은 표 ──

const k = (key: string, o: Partial<KeyboardEvent> & {code?: string} = {}) =>
    ({key, code: o.code ?? '', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...o});
const cs = (key: string) => k(key, {ctrlKey: true, shiftKey: true});

describe('작업 공간 단축키 (WK)', () => {
    it('WK-01: Ctrl+Shift+글자 — 창·도구', () => {
        const want: Record<string, string> = {
            T: 'newTab', N: 'newTab', W: 'closeTab', S: 'search', H: 'sessions', O: 'prefs', M: 'macros',
            L: 'log', B: 'memo', F: 'files', P: 'forwards', J: 'containers', K: 'console',
            C: 'copy', V: 'paste', D: 'disconnect', E: 'encoding',
        };
        for (const [key, action] of Object.entries(want)) {
            expect(workspaceAction(cs(key)), key).toBe(action);
            expect(workspaceAction(cs(key.toLowerCase())), key.toLowerCase()).toBe(action);
        }
    });

    it('WK-02: 분할(물리 키), 탭 순환, 도움말, 글꼴 크기', () => {
        expect(workspaceAction(k('|', {ctrlKey: true, shiftKey: true, code: 'Backslash'}))).toBe('splitRight');
        expect(workspaceAction(k('_', {ctrlKey: true, shiftKey: true, code: 'Minus'}))).toBe('splitDown');
        expect(workspaceAction(k('Tab', {ctrlKey: true}))).toBe('nextTab');
        expect(workspaceAction(k('Tab', {ctrlKey: true, shiftKey: true}))).toBe('prevTab');
        expect(workspaceAction(k('PageDown', {ctrlKey: true}))).toBe('nextTab');
        expect(workspaceAction(k('PageUp', {ctrlKey: true}))).toBe('prevTab');
        expect(workspaceAction(k('F1'))).toBe('help');
        expect(workspaceAction(k('=', {ctrlKey: true}))).toBe('fontUp');
        expect(workspaceAction(k('+', {ctrlKey: true}))).toBe('fontUp');
        expect(workspaceAction(k('-', {ctrlKey: true}))).toBe('fontDown');
        expect(workspaceAction(k('0', {ctrlKey: true}))).toBe('fontReset');
    });

    it('WK-03: 셸로 가야 하는 키는 아님', () => {
        for (const ev of [k('t'), k('T', {shiftKey: true}), k('t', {ctrlKey: true}), k('c', {ctrlKey: true}),
            k('F1', {shiftKey: true}), k('F2'), k('T', {ctrlKey: true, shiftKey: true, altKey: true}),
            k('Q', {ctrlKey: true, shiftKey: true}), k('-', {ctrlKey: true, altKey: true}), k('Enter')]) {
            expect(workspaceAction(ev), JSON.stringify(ev)).toBeUndefined();
            expect(isWorkspaceKey(ev)).toBe(false);
        }
    });

    it('WK-04: isWorkspaceKey는 표와 같은 판단, 모든 동작이 목록에 있음', () => {
        expect(isWorkspaceKey(cs('T'))).toBe(true);
        expect(isWorkspaceKey(k('F1'))).toBe(true);
        expect(WORKSPACE_ACTIONS).toContain('splitRight');
        expect(new Set(WORKSPACE_ACTIONS).size).toBe(WORKSPACE_ACTIONS.length);
    });

    it('WK-05: 입력 칸에서 통과하는 키 — 복사·붙여넣기는 칸에 남김 (Todo #127)', () => {
        expect(passesThroughInput(cs('B'))).toBe(true);
        expect(passesThroughInput(cs('K'))).toBe(true);
        expect(passesThroughInput(k('Tab', {ctrlKey: true}))).toBe(true);
        expect(passesThroughInput(cs('C'))).toBe(false);
        expect(passesThroughInput(cs('V'))).toBe(false);
        expect(passesThroughInput(k('a'))).toBe(false);
    });
});
