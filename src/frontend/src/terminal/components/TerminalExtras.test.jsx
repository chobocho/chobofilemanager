import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest, settings } from '../core/settings'
import { resetTranslucencyForTest } from '../core/look'

// ─── Todo #124: 업데이트 확인 · 웹 서버 · 창 투명도 ────────────────────────────────

let api, handlers, openUrl
beforeEach(() => {
  handlers = {}
  openUrl = vi.fn()
  const ok = () => vi.fn().mockResolvedValue(undefined)
  const web = { addr: '127.0.0.1:8022', enabled: false, running: false, url: '', remote: false, clients: 0, tls: false, fingerprint: '', error: '' }
  let webNow = web
  api = {
    GetSettings: vi.fn().mockResolvedValue({ fontSize: 16 }), SaveSettings: ok(), GetHistory: vi.fn().mockResolvedValue([]),
    GetSessions: vi.fn().mockResolvedValue([]), GetSSHConfigHosts: vi.fn().mockResolvedValue([]),
    GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
    CloseTab: ok(), Connect: vi.fn().mockResolvedValue('ssh'), Send: ok(), Resize: ok(), Disconnect: ok(),
    TabTheme: vi.fn().mockResolvedValue(''), SetTabTheme: ok(), GetLanguage: vi.fn().mockResolvedValue('ko'),
    CheckUpdate: vi.fn().mockResolvedValue({ checked: true, newer: false, current: '0.2.12', latest: '0.2.12', url: '' }),
    // 서버 상태를 기억하는 가짜 (WebStatus는 지금 상태를 돌려줌)
    WebStatus: vi.fn(async () => webNow),
    WebStart: vi.fn(async (addr) => (webNow = { ...web, addr, running: true, url: `http://${addr}/?t=abc`, clients: 0 })),
    WebStop: vi.fn(async () => { webNow = web }),
    WebNewToken: vi.fn(async () => (webNow = { ...webNow, url: 'http://127.0.0.1:8022/?t=new' })), WebOpen: ok(),
  }
  setTermBackend(api, { EventsOn: (n, fn) => { handlers[n] = fn; return () => delete handlers[n] }, ClipboardSetText: vi.fn().mockResolvedValue(true), BrowserOpenURL: openUrl })
  useTermStore.getState().resetForTest()
  resetSettingsForTest()
  resetTranslucencyForTest()
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null); vi.restoreAllMocks() })

const root = () => document.querySelector('[data-terminal-root]')
async function mount() {
  render(React.createElement(TerminalWorkspace, { createTerminal: (o) => new FakeTerminal(o), addons: false }))
  await screen.findByLabelText('Host')
  await waitFor(() => expect(settings.fontSize).toBe(16))
}
async function openPrefs() {
  await mount()
  fireEvent.keyDown(root(), { key: 'O', ctrlKey: true, shiftKey: true })
  return screen.findByRole('dialog', { name: '설정' })
}

describe('업데이트 확인 (UP)', () => {
  it('UP-01: 설정이 켜져 있으면 시작할 때 확인, 새 버전이면 물어보고 다운로드 페이지', async () => {
    api.GetSettings.mockResolvedValue({ fontSize: 16, updateCheck: true })
    api.CheckUpdate.mockResolvedValue({ checked: true, newer: true, current: '0.2.12', latest: '0.3.0', url: 'https://github.com/x/releases/tag/v0.3.0' })
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await mount()
    await waitFor(() => expect(api.CheckUpdate).toHaveBeenCalledWith(false))
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith('https://github.com/x/releases/tag/v0.3.0'))
    expect(ask.mock.calls[0][0]).toContain('V0.3.0')
  })

  it('UP-02: 꺼져 있으면 시작할 때 묻지 않음', async () => {
    await mount()
    await act(async () => {})
    expect(api.CheckUpdate).not.toHaveBeenCalled()
  })

  it('UP-03: 설정 > 지금 확인 → 결과 표시 (최신 / 오류)', async () => {
    const dlg = await openPrefs()
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '지금 확인' })) })
    expect(api.CheckUpdate).toHaveBeenCalledWith(true)
    expect(within(dlg).getByText('최신 버전입니다 (V0.2.12)')).toBeTruthy()
    api.CheckUpdate.mockRejectedValueOnce(new Error('네트워크 오류'))
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '지금 확인' })) })
    expect(within(dlg).getByText(/네트워크 오류/)).toBeTruthy()
  })

  it('UP-04: 업데이트 확인 체크 저장', async () => {
    const dlg = await openPrefs()
    fireEvent.click(within(dlg).getByLabelText(/시작할 때 새 버전 확인/))
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '확인' })) })
    expect(settings.updateCheck).toBe(true)
  })
})

describe('웹 서버 (WB)', () => {
  it('WB-01: 상태 표시, 켜기 → 주소로 시작, 접속 주소 복사, 다시 시작/끄기', async () => {
    const dlg = await openPrefs()
    await waitFor(() => expect(within(dlg).getByText('꺼져 있음')).toBeTruthy())
    expect(within(dlg).getByLabelText('웹 서버 주소').value).toBe('127.0.0.1:8022')
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '켜기' })) })
    expect(api.WebStart).toHaveBeenCalledWith('127.0.0.1:8022')
    expect(within(dlg).getByText(/켜짐 \(이 PC에서만\) · 열린 브라우저 0개/)).toBeTruthy()
    expect(within(dlg).getByLabelText('접속 주소').value).toBe('http://127.0.0.1:8022/?t=abc')
    expect(within(dlg).getByRole('button', { name: '다시 시작' })).toBeTruthy()
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '새 토큰' })) })
    expect(within(dlg).getByLabelText('접속 주소').value).toBe('http://127.0.0.1:8022/?t=new')
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '브라우저로 열기' })) })
    expect(api.WebOpen).toHaveBeenCalled()
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '끄기' })) })
    expect(api.WebStop).toHaveBeenCalled()
  })

  it('WB-02: 시작 실패 → 이유 표시', async () => {
    api.WebStart.mockRejectedValueOnce(new Error('주소를 쓸 수 없습니다'))
    const dlg = await openPrefs()
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '켜기' })) })
    expect(within(dlg).getByText(/주소를 쓸 수 없습니다/)).toBeTruthy()
  })

  it('WB-03: web:status → 탭 막대에 웹 서버 표시 (브라우저 수)', async () => {
    await mount()
    act(() => handlers['web:status'](true, 2))
    expect(screen.getByTitle('웹 서버가 켜져 있습니다 (설정 > 웹 서버)').textContent).toBe('🌐 웹 서버 · 브라우저 2개')
    act(() => handlers['web:status'](false, 0))
    expect(screen.queryByTitle('웹 서버가 켜져 있습니다 (설정 > 웹 서버)')).toBeNull()
  })
})

describe('창 투명도 (TL)', () => {
  it('TL-01: 고르는 동안 미리 보기, 취소하면 원래대로', async () => {
    const dlg = await openPrefs()
    fireEvent.change(within(dlg).getByLabelText('창 투명도'), { target: { value: 'window' } })
    fireEvent.change(within(dlg).getByLabelText('불투명도'), { target: { value: '70' } })
    expect(document.body.classList.contains('term-fade')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--term-fade')).toBe('0.7')
    expect(within(dlg).getByText('70%')).toBeTruthy()
    fireEvent.click(within(dlg).getByRole('button', { name: '취소' }))
    expect(document.body.classList.contains('term-fade')).toBe(false)
  })

  it('TL-02: 배경만 → 저장, 터미널 배경 투명(글자는 선명), 끄면 불투명도 막힘', async () => {
    const dlg = await openPrefs()
    expect(within(dlg).getByLabelText('불투명도').disabled).toBe(true)
    fireEvent.change(within(dlg).getByLabelText('창 투명도'), { target: { value: 'background' } })
    fireEvent.change(within(dlg).getByLabelText('불투명도'), { target: { value: '80' } })
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '확인' })) })
    expect(settings.translucency).toBe('background')
    expect(settings.opacity).toBe(80)
    expect(document.body.classList.contains('term-glass')).toBe(true)
  })
})
