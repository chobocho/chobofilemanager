import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest } from '../core/settings'

// ─── Todo #124: 포트 포워딩 창 (Ctrl+Shift+P) ─────────────────────────────────

let api, handlers, rules, terms
beforeEach(() => {
  handlers = {}
  terms = []
  rules = [{ id: 1, type: 'L', bindAddr: '127.0.0.1', bindPort: 5432, host: 'localhost', port: 5432, error: '', conns: 2, standby: false }]
  const ok = () => vi.fn().mockResolvedValue(undefined)
  api = {
    GetSettings: vi.fn().mockResolvedValue({}), SaveSettings: ok(), GetHistory: vi.fn().mockResolvedValue([]),
    GetSessions: vi.fn().mockResolvedValue([]), GetSSHConfigHosts: vi.fn().mockResolvedValue([]),
    GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
    CloseTab: ok(), Connect: vi.fn().mockResolvedValue('ssh'), Send: ok(), Resize: ok(), Disconnect: ok(),
    TabTheme: vi.fn().mockResolvedValue(''), SetTabTheme: ok(),
    ForwardList: vi.fn(async () => rules.map(r => ({ ...r }))),
    ForwardAdd: vi.fn(async (_id, f) => { const r = { ...f, id: 2, error: '', conns: 0, standby: false }; rules = [...rules, r]; return r }),
    ForwardRemove: vi.fn(async (_id, rid) => { rules = rules.filter(r => r.id !== rid) }),
  }
  setTermBackend(api, { EventsOn: (n, fn) => { handlers[n] = fn; return () => delete handlers[n] }, ClipboardSetText: vi.fn().mockResolvedValue(true) })
  useTermStore.getState().resetForTest()
  resetSettingsForTest()
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

const root = () => document.querySelector('[data-terminal-root]')
async function connected(proto = 'ssh') {
  api.Connect.mockResolvedValue(proto)
  render(React.createElement(TerminalWorkspace, { createTerminal: (o) => { const t = new FakeTerminal(o); terms.push(t); return t }, addons: false }))
  fireEvent.change(await screen.findByLabelText('Host'), { target: { value: 'srv' } })
  fireEvent.change(screen.getByLabelText('Login'), { target: { value: 'me' } })
  await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
  await waitFor(() => expect(screen.queryByLabelText('Host')).toBeNull())
}
async function openForwards() {
  await connected()
  await act(async () => { fireEvent.keyDown(root(), { key: 'P', ctrlKey: true, shiftKey: true }) })
  const dlg = await screen.findByRole('dialog', { name: '포트 포워딩 - srv' })
  await waitFor(() => expect(within(dlg).getAllByRole('row').length).toBeGreaterThan(1))
  return dlg
}

describe('포트 포워딩 창 (FD)', () => {
  it('FD-01: 규칙 목록과 상태, 같은 연결의 ssh 명령', async () => {
    const dlg = await openForwards()
    expect(within(dlg).getByText('127.0.0.1:5432')).toBeTruthy()
    expect(within(dlg).getByText('수신 중 · 연결 2')).toBeTruthy()
    expect(within(dlg).getByLabelText('ssh 명령').value).toBe('ssh -L 127.0.0.1:5432:localhost:5432 me@srv')
  })

  it('FD-02: 추가 — 종류·수신 포트·대상, Enter로도 추가, 목록 새로 고침', async () => {
    const dlg = await openForwards()
    fireEvent.change(within(dlg).getByLabelText('수신 포트'), { target: { value: '80a80' } })
    expect(within(dlg).getByLabelText('수신 포트').value).toBe('8080')
    fireEvent.change(within(dlg).getByLabelText('대상 호스트'), { target: { value: 'web' } })
    fireEvent.change(within(dlg).getByLabelText('대상 포트'), { target: { value: '80' } })
    await act(async () => { fireEvent.keyDown(within(dlg).getByLabelText('대상 포트'), { key: 'Enter' }) })
    expect(api.ForwardAdd).toHaveBeenCalledWith(1, { type: 'L', bindAddr: '', bindPort: 8080, host: 'web', port: 80 })
    await waitFor(() => expect(within(dlg).getAllByRole('row')).toHaveLength(3)) // 머리줄 + 2
    expect(within(dlg).getByLabelText('수신 포트').value).toBe('')
  })

  it('FD-03: 동적(-D)은 대상 칸 숨김, 설명 바뀜', async () => {
    const dlg = await openForwards()
    fireEvent.change(within(dlg).getByLabelText('종류'), { target: { value: 'D' } })
    expect(within(dlg).queryByLabelText('대상 호스트')).toBeNull()
    expect(within(dlg).getByText(/SOCKS5 프록시/)).toBeTruthy()
  })

  it('FD-04: 추가 실패 → 오류, 저장했지만 수신 못 함 → 안내', async () => {
    const dlg = await openForwards()
    api.ForwardAdd.mockRejectedValueOnce(new Error('이미 같은 수신 주소의 규칙이 있습니다'))
    fireEvent.change(within(dlg).getByLabelText('수신 포트'), { target: { value: '5432' } })
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '추가' })) })
    expect(within(dlg).getByRole('alert').textContent).toContain('이미 같은 수신 주소')
    api.ForwardAdd.mockResolvedValueOnce({ id: 9, type: 'L', bindAddr: '', bindPort: 1, host: '', port: 0, error: '권한 없음' })
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '추가' })) })
    expect(within(dlg).getByRole('alert').textContent).toBe('저장했지만 수신하지 못했습니다: 권한 없음')
  })

  it('FD-05: 줄 선택 후 삭제 (버튼·Delete 키)', async () => {
    const dlg = await openForwards()
    expect(within(dlg).getByRole('button', { name: '삭제' }).disabled).toBe(true)
    fireEvent.mouseDown(within(dlg).getByText('127.0.0.1:5432'))
    await act(async () => { fireEvent.keyDown(within(dlg).getByRole('grid'), { key: 'Delete' }) })
    expect(api.ForwardRemove).toHaveBeenCalledWith(1, 1)
    await waitFor(() => expect(within(dlg).getByText('규칙이 없습니다. 아래에서 추가하세요.')).toBeTruthy())
  })

  it('FD-06: fwd:changed → 다시 읽음, ssh 명령 복사, Esc로 닫힘', async () => {
    const dlg = await openForwards()
    rules = [...rules, { id: 3, type: 'D', bindAddr: '127.0.0.1', bindPort: 1080, host: '', port: 0, error: '', conns: 0, standby: true }]
    await act(async () => { handlers['fwd:changed'](1) })
    await waitFor(() => expect(within(dlg).getByText('대기 (다른 탭에서 수신 중)')).toBeTruthy())
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '복사' })) })
    fireEvent.keyDown(dlg, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /포트 포워딩/ })).toBeNull()
  })

  it('FD-07: SSH가 아니면 열지 않고 터미널에 안내, 탭 메뉴 항목 비활성', async () => {
    await connected('telnet')
    await act(async () => { fireEvent.keyDown(root(), { key: 'P', ctrlKey: true, shiftKey: true }) })
    expect(screen.queryByRole('dialog', { name: /포트 포워딩/ })).toBeNull()
    expect(terms[0].text()).toContain('포트 포워딩은 SSH 접속에서만 사용할 수 있습니다')
    fireEvent.contextMenu(screen.getByText('srv', { selector: '[data-tab-label]' }))
    expect(screen.getByRole('menuitem', { name: '포트 포워딩 (Ctrl+Shift+P)' }).getAttribute('aria-disabled')).toBe('true')
  })

  it('FD-08: 탭을 닫으면 창도 닫힘', async () => {
    await openForwards()
    await act(async () => { await useTermStore.getState().closeTab(1) })
    expect(useTermStore.getState().panel).toBeNull()
  })
})
