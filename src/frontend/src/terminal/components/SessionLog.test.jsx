import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest } from '../core/settings'

// ─── Todo #121: 세션 로그 — Ctrl+Shift+L, 탭 메뉴, 탭 표시 ────────────────────

let api, handlers
beforeEach(() => {
  handlers = {}
  const ok = () => vi.fn().mockResolvedValue(undefined)
  api = {
    GetSettings: vi.fn().mockResolvedValue({}), SaveSettings: ok(), GetHistory: vi.fn().mockResolvedValue([]),
    GetSessions: vi.fn().mockResolvedValue([]), GetSSHConfigHosts: vi.fn().mockResolvedValue([]),
    GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
    CloseTab: ok(), Connect: vi.fn().mockResolvedValue('ssh'), Send: ok(), Resize: ok(), Disconnect: ok(),
    TabTheme: vi.fn().mockResolvedValue(''), SetTabTheme: ok(), ShowLogs: ok(),
    StartLog: vi.fn(async (id) => { handlers['log:changed'](id, 'C:\\logs\\srv.log'); return 'C:\\logs\\srv.log' }),
    StopLog: vi.fn(async (id) => { handlers['log:changed'](id, '') }),
  }
  setTermBackend(api, { EventsOn: (n, fn) => { handlers[n] = fn; return () => delete handlers[n] }, ClipboardSetText: vi.fn() })
  useTermStore.getState().resetForTest()
  resetSettingsForTest()
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

const chip = () => screen.getByText('srv', { selector: '[data-tab-label]' }).closest('[title]')
async function connected() {
  render(React.createElement(TerminalWorkspace, { createTerminal: (o) => new FakeTerminal(o), addons: false }))
  fireEvent.change(await screen.findByLabelText('Host'), { target: { value: 'srv' } })
  await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
  await waitFor(() => expect(screen.queryByLabelText('Host')).toBeNull())
}

describe('세션 로그 화면 (SLV)', () => {
  it('SLV-01: Ctrl+Shift+L → 기록 시작, 탭 표시와 툴팁, 다시 누르면 중지', async () => {
    await connected()
    await act(async () => { fireEvent.keyDown(document.querySelector('[data-terminal-root]'), { key: 'L', ctrlKey: true, shiftKey: true }) })
    expect(api.StartLog).toHaveBeenCalledWith(1)
    await waitFor(() => expect(chip().getAttribute('title')).toContain('로그 기록 중: C:\\logs\\srv.log'))
    expect(chip().hasAttribute('data-logging')).toBe(true)
    await act(async () => { fireEvent.keyDown(document.querySelector('[data-terminal-root]'), { key: 'L', ctrlKey: true, shiftKey: true }) })
    expect(api.StopLog).toHaveBeenCalledWith(1)
    await waitFor(() => expect(chip().hasAttribute('data-logging')).toBe(false))
    expect(chip().getAttribute('title')).not.toContain('로그 기록 중')
  })

  it('SLV-02: 탭 메뉴 — 로그 기록 시작 / 로그 폴더 열기', async () => {
    await connected()
    fireEvent.contextMenu(screen.getByText('srv', { selector: '[data-tab-label]' }))
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: '로그 기록 시작' })) })
    expect(api.StartLog).toHaveBeenCalledWith(1)
    fireEvent.contextMenu(screen.getByText('srv', { selector: '[data-tab-label]' }))
    expect(screen.getByRole('menuitem', { name: '로그 기록 중지' })).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: '로그 폴더 열기' })) })
    expect(api.ShowLogs).toHaveBeenCalledWith(1)
  })
})
