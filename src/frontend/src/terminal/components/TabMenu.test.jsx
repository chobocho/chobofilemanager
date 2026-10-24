import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter, sessionById } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest } from '../core/settings'
import { themeByName } from '../core/themes'

// ─── Todo #121: 탭 메뉴 (우클릭) ──────────────────────────────────────────────

let api, terms
beforeEach(() => {
  terms = []
  const ok = () => vi.fn().mockResolvedValue(undefined)
  api = {
    GetSettings: vi.fn().mockResolvedValue({}), SaveSettings: ok(), GetHistory: vi.fn().mockResolvedValue([]),
    GetSessions: vi.fn().mockResolvedValue([]), GetSSHConfigHosts: vi.fn().mockResolvedValue([]),
    GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
    CloseTab: ok(), Connect: vi.fn().mockResolvedValue('ssh'), Send: ok(), Resize: ok(), Disconnect: ok(),
    TabTheme: vi.fn().mockResolvedValue(''), SetTabTheme: vi.fn().mockResolvedValue(true),
    SetEncoding: vi.fn((_i, e) => Promise.resolve(e)), SendBreak: ok(),
  }
  setTermBackend(api, { EventsOn: () => () => {}, ClipboardSetText: vi.fn() })
  useTermStore.getState().resetForTest()
  resetSettingsForTest()
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

const createTerminal = (o) => { const t = new FakeTerminal(o); terms.push(t); return t }
async function connected(host = 'srv.example') {
  render(React.createElement(TerminalWorkspace, { createTerminal, addons: false }))
  fireEvent.change(await screen.findByLabelText('Host'), { target: { value: host } })
  await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
  await waitFor(() => expect(screen.queryByLabelText('Host')).toBeNull())
}
const openMenu = (label = 'srv.example') => fireEvent.contextMenu(screen.getByText(label, { selector: '[data-tab-label]' }))
const item = (text) => screen.getByRole('menuitem', { name: text })

describe('탭 메뉴 (TB)', () => {
  it('TB-01: 우클릭 → 메뉴, Esc/바깥 클릭으로 닫힘', async () => {
    await connected()
    openMenu()
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    openMenu()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('TB-02: 복제 — 새 탭으로 같은 서버 연결', async () => {
    await connected()
    openMenu()
    await act(async () => { fireEvent.click(item('복제 (새 탭으로 같은 서버 접속)')) })
    await waitFor(() => expect(api.Connect).toHaveBeenCalledTimes(2))
    expect(api.Connect).toHaveBeenLastCalledWith(2, expect.objectContaining({ host: 'srv.example', port: 22 }))
    expect(useTermStore.getState().groups).toHaveLength(2)
  })

  it('TB-03: 연결 끊기 → idle, 다시 연결 → 같은 정보로 재연결', async () => {
    await connected()
    openMenu()
    await act(async () => { fireEvent.click(item('연결 끊기')) })
    expect(api.Disconnect).toHaveBeenCalledWith(1)
    expect(useTermStore.getState().tabs[0].state).toBe('idle')
    openMenu()
    await act(async () => { fireEvent.click(item('다시 연결')) })
    expect(api.Connect).toHaveBeenCalledTimes(2)
    expect(useTermStore.getState().tabs[0].state).toBe('on')
  })

  it('TB-04: 인코딩 전환', async () => {
    await connected()
    openMenu()
    await act(async () => { fireEvent.click(item('인코딩: EUC-KR로 전환')) })
    expect(api.SetEncoding).toHaveBeenCalledWith(1, 'EUC-KR')
    expect(sessionById(1).encoding).toBe('EUC-KR')
  })

  it('TB-05: 색 테마 하위 메뉴 → 서버별 저장', async () => {
    await connected()
    openMenu()
    fireEvent.mouseEnter(item('색 테마 (이 서버)'))
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: themeByName('dracula').label })) })
    expect(api.SetTabTheme).toHaveBeenCalledWith(1, 'dracula')
    expect(terms[0].options.theme).toEqual(themeByName('dracula').theme)
  })

  it('TB-06: 오른쪽으로 분할 / 탭 닫기', async () => {
    await connected()
    openMenu()
    act(() => { fireEvent.click(item('오른쪽으로 분할 (Ctrl+Shift+\\)')) })
    expect(useTermStore.getState().tabs).toHaveLength(2)
    expect(useTermStore.getState().groups).toHaveLength(1)
    openMenu()
    await act(async () => { fireEvent.click(item('분할 창 닫기')) })
    expect(useTermStore.getState().tabs).toHaveLength(1)
  })

  it('TB-07: 연결 후 이 서버에 저장된 테마 적용', async () => {
    api.TabTheme.mockResolvedValue('dracula')
    await connected()
    await waitFor(() => expect(terms[0].options.theme).toEqual(themeByName('dracula').theme))
  })
})
