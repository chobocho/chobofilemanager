import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest } from '../core/settings'
import { HELP_TEXT, REPO } from '../core/helpText'
import { terminalTitle } from '../core/title'
import { dbg, installDebug, resetDebugForTest } from '../core/debug'

// ─── Todo #124 보완: F1 터미널 도움말, 창 제목, 디버그 기록 ───────────────────────

let api, openUrl
beforeEach(() => {
  openUrl = vi.fn()
  const ok = () => vi.fn().mockResolvedValue(undefined)
  api = {
    GetSettings: vi.fn().mockResolvedValue({}), SaveSettings: ok(), GetHistory: vi.fn().mockResolvedValue([]),
    GetSessions: vi.fn().mockResolvedValue([]), GetSSHConfigHosts: vi.fn().mockResolvedValue([]),
    GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
    CloseTab: ok(), Connect: vi.fn().mockResolvedValue('ssh'), Send: ok(), Resize: ok(), Disconnect: ok(),
    TabTheme: vi.fn().mockResolvedValue(''), SetTabTheme: ok(), GetLanguage: vi.fn().mockResolvedValue('ko'),
    DebugEnabled: vi.fn().mockResolvedValue(false), DebugLog: ok(),
  }
  setTermBackend(api, { EventsOn: () => () => {}, BrowserOpenURL: openUrl, WindowSetTitle: vi.fn() })
  useTermStore.getState().resetForTest()
  resetSettingsForTest()
  try { localStorage.removeItem('chobocho.term.helpLang') } catch { /* 없음 */ }
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null); resetDebugForTest() })

const root = () => document.querySelector('[data-terminal-root]')
async function mount(props = {}) {
  render(React.createElement(TerminalWorkspace, { createTerminal: (o) => new FakeTerminal(o), addons: false, ...props }))
  await screen.findByLabelText('Host')
}

describe('도움말 (HL)', () => {
  it('HL-01: 도움말 내용 — 한국어·영어 같은 구성, 링크는 이 앱 저장소', () => {
    expect(HELP_TEXT.ko.sections.map(s => s.rows.length)).toEqual(HELP_TEXT.en.sections.map(s => s.rows.length))
    expect(REPO).toBe('https://github.com/chobocho/chobofilemanager')
    expect(HELP_TEXT.ko.links.rows[0][1]).toBe(`${REPO}/releases/latest`)
  })

  it('HL-02: F1로 열고 닫기, 섹션 표', async () => {
    await mount()
    fireEvent.keyDown(root(), { key: 'F1' })
    const dlg = screen.getByRole('dialog', { name: '도움말 (F1)' })
    expect(within(dlg).getByRole('heading', { name: '복사 / 붙여넣기' })).toBeTruthy()
    expect(within(dlg).getByText('Ctrl+Shift+C / Ctrl+Shift+V')).toBeTruthy()
    fireEvent.keyDown(dlg, { key: 'F1' })
    expect(screen.queryByRole('dialog', { name: '도움말 (F1)' })).toBeNull()
  })

  it('HL-03: English 버튼 / Alt+L로 언어 전환, 기억', async () => {
    await mount()
    fireEvent.keyDown(root(), { key: 'F1' })
    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    const dlg = screen.getByRole('dialog', { name: 'Help (F1)' })
    expect(within(dlg).getByRole('heading', { name: HELP_TEXT.en.sections[0].title })).toBeTruthy()
    expect(localStorage.getItem('chobocho.term.helpLang')).toBe('en')
    fireEvent.keyDown(dlg, { key: 'l', altKey: true })
    expect(screen.getByRole('dialog', { name: '도움말 (F1)' })).toBeTruthy()
  })

  it('HL-04: 링크는 기본 브라우저로, Esc·닫기로 닫힘', async () => {
    await mount()
    fireEvent.keyDown(root(), { key: 'F1' })
    fireEvent.click(screen.getByText(`${REPO}/releases/latest`.replace('https://', '')))
    expect(openUrl).toHaveBeenCalledWith(`${REPO}/releases/latest`)
    fireEvent.keyDown(screen.getByRole('dialog', { name: '도움말 (F1)' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '도움말 (F1)' })).toBeNull()
  })
})

describe('창 제목 (TT)', () => {
  it('TT-01: 활성 탭의 연결 — SSH host:port [인코딩], FTP ftp://, 로컬, 시리얼, 도커, 연결 없음', () => {
    const base = 'Chobocho Commander'
    expect(terminalTitle(base, undefined)).toBe(base)
    expect(terminalTitle(base, { state: 'idle', req: { host: 'h', port: 22 } })).toBe(base)
    expect(terminalTitle(base, { state: 'on', proto: 'ssh', encoding: 'UTF-8', req: { host: 'h', port: 22 } })).toBe(`${base} - h:22 [UTF-8]`)
    expect(terminalTitle(base, { state: 'ftp', proto: 'ftp', encoding: 'UTF-8', req: { host: 'h', port: 21 } })).toBe(`${base} - ftp://h:21 [UTF-8]`)
    expect(terminalTitle(base, { state: 'on', proto: 'local', req: { host: 'cmd', port: 0 } })).toBe(`${base} - cmd (로컬)`)
    expect(terminalTitle(base, { state: 'on', proto: 'serial', encoding: 'UTF-8', req: { host: 'COM3', port: 115200 } })).toBe(`${base} - COM3 115200 baud [UTF-8]`)
    expect(terminalTitle(base, { state: 'on', proto: 'docker', docker: { name: 'web', src: { label: 'me@srv' } } })).toBe(`${base} - web @ me@srv (docker)`)
  })

  it('TT-02: Terminal 보기가 보일 때 창 제목이 활성 연결, 숨기면 원래 제목', async () => {
    document.title = 'Chobocho Commander V0.2.12'
    const { rerender } = render(React.createElement(TerminalWorkspace, { createTerminal: (o) => new FakeTerminal(o), addons: false, shown: true }))
    fireEvent.change(await screen.findByLabelText('Host'), { target: { value: 'srv' } })
    await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
    await waitFor(() => expect(document.title).toBe('Chobocho Commander V0.2.12 - srv:22 [UTF-8]'))
    rerender(React.createElement(TerminalWorkspace, { createTerminal: (o) => new FakeTerminal(o), addons: false, shown: false }))
    expect(document.title).toBe('Chobocho Commander V0.2.12')
  })
})

describe('디버그 기록 (DB)', () => {
  it('DB-01: 켜져 있으면(DebugEnabled) 화면의 오류·경고를 Go 쪽 debug.log로, 켜지기 전 것도 보냄', async () => {
    api.DebugEnabled.mockResolvedValue(true)
    dbg('before')
    await installDebug()
    dbg('after')
    expect(api.DebugLog).toHaveBeenCalledWith('(early) before')
    expect(api.DebugLog).toHaveBeenCalledWith('after')
    console.warn('watch out')
    expect(api.DebugLog).toHaveBeenCalledWith('console.warn: watch out')
  })

  it('DB-02: 꺼져 있으면 아무것도 보내지 않음', async () => {
    dbg('x')
    await installDebug()
    dbg('y')
    expect(api.DebugLog).not.toHaveBeenCalled()
  })
})
