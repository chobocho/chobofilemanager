import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest, settings } from '../core/settings'
import { themeByName } from '../core/themes'

// ─── Todo #121: 설정 창 (Ctrl+Shift+O) ─────────────────────────────────────────

let api, terms
beforeEach(() => {
  terms = []
  const ok = () => vi.fn().mockResolvedValue(undefined)
  api = {
    GetSettings: vi.fn().mockResolvedValue({ fontSize: 16 }), SaveSettings: ok(), GetHistory: vi.fn().mockResolvedValue([]),
    GetSessions: vi.fn().mockResolvedValue([]), GetSSHConfigHosts: vi.fn().mockResolvedValue([]),
    GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
    CloseTab: ok(), Connect: vi.fn().mockResolvedValue('ssh'), Send: ok(), Resize: ok(), Disconnect: ok(),
    TabTheme: vi.fn().mockResolvedValue(''), SetTabTheme: ok(),
    ChooseLogDir: vi.fn().mockResolvedValue('D:\\picked'),
  }
  setTermBackend(api, { EventsOn: () => () => {}, ClipboardSetText: vi.fn() })
  useTermStore.getState().resetForTest()
  resetSettingsForTest()
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null); vi.useRealTimers() })

const createTerminal = (o) => { const t = new FakeTerminal(o); terms.push(t); return t }
async function openPrefs() {
  render(React.createElement(TerminalWorkspace, { createTerminal, addons: false }))
  await screen.findByLabelText('Host')
  await waitFor(() => expect(settings.fontSize).toBe(16)) // loadSettings 끝남
  fireEvent.keyDown(document.querySelector('[data-terminal-root]'), { key: 'O', ctrlKey: true, shiftKey: true })
  return screen.findByRole('dialog', { name: '설정' })
}

describe('설정 창 (PD)', () => {
  it('PD-01: Ctrl+Shift+O → 지금 설정으로 채움, 글꼴 크기에 포커스', async () => {
    const dlg = await openPrefs()
    expect(within(dlg).getByLabelText('글꼴 크기').value).toBe('16')
    expect(document.activeElement).toBe(within(dlg).getByLabelText('글꼴 크기'))
    expect(within(dlg).getByLabelText('여러 줄을 붙여넣기 전에 확인').checked).toBe(true)
    expect(within(dlg).getByLabelText('연결이 끊기면 자동으로 다시 연결').checked).toBe(true)
  })

  it('PD-02: 확인 → 저장하고 열린 탭에 바로 적용', async () => {
    const dlg = await openPrefs()
    fireEvent.change(within(dlg).getByLabelText('글꼴 크기'), { target: { value: '21' } })
    fireEvent.change(within(dlg).getByLabelText('색 테마'), { target: { value: 'dracula' } })
    fireEvent.change(within(dlg).getByLabelText('스크롤백'), { target: { value: '2000' } })
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '확인' })) })
    expect(screen.queryByRole('dialog', { name: '설정' })).toBeNull()
    expect(settings.fontSize).toBe(21)
    expect(settings.theme).toBe('dracula')
    expect(terms[0].options.fontSize).toBe(21)
    expect(terms[0].options.scrollback).toBe(2000)
    expect(terms[0].options.theme).toEqual(themeByName('dracula').theme)
    await waitFor(() => expect(api.SaveSettings).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 21, theme: 'dracula' })), { timeout: 2000 })
  })

  it('PD-03: 잘못된 숫자 → 오류, 창 유지, 저장 안 함', async () => {
    const dlg = await openPrefs()
    fireEvent.change(within(dlg).getByLabelText('연결 유지 간격'), { target: { value: '9999' } })
    fireEvent.click(within(dlg).getByRole('button', { name: '확인' }))
    expect(within(dlg).getByRole('alert').textContent).toBe('연결 유지 간격: 0~3600 사이의 숫자를 입력하세요')
    expect(document.activeElement).toBe(within(dlg).getByLabelText('연결 유지 간격'))
    expect(settings.keepAlive).toBe(60)
  })

  it('PD-04: 취소/Esc → 바꾼 값 버림', async () => {
    let dlg = await openPrefs()
    fireEvent.change(within(dlg).getByLabelText('글꼴 크기'), { target: { value: '30' } })
    fireEvent.click(within(dlg).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog', { name: '설정' })).toBeNull()
    expect(settings.fontSize).toBe(16)
    fireEvent.keyDown(document.querySelector('[data-terminal-root]'), { key: 'O', ctrlKey: true, shiftKey: true })
    dlg = await screen.findByRole('dialog', { name: '설정' })
    expect(within(dlg).getByLabelText('글꼴 크기').value).toBe('16')
    fireEvent.keyDown(within(dlg).getByLabelText('글꼴 크기'), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '설정' })).toBeNull()
  })

  it('PD-05: Enter = 확인', async () => {
    const dlg = await openPrefs()
    fireEvent.change(within(dlg).getByLabelText('글꼴 크기'), { target: { value: '12' } })
    await act(async () => { fireEvent.keyDown(within(dlg).getByLabelText('글꼴 크기'), { key: 'Enter' }) })
    expect(settings.fontSize).toBe(12)
  })

  it('PD-06: 테마를 고르면 미리보기 배경이 바뀜', async () => {
    const dlg = await openPrefs()
    fireEvent.change(within(dlg).getByLabelText('색 테마'), { target: { value: 'solarized-light' } })
    const pv = within(dlg).getByTestId('theme-preview')
    expect(pv.textContent).toContain('user@busan')
    expect(pv.style.background).not.toBe('')
    expect(pv.querySelectorAll('[data-swatch]')).toHaveLength(16)
  })

  it('PD-07: 강조 끄면 단어 입력란 비활성, 로그 폴더 찾아보기', async () => {
    const dlg = await openPrefs()
    fireEvent.click(within(dlg).getByLabelText(/출력에 나온 단어를 색으로 강조/))
    expect(within(dlg).getByLabelText('빨강 단어').disabled).toBe(true)
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '찾아보기' })) })
    expect(api.ChooseLogDir).toHaveBeenCalledWith('')
    expect(within(dlg).getByLabelText('로그 폴더').value).toBe('D:\\picked')
  })

  it('PD-08: 붙여넣기 확인을 끄면 저장값은 pasteNoConfirm=true', async () => {
    const dlg = await openPrefs()
    fireEvent.click(within(dlg).getByLabelText('여러 줄을 붙여넣기 전에 확인'))
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '확인' })) })
    expect(settings.pasteNoConfirm).toBe(true)
  })

  it('PD-09: 탭 막대 ⚙ 버튼으로도 열림', async () => {
    render(React.createElement(TerminalWorkspace, { createTerminal, addons: false }))
    await screen.findByLabelText('Host')
    fireEvent.click(screen.getByTitle('설정 (Ctrl+Shift+O)'))
    expect(await screen.findByRole('dialog', { name: '설정' })).toBeTruthy()
  })
})
