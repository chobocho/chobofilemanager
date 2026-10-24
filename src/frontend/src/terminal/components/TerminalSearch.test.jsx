import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter, sessionById } from '../core/session'
import { resetSettingsForTest } from '../core/settings'

// ─── Todo #120: 터미널 검색 (Ctrl+Shift+S, 실제 xterm SearchAddon) ─────────────

let handlers
beforeEach(() => {
  handlers = new Map()
  const ok = () => vi.fn().mockResolvedValue(undefined)
  setTermBackend({
    GetSettings: vi.fn().mockResolvedValue({}), SaveSettings: ok(), GetHistory: vi.fn().mockResolvedValue([]),
    GetSessions: vi.fn().mockResolvedValue([]), GetSSHConfigHosts: vi.fn().mockResolvedValue([]),
    GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]), CloseTab: ok(),
  }, { EventsOn: (n, cb) => { handlers.set(n, cb); return () => handlers.delete(n) }, ClipboardSetText: vi.fn() })
  useTermStore.getState().resetForTest()
  resetSettingsForTest()
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

async function writeAndWait(s, text) {
  await new Promise(r => s.term.write(text, r))
}

describe('터미널 검색 (SR)', () => {
  it('SR-01: Ctrl+Shift+S → 검색창, Enter로 다음 일치 선택, 없으면 표시, Esc로 닫기', async () => {
    const { container } = render(React.createElement(TerminalWorkspace))
    fireEvent.keyDown(await screen.findByLabelText('Host'), { key: 'Escape' })
    const s = sessionById(1)
    await waitFor(() => expect(s.term.unicode.versions).toContain('11-cjk')) // 애드온 로드 완료
    await writeAndWait(s, 'alpha beta\r\ngamma beta\r\n')

    fireEvent.keyDown(container.firstChild, { key: 'S', ctrlKey: true, shiftKey: true })
    const input = screen.getByPlaceholderText('터미널 검색')
    fireEvent.change(input, { target: { value: 'beta' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(s.term.getSelection()).toBe('beta')

    fireEvent.change(input, { target: { value: 'zzz' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('없음')).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('터미널 검색')).toBeNull()
  })
})
