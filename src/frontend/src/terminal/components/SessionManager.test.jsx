import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest } from '../core/settings'

// ─── Todo #121: 세션 저장 · 세션 관리자 (Ctrl+Shift+H) ─────────────────────────

const S = (o) => ({ id: 'x', name: '', group: '', host: '', port: 22, login: '', encoding: 'UTF-8', pass: '', jump: '', ...o })
let api, saved
beforeEach(() => {
  saved = [
    S({ id: '1', name: 'web', group: 'prod', host: 'web.example', login: 'root' }),
    S({ id: '2', name: 'db', group: 'prod', host: 'db.example' }),
    S({ id: '3', name: 'pi', host: '192.168.0.9', login: 'pi' }),
  ]
  const ok = () => vi.fn().mockResolvedValue(undefined)
  let n = 10
  api = {
    GetSettings: vi.fn().mockResolvedValue({}), SaveSettings: ok(), GetHistory: vi.fn().mockResolvedValue([]),
    GetSessions: vi.fn(() => Promise.resolve(saved.map(x => ({ ...x })))),
    SaveSession: vi.fn((x, keepPass) => {
      const v = { ...x, id: x.id || String(n++), pass: keepPass ? x.pass : '' }
      saved = [...saved.filter(o => o.id !== v.id), v]
      return Promise.resolve(v)
    }),
    DeleteSession: vi.fn((id) => { saved = saved.filter(o => o.id !== id); return Promise.resolve() }),
    ExportSessions: vi.fn().mockResolvedValue('C:\\out\\s.json'),
    ImportSessions: vi.fn().mockResolvedValue({ added: 2, skipped: 1 }),
    ImportPuTTY: vi.fn().mockRejectedValue(new Error('PuTTY에 저장된 SSH / Telnet 세션이 없습니다')),
    GetSSHConfigHosts: vi.fn().mockResolvedValue([]), GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
    CloseTab: ok(), Connect: vi.fn().mockResolvedValue('ssh'), Send: ok(), Resize: ok(), Disconnect: ok(),
    TabTheme: vi.fn().mockResolvedValue(''), SetTabTheme: ok(),
  }
  setTermBackend(api, { EventsOn: () => () => {}, ClipboardSetText: vi.fn() })
  useTermStore.getState().resetForTest()
  resetSettingsForTest()
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

const createTerminal = (o) => new FakeTerminal(o)
const mount = () => render(React.createElement(TerminalWorkspace, { createTerminal, addons: false }))
const workspace = () => document.querySelector('[data-terminal-root]')
async function openManager() {
  mount()
  await screen.findByLabelText('Host')
  fireEvent.keyDown(workspace(), { key: 'H', ctrlKey: true, shiftKey: true })
  return screen.findByRole('dialog', { name: '세션 관리' })
}
const row = (dlg, name) => within(dlg).getByRole('option', { name: new RegExp(`^${name}`) })

describe('세션 관리자 (SM)', () => {
  it('SM-01: Ctrl+Shift+H로 열림 — 그룹별 목록, 첫 세션 선택, 입력란 채움', async () => {
    const dlg = await openManager()
    await waitFor(() => expect(row(dlg, 'web')).toBeTruthy())
    expect(within(dlg).getByText('★ prod')).toBeTruthy()
    expect(within(dlg).getByText('★ 그룹 없음')).toBeTruthy()
    expect(row(dlg, 'web').getAttribute('aria-selected')).toBe('true')
    expect(within(dlg).getByLabelText('이름').value).toBe('web')
    expect(within(dlg).getByLabelText('Host').value).toBe('web.example')
  })

  it('SM-02: 찾기 입력 → 목록 거름, 화살표로 선택 이동', async () => {
    const dlg = await openManager()
    await waitFor(() => row(dlg, 'web'))
    fireEvent.change(within(dlg).getByPlaceholderText('찾기 (이름 · 주소 · 그룹)'), { target: { value: 'prod' } })
    expect(within(dlg).queryByRole('option', { name: /^pi/ })).toBeNull()
    fireEvent.keyDown(within(dlg).getByPlaceholderText('찾기 (이름 · 주소 · 그룹)'), { key: 'ArrowDown' })
    await waitFor(() => expect(row(dlg, 'db').getAttribute('aria-selected')).toBe('true'))
  })

  it('SM-03: 고치면 저장 (다른 세션을 고르면 바로)', async () => {
    const dlg = await openManager()
    await waitFor(() => row(dlg, 'web'))
    fireEvent.change(within(dlg).getByLabelText('이름'), { target: { value: 'web2' } })
    await act(async () => { fireEvent.mouseDown(row(dlg, 'db')) })
    await waitFor(() => expect(api.SaveSession).toHaveBeenCalledWith(expect.objectContaining({ id: '1', name: 'web2', host: 'web.example' }), false))
    await waitFor(() => expect(within(dlg).getByLabelText('이름').value).toBe('db'))
    expect(row(dlg, 'web2')).toBeTruthy()
  })

  it('SM-04: Host가 비면 저장하지 않고 알림', async () => {
    const dlg = await openManager()
    await waitFor(() => row(dlg, 'web'))
    fireEvent.change(within(dlg).getByLabelText('Host'), { target: { value: ' ' } })
    await act(async () => { fireEvent.mouseDown(row(dlg, 'db')) })
    expect(api.SaveSession).not.toHaveBeenCalled()
    expect(within(dlg).getByRole('alert').textContent).toContain('Host를 입력하세요')
  })

  it('SM-05: + 추가 → 새 세션 입력 후 저장, 비밀번호 입력 = 저장 체크', async () => {
    const dlg = await openManager()
    await waitFor(() => row(dlg, 'web'))
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '+ 추가' })) })
    expect(within(dlg).getByText('★ 새 세션')).toBeTruthy()
    expect(within(dlg).getByRole('option', { name: /^\(새 세션\)/ }).getAttribute('aria-selected')).toBe('true')
    fireEvent.change(within(dlg).getByLabelText('Host'), { target: { value: 'new.example' } })
    fireEvent.change(within(dlg).getByLabelText('Pass'), { target: { value: 'pw' } })
    expect(within(dlg).getByRole('checkbox').checked).toBe(true)
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '닫기' })) })
    expect(api.SaveSession).toHaveBeenCalledWith(expect.objectContaining({ id: '', host: 'new.example', pass: 'pw', port: 22 }), true)
    expect(screen.queryByRole('dialog', { name: '세션 관리' })).toBeNull()
  })

  it('SM-06: 복제 → "(복사)" 세션 저장 후 선택', async () => {
    const dlg = await openManager()
    await waitFor(() => row(dlg, 'web'))
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '복제' })) })
    await waitFor(() => expect(within(dlg).getByLabelText('이름').value).toBe('web (복사)'))
    expect(api.SaveSession).toHaveBeenCalledWith(expect.objectContaining({ id: '', name: 'web (복사)', host: 'web.example' }), false)
  })

  it('SM-07: 삭제 — 확인 후 지우고 다음 세션 선택, 취소하면 유지', async () => {
    const dlg = await openManager()
    await waitFor(() => row(dlg, 'web'))
    fireEvent.click(within(dlg).getByRole('button', { name: '삭제' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '취소' }))
    expect(api.DeleteSession).not.toHaveBeenCalled()
    fireEvent.click(within(dlg).getByRole('button', { name: '삭제' }))
    const ask = screen.getByRole('alertdialog')
    expect(within(ask).getByText("'web' 세션을 지울까요?")).toBeTruthy()
    await act(async () => { fireEvent.click(within(ask).getByRole('button', { name: '지우기' })) })
    expect(api.DeleteSession).toHaveBeenCalledWith('1')
    await waitFor(() => expect(row(dlg, 'db').getAttribute('aria-selected')).toBe('true'))
    expect(within(dlg).queryByRole('option', { name: /^web/ })).toBeNull()
  })

  it('SM-08: 접속 — 창 닫고 지금 칸에서 세션 이름으로 연결', async () => {
    const dlg = await openManager()
    await waitFor(() => row(dlg, 'web'))
    await act(async () => { fireEvent.doubleClick(row(dlg, 'web')) })
    await waitFor(() => expect(api.Connect).toHaveBeenCalledWith(1, expect.objectContaining({ host: 'web.example', login: 'root' })))
    expect(screen.queryByRole('dialog', { name: '세션 관리' })).toBeNull()
    await waitFor(() => expect(screen.getByText('web', { selector: '[data-tab-label]' })).toBeTruthy())
  })

  it('SM-09: 그룹 전체 열기 — 그룹의 세션마다 탭', async () => {
    const dlg = await openManager()
    await waitFor(() => row(dlg, 'web'))
    const btn = within(dlg).getByRole('button', { name: '"prod" 전체 열기' })
    await act(async () => { fireEvent.click(btn) })
    await waitFor(() => expect(api.Connect).toHaveBeenCalledTimes(2))
    expect(api.Connect.mock.calls.map(c => c[1].host).sort()).toEqual(['db.example', 'web.example'])
    expect(useTermStore.getState().groups).toHaveLength(2)
  })

  it('SM-10: 가져오기 · 내보내기 메뉴 — 결과/오류 표시', async () => {
    const dlg = await openManager()
    await waitFor(() => row(dlg, 'web'))
    const more = within(dlg).getByRole('button', { name: '가져오기 · 내보내기 ▾' })
    fireEvent.click(more)
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: '파일에서 가져오기...' })) })
    await waitFor(() => expect(within(dlg).getByRole('status').textContent).toBe('2개를 가져왔습니다 (이미 있는 1개는 건너뜀)'))
    fireEvent.click(more)
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: '파일로 내보내기... (비밀번호 제외)' })) })
    await waitFor(() => expect(within(dlg).getByRole('status').textContent).toContain('3개를 내보냈습니다'))
    fireEvent.click(more)
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'PuTTY 세션 가져오기' })) })
    await waitFor(() => expect(within(dlg).getByRole('alert').textContent).toContain('PuTTY에 저장된'))
  })

  it('SM-11: Esc로 닫힘 — 터미널 칸은 그대로', async () => {
    const dlg = await openManager()
    fireEvent.keyDown(dlg, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '세션 관리' })).toBeNull())
    expect(useTermStore.getState().tabs).toHaveLength(1)
  })
})

describe('세션으로 저장 (SV)', () => {
  it('SV-10: 접속 창의 ☆ 저장 → 이름·그룹 입력 후 저장, 접속 목록에 반영', async () => {
    mount()
    fireEvent.change(await screen.findByLabelText('Host'), { target: { value: 'save.example' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: '☆ 저장' }))
    const dlg = await screen.findByRole('dialog', { name: '세션으로 저장' })
    expect(within(dlg).getByText('save.example:22 · UTF-8')).toBeTruthy()
    expect(within(dlg).getByLabelText('이름').value).toBe('save.example')
    fireEvent.change(within(dlg).getByLabelText('이름'), { target: { value: 'mine' } })
    fireEvent.change(within(dlg).getByLabelText('그룹'), { target: { value: 'g1' } })
    fireEvent.click(within(dlg).getByRole('checkbox'))
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '저장' })) })
    expect(api.SaveSession).toHaveBeenCalledWith(expect.objectContaining({ id: '', name: 'mine', group: 'g1', host: 'save.example', pass: 'pw' }), true)
    expect(screen.queryByRole('dialog', { name: '세션으로 저장' })).toBeNull()
    // 그 세션 이름으로 연결
    await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
    await waitFor(() => expect(screen.getByText('mine', { selector: '[data-tab-label]' })).toBeTruthy())
  })

  it('SV-11: Alt+S로 열고 Esc로 취소 — 접속 창은 남음', async () => {
    mount()
    const host = await screen.findByLabelText('Host')
    fireEvent.change(host, { target: { value: 'h1' } })
    fireEvent.keyDown(host, { key: 's', altKey: true })
    const dlg = await screen.findByRole('dialog', { name: '세션으로 저장' })
    fireEvent.keyDown(within(dlg).getByLabelText('이름'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '세션으로 저장' })).toBeNull())
    expect(screen.getByLabelText('Host')).toBeTruthy()
    expect(api.SaveSession).not.toHaveBeenCalled()
  })

  it('SV-12: 탭 메뉴 "세션으로 저장" — 저장하면 탭 이름이 세션 이름', async () => {
    mount()
    fireEvent.change(await screen.findByLabelText('Host'), { target: { value: 'tab.example' } })
    await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
    await waitFor(() => expect(screen.queryByLabelText('Host')).toBeNull())
    fireEvent.contextMenu(screen.getByText('tab.example', { selector: '[data-tab-label]' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '세션으로 저장' }))
    const dlg = await screen.findByRole('dialog', { name: '세션으로 저장' })
    fireEvent.change(within(dlg).getByLabelText('이름'), { target: { value: 'named' } })
    await act(async () => { fireEvent.keyDown(within(dlg).getByLabelText('이름'), { key: 'Enter' }) })
    await waitFor(() => expect(screen.getByText('named', { selector: '[data-tab-label]' })).toBeTruthy())
  })

  it('SV-13: 비밀번호가 없으면 "비밀번호도 저장" 비활성', async () => {
    mount()
    fireEvent.change(await screen.findByLabelText('Host'), { target: { value: 'nopass' } })
    fireEvent.click(screen.getByRole('button', { name: '☆ 저장' }))
    const dlg = await screen.findByRole('dialog', { name: '세션으로 저장' })
    expect(within(dlg).getByRole('checkbox').disabled).toBe(true)
  })
})
