import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { useFilesStore } from '../store/filesStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest } from '../core/settings'

// ─── Todo #124: Zmodem(sz/rz) 전송 진행 — 파일 창이 없을 때 떠 있는 진행 상자 ───────

let api, handlers, terms
beforeEach(() => {
  handlers = {}
  terms = []
  const ok = () => vi.fn().mockResolvedValue(undefined)
  api = {
    GetSettings: vi.fn().mockResolvedValue({}), SaveSettings: ok(), GetHistory: vi.fn().mockResolvedValue([]),
    GetSessions: vi.fn().mockResolvedValue([]), GetSSHConfigHosts: vi.fn().mockResolvedValue([]),
    GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
    CloseTab: ok(), Connect: vi.fn().mockResolvedValue('ssh'), Send: ok(), Resize: ok(), Disconnect: ok(),
    TabTheme: vi.fn().mockResolvedValue(''), SetTabTheme: ok(), FileCancel: ok(), FileOpen: vi.fn().mockRejectedValue(new Error('x')),
  }
  setTermBackend(api, { EventsOn: (n, fn) => { handlers[n] = fn; return () => delete handlers[n] }, ClipboardSetText: vi.fn() })
  useTermStore.getState().resetForTest()
  useFilesStore.getState().resetForTest()
  resetSettingsForTest()
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

async function connected(host = 'srv', proto = 'ssh') {
  api.Connect.mockResolvedValue(proto)
  render(React.createElement(TerminalWorkspace, { createTerminal: (o) => { const t = new FakeTerminal(o); terms.push(t); return t }, addons: false }))
  fireEvent.change(await screen.findByLabelText('Host'), { target: { value: host } })
  await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
  await waitFor(() => expect(screen.queryByLabelText('Host')).toBeNull())
}
const chip = () => screen.getByText('srv', { selector: '[data-tab-label]' }).closest('[title]')

describe('Zmodem 진행 (ZM)', () => {
  it('ZM-01: sz 받는 중 → 떠 있는 진행 상자(이름·퍼센트), 탭 칩에 전송 표시', async () => {
    await connected()
    act(() => handlers['xfer:progress'](1, { name: 'log.tgz', done: 256, total: 1024, upload: false }))
    const box = screen.getByRole('status', { name: '파일 전송 진행' })
    expect(box.textContent).toContain('⬇ log.tgz')
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25')
    expect(chip().hasAttribute('data-busy')).toBe(true)
  })

  it('ZM-02: 취소 → FileCancel(그 탭), xfer:end로 사라짐', async () => {
    await connected()
    act(() => handlers['xfer:progress'](1, { name: 'a', done: 1, total: 2, upload: true }))
    expect(screen.getByRole('status', { name: '파일 전송 진행' }).textContent).toContain('⬆ a')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '전송 취소' })) })
    expect(api.FileCancel).toHaveBeenCalledWith(1)
    act(() => handlers['xfer:end'](1, { ok: false, message: '취소됨' }))
    expect(screen.queryByRole('status', { name: '파일 전송 진행' })).toBeNull()
    expect(chip().hasAttribute('data-busy')).toBe(false)
  })

  it('ZM-03: 다른 탭의 전송이면 그 탭으로 가야 보임 (활성 탭에만 표시)', async () => {
    await connected()
    act(() => { useTermStore.getState().newTab() })
    act(() => handlers['xfer:progress'](1, { name: 'a', done: 1, total: 2, upload: false }))
    expect(screen.queryByRole('status', { name: '파일 전송 진행' })).toBeNull()
    act(() => useTermStore.getState().setActive(1))
    expect(screen.getByRole('status', { name: '파일 전송 진행' })).toBeTruthy()
  })

  it('ZM-04: 시리얼 탭에서 파일 전송(Ctrl+Shift+F) → sz / rz 안내', async () => {
    await connected('COM3', 'serial')
    await act(async () => { fireEvent.keyDown(document.querySelector('[data-terminal-root]'), { key: 'F', ctrlKey: true, shiftKey: true }) })
    expect(api.FileOpen).not.toHaveBeenCalled()
    expect(terms[0].text()).toContain('시리얼 포트에서는 파일 전송 창 대신 sz / rz(Zmodem)를 쓰세요')
  })
})
