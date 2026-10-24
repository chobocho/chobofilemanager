import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest } from '../core/settings'

// ─── Todo #120: Terminal 보기 (탭 + 연결 대화상자) ──────────────────────────────

let handlers, api, terms
function setup() {
  handlers = new Map()
  terms = []
  api = {
    GetSettings: vi.fn().mockResolvedValue({}),
    SaveSettings: vi.fn().mockResolvedValue(undefined),
    GetHistory: vi.fn().mockResolvedValue([{ host: 'old.example', port: 22, login: 'me', encoding: 'UTF-8', pass: '', jump: '' }]),
    GetSessions: vi.fn().mockResolvedValue([]),
    GetSSHConfigHosts: vi.fn().mockResolvedValue([{ host: 'web', hostName: '10.0.0.1', port: 22, login: 'deploy' }]),
    GetLocalShells: vi.fn().mockResolvedValue([{ name: 'cmd', label: '명령 프롬프트' }]),
    GetSerialPorts: vi.fn().mockResolvedValue([]),
    Connect: vi.fn().mockResolvedValue('local'),
    Send: vi.fn().mockResolvedValue(undefined),
    Resize: vi.fn().mockResolvedValue(undefined),
    CloseTab: vi.fn().mockResolvedValue(undefined),
    TabTheme: vi.fn().mockResolvedValue(''),
  }
  setTermBackend(api, {
    EventsOn: (name, cb) => { handlers.set(name, cb); return () => handlers.delete(name) },
    ClipboardSetText: vi.fn(), ClipboardGetText: vi.fn(), BrowserOpenURL: vi.fn(),
  })
  useTermStore.getState().resetForTest()
  resetSettingsForTest()
}

const createTerminal = (o) => { const t = new FakeTerminal(o); terms.push(t); return t }

async function renderWs() {
  const r = render(React.createElement(TerminalWorkspace, { createTerminal, addons: false }))
  await screen.findByLabelText('Host')
  await act(async () => {})
  return r
}

describe('TerminalWorkspace (TW)', () => {
  beforeEach(setup)
  afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

  it('TW-01: 처음 열면 새 탭 + 연결 대화상자, 최근 접속이 Host에 미리 채워짐', async () => {
    await renderWs()
    expect(useTermStore.getState().tabs).toHaveLength(1)
    expect(screen.getByLabelText('Host').value).toBe('old.example')
    expect(screen.getByLabelText('Login').value).toBe('me')
    expect(terms).toHaveLength(1)
  })

  it('TW-02: Host 목록 — 최근/ssh_config/로컬 셸 표시, 클릭하면 필드 채움', async () => {
    await renderWs()
    fireEvent.click(screen.getByTitle('목록 열기'))
    expect(screen.getByText('web')).toBeTruthy()
    fireEvent.mouseDown(screen.getByText('명령 프롬프트'))
    expect(screen.getByLabelText('Host').value).toBe('cmd')
    expect(screen.getByText('로컬 셸')).toBeTruthy()
    expect(screen.getByLabelText('Port').disabled).toBe(true)
  })

  it('TW-03: 로컬 셸 연결 — Connect(포트 0, UTF-8), 대화상자 닫힘, 탭 이름', async () => {
    await renderWs()
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'cmd' } })
    await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
    expect(api.Connect).toHaveBeenCalledWith(1, expect.objectContaining({ host: 'cmd', port: 0, encoding: 'UTF-8' }))
    await waitFor(() => expect(screen.queryByLabelText('Host')).toBeNull())
    expect(screen.getByText('cmd', { selector: '[data-tab-label]' })).toBeTruthy()
  })

  it('TW-04: 연결 실패 — 대화상자에 오류, 그대로 유지', async () => {
    api.Connect.mockRejectedValueOnce(new Error('호스트를 찾을 수 없습니다'))
    await renderWs()
    await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
    expect(await screen.findByText(/호스트를 찾을 수 없습니다/)).toBeTruthy()
    expect(screen.getByLabelText('Host')).toBeTruthy()
  })

  it('TW-05: Esc로 대화상자 닫고, 연결 안 된 터미널에서 Enter로 다시 열기', async () => {
    await renderWs()
    fireEvent.keyDown(screen.getByLabelText('Host'), { key: 'Escape' })
    expect(screen.queryByLabelText('Host')).toBeNull()
    act(() => terms[0].type('\r'))
    expect(await screen.findByLabelText('Host')).toBeTruthy()
  })

  it('TW-06: 탭 단축키 — Ctrl+Shift+T 새 탭, Ctrl+Tab 순환, Ctrl+Shift+W 닫기', async () => {
    const { container } = await renderWs()
    const root = container.firstChild
    fireEvent.keyDown(root, { key: 'T', ctrlKey: true, shiftKey: true })
    expect(useTermStore.getState().tabs).toHaveLength(2)
    expect(useTermStore.getState().activeId).toBe(2)
    fireEvent.keyDown(root, { key: 'Tab', ctrlKey: true })
    expect(useTermStore.getState().activeId).toBe(1)
    await act(async () => { fireEvent.keyDown(root, { key: 'W', ctrlKey: true, shiftKey: true }) })
    expect(useTermStore.getState().tabs.map(t => t.id)).toEqual([2])
    expect(api.CloseTab).toHaveBeenCalledWith(1)
  })

  it('TW-07: 탭마다 자기 터미널 — 비활성 탭은 숨김(마운트 유지)', async () => {
    await renderWs()
    act(() => { useTermStore.getState().newTab() })
    await act(async () => {})
    expect(terms).toHaveLength(2)
    const panes = document.querySelectorAll('[data-term-pane]')
    expect(panes).toHaveLength(2)
    expect(panes[0].hidden).toBe(true)
    expect(panes[1].hidden).toBe(false)
  })

  it('TW-08: 비활성 탭 출력 → 활동 표시', async () => {
    await renderWs()
    act(() => { useTermStore.getState().newTab() })
    await act(async () => {})
    act(() => handlers.get('term:data')(1, btoa('x')))
    expect(useTermStore.getState().tabs.find(t => t.id === 1).activity).toBe(true)
    expect(terms[0].text()).toBe('x')
  })

  it('TW-09: 탭 닫기 버튼', async () => {
    await renderWs()
    await act(async () => { fireEvent.click(screen.getByTitle('탭 닫기 (Ctrl+Shift+W)')) })
    expect(useTermStore.getState().tabs).toHaveLength(0)
    expect(screen.getByText(/새 탭을 열려면/)).toBeTruthy()
  })

  it('TW-10: 터미널은 앱 단축키를 xterm에 넘기지 않음 (탭 단축키 통과)', async () => {
    await renderWs()
    const h = terms[0].keyHandler
    expect(h({ key: 'T', ctrlKey: true, shiftKey: true, type: 'keydown' })).toBe(false)
    expect(h({ key: 'Tab', ctrlKey: true, type: 'keydown' })).toBe(false)
    expect(h({ key: 'a', ctrlKey: true, type: 'keydown' })).toBe(true)
    expect(h({ key: 'F5', type: 'keydown' })).toBe(true)
  })
})
