import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest } from '../core/settings'

// ─── Todo #121: 분할 화면 ─────────────────────────────────────────────────────

let terms
beforeEach(() => {
  terms = []
  const ok = () => vi.fn().mockResolvedValue(undefined)
  setTermBackend({
    GetSettings: vi.fn().mockResolvedValue({}), SaveSettings: ok(), GetHistory: vi.fn().mockResolvedValue([]),
    GetSessions: vi.fn().mockResolvedValue([]), GetSSHConfigHosts: vi.fn().mockResolvedValue([]),
    GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
    CloseTab: ok(), Connect: vi.fn().mockResolvedValue('local'), Send: ok(), Resize: ok(),
  }, { EventsOn: () => () => {}, ClipboardSetText: vi.fn() })
  useTermStore.getState().resetForTest()
  resetSettingsForTest()
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

const createTerminal = (o) => { const t = new FakeTerminal(o); terms.push(t); return t }
async function renderWs() {
  const r = render(React.createElement(TerminalWorkspace, { createTerminal, addons: false }))
  await screen.findByLabelText('Host')
  fireEvent.keyDown(screen.getByLabelText('Host'), { key: 'Escape' }) // 첫 탭은 대화상자만 닫힘
  await act(async () => {})
  return r
}
const pane = (id) => document.querySelector(`[data-term-pane="${id}"]`)
const root = () => document.querySelector('[data-terminal-root]')

describe('분할 화면 (SV)', () => {
  it('SV-01: Ctrl+Shift+\ → 오른쪽에 새 칸, 기존 터미널은 다시 만들지 않음', async () => {
    await renderWs()
    fireEvent.keyDown(root(), { key: '|', code: 'Backslash', ctrlKey: true, shiftKey: true })
    await act(async () => {})
    expect(terms).toHaveLength(2)
    expect(terms[0].disposed).toBe(false)
    expect(pane(1).style.width).toBe('50%')
    expect(pane(2).style.left).toBe('50%')
    expect(pane(1).hidden).toBe(false)
    expect(pane(2).hidden).toBe(false)
    expect(screen.getByLabelText('Host')).toBeTruthy() // 새 칸의 연결 대화상자
  })

  it('SV-02: 새 칸의 대화상자를 Esc로 닫으면 칸도 닫힘', async () => {
    await renderWs()
    fireEvent.keyDown(root(), { key: '_', code: 'Minus', ctrlKey: true, shiftKey: true })
    await act(async () => {})
    await act(async () => { fireEvent.keyDown(screen.getByLabelText('Host'), { key: 'Escape' }) })
    expect(pane(2)).toBeNull()
    expect(terms[1].disposed).toBe(true)
    expect(pane(1).style.height).toBe('100%')
  })

  it('SV-03: Alt+방향키로 칸 이동, 분할 안 된 탭에서는 프로그램으로', async () => {
    await renderWs()
    expect(terms[0].keyHandler({ key: 'ArrowLeft', altKey: true, type: 'keydown' })).toBe(true) // 분할 전: 셸로
    fireEvent.keyDown(root(), { key: '|', code: 'Backslash', ctrlKey: true, shiftKey: true })
    await act(async () => {})
    fireEvent.keyDown(screen.getByLabelText('Host'), { key: 'Escape' })
    // 연결 안 된 임시 칸은 Esc로 닫혔으므로 다시 분할 후 연결
    fireEvent.keyDown(root(), { key: '|', code: 'Backslash', ctrlKey: true, shiftKey: true })
    await act(async () => {})
    await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
    const active = useTermStore.getState().activeId
    expect(terms[0].keyHandler({ key: 'ArrowLeft', altKey: true, type: 'keydown' })).toBe(false) // 분할 후: 앱이 처리
    fireEvent.keyDown(root(), { key: 'ArrowLeft', altKey: true })
    expect(useTermStore.getState().activeId).toBe(1)
    fireEvent.keyDown(root(), { key: 'ArrowRight', altKey: true })
    expect(useTermStore.getState().activeId).toBe(active)
  })

  it('SV-04: 경계선 끌기로 크기 조절, 더블클릭이면 반반', async () => {
    await renderWs()
    fireEvent.keyDown(root(), { key: '|', code: 'Backslash', ctrlKey: true, shiftKey: true })
    await act(async () => {})
    const area = document.querySelector('[data-group-area]')
    area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500 })
    const gutter = document.querySelector('[data-gutter]')
    fireEvent.mouseDown(gutter, { button: 0, clientX: 500 })
    fireEvent.mouseMove(window, { clientX: 300 })
    fireEvent.mouseUp(window)
    expect(pane(1).style.width).toBe('30%')
    fireEvent.doubleClick(gutter)
    expect(pane(1).style.width).toBe('50%')
  })

  it('SV-05: 다른 탭(그룹)으로 가면 이전 그룹의 칸은 모두 숨김', async () => {
    await renderWs()
    fireEvent.keyDown(root(), { key: '|', code: 'Backslash', ctrlKey: true, shiftKey: true })
    await act(async () => {})
    act(() => { useTermStore.getState().newTab() })
    await act(async () => {})
    expect(pane(1).hidden).toBe(true)
    expect(pane(2).hidden).toBe(true)
    expect(pane(3).hidden).toBe(false)
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(2) // 그룹 2개
  })
})
