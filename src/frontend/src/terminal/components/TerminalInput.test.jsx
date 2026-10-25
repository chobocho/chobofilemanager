import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest, settings } from '../core/settings'

// ─── Todo #124 보완: 복사·붙여넣기, 단축키, 글꼴 크기, 탭 막대 마우스 (choboTerm tabs.ts·main.ts) ──

let api, terms, clip
beforeEach(() => {
  terms = []
  clip = { set: vi.fn().mockResolvedValue(true), get: vi.fn().mockResolvedValue('ls') }
  const ok = () => vi.fn().mockResolvedValue(undefined)
  api = {
    GetSettings: vi.fn().mockResolvedValue({ fontSize: 15 }), SaveSettings: ok(), GetHistory: vi.fn().mockResolvedValue([]),
    GetSessions: vi.fn().mockResolvedValue([]), GetSSHConfigHosts: vi.fn().mockResolvedValue([]),
    GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
    CloseTab: ok(), Connect: vi.fn().mockResolvedValue('ssh'), Send: ok(), Resize: ok(), Disconnect: ok(),
    TabTheme: vi.fn().mockResolvedValue(''), SetTabTheme: ok(), GetLanguage: vi.fn().mockResolvedValue('ko'),
    SetEncoding: vi.fn((_i, e) => Promise.resolve(e)),
  }
  setTermBackend(api, { EventsOn: () => () => {}, ClipboardSetText: clip.set, ClipboardGetText: clip.get })
  useTermStore.getState().resetForTest()
  resetSettingsForTest()
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

const root = () => document.querySelector('[data-terminal-root]')
const pane = () => document.querySelector('[data-term-pane]:not([hidden])')
const key = (o) => act(async () => { fireEvent.keyDown(root(), o) })
async function connected(host = 'srv', proto = 'ssh') {
  api.Connect.mockResolvedValue(proto)
  render(React.createElement(TerminalWorkspace, { createTerminal: (o) => { const t = new FakeTerminal(o); terms.push(t); return t }, addons: false }))
  fireEvent.change(await screen.findByLabelText('Host'), { target: { value: host } })
  await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
  await waitFor(() => expect(screen.queryByLabelText('Host')).toBeNull())
  await waitFor(() => expect(settings.fontSize).toBe(15))
}

describe('복사·붙여넣기 (CP)', () => {
  it('CP-01: 마우스로 선택하면 놓을 때 바로 복사', async () => {
    await connected()
    terms[0].selection = 'hello'
    fireEvent.mouseDown(pane(), { button: 0, clientX: 10, clientY: 10 })
    fireEvent.mouseUp(window, { button: 0, clientX: 60, clientY: 10 })
    expect(clip.set).toHaveBeenCalledWith('hello')
  })

  it('CP-02: 프로그램이 마우스를 쓰는 중에 끌면 Shift+드래그 안내', async () => {
    await connected()
    terms[0].modes.mouseTrackingMode = 'any'
    fireEvent.mouseDown(pane(), { button: 0, clientX: 10, clientY: 10 })
    fireEvent.mouseUp(window, { button: 0, clientX: 80, clientY: 40 })
    expect(clip.set).not.toHaveBeenCalled()
    expect(screen.getByText('프로그램이 마우스를 쓰는 중입니다. Shift+드래그로 선택 · 복사')).toBeTruthy()
  })

  it('CP-03: 우클릭 붙여넣기 — 한 줄은 바로, 여러 줄은 확인, 마우스 쓰는 프로그램은 Shift+우클릭만', async () => {
    await connected()
    await act(async () => { fireEvent.contextMenu(pane()) })
    expect(terms[0].pasted).toEqual(['ls'])
    clip.get.mockResolvedValueOnce('a\nb')
    await act(async () => { fireEvent.contextMenu(pane()) })
    expect(screen.getByRole('dialog', { name: '붙여넣기' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog', { name: '붙여넣기' })).getByRole('button', { name: '붙여넣기' }))
    expect(terms[0].pasted).toEqual(['ls', 'a\nb'])
    terms[0].modes.mouseTrackingMode = 'vt200'
    await act(async () => { fireEvent.contextMenu(pane()) })
    expect(terms[0].pasted).toHaveLength(2)
    await act(async () => { fireEvent.contextMenu(pane(), { shiftKey: true }) })
    expect(terms[0].pasted).toHaveLength(3)
  })

  it('CP-04: Ctrl+Shift+C 복사 / Ctrl+Shift+V 붙여넣기', async () => {
    await connected()
    terms[0].selection = 'sel'
    await key({ key: 'C', ctrlKey: true, shiftKey: true })
    expect(clip.set).toHaveBeenCalledWith('sel')
    await key({ key: 'V', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(terms[0].pasted).toEqual(['ls']))
  })

  it('CP-05: 로컬 셸 탭의 Ctrl+V는 브라우저 붙여넣기로 (xterm이 ^V로 보내지 않음), SSH 탭은 그대로', async () => {
    await connected('cmd', 'local')
    const ev = { type: 'keydown', key: 'v', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false }
    expect(terms[0].keyHandler(ev)).toBe(false)
    cleanup()
    terms = []
    useTermStore.getState().resetForTest()
    await connected('srv', 'ssh')
    expect(terms[0].keyHandler(ev)).toBe(true)
  })
})

describe('단축키 (KY)', () => {
  it('KY-01: Ctrl+Shift+D 연결 끊기, Ctrl+Shift+E 인코딩 전환, Ctrl+Shift+N 새 탭', async () => {
    await connected()
    await key({ key: 'E', ctrlKey: true, shiftKey: true })
    expect(api.SetEncoding).toHaveBeenCalledWith(1, 'EUC-KR')
    await key({ key: 'D', ctrlKey: true, shiftKey: true })
    expect(api.Disconnect).toHaveBeenCalledWith(1)
    await key({ key: 'N', ctrlKey: true, shiftKey: true })
    expect(useTermStore.getState().tabs).toHaveLength(2)
  })

  it('KY-02: 글꼴 크기 Ctrl+= / Ctrl+- / Ctrl+0 / Ctrl+휠 — 모든 탭, 8~40, 기억', async () => {
    await connected()
    await key({ key: '=', ctrlKey: true })
    expect(settings.fontSize).toBe(16)
    expect(terms[0].options.fontSize).toBe(16)
    await key({ key: '-', ctrlKey: true })
    await key({ key: '-', ctrlKey: true })
    expect(settings.fontSize).toBe(14)
    await key({ key: '0', ctrlKey: true })
    expect(settings.fontSize).toBe(15)
    await act(async () => { fireEvent.wheel(pane(), { deltaY: -100, ctrlKey: true }) })
    expect(settings.fontSize).toBe(16)
    settings.fontSize = 40
    await key({ key: '=', ctrlKey: true })
    expect(settings.fontSize).toBe(40)
    await waitFor(() => expect(api.SaveSettings).toHaveBeenCalled(), { timeout: 2000 })
  })

  it('KY-03: 접속 창 Alt+C 연결 / Alt+A 취소', async () => {
    render(React.createElement(TerminalWorkspace, { createTerminal: (o) => { const t = new FakeTerminal(o); terms.push(t); return t }, addons: false }))
    const host = await screen.findByLabelText('Host')
    fireEvent.change(host, { target: { value: 'srv' } })
    await act(async () => { fireEvent.keyDown(host, { key: 'c', altKey: true }) })
    expect(api.Connect).toHaveBeenCalled()
    await act(async () => { useTermStore.getState().newTab() })
    const h2 = await screen.findByLabelText('Host')
    fireEvent.keyDown(h2, { key: 'a', altKey: true })
    await waitFor(() => expect(screen.queryByLabelText('Host')).toBeNull())
  })
})

describe('탭 막대 마우스 (TM)', () => {
  it('TM-01: 빈 곳 더블클릭 → 새 탭, 가운데 클릭 → 닫기', async () => {
    await connected()
    fireEvent.doubleClick(screen.getByRole('tablist'))
    expect(useTermStore.getState().tabs).toHaveLength(2)
    fireEvent(screen.getByText('srv', { selector: '[data-tab-label]' }), new MouseEvent('auxclick', { button: 1, bubbles: true }))
    await waitFor(() => expect(useTermStore.getState().tabs.map(t => t.id)).toEqual([2]))
  })

  it('TM-02: 탭을 끌어 다른 탭 위에 놓으면 순서 바뀜', async () => {
    await connected()
    act(() => { useTermStore.getState().newTab() })
    const tabs = screen.getAllByRole('tab')
    const data = { types: [], setData() {}, getData() { return '' }, effectAllowed: '' }
    fireEvent.dragStart(tabs[0], { dataTransfer: data })
    fireEvent.dragOver(tabs[1], { dataTransfer: data })
    fireEvent.drop(tabs[1], { dataTransfer: data })
    expect(useTermStore.getState().groups.map(g => g.id)).toEqual([2, 1])
  })
})
