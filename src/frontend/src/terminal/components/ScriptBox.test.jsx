import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { useScriptStore } from '../store/scriptStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter, sessionById } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest, settings } from '../core/settings'

// ─── Todo #124: Lua 스크립트 상자 · Lua 콘솔 (Ctrl+Shift+K) ─────────────────────

let api, handlers, terms, openUrl
beforeEach(() => {
  handlers = {}
  terms = []
  openUrl = vi.fn()
  const ok = () => vi.fn().mockResolvedValue(undefined)
  api = {
    GetSettings: vi.fn().mockResolvedValue({ macros: [{ name: 'lm', key: 'F6', text: 'send("ls")', kind: 'lua' }] }), SaveSettings: ok(),
    GetHistory: vi.fn().mockResolvedValue([]), GetSessions: vi.fn().mockResolvedValue([]), GetSSHConfigHosts: vi.fn().mockResolvedValue([]),
    GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
    CloseTab: ok(), Connect: vi.fn().mockResolvedValue('ssh'), Send: ok(), Resize: ok(), Disconnect: ok(),
    TabTheme: vi.fn().mockResolvedValue(''), SetTabTheme: ok(),
    StartConsole: vi.fn(async (id) => { handlers['script:start'](id, { name: 'Lua 콘솔', started: Date.now(), console: true }) }),
    StopScript: ok(), ConsoleEval: ok(), ConsoleInterrupt: ok(),
    ConsoleOpen: vi.fn().mockResolvedValue({ name: 'a.lua', text: 'print(1)\n' }),
    ConsoleSave: vi.fn().mockResolvedValue('C:\\lua\\console.txt'),
    RunScript: ok(), RunScriptFile: ok(), ShowScripts: ok(), ScriptScreen: ok(),
  }
  setTermBackend(api, { EventsOn: (n, fn) => { handlers[n] = fn; return () => delete handlers[n] }, ClipboardSetText: vi.fn(), BrowserOpenURL: openUrl })
  useTermStore.getState().resetForTest()
  useScriptStore.getState().resetForTest()
  resetSettingsForTest()
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

const root = () => document.querySelector('[data-terminal-root]')
const box = () => screen.queryByRole('region', { name: /Lua|스크립트|a\.lua/ })
async function connected() {
  render(React.createElement(TerminalWorkspace, { createTerminal: (o) => { const t = new FakeTerminal(o); terms.push(t); return t }, addons: false }))
  fireEvent.change(await screen.findByLabelText('Host'), { target: { value: 'srv' } })
  await waitFor(() => expect(settings.macros).toHaveLength(1))
  await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
  await waitFor(() => expect(screen.queryByLabelText('Host')).toBeNull())
}
async function openConsole() {
  await connected()
  await act(async () => { fireEvent.keyDown(root(), { key: 'K', ctrlKey: true, shiftKey: true }) })
  return screen.findByRole('region', { name: 'Lua 콘솔' })
}
const input = () => within(screen.getByRole('region', { name: 'Lua 콘솔' })).getByRole('textbox')

describe('Lua 콘솔 (LC)', () => {
  it('LC-01: Ctrl+Shift+K → 콘솔(안내 줄, 입력에 포커스), 탭 배지 Lua, 다시 누르면 닫고 StopScript', async () => {
    const b = await openConsole()
    expect(api.StartConsole).toHaveBeenCalledWith(1)
    expect(b.textContent).toContain('send · expect · sleep')
    expect(document.activeElement).toBe(input())
    expect(screen.getByTitle('Lua 콘솔 (Ctrl+Shift+K)').textContent).toBe('Lua')
    await act(async () => { fireEvent.keyDown(root(), { key: 'K', ctrlKey: true, shiftKey: true }) })
    expect(api.StopScript).toHaveBeenCalledWith(1)
    expect(screen.queryByRole('region', { name: 'Lua 콘솔' })).toBeNull()
  })

  it('LC-02: Enter 실행 → 입력 줄 표시, ConsoleEval, 결과(script:result) 표시', async () => {
    await openConsole()
    fireEvent.change(input(), { target: { value: '1+1' } })
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }) })
    expect(api.ConsoleEval).toHaveBeenCalledWith(1, 1, '1+1')
    expect(input().value).toBe('')
    const b = screen.getByRole('region', { name: 'Lua 콘솔' })
    expect(b.textContent).toContain('> 1+1')
    expect(within(b).getByText(/실행 중/)).toBeTruthy()
    act(() => handlers['script:result'](1, 1, '2', ''))
    expect(within(b).getByText('2')).toBeTruthy()
    expect(within(b).queryByText(/실행 중/)).toBeNull()
  })

  it('LC-03: 실행 중 다시 Enter는 안내, Ctrl+C·중지 버튼은 ConsoleInterrupt', async () => {
    await openConsole()
    fireEvent.change(input(), { target: { value: 'while true do end' } })
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }) })
    fireEvent.change(input(), { target: { value: 'x' } })
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }) })
    expect(api.ConsoleEval).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('region', { name: 'Lua 콘솔' }).textContent).toContain('앞의 입력이 실행 중입니다')
    fireEvent.keyDown(input(), { key: 'c', ctrlKey: true })
    expect(api.ConsoleInterrupt).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: '중지' }))
    expect(api.ConsoleInterrupt).toHaveBeenCalledTimes(2)
  })

  it('LC-04: ↑↓ 이전 입력, Shift+Enter는 줄바꿈(실행 안 함)', async () => {
    await openConsole()
    for (const code of ['a=1', 'b=2']) {
      fireEvent.change(input(), { target: { value: code } })
      await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }) })
      act(() => handlers['script:result'](1, api.ConsoleEval.mock.calls.length, '', ''))
    }
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(input().value).toBe('b=2')
    fireEvent.keyDown(input(), { key: 'ArrowUp' })
    expect(input().value).toBe('a=1')
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(input().value).toBe('')
    fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true })
    expect(api.ConsoleEval).toHaveBeenCalledTimes(2)
  })

  it('LC-05: 오류는 빨간 줄, print는 그대로 (script:print)', async () => {
    await openConsole()
    fireEvent.change(input(), { target: { value: 'error("x")' } })
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }) })
    act(() => handlers['script:print'](1, 'hello\nworld'))
    act(() => handlers['script:result'](1, 1, '', '[string]:1: x'))
    const b = screen.getByRole('region', { name: 'Lua 콘솔' })
    expect(within(b).getByText('hello')).toBeTruthy()
    expect(within(b).getByText('world')).toBeTruthy()
    expect(within(b).getByText('[string]:1: x').getAttribute('data-kind')).toBe('err')
  })

  it('LC-06: Ctrl+O 파일 불러오기(실행 전), Ctrl+S 입력·출력 저장', async () => {
    await openConsole()
    await act(async () => { fireEvent.keyDown(input(), { key: 'o', ctrlKey: true }) })
    expect(input().value).toBe('print(1)')
    expect(api.ConsoleEval).not.toHaveBeenCalled()
    await act(async () => { fireEvent.keyDown(input(), { key: 's', ctrlKey: true }) })
    expect(api.ConsoleSave).toHaveBeenCalledWith(expect.stringContaining('send · expect'))
    expect(screen.getByRole('region', { name: 'Lua 콘솔' }).textContent).toContain('저장했습니다: C:\\lua\\console.txt')
  })

  it('LC-07: 콘솔이 끝나면(script:end) 입력 줄 없어짐, 저장은 남음', async () => {
    await openConsole()
    act(() => handlers['script:end'](1, 3000, '', false))
    const b = screen.getByRole('region', { name: /Lua 콘솔/ })
    expect(within(b).queryByRole('textbox')).toBeNull()
    expect(within(b).getByRole('button', { name: '저장' })).toBeTruthy()
  })

  it('LC-08: Esc는 터미널로 포커스 (콘솔은 유지)', async () => {
    await openConsole()
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(screen.getByRole('region', { name: 'Lua 콘솔' })).toBeTruthy()
  })
})

describe('Lua 스크립트 (LR)', () => {
  it('LR-01: 탭 메뉴 "Lua 스크립트 실행..." → RunScriptFile, 시작하면 상자와 ▶ 배지', async () => {
    await connected()
    fireEvent.contextMenu(screen.getByText('srv', { selector: '[data-tab-label]' }))
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Lua 스크립트 실행...' })) })
    expect(api.RunScriptFile).toHaveBeenCalledWith(1)
    act(() => handlers['script:start'](1, { name: 'deploy.lua', started: Date.now(), console: false }))
    expect(screen.getByRole('region', { name: /deploy\.lua/ })).toBeTruthy()
    expect(screen.getByTitle(/Lua 스크립트 실행 중: deploy\.lua/).textContent).toMatch(/^▶ 0:0\d$/)
  })

  it('LR-02: 끝 — 성공은 ✔ (5초 뒤 사라짐), 오류는 ✖ 줄 남김, 멈춤은 ■', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await connected()
      act(() => handlers['script:start'](1, { name: 'a.lua', started: Date.now(), console: false }))
      act(() => handlers['script:end'](1, 2000, '', false))
      expect(box().textContent).toContain('✔ a.lua · 끝 · 0:02')
      await act(async () => { vi.advanceTimersByTime(5100) })
      expect(box()).toBeNull()
      act(() => handlers['script:start'](1, { name: 'b.lua', started: Date.now(), console: false }))
      act(() => handlers['script:end'](1, 1000, 'b.lua:3: attempt to call nil', false))
      await act(async () => { vi.advanceTimersByTime(6000) })
      expect(box().textContent).toContain('✖ b.lua')
      expect(box().textContent).toContain('b.lua:3: attempt to call nil')
      act(() => handlers['script:start'](1, { name: 'c.lua', started: Date.now(), console: false }))
      act(() => handlers['script:end'](1, 1000, '사용자가 멈춤', true))
      expect(box().textContent).toContain('■ c.lua · 멈춤')
    } finally {
      vi.useRealTimers()
    }
  })

  it('LR-03: 스크립트 중지 / 스크립트 폴더 열기 (탭 메뉴)', async () => {
    await connected()
    act(() => handlers['script:start'](1, { name: 'a.lua', started: Date.now(), console: false }))
    fireEvent.contextMenu(screen.getByText('srv', { selector: '[data-tab-label]' }))
    expect(screen.getByRole('menuitem', { name: 'Lua 스크립트 실행...' }).getAttribute('aria-disabled')).toBe('true')
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: '스크립트 중지' })) })
    expect(api.StopScript).toHaveBeenCalledWith(1)
    fireEvent.contextMenu(screen.getByText('srv', { selector: '[data-tab-label]' }))
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: '스크립트 폴더 열기' })) })
    expect(api.ShowScripts).toHaveBeenCalled()
  })

  it('LR-04: screen() 요청 → 지금 화면 글자를 돌려줌, open_url은 브라우저', async () => {
    await connected()
    const t = terms[0]
    t.buffer = { active: { viewportY: 0, getLine: (y) => ({ translateToString: () => ['$ ls', 'a  b', ''][y] ?? '' }) } }
    t.rows = 3
    act(() => handlers['script:screen'](1, 7))
    expect(api.ScriptScreen).toHaveBeenCalledWith(1, 7, '$ ls\na  b')
    act(() => handlers['script:open'](1, 'https://example.com'))
    expect(openUrl).toHaveBeenCalledWith('https://example.com')
  })

  it('LR-05: Lua 매크로(F6) → RunScript(탭, 이름, 내용)', async () => {
    await connected()
    await act(async () => { fireEvent.keyDown(root(), { key: 'F6' }) })
    expect(api.RunScript).toHaveBeenCalledWith(1, 'lm', 'send("ls")')
  })

  it('LR-06: 시작 실패(이미 실행 중 등) → 터미널에 안내', async () => {
    await connected()
    api.RunScriptFile.mockRejectedValueOnce(new Error('이미 스크립트가 실행 중입니다'))
    fireEvent.contextMenu(screen.getByText('srv', { selector: '[data-tab-label]' }))
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Lua 스크립트 실행...' })) })
    expect(terms[0].text()).toContain('이미 스크립트가 실행 중입니다')
  })

  it('LR-07: 탭을 닫으면 스크립트 상태 정리', async () => {
    await connected()
    act(() => handlers['script:start'](1, { name: 'a.lua', started: Date.now(), console: false }))
    await act(async () => { await useTermStore.getState().closeTab(1) })
    expect(useScriptStore.getState().tabs[1]).toBeUndefined()
    void sessionById
  })
})
