import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import TerminalDock from './TerminalDock.jsx'
import { useDockStore, DOCK_PREFS_KEY } from '../../stores/dockStore'
import { useFileStore } from '../../stores/fileStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter } from '../core/session'
import { DOCK_ID_BASE } from '../core/dock'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest } from '../core/settings'

// ─── Todo #122: 하단 터미널 도크 — 패널 폴더의 로컬 셸 ─────────────────────────

const BS = String.fromCharCode(92)
const W = (...p) => p.join(BS)
let api, handlers, terms
const setPanel = (side, path) => act(() => {
  useFileStore.setState(s => ({ [side]: { ...s[side], path } }))
})

beforeEach(() => {
  try { localStorage.removeItem(DOCK_PREFS_KEY) } catch { /* 없음 */ }
  handlers = {}
  terms = []
  const ok = () => vi.fn().mockResolvedValue(undefined)
  api = {
    GetSettings: vi.fn().mockResolvedValue({}), Connect: vi.fn().mockResolvedValue('local'),
    Send: ok(), Resize: ok(), Disconnect: ok(), CloseTab: ok(),
  }
  setTermBackend(api, { EventsOn: (n, fn) => { handlers[n] = fn; return () => delete handlers[n] }, ClipboardSetText: vi.fn() })
  useDockStore.getState().resetForTest()
  useFileStore.setState(s => ({ activePanel: 'left', left: { ...s.left, path: W('C:', 'work') }, right: { ...s.right, path: W('D:', 'other') } }))
  resetSettingsForTest()
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

const createTerminal = (o) => { const t = new FakeTerminal(o); terms.push(t); return t }
async function mount() {
  const u = render(React.createElement(TerminalDock, { createTerminal, addons: false }))
  await waitFor(() => expect(api.Connect).toHaveBeenCalled())
  await act(async () => {})
  return u
}

describe('터미널 도크 (DKV)', () => {
  it('DKV-01: 열면 활성 패널 폴더에서 로컬 셸(cmd) 시작, 키는 터미널 소유', async () => {
    await mount()
    expect(api.Connect).toHaveBeenCalledWith(DOCK_ID_BASE, expect.objectContaining({ host: 'cmd', port: 0, dir: W('C:', 'work') }))
    const region = screen.getByRole('region', { name: '터미널 도크' })
    expect(region.hasAttribute('data-terminal-root')).toBe(true)
  })

  it('DKV-02: 패널 따라가기 켜면 폴더 이동마다 cd, 끄면 안 보냄', async () => {
    await mount()
    setPanel('left', W('C:', 'next'))
    expect(api.Send).not.toHaveBeenCalled() // 기본은 꺼짐
    fireEvent.click(screen.getByLabelText('패널 따라가기'))
    setPanel('left', W('C:', 'a b'))
    await waitFor(() => expect(api.Send).toHaveBeenCalledWith(DOCK_ID_BASE, `cd /d "${W('C:', 'a b')}"\r`))
    // 활성 패널을 바꿔도 따라감
    act(() => useFileStore.setState({ activePanel: 'right' }))
    await waitFor(() => expect(api.Send).toHaveBeenLastCalledWith(DOCK_ID_BASE, `cd /d "${W('D:', 'other')}"\r`))
    expect(JSON.parse(localStorage.getItem(DOCK_PREFS_KEY)).follow).toBe(true)
  })

  it('DKV-03: 셸 바꾸기 → 그 셸로 다시 시작, 선택 기억', async () => {
    await mount()
    await act(async () => { fireEvent.change(screen.getByLabelText('셸'), { target: { value: 'powershell' } }) })
    await waitFor(() => expect(api.Connect).toHaveBeenLastCalledWith(DOCK_ID_BASE, expect.objectContaining({ host: 'powershell' })))
    expect(JSON.parse(localStorage.getItem(DOCK_PREFS_KEY)).shell).toBe('powershell')
  })

  it('DKV-04: 셸이 끝나면 안내, Enter로 다시 시작', async () => {
    await mount()
    act(() => handlers['term:closed'](DOCK_ID_BASE, '', false))
    expect(terms[0].text()).toContain('셸이 끝났습니다')
    await act(async () => { terms[0].type('\r') })
    await waitFor(() => expect(api.Connect).toHaveBeenCalledTimes(2))
  })

  it('DKV-05: 시작 실패 → 화면에 오류, Enter로 다시 시도', async () => {
    api.Connect.mockRejectedValueOnce(new Error('cmd.exe를 찾을 수 없습니다'))
    await mount()
    expect(terms[0].text()).toContain('cmd.exe를 찾을 수 없습니다')
    await act(async () => { terms[0].type('\r') })
    await waitFor(() => expect(api.Connect).toHaveBeenCalledTimes(2))
  })

  it('DKV-06: 경로 붙여넣기 (스토어 paste) → 셸에 입력, 도크에 포커스', async () => {
    await mount()
    act(() => { useDockStore.getState().paste(W('C:', 'work', 'a b.txt')) })
    await waitFor(() => expect(api.Send).toHaveBeenCalledWith(DOCK_ID_BASE, `"${W('C:', 'work', 'a b.txt')}" `))
  })

  it('DKV-07: 다시 시작 버튼, ✕는 도크를 닫음(세션 유지)', async () => {
    await mount()
    useDockStore.setState({ open: true })
    await act(async () => { fireEvent.click(screen.getByTitle('셸 다시 시작')) })
    await waitFor(() => expect(api.Connect).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByTitle('도크 닫기 (F9)'))
    expect(useDockStore.getState().open).toBe(false)
    expect(api.CloseTab).not.toHaveBeenCalled()
  })

  it('DKV-08: 도크 안에서 F9 → 도크 닫고 패널로', async () => {
    await mount()
    useDockStore.setState({ open: true })
    fireEvent.keyDown(screen.getByRole('region', { name: '터미널 도크' }), { key: 'F9' })
    expect(useDockStore.getState().open).toBe(false)
  })

  it('DKV-09: 경계선 끌어 높이 조절, 기억', async () => {
    await mount()
    const grip = screen.getByTitle('끌어서 높이 조절')
    fireEvent.mouseDown(grip, { button: 0, clientY: 500 })
    fireEvent.mouseMove(window, { clientY: 400 })
    fireEvent.mouseUp(window)
    expect(useDockStore.getState().height).toBe(360)
    expect(JSON.parse(localStorage.getItem(DOCK_PREFS_KEY)).height).toBe(360)
  })

  it('DKV-10: 연결 중이 아니면 따라가기 cd 안 보냄', async () => {
    api.Connect.mockRejectedValueOnce(new Error('x'))
    await mount()
    fireEvent.click(screen.getByLabelText('패널 따라가기'))
    setPanel('left', W('C:', 'z'))
    expect(api.Send).not.toHaveBeenCalled()
  })

  it('DKV-11: 셸이 알려 준 폴더로 패널 이동 (📁 패널로) — 모르면 비활성', async () => {
    const navigate = vi.spyOn(useFileStore.getState(), 'navigate').mockResolvedValue(undefined)
    await mount()
    const btn = screen.getByTitle('셸의 지금 폴더를 파일 패널에서 열기')
    expect(btn.disabled).toBe(true)
    act(() => { terms[0].osc(7, 'file://pc/C:/work/sub') })
    await waitFor(() => expect(screen.getByTitle('셸의 지금 폴더를 파일 패널에서 열기').disabled).toBe(false))
    fireEvent.click(screen.getByTitle('셸의 지금 폴더를 파일 패널에서 열기'))
    expect(navigate).toHaveBeenCalledWith('left', W('C:', 'work', 'sub'))
    // cmd는 OSC 9;9로 알려 줌 (Windows Terminal 방식)
    act(() => { terms[0].osc(9, '9;' + W('D:', 'other')) })
    fireEvent.click(screen.getByTitle('셸의 지금 폴더를 파일 패널에서 열기'))
    expect(navigate).toHaveBeenLastCalledWith('left', W('D:', 'other'))
    navigate.mockRestore()
  })

  // Todo #136-1: 리눅스에는 cmd가 없음 — 이 PC의 셸 목록(GetLocalShells)으로 고르고, 저장된 셸이 없으면 첫 셸로
  it('DKV-12: 이 PC의 셸 목록 — 저장된 셸(cmd)이 없으면 첫 셸(bash)로 한 번만 시작', async () => {
    api.GetLocalShells = vi.fn().mockResolvedValue([{ name: 'bash', label: 'Bash' }, { name: 'zsh', label: 'Zsh' }])
    await mount()
    expect(api.Connect).toHaveBeenCalledTimes(1)
    expect(api.Connect).toHaveBeenCalledWith(DOCK_ID_BASE, expect.objectContaining({ host: 'bash' }))
    const options = [...screen.getByLabelText('셸').querySelectorAll('option')].map(o => o.value)
    expect(options).toEqual(['bash', 'zsh'])
    expect(screen.getByLabelText('셸').value).toBe('bash')
    // 고른 셸로 다시 시작
    await act(async () => { fireEvent.change(screen.getByLabelText('셸'), { target: { value: 'zsh' } }) })
    await waitFor(() => expect(api.Connect).toHaveBeenLastCalledWith(DOCK_ID_BASE, expect.objectContaining({ host: 'zsh' })))
  })

  it('DKV-13: 저장된 셸이 목록에 있으면 그대로, 목록을 못 받으면 기본 목록', async () => {
    localStorage.setItem(DOCK_PREFS_KEY, JSON.stringify({ shell: 'zsh' }))
    useDockStore.getState().resetForTest()
    api.GetLocalShells = vi.fn().mockResolvedValue([{ name: 'bash', label: 'Bash' }, { name: 'zsh', label: 'Zsh' }])
    await mount()
    expect(api.Connect).toHaveBeenCalledWith(DOCK_ID_BASE, expect.objectContaining({ host: 'zsh' }))
    cleanup()
    localStorage.removeItem(DOCK_PREFS_KEY)
    useDockStore.getState().resetForTest()
    api.GetLocalShells = vi.fn().mockRejectedValue(new Error('no backend'))
    api.Connect.mockClear()
    await mount()
    expect(api.Connect).toHaveBeenCalledWith(DOCK_ID_BASE, expect.objectContaining({ host: 'cmd' }))
    expect(screen.getByLabelText('셸').querySelectorAll('option').length).toBe(3)
  })
})
