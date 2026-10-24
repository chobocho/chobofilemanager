import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

import { useFTPStore } from './ftpStore.js'

const initial = useFTPStore.getState()

describe('ftpStore 커버리지', () => {
  let errSpy
  beforeEach(() => {
    for (const fn of Object.values(api)) { fn.mockReset(); fn.mockResolvedValue(undefined) }
    useFTPStore.setState({
      connections: [], bookmarks: [], history: [], activeConnection: null,
      panels: {
        left: { path: '/', files: [], loading: false, error: null },
        right: { path: '/', files: [], loading: false, error: null },
      },
    })
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errSpy.mockRestore())

  it('FS-01: 초기 상태 형태', () => {
    expect(initial.connections).toEqual([])
    expect(initial.panels.left.path).toBe('/')
    expect(initial.panels.right.loading).toBe(false)
  })

  it('FS-02: loadBookmarks — 목록 저장, null은 빈 배열', async () => {
    api.FTPGetBookmarks.mockResolvedValueOnce([{ id: 'b1' }])
    await useFTPStore.getState().loadBookmarks()
    expect(useFTPStore.getState().bookmarks).toEqual([{ id: 'b1' }])
    api.FTPGetBookmarks.mockResolvedValueOnce(null)
    await useFTPStore.getState().loadBookmarks()
    expect(useFTPStore.getState().bookmarks).toEqual([])
  })

  it('FS-03: loadBookmarks 실패 시 기존 목록 유지 + console.error', async () => {
    useFTPStore.setState({ bookmarks: [{ id: 'keep' }] })
    api.FTPGetBookmarks.mockRejectedValueOnce(new Error('boom'))
    await expect(useFTPStore.getState().loadBookmarks()).resolves.toBeUndefined()
    expect(useFTPStore.getState().bookmarks).toEqual([{ id: 'keep' }])
    expect(errSpy).toHaveBeenCalled()
  })

  it('FS-04: loadHistory — 목록 저장, null은 빈 배열, 실패는 무시', async () => {
    api.FTPGetHistory.mockResolvedValueOnce([{ id: 'h1' }])
    await useFTPStore.getState().loadHistory()
    expect(useFTPStore.getState().history).toEqual([{ id: 'h1' }])
    api.FTPGetHistory.mockResolvedValueOnce(null)
    await useFTPStore.getState().loadHistory()
    expect(useFTPStore.getState().history).toEqual([])
    useFTPStore.setState({ history: [{ id: 'x' }] })
    api.FTPGetHistory.mockRejectedValueOnce('fail')
    await useFTPStore.getState().loadHistory()
    expect(useFTPStore.getState().history).toEqual([{ id: 'x' }])
    expect(errSpy).toHaveBeenCalled()
  })

  it('FS-05: addHistory — 저장 후 이력 재로딩', async () => {
    api.FTPGetHistory.mockResolvedValueOnce([{ id: 'h9', host: 'a' }])
    await useFTPStore.getState().addHistory({ host: 'a' })
    expect(api.FTPAddHistory).toHaveBeenCalledWith({ host: 'a' })
    expect(useFTPStore.getState().history).toEqual([{ id: 'h9', host: 'a' }])
  })

  it('FS-06: addHistory 실패해도 예외 전파 없음, 재로딩 안 함', async () => {
    api.FTPAddHistory.mockRejectedValueOnce(new Error('disk'))
    await expect(useFTPStore.getState().addHistory({ host: 'a' })).resolves.toBeUndefined()
    expect(api.FTPGetHistory).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalled()
  })

  it('FS-07: deleteHistory — 삭제 후 재로딩', async () => {
    api.FTPGetHistory.mockResolvedValueOnce([])
    useFTPStore.setState({ history: [{ id: 'h1' }] })
    await useFTPStore.getState().deleteHistory('h1')
    expect(api.FTPDeleteHistory).toHaveBeenCalledWith('h1')
    expect(useFTPStore.getState().history).toEqual([])
  })

  it('FS-08: deleteHistory 실패는 호출자에게 전파', async () => {
    api.FTPDeleteHistory.mockRejectedValueOnce(new Error('nope'))
    await expect(useFTPStore.getState().deleteHistory('h1')).rejects.toThrow('nope')
  })

  it('FS-09: clearHistory — 백엔드 호출 + 빈 배열', async () => {
    useFTPStore.setState({ history: [{ id: 'a' }, { id: 'b' }] })
    await useFTPStore.getState().clearHistory()
    expect(api.FTPClearHistory).toHaveBeenCalled()
    expect(useFTPStore.getState().history).toEqual([])
  })

  it('FS-10: connect 실패 시 예외 전파, 연결 목록 미갱신', async () => {
    api.FTPConnect.mockRejectedValueOnce(new Error('refused'))
    await expect(useFTPStore.getState().connect({ host: 'h' })).rejects.toThrow('refused')
    expect(api.FTPGetConnections).not.toHaveBeenCalled()
  })

  it('FS-11: connect — 일치하는 id 없으면 null, 목록은 저장', async () => {
    api.FTPConnect.mockResolvedValueOnce('zz')
    api.FTPGetConnections.mockResolvedValueOnce([{ id: 'a' }])
    expect(await useFTPStore.getState().connect({ host: 'h' })).toBeNull()
    expect(useFTPStore.getState().connections).toEqual([{ id: 'a' }])
  })

  it('FS-12: disconnect — 백엔드 호출 후 연결 목록 갱신(null → [])', async () => {
    useFTPStore.setState({ connections: [{ id: 'a' }] })
    api.FTPGetConnections.mockResolvedValueOnce(null)
    await useFTPStore.getState().disconnect('a')
    expect(api.FTPDisconnect).toHaveBeenCalledWith('a')
    expect(useFTPStore.getState().connections).toEqual([])
  })

  it('FS-13: refreshConnections — 목록 갱신', async () => {
    api.FTPGetConnections.mockResolvedValueOnce([{ id: 'q' }])
    await useFTPStore.getState().refreshConnections()
    expect(useFTPStore.getState().connections).toEqual([{ id: 'q' }])
    api.FTPGetConnections.mockResolvedValueOnce(undefined)
    await useFTPStore.getState().refreshConnections()
    expect(useFTPStore.getState().connections).toEqual([])
  })

  it('FS-14: listDirectory 성공 — 해당 패널만 갱신, loading 해제', async () => {
    let resolve
    api.FTPListDirectory.mockReturnValueOnce(new Promise(r => { resolve = r }))
    const p = useFTPStore.getState().listDirectory('c1', '/pub', 'left')
    expect(useFTPStore.getState().panels.left.loading).toBe(true)
    resolve({ path: '/pub', files: [{ name: 'a' }] })
    await p
    const { left, right } = useFTPStore.getState().panels
    expect(api.FTPListDirectory).toHaveBeenCalledWith('c1', '/pub')
    expect(left).toEqual({ path: '/pub', files: [{ name: 'a' }], loading: false, error: null })
    expect(right.path).toBe('/')
  })

  it('FS-15: listDirectory — files null이면 빈 배열', async () => {
    api.FTPListDirectory.mockResolvedValueOnce({ path: '/x', files: null })
    await useFTPStore.getState().listDirectory('c1', '/x', 'right')
    expect(useFTPStore.getState().panels.right.files).toEqual([])
  })

  it('FS-16: listDirectory 실패 — error 메시지 저장, 기존 경로 유지', async () => {
    api.FTPListDirectory.mockRejectedValueOnce(new Error('550 denied'))
    await useFTPStore.getState().listDirectory('c1', '/secret', 'left')
    const left = useFTPStore.getState().panels.left
    expect(left.error).toBe('550 denied')
    expect(left.loading).toBe(false)
    expect(left.path).toBe('/')
  })

  it('FS-17: listDirectory 실패 — message 없는 값은 문자열화', async () => {
    api.FTPListDirectory.mockRejectedValueOnce('timeout')
    await useFTPStore.getState().listDirectory('c1', '/', 'right')
    expect(useFTPStore.getState().panels.right.error).toBe('timeout')
  })

  it('FS-18: download/upload/deleteItem/createDirectory/renameItem 인자 전달', async () => {
    const s = useFTPStore.getState()
    await s.download('c', '/r/a', 'C:\\local')
    await s.upload('c', 'C:\\local\\b', '/r/b')
    await s.deleteItem('c', '/r/a')
    await s.createDirectory('c', '/r/new')
    await s.renameItem('c', '/r/a', '/r/z')
    expect(api.FTPDownload).toHaveBeenCalledWith('c', '/r/a', 'C:\\local')
    expect(api.FTPUpload).toHaveBeenCalledWith('c', 'C:\\local\\b', '/r/b')
    expect(api.FTPDeleteItem).toHaveBeenCalledWith('c', '/r/a')
    expect(api.FTPCreateDirectory).toHaveBeenCalledWith('c', '/r/new')
    expect(api.FTPRenameItem).toHaveBeenCalledWith('c', '/r/a', '/r/z')
  })

  it('FS-19: download 실패는 전파', async () => {
    api.FTPDownload.mockRejectedValueOnce(new Error('io'))
    await expect(useFTPStore.getState().download('c', '/a', '/l')).rejects.toThrow('io')
  })

  it('FS-20: saveBookmark — 저장 후 북마크 재로딩', async () => {
    api.FTPGetBookmarks.mockResolvedValueOnce([{ id: 'n', name: 'N' }])
    await useFTPStore.getState().saveBookmark({ name: 'N', config: { host: 'h' } })
    expect(api.FTPSaveBookmark).toHaveBeenCalledWith({ name: 'N', config: { host: 'h' } })
    expect(useFTPStore.getState().bookmarks).toEqual([{ id: 'n', name: 'N' }])
  })

  it('FS-21: deleteBookmark — 삭제 후 재로딩', async () => {
    useFTPStore.setState({ bookmarks: [{ id: 'n' }] })
    api.FTPGetBookmarks.mockResolvedValueOnce([])
    await useFTPStore.getState().deleteBookmark('n')
    expect(api.FTPDeleteBookmark).toHaveBeenCalledWith('n')
    expect(useFTPStore.getState().bookmarks).toEqual([])
  })

  it('FS-22: saveBookmark 실패 시 재로딩하지 않고 전파', async () => {
    api.FTPSaveBookmark.mockRejectedValueOnce(new Error('dup'))
    await expect(useFTPStore.getState().saveBookmark({ name: 'x' })).rejects.toThrow('dup')
    expect(api.FTPGetBookmarks).not.toHaveBeenCalled()
  })
})
