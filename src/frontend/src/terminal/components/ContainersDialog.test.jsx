import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest, settings } from '../core/settings'

// ─── Todo #124: 도커 컨테이너 창 (Ctrl+Shift+J) ───────────────────────────────

const C = (o) => ({ id: 'c1', name: 'web', image: 'nginx', status: 'Up 3 hours', running: true, ports: '0.0.0.0:8080->80/tcp',
  published: [{ port: 8080, to: '80/tcp', ip: '0.0.0.0' }], created: '3 hours ago', ...o })
let api, terms, openUrl
beforeEach(() => {
  terms = []
  openUrl = vi.fn()
  const ok = () => vi.fn().mockResolvedValue(undefined)
  api = {
    GetSettings: vi.fn().mockResolvedValue({}), SaveSettings: ok(), GetHistory: vi.fn().mockResolvedValue([]),
    GetSessions: vi.fn().mockResolvedValue([]), GetSSHConfigHosts: vi.fn().mockResolvedValue([]),
    GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
    CloseTab: ok(), Connect: vi.fn().mockResolvedValue('ssh'), Send: ok(), Resize: ok(), Disconnect: ok(),
    TabTheme: vi.fn().mockResolvedValue(''), SetTabTheme: ok(),
    DockerList: vi.fn().mockResolvedValue([C(), C({ id: 'c2', name: 'db', image: 'postgres', running: false, status: 'Exited (0)', published: [], ports: '' })]),
    DockerEngineInfo: vi.fn().mockResolvedValue({ name: 'docker', version: '27.1' }),
    DockerAction: ok(), DockerOpen: ok(),
    ForwardList: vi.fn().mockResolvedValue([]), ForwardAdd: vi.fn(async (_i, f) => ({ ...f, id: 5, error: '' })), ForwardRemove: ok(),
  }
  setTermBackend(api, { EventsOn: () => () => {}, ClipboardSetText: vi.fn(), BrowserOpenURL: openUrl })
  useTermStore.getState().resetForTest()
  resetSettingsForTest()
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null); vi.restoreAllMocks() })

const root = () => document.querySelector('[data-terminal-root]')
async function connected() {
  render(React.createElement(TerminalWorkspace, { createTerminal: (o) => { const t = new FakeTerminal(o); terms.push(t); return t }, addons: false }))
  fireEvent.change(await screen.findByLabelText('Host'), { target: { value: 'srv' } })
  fireEvent.change(screen.getByLabelText('Login'), { target: { value: 'me' } })
  await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
  await waitFor(() => expect(screen.queryByLabelText('Host')).toBeNull())
}
async function openDocker() {
  await connected()
  await act(async () => { fireEvent.keyDown(root(), { key: 'J', ctrlKey: true, shiftKey: true }) })
  const dlg = await screen.findByRole('dialog', { name: '도커 컨테이너' })
  await waitFor(() => expect(within(dlg).getByText('nginx')).toBeTruthy())
  return dlg
}

describe('도커 컨테이너 창 (DCV)', () => {
  it('DCV-01: SSH 탭의 서버가 먼저, 이 PC도 선택지, 엔진 이름·버전', async () => {
    const dlg = await openDocker()
    const src = within(dlg).getByLabelText('컨테이너가 있는 곳')
    expect([...src.options].map(o => o.textContent)).toEqual(['서버: me@srv', '이 PC'])
    expect(api.DockerList).toHaveBeenCalledWith(1, false, '')
    await waitFor(() => expect(within(dlg).getByText('docker 27.1')).toBeTruthy())
    await act(async () => { fireEvent.change(src, { target: { value: '1' } }) })
    expect(api.DockerList).toHaveBeenLastCalledWith(0, false, '')
  })

  it('DCV-02: 중지된 컨테이너도 표시 → all=true', async () => {
    const dlg = await openDocker()
    await act(async () => { fireEvent.click(within(dlg).getByLabelText('중지된 컨테이너도 표시')) })
    expect(api.DockerList).toHaveBeenLastCalledWith(1, true, '')
  })

  it('DCV-03: 엔진 고르기 → 이곳에만 기억, 다시 읽기', async () => {
    const dlg = await openDocker()
    await act(async () => { fireEvent.change(within(dlg).getByLabelText('컨테이너 엔진'), { target: { value: 'podman' } }) })
    expect(settings.dockerEngines).toEqual({ 'srv:22': 'podman' })
    expect(api.DockerList).toHaveBeenLastCalledWith(1, false, 'podman')
  })

  it('DCV-04: 셸 열기 → 새 탭에서 docker exec (서버 연결을 함께 씀), 탭 이름 🐳', async () => {
    const dlg = await openDocker()
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '셸 열기' })) })
    await waitFor(() => expect(api.DockerOpen).toHaveBeenCalledWith(2, 1, 'c1', 'shell', 'web@me@srv', expect.any(Number), expect.any(Number), ''))
    expect(screen.queryByRole('dialog', { name: '도커 컨테이너' })).toBeNull()
    await waitFor(() => expect(screen.getByText('🐳 web', { selector: '[data-tab-label]' })).toBeTruthy())
    expect(useTermStore.getState().tabs.find(t => t.id === 2).state).toBe('on')
  })

  it('DCV-05: 중지된 컨테이너는 셸 불가, 로그 보기 가능(📜)', async () => {
    const dlg = await openDocker()
    fireEvent.mouseDown(within(dlg).getByText('postgres'))
    expect(within(dlg).getByRole('button', { name: '셸 열기' }).disabled).toBe(true)
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '로그 보기' })) })
    await waitFor(() => expect(api.DockerOpen).toHaveBeenCalledWith(2, 1, 'c2', 'logs', 'db@me@srv', expect.any(Number), expect.any(Number), ''))
    await waitFor(() => expect(screen.getByText('📜 db', { selector: '[data-tab-label]' })).toBeTruthy())
  })

  it('DCV-06: 중지는 확인 후, 시작은 바로', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const dlg = await openDocker()
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '중지' })) })
    expect(api.DockerAction).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '중지' })) })
    expect(api.DockerAction).toHaveBeenCalledWith(1, 'c1', 'stop', '')
    fireEvent.mouseDown(within(dlg).getByText('postgres'))
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '시작' })) })
    expect(api.DockerAction).toHaveBeenLastCalledWith(1, 'c2', 'start', '')
  })

  it('DCV-07: 포트 열기 — 서버면 같은 포트 -L 추가 후 브라우저', async () => {
    const dlg = await openDocker()
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '포트 열기' })) })
    expect(api.ForwardAdd).toHaveBeenCalledWith(1, { type: 'L', bindAddr: '', bindPort: 8080, host: '127.0.0.1', port: 8080 })
    expect(openUrl).toHaveBeenCalledWith('http://localhost:8080/')
  })

  it('DCV-08: 포트 열기 — 이 PC 포트가 막히면 규칙을 지우고 안내', async () => {
    api.ForwardAdd.mockResolvedValueOnce({ id: 7, error: '이미 사용 중' })
    const dlg = await openDocker()
    await act(async () => { fireEvent.click(within(dlg).getByRole('button', { name: '포트 열기' })) })
    expect(api.ForwardRemove).toHaveBeenCalledWith(1, 7)
    expect(within(dlg).getByRole('alert').textContent).toContain('이 PC의 포트 8080를 열 수 없습니다: 이미 사용 중')
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('DCV-09: 목록 오류 → 표시, F5 다시 읽기, Esc 닫기', async () => {
    const dlg = await openDocker()
    api.DockerList.mockRejectedValueOnce(new Error('docker가 설치되어 있지 않습니다'))
    await act(async () => { fireEvent.keyDown(dlg, { key: 'F5' }) })
    expect(within(dlg).getByRole('alert').textContent).toContain('docker가 설치되어 있지 않습니다')
    fireEvent.keyDown(dlg, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '도커 컨테이너' })).toBeNull()
  })

  it('DCV-10: 도커 탭 — 다시 연결·복제는 docker로, 끝난 뒤 Enter로 다시', async () => {
    const dlg = await openDocker()
    await act(async () => { fireEvent.keyDown(within(dlg).getByRole('grid'), { key: 'Enter' }) })
    await waitFor(() => expect(api.DockerOpen).toHaveBeenCalledTimes(1))
    await act(async () => { await useTermStore.getState().reconnect(2) })
    expect(api.DockerOpen).toHaveBeenCalledTimes(2)
    await act(async () => { useTermStore.getState().duplicate(2) })
    await waitFor(() => expect(api.DockerOpen).toHaveBeenCalledTimes(3))
    expect(api.DockerOpen.mock.calls[2][0]).toBe(3)
  })

  it('DCV-11: 연결된 SSH 탭이 없으면 이 PC만', async () => {
    render(React.createElement(TerminalWorkspace, { createTerminal: (o) => new FakeTerminal(o), addons: false }))
    await screen.findByLabelText('Host')
    fireEvent.keyDown(root(), { key: 'J', ctrlKey: true, shiftKey: true })
    const dlg = await screen.findByRole('dialog', { name: '도커 컨테이너' })
    expect([...within(dlg).getByLabelText('컨테이너가 있는 곳').options].map(o => o.textContent)).toEqual(['이 PC'])
    await waitFor(() => expect(api.DockerList).toHaveBeenCalledWith(0, false, ''))
  })
})
