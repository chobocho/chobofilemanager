import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react'
import TerminalWorkspace from './TerminalWorkspace.jsx'
import { useTermStore } from '../store/termStore'
import { useFilesStore } from '../store/filesStore'
import { useFileStore } from '../../stores/fileStore'
import { setTermBackend } from '../core/termApi'
import { stopEventRouter } from '../core/session'
import { FakeTerminal } from '../test/fakeTerminal'
import { resetSettingsForTest } from '../core/settings'

// ─── Todo #123: 원격 파일 창 (Ctrl+Shift+F) — SFTP/SCP/FTP ─────────────────────

const F = (name, o = {}) => ({ name, isDir: false, size: 100, modTime: '2026-10-01 10:00', ...o })
const D = (name) => F(name, { isDir: true, size: 0 })
let api, handlers, remote
beforeEach(() => {
  handlers = {}
  remote = { '/home/me': [D('src'), F('a.txt'), F('b.log', { size: 2048 })], '/home/me/src': [F('main.go')], '/home': [D('me')] }
  const ok = () => vi.fn().mockResolvedValue(undefined)
  api = {
    GetSettings: vi.fn().mockResolvedValue({}), SaveSettings: ok(), GetHistory: vi.fn().mockResolvedValue([]),
    GetSessions: vi.fn().mockResolvedValue([]), GetSSHConfigHosts: vi.fn().mockResolvedValue([]),
    GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
    CloseTab: ok(), Connect: vi.fn().mockResolvedValue('ssh'), Send: ok(), Resize: ok(), Disconnect: ok(),
    TabTheme: vi.fn().mockResolvedValue(''), SetTabTheme: ok(),
    FileOpen: vi.fn().mockResolvedValue({ home: '/home/me', protocol: 'SFTP' }),
    FileStartDir: vi.fn().mockResolvedValue(''),
    FileList: vi.fn(async (_id, dir) => { if (!(dir in remote)) throw new Error(`없는 폴더: ${dir}`); return remote[dir] }),
    FileBookmarks: vi.fn().mockResolvedValue([]), SetFileBookmarks: ok(),
    FileDownload: vi.fn().mockResolvedValue('C:\\Downloads\\a.txt'),
    FileDownloadMany: vi.fn().mockResolvedValue({ dir: 'C:\\Downloads', count: 2 }),
    FileDownloadTo: vi.fn().mockResolvedValue({ dir: 'C:\\work', count: 1 }),
    FileUpload: vi.fn().mockResolvedValue(0), FileUploadPaths: vi.fn().mockResolvedValue(1),
    FileDelete: vi.fn().mockResolvedValue(1), FileRename: ok(), FileMkdir: ok(), FileCreate: ok(),
    FileCancel: ok(), FileClose: ok(),
  }
  setTermBackend(api, { EventsOn: (n, fn) => { handlers[n] = fn; return () => delete handlers[n] }, ClipboardSetText: vi.fn() })
  useTermStore.getState().resetForTest()
  useFilesStore.getState().resetForTest()
  resetSettingsForTest()
  useFileStore.setState(s => ({ activePanel: 'left', left: { ...s.left, path: 'C:\\work', selected: new Set(), files: [], cursor: 0 } }))
})
afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })

const root = () => document.querySelector('[data-terminal-root]')
const win = () => screen.getByRole('dialog', { name: /파일 전송/ })
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const row = (name) => within(win()).getByRole('row', { name: new RegExp(`^${esc(name)}`) })
async function connected() {
  render(React.createElement(TerminalWorkspace, { createTerminal: (o) => new FakeTerminal(o), addons: false }))
  fireEvent.change(await screen.findByLabelText('Host'), { target: { value: 'srv' } })
  await act(async () => { fireEvent.submit(screen.getByLabelText('Host').closest('form')) })
  await waitFor(() => expect(screen.queryByLabelText('Host')).toBeNull())
}
async function openFiles() {
  await connected()
  await act(async () => { fireEvent.keyDown(root(), { key: 'F', ctrlKey: true, shiftKey: true }) })
  await waitFor(() => expect(row('a.txt')).toBeTruthy())
  return win()
}
const keyIn = (k, o = {}) => act(async () => { fireEvent.keyDown(within(win()).getByRole('grid'), { key: k, ...o }) })

describe('원격 파일 창 (RFV)', () => {
  it('RFV-01: Ctrl+Shift+F → 홈 폴더 목록 (.., 폴더, 파일 크기), 제목에 프로토콜·서버', async () => {
    const w = await openFiles()
    expect(w.getAttribute('aria-label')).toBe('파일 전송 (SFTP) - srv')
    expect(within(w).getByLabelText('원격 경로').value).toBe('/home/me')
    expect(row('.. (상위 폴더)')).toBeTruthy()
    expect(row('b.log').textContent).toContain('2.0 KB')
    expect(row('src').getAttribute('aria-selected')).toBe('true')
  })

  it('RFV-02: Enter로 폴더 들어가기, Backspace로 올라가면 온 폴더 선택', async () => {
    await openFiles()
    await keyIn('Enter')
    await waitFor(() => expect(row('main.go')).toBeTruthy())
    await keyIn('Backspace')
    await waitFor(() => expect(row('src').getAttribute('aria-selected')).toBe('true'))
  })

  it('RFV-03: 경로 입력 → 이동, 없는 폴더면 오류', async () => {
    const w = await openFiles()
    const input = within(w).getByLabelText('원격 경로')
    fireEvent.change(input, { target: { value: '/nope' } })
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })
    expect(within(w).getByRole('alert').textContent).toContain('없는 폴더: /nope')
    fireEvent.change(input, { target: { value: '/home' } })
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }) })
    await waitFor(() => expect(row('me')).toBeTruthy())
  })

  it('RFV-04: 파일 하나 다운로드 (F5 대신 Enter) → 저장 위치 표시', async () => {
    const w = await openFiles()
    await act(async () => { fireEvent.mouseDown(row('a.txt')) })
    await keyIn('Enter')
    expect(api.FileDownload).toHaveBeenCalledWith(1, '/home/me/a.txt', 100)
    expect(within(w).getByRole('status').textContent).toBe('저장했습니다: C:\\Downloads\\a.txt')
  })

  it('RFV-05: 여러 개(Ctrl+클릭) 다운로드 → 폴더 골라 저장', async () => {
    const w = await openFiles()
    await act(async () => { fireEvent.mouseDown(row('a.txt')) })
    await act(async () => { fireEvent.mouseDown(row('b.log'), { ctrlKey: true }) })
    await act(async () => { fireEvent.click(within(w).getByRole('button', { name: '다운로드' })) })
    expect(api.FileDownloadMany).toHaveBeenCalledWith(1, '/home/me', [expect.objectContaining({ name: 'a.txt' }), expect.objectContaining({ name: 'b.log' })])
    expect(within(w).getByRole('status').textContent).toBe('2개 파일을 저장했습니다: C:\\Downloads')
  })

  it('RFV-06: 파일 패널 폴더로 받기 → FileDownloadTo, 패널 새로 고침', async () => {
    const refresh = vi.spyOn(useFileStore.getState(), 'refresh').mockResolvedValue(undefined)
    const w = await openFiles()
    await act(async () => { fireEvent.mouseDown(row('a.txt')) })
    await act(async () => { fireEvent.click(within(w).getByRole('button', { name: '⬇ 패널로' })) })
    expect(api.FileDownloadTo).toHaveBeenCalledWith(1, '/home/me', [expect.objectContaining({ name: 'a.txt' })], 'C:\\work')
    expect(within(w).getByRole('status').textContent).toBe('1개 파일을 파일 패널 폴더에 받았습니다: C:\\work')
    expect(refresh).toHaveBeenCalledWith('left')
    refresh.mockRestore()
  })

  it('RFV-07: 파일 패널의 선택 항목 올리기 → FileUploadPaths, 올린 이름 선택', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, selected: new Set(['C:\\work\\up.bin']) } }))
    remote['/home/me'] = [...remote['/home/me'], F('up.bin')]
    const w = await openFiles()
    await act(async () => { fireEvent.click(within(w).getByRole('button', { name: '⬆ 패널에서' })) })
    expect(api.FileUploadPaths).toHaveBeenCalledWith(1, '/home/me', ['C:\\work\\up.bin'])
    await waitFor(() => expect(row('up.bin').getAttribute('aria-selected')).toBe('true'))
    expect(within(w).getByRole('status').textContent).toBe('1개 파일을 업로드했습니다')
  })

  it('RFV-08: 삭제 — 확인 창, 지운 뒤 다음 항목 선택', async () => {
    const w = await openFiles()
    await act(async () => { fireEvent.mouseDown(row('a.txt')) })
    await keyIn('Delete')
    const ask = screen.getByRole('alertdialog')
    expect(ask.textContent).toContain('"a.txt"을(를) 서버에서 삭제할까요?')
    remote['/home/me'] = [D('src'), F('b.log', { size: 2048 })]
    await act(async () => { fireEvent.click(within(ask).getByRole('button', { name: '삭제' })) })
    expect(api.FileDelete).toHaveBeenCalledWith(1, '/home/me', [expect.objectContaining({ name: 'a.txt' })])
    await waitFor(() => expect(row('b.log').getAttribute('aria-selected')).toBe('true'))
    expect(within(w).getByRole('status').textContent).toBe('1개 항목을 삭제했습니다')
  })

  it('RFV-09: 이름 바꾸기(F2) / 새 폴더(F7) / 새 파일(Shift+F4)', async () => {
    await openFiles()
    await act(async () => { fireEvent.mouseDown(row('a.txt')) })
    await keyIn('F2')
    let ask = screen.getByRole('alertdialog')
    fireEvent.change(within(ask).getByRole('textbox'), { target: { value: 'c.txt' } })
    await act(async () => { fireEvent.click(within(ask).getByRole('button', { name: '확인' })) })
    expect(api.FileRename).toHaveBeenCalledWith(1, '/home/me', 'a.txt', 'c.txt')
    await keyIn('F7')
    ask = screen.getByRole('alertdialog')
    fireEvent.change(within(ask).getByRole('textbox'), { target: { value: 'newdir' } })
    await act(async () => { fireEvent.keyDown(within(ask).getByRole('textbox'), { key: 'Enter' }) })
    expect(api.FileMkdir).toHaveBeenCalledWith(1, '/home/me', 'newdir')
    await keyIn('F4', { shiftKey: true })
    ask = screen.getByRole('alertdialog')
    fireEvent.change(within(ask).getByRole('textbox'), { target: { value: 'e.txt' } })
    await act(async () => { fireEvent.click(within(ask).getByRole('button', { name: '확인' })) })
    expect(api.FileCreate).toHaveBeenCalledWith(1, '/home/me', 'e.txt')
  })

  it('RFV-10: 즐겨찾기 ☆ / Ctrl+D 추가·빼기', async () => {
    const w = await openFiles()
    await act(async () => { fireEvent.click(within(w).getByTitle('즐겨찾기에 추가 (Ctrl+D)')) })
    expect(api.SetFileBookmarks).toHaveBeenCalledWith(1, ['/home/me'])
    expect(within(w).getByTitle('즐겨찾기에서 빼기 (Ctrl+D)').textContent).toBe('★')
    api.FileBookmarks.mockResolvedValue(['/home/me'])
    await keyIn('d', { ctrlKey: true })
    expect(api.SetFileBookmarks).toHaveBeenLastCalledWith(1, [])
  })

  it('RFV-11: 즐겨찾기 메뉴(Ctrl+B) — 홈·최상위·최근 폴더, 고르면 이동', async () => {
    api.FileBookmarks.mockResolvedValue(['/home/me/src'])
    await openFiles()
    await keyIn('b', { ctrlKey: true })
    const menu = screen.getByRole('menu', { name: '즐겨찾기' })
    expect(within(menu).getByRole('menuitem', { name: /홈 폴더 \(\/home\/me\)/ })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: /\/ \(최상위 폴더\)/ })).toBeTruthy()
    await act(async () => { fireEvent.click(within(menu).getByRole('menuitem', { name: /^\/home\/me\/src/ })) })
    await waitFor(() => expect(row('main.go')).toBeTruthy())
  })

  it('RFV-12: 전송 진행 표시 (xfer:progress) → 끝나면 사라짐, 취소 버튼', async () => {
    const w = await openFiles()
    act(() => handlers['xfer:progress'](1, { name: 'big.iso', done: 512, total: 1024, upload: false }))
    const bar = within(w).getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('50')
    expect(within(w).getByText('⬇ big.iso')).toBeTruthy()
    await act(async () => { fireEvent.click(within(w).getByRole('button', { name: '전송 취소' })) })
    expect(api.FileCancel).toHaveBeenCalledWith(1)
    act(() => handlers['xfer:end'](1))
    expect(within(w).queryByRole('progressbar')).toBeNull()
  })

  it('RFV-13: Esc로 닫으면 창 정리(FileCancel 없이), 탭 메뉴 "파일 전송"으로 다시 열림', async () => {
    await openFiles()
    await keyIn('Escape')
    expect(screen.queryByRole('dialog', { name: /파일 전송/ })).toBeNull()
    expect(api.FileCancel).not.toHaveBeenCalled()
    fireEvent.contextMenu(screen.getByText('srv', { selector: '[data-tab-label]' }))
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: '파일 전송 (Ctrl+Shift+F)' })) })
    await waitFor(() => expect(row('a.txt')).toBeTruthy())
  })

  it('RFV-14: 파일 접근이 안 되는 연결(Telnet) → 터미널에 안내', async () => {
    api.FileOpen.mockRejectedValue(new Error('이 연결은 파일 전송을 지원하지 않습니다'))
    await connected()
    await act(async () => { fireEvent.keyDown(root(), { key: 'F', ctrlKey: true, shiftKey: true }) })
    expect(screen.queryByRole('dialog', { name: /파일 전송/ })).toBeNull()
    expect(useFilesStore.getState().views[1]).toBeUndefined()
  })

  it('RFV-15: 터미널의 현재 폴더(OSC 7)에서 시작', async () => {
    api.FileStartDir.mockResolvedValue('/home/me/src')
    await connected()
    const { sessionById } = await import('../core/session')
    sessionById(1).cwd = '/home/me/src'
    await act(async () => { fireEvent.keyDown(root(), { key: 'F', ctrlKey: true, shiftKey: true }) })
    expect(api.FileStartDir).toHaveBeenCalledWith(1, '/home/me/src')
    await waitFor(() => expect(row('main.go')).toBeTruthy())
  })

  it('RFV-16: FTP 연결은 파일 창이 바로 열림', async () => {
    api.Connect.mockResolvedValue('ftp')
    api.FileOpen.mockResolvedValue({ home: '/home/me', protocol: 'FTP' })
    await connected()
    await waitFor(() => expect(win().getAttribute('aria-label')).toBe('파일 전송 (FTP) - srv'))
    await waitFor(() => expect(row('a.txt')).toBeTruthy())
  })

  it('RFV-17: 탭을 닫으면 파일 창 상태도 정리', async () => {
    await openFiles()
    await act(async () => { await useTermStore.getState().closeTab(1) })
    expect(useFilesStore.getState().views[1]).toBeUndefined()
  })
})
