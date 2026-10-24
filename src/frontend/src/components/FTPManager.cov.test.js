import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react'

const api = vi.hoisted(() => ({
  FTPGetBookmarks: vi.fn(),
  FTPGetHistory: vi.fn(),
  FTPAddHistory: vi.fn(),
  FTPDeleteHistory: vi.fn(),
  FTPClearHistory: vi.fn(),
  FTPConnect: vi.fn(),
  FTPDisconnect: vi.fn(),
  FTPGetConnections: vi.fn(),
  FTPListDirectory: vi.fn(),
  FTPDownload: vi.fn(),
  FTPUpload: vi.fn(),
  FTPDeleteItem: vi.fn(),
  FTPCreateDirectory: vi.fn(),
  FTPRenameItem: vi.fn(),
  FTPSaveBookmark: vi.fn(),
  FTPDeleteBookmark: vi.fn(),
}))

vi.mock('../wailsjs/runtime', () => ({ default: api }))

import FTPManager, { ConnectModal } from './FTPManager.jsx'
import { useFTPStore } from '../stores/ftpStore'
import { useFileStore } from '../stores/fileStore'
import { useThemeStore } from '../stores/themeStore'

const h = React.createElement
Element.prototype.scrollIntoView = vi.fn()

const REMOTE = {
  '/': [
    { name: 'pub', path: '/pub', isDir: true, size: 0, modified: '2026-01-01T00:00:00Z' },
    { name: 'a.txt', path: '/a.txt', isDir: false, size: 10, modified: '2026-01-01T00:00:00Z', extension: '.txt' },
    { name: 'img.png', path: '/img.png', isDir: false, size: 20, modified: '2026-01-01T00:00:00Z' },
    { name: '.hidden', path: '/.hidden', isDir: false, size: 1, modified: '2026-01-01T00:00:00Z' },
  ],
  '/pub': [
    { name: 'b.zip', path: '/pub/b.zip', isDir: false, size: 30, modified: '2026-01-01T00:00:00Z' },
  ],
}
const CONN = { id: 'c1', host: 'ftp.test', port: 21, username: 'bob' }

let fs // file store action mocks

function setupFileStore() {
  fs = {
    refresh: vi.fn().mockResolvedValue(undefined),
    navigate: vi.fn(),
    navigateUp: vi.fn(),
    toggleSelect: vi.fn(),
    toggleHidden: vi.fn(),
    clearSelection: vi.fn(),
  }
  useFileStore.setState(s => ({
    ...fs,
    drives: [{ name: 'C:', path: 'C:\\', driveType: 'fixed' }, { name: 'D:', path: 'D:\\', driveType: 'fixed' }],
    left: {
      ...s.left, path: 'C:\\work', loading: false, error: null, showHidden: false,
      selected: new Set(),
      files: [
        { name: 'x.txt', path: 'C:\\work\\x.txt', isDir: false, isHidden: false, size: 5, modified: '2026-01-01T00:00:00Z', extension: '.txt' },
        { name: 'sub', path: 'C:\\work\\sub', isDir: true, isHidden: false, size: 0, modified: '2026-01-01T00:00:00Z' },
        { name: 'secret.txt', path: 'C:\\work\\secret.txt', isDir: false, isHidden: true, size: 1, modified: '', extension: '.txt' },
      ],
    },
    right: { ...s.right, path: 'D:\\', files: [], selected: new Set(), loading: false, error: null, showHidden: false },
  }))
}

const byTitle = (root, t) => [...root.querySelectorAll('[title]')].find(e => e.getAttribute('title') === t)

function panels(container) {
  const [local, ftp] = container.querySelectorAll('[tabindex="0"]')
  return { local, ftp }
}

async function renderMgr() {
  let r
  await act(async () => { r = render(h(FTPManager)) })
  return r
}

async function connect(container, host = 'ftp.test') {
  await act(async () => { fireEvent.click(screen.getByText('Connect', { selector: 'button' })) })
  fireEvent.change(screen.getByPlaceholderText('ftp.example.com'), { target: { value: host } })
  fireEvent.change(screen.getByPlaceholderText('anonymous'), { target: { value: 'bob' } })
  const submit = container.querySelector('button[type="submit"]')
  await act(async () => { fireEvent.click(submit) })
  await waitFor(() => expect(screen.getByText(`Connected to ${host}`)).toBeTruthy())
}

async function click(el, opts) { await act(async () => { fireEvent.click(el, opts) }) }
async function dbl(el) { await act(async () => { fireEvent.doubleClick(el) }) }
async function key(el, k) { await act(async () => { fireEvent.keyDown(el, { key: k }) }) }

describe('FTPManager 통합 흐름', () => {
  let origPrompt, origConfirm
  beforeEach(() => {
    for (const fn of Object.values(api)) { fn.mockReset(); fn.mockResolvedValue(undefined) }
    api.FTPGetBookmarks.mockResolvedValue([])
    api.FTPGetHistory.mockResolvedValue([])
    api.FTPConnect.mockResolvedValue('c1')
    api.FTPGetConnections.mockResolvedValue([CONN])
    api.FTPListDirectory.mockImplementation(async (_id, p) => ({ path: p, files: REMOTE[p] || [] }))
    useFTPStore.setState({ connections: [], bookmarks: [], history: [] })
    useThemeStore.setState({ theme: 'dark' })
    setupFileStore()
    origPrompt = window.prompt
    origConfirm = window.confirm
  })
  afterEach(() => {
    cleanup()
    window.prompt = origPrompt
    window.confirm = origConfirm
  })

  it('FM-01: 미접속 상태 — Not connected, 원격 작업 버튼 없음, 로컬 목록 표시', async () => {
    const { container } = await renderMgr()
    expect(screen.getByText('Not connected')).toBeTruthy()
    expect(screen.getByText('FTP (offline)')).toBeTruthy()
    expect(screen.queryByText('Download', { selector: 'button' })).toBeNull()
    expect(screen.queryByText('Disconnect', { selector: 'button' })).toBeNull()
    const { local } = panels(container)
    expect(within(local).getByText('x.txt')).toBeTruthy()
    expect(within(local).queryByText('secret.txt')).toBeNull() // 숨김 파일 제외
    expect(within(local).getByText('[..]')).toBeTruthy()      // C:\work는 루트 아님
    expect(api.FTPGetBookmarks).toHaveBeenCalled()
    expect(api.FTPGetHistory).toHaveBeenCalled()
  })

  it('FM-02: 접속 → 루트 목록, 히스토리 저장, 연결 정보 표시, 점파일 숨김', async () => {
    const { container } = await renderMgr()
    await connect(container)
    expect(api.FTPConnect).toHaveBeenCalledWith(expect.objectContaining({ host: 'ftp.test', username: 'bob', port: 21, useTls: false }))
    expect(api.FTPListDirectory).toHaveBeenCalledWith('c1', '/')
    expect(api.FTPAddHistory).toHaveBeenCalledWith(expect.objectContaining({ host: 'ftp.test' }))
    expect(screen.getByText('bob@ftp.test:21')).toBeTruthy()
    const { ftp } = panels(container)
    expect(within(ftp).getByText('a.txt')).toBeTruthy()
    expect(within(ftp).queryByText('.hidden')).toBeNull()
    expect(within(ftp).queryByText('[..]')).toBeNull() // 루트에서는 [..] 없음
    expect(screen.queryByPlaceholderText('ftp.example.com')).toBeNull() // 모달 닫힘
  })

  it('FM-03: 폴더 더블클릭 진입 → [..] 더블클릭으로 상위 복귀', async () => {
    const { container } = await renderMgr()
    await connect(container)
    const { ftp } = panels(container)
    await dbl(ftp.querySelector('[title="/pub"]'))
    await waitFor(() => expect(within(ftp).getByText('b.zip')).toBeTruthy())
    expect(api.FTPListDirectory).toHaveBeenLastCalledWith('c1', '/pub')
    await dbl(within(ftp).getByText('[..]').closest('div'))
    await waitFor(() => expect(api.FTPListDirectory).toHaveBeenLastCalledWith('c1', '/'))
    // 파일 더블클릭은 아무 동작 없음
    const calls = api.FTPListDirectory.mock.calls.length
    await dbl(ftp.querySelector('[title="/a.txt"]'))
    expect(api.FTPListDirectory.mock.calls.length).toBe(calls)
  })

  it('FM-04: 키보드 — ↓/Enter 폴더 진입, ↑로 [..], Enter로 상위, Backspace', async () => {
    const { container } = await renderMgr()
    await connect(container)
    const { ftp } = panels(container)
    await key(ftp, 'ArrowDown')
    await key(ftp, 'ArrowUp')
    await key(ftp, 'Enter') // cursor 0 = pub
    await waitFor(() => expect(api.FTPListDirectory).toHaveBeenLastCalledWith('c1', '/pub'))
    await waitFor(() => expect(within(ftp).getByText('b.zip')).toBeTruthy())
    await key(ftp, 'ArrowUp') // → [..]
    await key(ftp, 'ArrowUp') // [..]에서는 무시
    await key(ftp, 'Enter')
    await waitFor(() => expect(api.FTPListDirectory).toHaveBeenLastCalledWith('c1', '/'))
    await waitFor(() => expect(within(ftp).getByText('a.txt')).toBeTruthy())
    await key(ftp, 'Backspace') // 루트에서 상위 → '/'
    await waitFor(() => expect(api.FTPListDirectory).toHaveBeenCalledTimes(4))
    expect(api.FTPListDirectory).toHaveBeenLastCalledWith('c1', '/')
    await key(ftp, 'x') // 기타 키 무시
  })

  it('FM-05: Space로 선택 → Download 활성화 → 로컬 패널 경로로 다운로드 후 refresh', async () => {
    const { container } = await renderMgr()
    await connect(container)
    const { ftp } = panels(container)
    const dl = screen.getByText('Download', { selector: 'button' })
    expect(dl.disabled).toBe(true)
    await key(ftp, 'ArrowDown') // a.txt
    await key(ftp, ' ')
    expect(dl.disabled).toBe(false)
    await click(dl)
    await waitFor(() => expect(screen.getByText('Downloaded 1 file(s)')).toBeTruthy())
    expect(api.FTPDownload).toHaveBeenCalledWith('c1', '/a.txt', 'C:\\work')
    expect(fs.refresh).toHaveBeenCalledWith('left')
    expect(dl.disabled).toBe(true) // 선택 해제
  })

  it('FM-06: Ctrl+클릭 다중 선택, 다시 Ctrl+클릭으로 해제', async () => {
    const { container } = await renderMgr()
    await connect(container)
    const { ftp } = panels(container)
    const a = ftp.querySelector('[title="/a.txt"]')
    await click(a, { ctrlKey: true })
    await click(ftp.querySelector('[title="/img.png"]'), { ctrlKey: true })
    await click(screen.getByText('Download', { selector: 'button' }))
    await waitFor(() => expect(screen.getByText('Downloaded 2 file(s)')).toBeTruthy())
    expect(api.FTPDownload).toHaveBeenCalledTimes(2)
    await click(a, { ctrlKey: true })
    await click(a, { ctrlKey: true })
    expect(screen.getByText('Download', { selector: 'button' }).disabled).toBe(true)
    await click(a) // 일반 클릭은 선택하지 않음
    expect(screen.getByText('Download', { selector: 'button' }).disabled).toBe(true)
  })

  it('FM-07: 오른쪽 로컬 패널 선택 시 해당 경로로 다운로드', async () => {
    const { container } = await renderMgr()
    await connect(container)
    fireEvent.change(container.querySelector('select'), { target: { value: 'right' } })
    const { local, ftp } = panels(container)
    expect(within(local).getByText('D:\\')).toBeTruthy()
    expect(within(local).queryByText('[..]')).toBeNull() // 드라이브 루트
    await click(ftp.querySelector('[title="/a.txt"]'), { ctrlKey: true })
    await click(screen.getByText('Download', { selector: 'button' }))
    await waitFor(() => expect(api.FTPDownload).toHaveBeenCalledWith('c1', '/a.txt', 'D:\\'))
    expect(fs.refresh).toHaveBeenCalledWith('right')
  })

  it('FM-08: 로컬 선택 파일 업로드 → 원격 경로 조합, 목록 갱신, 로컬 선택 해제', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, selected: new Set(['C:\\work\\x.txt']) } }))
    const { container } = await renderMgr()
    await connect(container)
    const { ftp } = panels(container)
    await dbl(ftp.querySelector('[title="/pub"]'))
    await waitFor(() => expect(within(ftp).getByText('b.zip')).toBeTruthy())
    const up = screen.getByText('Upload', { selector: 'button' })
    expect(up.disabled).toBe(false)
    await click(up)
    await waitFor(() => expect(screen.getByText('Uploaded 1 file(s)')).toBeTruthy())
    expect(api.FTPUpload).toHaveBeenCalledWith('c1', 'C:\\work\\x.txt', '/pub/x.txt')
    expect(api.FTPListDirectory).toHaveBeenLastCalledWith('c1', '/pub')
    expect(fs.clearSelection).toHaveBeenCalledWith('left')
  })

  it('FM-09: 루트에 업로드하면 슬래시 중복 없이 /이름', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, selected: new Set(['C:\\work\\x.txt']) } }))
    const { container } = await renderMgr()
    await connect(container)
    await click(screen.getByText('Upload', { selector: 'button' }))
    await waitFor(() => expect(api.FTPUpload).toHaveBeenCalledWith('c1', 'C:\\work\\x.txt', '/x.txt'))
  })

  it('FM-10: 업로드할 로컬 선택이 없으면 Upload 비활성', async () => {
    const { container } = await renderMgr()
    await connect(container)
    expect(screen.getByText('Upload', { selector: 'button' }).disabled).toBe(true)
  })

  it('FM-11: New Dir — prompt 입력 시 생성, 취소 시 미호출, 실패 시 상태 메시지', async () => {
    const { container } = await renderMgr()
    await connect(container)
    const btn = screen.getByText('New Dir', { selector: 'button' })
    window.prompt = vi.fn(() => null)
    await click(btn)
    expect(api.FTPCreateDirectory).not.toHaveBeenCalled()

    window.prompt = vi.fn(() => 'newdir')
    await click(btn)
    await waitFor(() => expect(screen.getByText('Directory created')).toBeTruthy())
    expect(api.FTPCreateDirectory).toHaveBeenCalledWith('c1', '/newdir')

    api.FTPCreateDirectory.mockRejectedValueOnce('exists')
    await click(btn)
    await waitFor(() => expect(screen.getByText('Create dir failed: exists')).toBeTruthy())
  })

  it('FM-12: 하위 폴더에서 New Dir — 경로 조합', async () => {
    const { container } = await renderMgr()
    await connect(container)
    await dbl(panels(container).ftp.querySelector('[title="/pub"]'))
    await waitFor(() => expect(screen.getByText('b.zip')).toBeTruthy())
    window.prompt = vi.fn(() => 'n2')
    await click(screen.getByText('New Dir', { selector: 'button' }))
    await waitFor(() => expect(api.FTPCreateDirectory).toHaveBeenCalledWith('c1', '/pub/n2'))
  })

  it('FM-13: Delete — confirm 취소면 삭제 안 함', async () => {
    const { container } = await renderMgr()
    await connect(container)
    await click(panels(container).ftp.querySelector('[title="/pub"]'), { ctrlKey: true })
    window.confirm = vi.fn(() => false)
    await click(screen.getByText('Delete', { selector: 'button' }))
    expect(window.confirm).toHaveBeenCalled()
    expect(window.confirm.mock.calls[0][0]).toContain('폴더 1개')
    expect(api.FTPDeleteItem).not.toHaveBeenCalled()
  })

  it('FM-14: Delete — confirm 승인 시 폴더 여부와 함께 삭제, 목록 갱신', async () => {
    const { container } = await renderMgr()
    await connect(container)
    const { ftp } = panels(container)
    await click(ftp.querySelector('[title="/pub"]'), { ctrlKey: true })
    await click(ftp.querySelector('[title="/a.txt"]'), { ctrlKey: true })
    window.confirm = vi.fn(() => true)
    const before = api.FTPListDirectory.mock.calls.length
    await click(screen.getByText('Delete', { selector: 'button' }))
    await waitFor(() => expect(screen.getByText('Deleted 2 item(s)')).toBeTruthy())
    expect(api.FTPDeleteItem).toHaveBeenCalledWith('c1', '/pub', true)
    expect(api.FTPDeleteItem).toHaveBeenCalledWith('c1', '/a.txt', false)
    expect(api.FTPListDirectory.mock.calls.length).toBe(before + 1)
  })

  it('FM-15: Delete 실패 — 첫 실패에서 중단, 실패 메시지 유지, 목록은 갱신', async () => {
    const { container } = await renderMgr()
    await connect(container)
    const { ftp } = panels(container)
    await click(ftp.querySelector('[title="/a.txt"]'), { ctrlKey: true })
    await click(ftp.querySelector('[title="/img.png"]'), { ctrlKey: true })
    window.confirm = vi.fn(() => true)
    api.FTPDeleteItem.mockRejectedValueOnce('550')
    await click(screen.getByText('Delete', { selector: 'button' }))
    await waitFor(() => expect(screen.getByText('Delete failed (a.txt): 550')).toBeTruthy())
    expect(api.FTPDeleteItem).toHaveBeenCalledTimes(1)
  })

  it('FM-16: Disconnect → 미접속 상태로 복귀', async () => {
    const { container } = await renderMgr()
    await connect(container)
    await click(screen.getByText('Disconnect', { selector: 'button' }))
    await waitFor(() => expect(screen.getByText('Disconnected')).toBeTruthy())
    expect(api.FTPDisconnect).toHaveBeenCalledWith('c1')
    expect(screen.getByText('Not connected')).toBeTruthy()
    expect(screen.queryByText('a.txt')).toBeNull()
  })

  it('FM-17: Disconnect 실패 시 오류 상태 메시지, 연결 유지', async () => {
    const { container } = await renderMgr()
    await connect(container)
    api.FTPDisconnect.mockRejectedValueOnce('broken')
    await click(screen.getByText('Disconnect', { selector: 'button' }))
    await waitFor(() => expect(screen.getByText('Disconnect error: broken')).toBeTruthy())
    expect(screen.getByText('bob@ftp.test:21')).toBeTruthy()
  })

  it('FM-18: 접속 중 재접속하면 이전 연결을 먼저 해제', async () => {
    const { container } = await renderMgr()
    await connect(container)
    api.FTPConnect.mockResolvedValueOnce('c2')
    api.FTPGetConnections.mockResolvedValueOnce([{ id: 'c2', host: 'other', port: 21, username: 'bob' }])
    await connect(container, 'other')
    expect(api.FTPDisconnect).toHaveBeenCalledWith('c1')
    expect(api.FTPListDirectory).toHaveBeenLastCalledWith('c2', '/')
  })

  it('FM-19: 접속 실패 → 실패 메시지, 모달 닫힘', async () => {
    const { container } = await renderMgr()
    api.FTPConnect.mockRejectedValueOnce('refused')
    await click(screen.getByText('Connect', { selector: 'button' }))
    fireEvent.change(screen.getByPlaceholderText('ftp.example.com'), { target: { value: 'bad' } })
    await click(container.querySelector('button[type="submit"]'))
    await waitFor(() => expect(screen.getByText('Connection failed: refused')).toBeTruthy())
    expect(screen.queryByPlaceholderText('ftp.example.com')).toBeNull()
    expect(api.FTPAddHistory).not.toHaveBeenCalled()
  })

  it('FM-20: 목록 조회 실패 시 패널에 오류 표시', async () => {
    api.FTPListDirectory.mockRejectedValueOnce('530 login')
    const { container } = await renderMgr()
    await connect(container)
    expect(within(panels(container).ftp).getByText(/530 login/)).toBeTruthy()
  })

  it('FM-21: Refresh 버튼 — 현재 경로 재조회', async () => {
    const { container } = await renderMgr()
    await connect(container)
    const n = api.FTPListDirectory.mock.calls.length
    await click(screen.getByText('Refresh', { selector: 'button' }))
    await waitFor(() => expect(api.FTPListDirectory.mock.calls.length).toBe(n + 1))
    // 패널 헤더 Refresh/Parent도 동작
    const { ftp } = panels(container)
    await click(within(ftp).getByTitle('Refresh'))
    await click(within(ftp).getByTitle('Parent (Backspace)'))
    await waitFor(() => expect(api.FTPListDirectory.mock.calls.length).toBe(n + 3))
  })

  it('FM-22: FTP 점파일 표시 토글', async () => {
    const { container } = await renderMgr()
    await connect(container)
    const { ftp } = panels(container)
    await click(within(ftp).getByTitle('Show dotfiles'))
    expect(within(ftp).getByText('.hidden')).toBeTruthy()
    await click(within(ftp).getByTitle('Hide dotfiles'))
    expect(within(ftp).queryByText('.hidden')).toBeNull()
  })

  it('FM-23: 미접속 시 FTP 패널 버튼/키는 API를 호출하지 않음', async () => {
    const { container } = await renderMgr()
    const { ftp } = panels(container)
    await click(within(ftp).getByTitle('Refresh'))
    await click(within(ftp).getByTitle('Parent (Backspace)'))
    await key(ftp, 'Backspace')
    expect(api.FTPListDirectory).not.toHaveBeenCalled()
    // "Connect to server" 버튼으로 모달 열기
    await click(screen.getByText('Connect to server'))
    expect(screen.getByPlaceholderText('ftp.example.com')).toBeTruthy()
    // 오버레이 클릭으로 닫기
    await click(screen.getByText('FTP Connect').closest('div').parentElement.parentElement)
    expect(screen.queryByPlaceholderText('ftp.example.com')).toBeNull()
  })

  it('FM-24: 로컬 패널 — 헤더 버튼/드라이브/더블클릭/키보드가 fileStore 액션 호출', async () => {
    const { container } = await renderMgr()
    const { local } = panels(container)
    await click(within(local).getByTitle('Refresh'))
    expect(fs.refresh).toHaveBeenCalledWith('left')
    await click(within(local).getByTitle('Parent (Backspace)'))
    expect(fs.navigateUp).toHaveBeenCalledWith('left')
    await click(within(local).getByTitle('Show dotfiles'))
    expect(fs.toggleHidden).toHaveBeenCalledWith('left')
    fireEvent.change(within(local).getByTitle('드라이브 선택'), { target: { value: 'D:\\' } })
    expect(fs.navigate).toHaveBeenCalledWith('left', 'D:\\')
    await dbl(byTitle(local, 'C:\\work\\sub'))
    expect(fs.navigate).toHaveBeenCalledWith('left', 'C:\\work\\sub')
    await click(byTitle(local, 'C:\\work\\x.txt'), { ctrlKey: true })
    expect(fs.toggleSelect).toHaveBeenCalledWith('left', 'C:\\work\\x.txt')
    // 키보드: [..] 클릭 후 Enter → navigateUp
    await click(within(local).getByText('[..]').closest('div'))
    fs.navigateUp.mockClear()
    await key(local, 'Enter')
    expect(fs.navigateUp).toHaveBeenCalledWith('left')
    // ↓ 두 번 → sub, Enter → navigate, Space → toggleSelect
    await key(local, 'ArrowDown')
    await key(local, 'ArrowDown')
    fs.navigate.mockClear()
    await key(local, 'Enter')
    expect(fs.navigate).toHaveBeenCalledWith('left', 'C:\\work\\sub')
    fs.toggleSelect.mockClear()
    await key(local, ' ')
    expect(fs.toggleSelect).toHaveBeenCalledWith('left', 'C:\\work\\sub')
    // 셀렉트 위 키 입력은 무시
    fs.navigateUp.mockClear()
    fireEvent.keyDown(within(local).getByTitle('드라이브 선택'), { key: 'Backspace' })
    expect(fs.navigateUp).not.toHaveBeenCalled()
  })

  it('FM-25: 로컬 로딩/오류 상태 표시, showHidden이면 숨김 파일 표시', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, loading: true } }))
    const r = await renderMgr()
    expect(within(panels(r.container).local).getByText('Loading...')).toBeTruthy()
    cleanup()
    useFileStore.setState(s => ({ left: { ...s.left, loading: false, error: 'EACCES' } }))
    const r2 = await renderMgr()
    expect(within(panels(r2.container).local).getByText(/EACCES/)).toBeTruthy()
    cleanup()
    useFileStore.setState(s => ({ left: { ...s.left, error: null, showHidden: true } }))
    const r3 = await renderMgr()
    expect(within(panels(r3.container).local).getByText('secret.txt')).toBeTruthy()
    expect(within(panels(r3.container).local).getByTitle('Hide dotfiles')).toBeTruthy()
  })

  it('FM-26: 북마크 패널 — 비어 있으면 안내, 닫기 버튼', async () => {
    await renderMgr()
    await click(screen.getByText('Bookmarks', { selector: 'button' }))
    expect(screen.getByText('No bookmarks or history')).toBeTruthy()
    await click(screen.getByText('✕'))
    expect(screen.queryByText('No bookmarks or history')).toBeNull()
  })

  it('FM-27: 계정 있는 북마크 클릭 → 접속 창 미리 채움(비밀번호 비움)', async () => {
    api.FTPGetBookmarks.mockResolvedValue([{ id: 'b1', name: 'Work', config: { host: 'w.example', port: 2121, username: 'alice', password: 'leak' } }])
    await renderMgr()
    await click(screen.getByText('Bookmarks', { selector: 'button' }))
    expect(screen.getByText('즐겨찾기')).toBeTruthy()
    await click(screen.getByText('Work'))
    expect(screen.getByPlaceholderText('ftp.example.com').value).toBe('w.example')
    expect(screen.getByPlaceholderText('anonymous').value).toBe('alice')
    expect(screen.getByPlaceholderText('(leave blank for anonymous)').value).toBe('')
    expect(screen.getByDisplayValue('2121')).toBeTruthy()
    expect(api.FTPConnect).not.toHaveBeenCalled()
    await click(screen.getByText('Cancel'))
    expect(screen.queryByPlaceholderText('ftp.example.com')).toBeNull()
  })

  it('FM-28: 계정 없는 북마크 클릭 → 즉시 접속', async () => {
    api.FTPGetBookmarks.mockResolvedValue([{ id: 'b2', name: 'Anon', config: { host: 'ftp.test', port: 21, username: '' } }])
    await renderMgr()
    await click(screen.getByText('Bookmarks', { selector: 'button' }))
    await click(screen.getByText('Anon'))
    await waitFor(() => expect(screen.getByText('Connected to ftp.test')).toBeTruthy())
    expect(api.FTPConnect).toHaveBeenCalledWith({ host: 'ftp.test', port: 21, username: '' })
  })

  it('FM-29: 북마크 삭제 버튼 → FTPDeleteBookmark + 재로딩', async () => {
    api.FTPGetBookmarks.mockResolvedValueOnce([{ id: 'b1', name: 'Work', config: { host: 'w', port: 21, username: 'a' } }])
    const { container } = await renderMgr()
    await click(screen.getByText('Bookmarks', { selector: 'button' }))
    const item = screen.getByText('Work').closest('div').parentElement
    await click(item.querySelector('button'))
    await waitFor(() => expect(api.FTPDeleteBookmark).toHaveBeenCalledWith('b1'))
    await waitFor(() => expect(screen.getByText('No bookmarks or history')).toBeTruthy())
    expect(container).toBeTruthy()
  })

  it('FM-30: 최근 접속 클릭 → 미리 채움(anonymous는 빈 계정), 삭제/전체 삭제', async () => {
    api.FTPGetHistory.mockResolvedValue([
      { id: 'h1', host: 'h1.example', port: 21, username: 'anonymous' },
      { id: 'h2', host: 'h2.example', port: 990, username: 'carol' },
    ])
    await renderMgr()
    await click(screen.getByText('Bookmarks', { selector: 'button' }))
    expect(screen.getByText('최근 접속')).toBeTruthy()
    await click(screen.getByText('anonymous@h1.example'))
    expect(screen.getByPlaceholderText('ftp.example.com').value).toBe('h1.example')
    expect(screen.getByPlaceholderText('anonymous').value).toBe('')
    await click(screen.getByText('Cancel'))
    await click(screen.getByText('carol@h2.example'))
    expect(screen.getByPlaceholderText('anonymous').value).toBe('carol')
    await click(screen.getByText('Cancel'))

    const row = screen.getByText('carol@h2.example').closest('div').parentElement
    await click(row.querySelector('button'))
    await waitFor(() => expect(api.FTPDeleteHistory).toHaveBeenCalledWith('h2'))

    await click(screen.getByTitle('전체 삭제'))
    await waitFor(() => expect(api.FTPClearHistory).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('최근 접속')).toBeNull())
  })

  it('FM-31: Bookmark 저장 — 이름 입력 시 비밀번호 없이 저장, 취소 시 미저장', async () => {
    const { container } = await renderMgr()
    await connect(container)
    window.prompt = vi.fn(() => '')
    await click(screen.getByText('Bookmark', { selector: 'button' }))
    expect(api.FTPSaveBookmark).not.toHaveBeenCalled()
    window.prompt = vi.fn(() => 'Mine')
    await click(screen.getByText('Bookmark', { selector: 'button' }))
    await waitFor(() => expect(screen.getByText('Bookmark saved')).toBeTruthy())
    expect(api.FTPSaveBookmark).toHaveBeenCalledWith({ name: 'Mine', config: { host: 'ftp.test', port: 21, username: 'bob', password: '' } })
  })

  it('FM-32: 라이트 테마에서도 렌더링(아이콘 색상 맵)', async () => {
    useThemeStore.setState({ theme: 'light' })
    const { container } = await renderMgr()
    await connect(container)
    expect(within(panels(container).ftp).getByText('img.png')).toBeTruthy()
    // 확장자 열: extension 없는 파일은 이름에서 추출
    expect(within(panels(container).ftp).getByText('png')).toBeTruthy()
  })

  it.skip('BUG: 다운로드 실패 메시지가 "Downloaded 0 file(s)"로 덮어써져 사용자에게 보이지 않음', async () => {
    const { container } = await renderMgr()
    await connect(container)
    await click(panels(container).ftp.querySelector('[title="/a.txt"]'), { ctrlKey: true })
    api.FTPDownload.mockRejectedValueOnce('disk full')
    await click(screen.getByText('Download', { selector: 'button' }))
    await waitFor(() => expect(api.FTPDownload).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText(/disk full/)).toBeTruthy())
  })

  it.skip('BUG: TLS 연결에서 저장한 북마크가 useTls를 잃어 재접속 시 평문 FTP로 접속', async () => {
    const { container } = await renderMgr()
    await click(screen.getByText('Connect', { selector: 'button' }))
    fireEvent.change(screen.getByPlaceholderText('ftp.example.com'), { target: { value: 'ftp.test' } })
    fireEvent.click(screen.getByLabelText('Use TLS (FTPS)'))
    await click(container.querySelector('button[type="submit"]'))
    await waitFor(() => expect(screen.getByText('Connected to ftp.test')).toBeTruthy())
    window.prompt = vi.fn(() => 'Secure')
    await click(screen.getByText('Bookmark', { selector: 'button' }))
    await waitFor(() => expect(api.FTPSaveBookmark).toHaveBeenCalled())
    expect(api.FTPSaveBookmark.mock.calls[0][0].config.useTls).toBe(true)
  })
})

describe('ConnectModal 추가 커버리지', () => {
  afterEach(() => cleanup())

  it('FM-40: host 비어 있으면 제출해도 onConnect 미호출', () => {
    const onConnect = vi.fn()
    const { container } = render(h(ConnectModal, { onConnect, onClose: () => {} }))
    fireEvent.submit(container.querySelector('form'))
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('FM-41: 포트/비밀번호 입력 반영, 잘못된 포트는 21', () => {
    const onConnect = vi.fn()
    const { container } = render(h(ConnectModal, { onConnect, onClose: () => {} }))
    fireEvent.change(screen.getByPlaceholderText('ftp.example.com'), { target: { value: 'h' } })
    const port = container.querySelector('input[type="number"]')
    fireEvent.change(port, { target: { value: '2222' } })
    fireEvent.change(screen.getByPlaceholderText('(leave blank for anonymous)'), { target: { value: 'pw' } })
    fireEvent.submit(container.querySelector('form'))
    expect(onConnect).toHaveBeenLastCalledWith(expect.objectContaining({ host: 'h', port: 2222, password: 'pw', passive: true }))
    fireEvent.change(port, { target: { value: '' } })
    fireEvent.submit(container.querySelector('form'))
    expect(onConnect.mock.calls.at(-1)[0].port).toBe(21)
  })

  it('FM-42: prefill.useTls=true면 체크된 상태로 시작, ✕로 닫기', () => {
    const onClose = vi.fn()
    render(h(ConnectModal, { onConnect: vi.fn(), onClose, prefill: { host: 'p', useTls: true } }))
    expect(screen.getByLabelText('Use TLS (FTPS)').checked).toBe(true)
    fireEvent.click(screen.getByText('✕'))
    expect(onClose).toHaveBeenCalled()
  })
})
