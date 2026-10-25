import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore, MEMO_KEY } from '../store/termStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest } from '../core/settings'

// ─── Todo #121: 메모장 (Ctrl+Shift+B) — 칸 위에 뜨고, 모든 탭이 같은 내용 ────────

let api
beforeEach(() => {
  try { localStorage.removeItem(MEMO_KEY) } catch { /* 없음 */ }
  const ok = () => vi.fn().mockResolvedValue(undefined)
  api = {
    GetSettings: vi.fn().mockResolvedValue({}), SaveSettings: ok(), GetHistory: vi.fn().mockResolvedValue([]),
    GetSessions: vi.fn().mockResolvedValue([]), GetSSHConfigHosts: vi.fn().mockResolvedValue([]),
    GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
    CloseTab: ok(), Connect: vi.fn().mockResolvedValue('ssh'), Send: ok(), Resize: ok(), Disconnect: ok(),
    TabTheme: vi.fn().mockResolvedValue(''), SetTabTheme: ok(),
    MemoSave: vi.fn().mockResolvedValue('C:\\Users\\me\\Downloads\\memo.txt'),
  }
  setTermBackend(api, { EventsOn: () => () => {}, ClipboardSetText: vi.fn() })
  useTermStore.getState().resetForTest()
  resetSettingsForTest()
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null); vi.restoreAllMocks() })

const root = () => document.querySelector('[data-terminal-root]')
const toggle = () => fireEvent.keyDown(root(), { key: 'B', ctrlKey: true, shiftKey: true })
const pads = () => screen.queryAllByRole('region', { name: '메모장' })
async function connected() {
  render(React.createElement(TerminalWorkspace, { createTerminal: (o) => new FakeTerminal(o), addons: false }))
  fireEvent.change(await screen.findByLabelText('Host'), { target: { value: 'srv' } })
  await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
  await waitFor(() => expect(screen.queryByLabelText('Host')).toBeNull())
}

describe('메모장 (MM)', () => {
  it('MM-01: Ctrl+Shift+B로 열고 닫음, 열면 입력란에 포커스', async () => {
    await connected()
    toggle()
    expect(pads()).toHaveLength(1)
    expect(document.activeElement).toBe(within(pads()[0]).getByRole('textbox'))
    toggle()
    expect(pads()).toHaveLength(0)
  })

  it('MM-02: 입력하면 바로 저장, 다시 열어도 그대로', async () => {
    await connected()
    toggle()
    fireEvent.change(within(pads()[0]).getByRole('textbox'), { target: { value: '서버 비번 바꿀 것' } })
    expect(localStorage.getItem(MEMO_KEY)).toBe('서버 비번 바꿀 것')
    toggle(); toggle()
    expect(within(pads()[0]).getByRole('textbox').value).toBe('서버 비번 바꿀 것')
  })

  it('MM-03: 분할한 두 칸의 메모장은 같은 내용', async () => {
    await connected()
    toggle()
    fireEvent.keyDown(root(), { key: '|', code: 'Backslash', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(useTermStore.getState().tabs).toHaveLength(2))
    toggle()
    expect(pads()).toHaveLength(2)
    fireEvent.change(within(pads()[1]).getByRole('textbox'), { target: { value: 'shared' } })
    expect(within(pads()[0]).getByRole('textbox').value).toBe('shared')
  })

  it('MM-04: Esc / ✕로 닫힘', async () => {
    await connected()
    toggle()
    fireEvent.keyDown(within(pads()[0]).getByRole('textbox'), { key: 'Escape' })
    expect(pads()).toHaveLength(0)
    toggle()
    fireEvent.click(within(pads()[0]).getByTitle('닫기 (Esc)'))
    expect(pads()).toHaveLength(0)
  })

  it('MM-05: 다른 이름으로 저장 → 결과 표시, 실패도 표시', async () => {
    await connected()
    toggle()
    fireEvent.change(within(pads()[0]).getByRole('textbox'), { target: { value: 'memo' } })
    await act(async () => { fireEvent.click(within(pads()[0]).getByRole('button', { name: '다른 이름으로 저장' })) })
    expect(api.MemoSave).toHaveBeenCalledWith('memo')
    expect(within(pads()[0]).getByRole('status').textContent).toBe('메모를 저장했습니다: C:\\Users\\me\\Downloads\\memo.txt')
    api.MemoSave.mockRejectedValueOnce(new Error('디스크가 가득 참'))
    await act(async () => { fireEvent.click(within(pads()[0]).getByRole('button', { name: '다른 이름으로 저장' })) })
    expect(within(pads()[0]).getByRole('status').textContent).toContain('메모를 저장하지 못했습니다: 디스크가 가득 참')
  })

  it('MM-06: 저장 창을 취소하면(빈 경로) 아무 표시 없음', async () => {
    await connected()
    api.MemoSave.mockResolvedValueOnce('')
    toggle()
    await act(async () => { fireEvent.click(within(pads()[0]).getByRole('button', { name: '다른 이름으로 저장' })) })
    expect(within(pads()[0]).queryByRole('status')).toBeNull()
  })

  it('MM-07: 탭 메뉴 "메모장", 탭을 닫으면 그 칸의 메모장도 사라짐', async () => {
    await connected()
    fireEvent.contextMenu(screen.getByText('srv', { selector: '[data-tab-label]' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '메모장 (Ctrl+Shift+B)' }))
    expect(pads()).toHaveLength(1)
    await act(async () => { await useTermStore.getState().closeTab(1) })
    expect(pads()).toHaveLength(0)
    expect(useTermStore.getState().memos).toEqual([])
  })

  it('MM-08: localStorage를 못 써도 메모장은 동작', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    await connected()
    toggle()
    fireEvent.change(within(pads()[0]).getByRole('textbox'), { target: { value: 'x' } })
    expect(within(pads()[0]).getByRole('textbox').value).toBe('x')
    expect(within(pads()[0]).getByRole('status').textContent).toContain('메모 자동 저장 실패')
  })
})
