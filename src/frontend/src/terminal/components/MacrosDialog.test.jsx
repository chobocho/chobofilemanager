import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest, settings } from '../core/settings'

// ─── Todo #121: 매크로 창 (Ctrl+Shift+M) · F키 매크로 ─────────────────────────

let api
beforeEach(() => {
  const ok = () => vi.fn().mockResolvedValue(undefined)
  api = {
    GetSettings: vi.fn().mockResolvedValue({ macros: [{ name: 'list', key: 'F5', text: 'ls -l\n', kind: '' }, { name: 'up', key: '', text: 'uptime\n', kind: '' }] }),
    SaveSettings: ok(), GetHistory: vi.fn().mockResolvedValue([]),
    GetSessions: vi.fn().mockResolvedValue([]), GetSSHConfigHosts: vi.fn().mockResolvedValue([]),
    GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
    CloseTab: ok(), Connect: vi.fn().mockResolvedValue('ssh'), Send: ok(), Resize: ok(), Disconnect: ok(),
    TabTheme: vi.fn().mockResolvedValue(''), SetTabTheme: ok(),
  }
  setTermBackend(api, { EventsOn: () => () => {}, ClipboardSetText: vi.fn() })
  useTermStore.getState().resetForTest()
  resetSettingsForTest()
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

const root = () => document.querySelector('[data-terminal-root]')
async function connected() {
  render(React.createElement(TerminalWorkspace, { createTerminal: (o) => new FakeTerminal(o), addons: false }))
  fireEvent.change(await screen.findByLabelText('Host'), { target: { value: 'srv' } })
  await waitFor(() => expect(settings.macros).toHaveLength(2))
  await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
  await waitFor(() => expect(screen.queryByLabelText('Host')).toBeNull())
}
async function openMacros() {
  await connected()
  fireEvent.keyDown(root(), { key: 'M', ctrlKey: true, shiftKey: true })
  return screen.findByRole('dialog', { name: '매크로' })
}

describe('매크로 (MD)', () => {
  it('MD-01: 지정한 F키 → 연결된 탭에 보냄, 다른 F키는 그대로', async () => {
    await connected()
    fireEvent.keyDown(root(), { key: 'F5' })
    await waitFor(() => expect(api.Send).toHaveBeenCalledWith(1, 'ls -l\r'))
    api.Send.mockClear()
    fireEvent.keyDown(root(), { key: 'F6' })
    expect(api.Send).not.toHaveBeenCalled()
  })

  it('MD-02: 연결 창이 열려 있으면 F키 매크로 안 보냄', async () => {
    render(React.createElement(TerminalWorkspace, { createTerminal: (o) => new FakeTerminal(o), addons: false }))
    await screen.findByLabelText('Host')
    await waitFor(() => expect(settings.macros).toHaveLength(2))
    fireEvent.keyDown(root(), { key: 'F5' })
    expect(api.Send).not.toHaveBeenCalled()
  })

  it('MD-03: 창 — 목록(단축키·이름), 첫 매크로 선택, 입력란 채움', async () => {
    const dlg = await openMacros()
    const opts = within(dlg).getAllByRole('option', { name: /list|up/ })
    expect(opts.map(o => o.textContent)).toEqual(['F5list', 'up'])
    expect(opts[0].getAttribute('aria-selected')).toBe('true')
    expect(within(dlg).getByLabelText('이름').value).toBe('list')
    expect(within(dlg).getByLabelText('내용').value).toBe('ls -l\n')
    expect(within(dlg).getByLabelText('단축키').value).toBe('F5')
  })

  it('MD-04: 고치면 바로 저장 — 이름, 내용, 단축키', async () => {
    const dlg = await openMacros()
    fireEvent.change(within(dlg).getByLabelText('이름'), { target: { value: 'll' } })
    fireEvent.change(within(dlg).getByLabelText('내용'), { target: { value: 'ls -al\n' } })
    fireEvent.change(within(dlg).getByLabelText('단축키'), { target: { value: 'Shift+F3' } })
    expect(settings.macros[0]).toEqual({ name: 'll', key: 'Shift+F3', text: 'ls -al\n', kind: '' })
    expect(within(dlg).getAllByRole('option', { name: /ll/ })[0].textContent).toBe('Shift+F3ll')
    await waitFor(() => expect(api.SaveSettings).toHaveBeenCalled(), { timeout: 2000 })
  })

  it('MD-05: 다른 매크로가 쓰는 키는 고를 수 없음', async () => {
    const dlg = await openMacros()
    fireEvent.mouseDown(within(dlg).getByRole('option', { name: /up/ }))
    const f5 = within(within(dlg).getByLabelText('단축키')).getByRole('option', { name: 'F5 - list' })
    expect(f5.disabled).toBe(true)
  })

  it('MD-06: + 추가 / 삭제', async () => {
    const dlg = await openMacros()
    fireEvent.click(within(dlg).getByRole('button', { name: '+ 추가' }))
    expect(settings.macros).toHaveLength(3)
    expect(document.activeElement).toBe(within(dlg).getByLabelText('이름'))
    fireEvent.click(within(dlg).getByRole('button', { name: '삭제' }))
    expect(settings.macros).toHaveLength(2)
  })

  it('MD-07: 보내기 → 창 닫고 연결된 탭에 보냄 (목록 Enter, 더블클릭도)', async () => {
    const dlg = await openMacros()
    fireEvent.mouseDown(within(dlg).getByRole('option', { name: /up/ }))
    fireEvent.click(within(dlg).getByRole('button', { name: '보내기' }))
    expect(screen.queryByRole('dialog', { name: '매크로' })).toBeNull()
    await waitFor(() => expect(api.Send).toHaveBeenCalledWith(1, 'uptime\r'))
  })

  it('MD-08: 종류를 Lua로 바꾸면 버튼이 "실행", 안내도 Lua', async () => {
    const dlg = await openMacros()
    fireEvent.change(within(dlg).getByLabelText('종류'), { target: { value: 'lua' } })
    expect(within(dlg).getByRole('button', { name: '실행' })).toBeTruthy()
    expect(within(dlg).getByText(/expect\(/)).toBeTruthy()
    expect(settings.macros[0].kind).toBe('lua')
  })

  it('MD-09: 목록 키보드 — 아래 화살표, Delete, Insert, Esc 닫기', async () => {
    const dlg = await openMacros()
    const list = within(dlg).getByRole('listbox')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(within(dlg).getByLabelText('이름').value).toBe('up')
    fireEvent.keyDown(list, { key: 'Delete' })
    expect(settings.macros.map(m => m.name)).toEqual(['list'])
    fireEvent.keyDown(list, { key: 'Insert' })
    expect(settings.macros).toHaveLength(2)
    fireEvent.keyDown(list, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '매크로' })).toBeNull()
  })

  it('MD-10: 매크로가 없으면 안내, 입력란 비활성', async () => {
    api.GetSettings.mockResolvedValue({ macros: [] })
    render(React.createElement(TerminalWorkspace, { createTerminal: (o) => new FakeTerminal(o), addons: false }))
    await screen.findByLabelText('Host')
    fireEvent.click(screen.getByTitle('매크로 (Ctrl+Shift+M)'))
    const dlg = await screen.findByRole('dialog', { name: '매크로' })
    expect(within(dlg).getByText('+ 추가로 매크로를 만드세요')).toBeTruthy()
    expect(within(dlg).getByLabelText('이름').disabled).toBe(true)
  })
})
