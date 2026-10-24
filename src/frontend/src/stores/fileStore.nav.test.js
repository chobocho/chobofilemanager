import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../wailsjs/runtime', () => ({
  default: {
    ListDirectory: vi.fn(),
    GetParentPath: vi.fn(),
    ChangeWorkingDirectory: vi.fn().mockResolvedValue(undefined),
    SaveSessionState: vi.fn().mockResolvedValue(undefined),
  }
}))

const f = (dir, name) => ({ name, path: `${dir}/${name}`, isDir: false, isHidden: false, size: 1, modified: '', extension: '' })

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// ─── Todo #92: 이동 경합, 뒤로/앞으로 상태 ────────────────────────────────────
describe('Todo #92 — navigation', () => {
  let useFileStore, api

  beforeEach(async () => {
    vi.resetModules()
    useFileStore = (await import('./fileStore.js')).useFileStore
    api = (await import('../wailsjs/runtime')).default
    api.ListDirectory.mockReset()
    api.ChangeWorkingDirectory.mockClear()
    api.SaveSessionState.mockClear()
    useFileStore.setState(s => ({
      activePanel: 'left',
      left: { ...s.left, path: '/start', files: [], history: ['/start'], historyIndex: 0, cursor: 0, cursorOnParent: false, showHidden: false },
    }))
  })

  it('NAV-01: 늦게 도착한 이전 이동 응답이 최신 이동을 덮어쓰지 않음', async () => {
    const slow = deferred()
    api.ListDirectory.mockImplementation((p) => p === '/slow' ? slow.promise : Promise.resolve({ path: p, files: [f(p, 'b')] }))
    const first = useFileStore.getState().navigate('left', '/slow')
    await useFileStore.getState().navigate('left', '/fast')
    slow.resolve({ path: '/slow', files: [f('/slow', 'a')] })
    await first
    const left = useFileStore.getState().left
    expect(left.path).toBe('/fast')
    expect(left.files[0].name).toBe('b')
    expect(left.history).toEqual(['/start', '/fast'])
  })

  it('NAV-02: navigateBack 실패 시 historyIndex/path 유지, 예외 전파 없음', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, path: '/b', history: ['/a', '/b'], historyIndex: 1 } }))
    api.ListDirectory.mockRejectedValue(new Error('gone'))
    await useFileStore.getState().navigateBack('left')
    const left = useFileStore.getState().left
    expect(left.historyIndex).toBe(1)
    expect(left.path).toBe('/b')
    expect(left.error).toContain('gone')
  })

  it('NAV-03: navigateBack 후 커서가 범위 안 (자식 폴더 못 찾으면 0)', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, path: '/a/x', history: ['/a', '/a/x'], historyIndex: 1, cursor: 50 } }))
    api.ListDirectory.mockResolvedValue({ path: '/a', files: [f('/a', 'p'), f('/a', 'q')] })
    await useFileStore.getState().navigateBack('left')
    expect(useFileStore.getState().left.cursor).toBe(0)
  })

  it('NAV-04: navigateBack은 세션 저장 + 작업 폴더 변경', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, path: '/b', history: ['/a', '/b'], historyIndex: 1 } }))
    api.ListDirectory.mockResolvedValue({ path: '/a', files: [] })
    await useFileStore.getState().navigateBack('left')
    expect(api.ChangeWorkingDirectory).toHaveBeenCalledWith('/a')
    expect(api.SaveSessionState).toHaveBeenCalled()
  })

  it('NAV-05: navigateForward 후 커서 0, 실패 시 상태 유지', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, path: '/a', history: ['/a', '/b'], historyIndex: 0, cursor: 9 } }))
    api.ListDirectory.mockResolvedValueOnce({ path: '/b', files: [f('/b', 'z')] })
    await useFileStore.getState().navigateForward('left')
    let left = useFileStore.getState().left
    expect(left.path).toBe('/b')
    expect(left.historyIndex).toBe(1)
    expect(left.cursor).toBe(0)
    expect(api.ChangeWorkingDirectory).toHaveBeenCalledWith('/b')

    useFileStore.setState(s => ({ left: { ...s.left, path: '/a', history: ['/a', '/b'], historyIndex: 0 } }))
    api.ListDirectory.mockRejectedValueOnce(new Error('denied'))
    await useFileStore.getState().navigateForward('left')
    left = useFileStore.getState().left
    expect(left.historyIndex).toBe(0)
    expect(left.path).toBe('/a')
  })

  it('NAV-06: 빠른 탭 전환 시 이전 탭의 늦은 응답 무시', async () => {
    useFileStore.setState(s => ({
      left: { ...s.left, path: '/t0', tabs: [{ id: 0, path: '/t0' }, { id: 1, path: '/t1' }, { id: 2, path: '/t2' }], activeTabIdx: 0 },
    }))
    const slow = deferred()
    api.ListDirectory.mockImplementation((p) => p === '/t1' ? slow.promise : Promise.resolve({ path: p, files: [] }))
    const first = useFileStore.getState().switchTab('left', 1)
    await useFileStore.getState().switchTab('left', 2)
    slow.resolve({ path: '/t1', files: [] })
    await first
    const left = useFileStore.getState().left
    expect(left.activeTabIdx).toBe(2)
    expect(left.path).toBe('/t2')
  })
})

// ─── Todo #93: 정렬 유지 + 정렬 시 커서 파일 유지 ─────────────────────────────
describe('Todo #93 — sort', () => {
  let useFileStore, api
  const file = (name, size) => ({ name, path: `/d/${name}`, isDir: false, isHidden: false, size, modified: '', extension: '' })

  beforeEach(async () => {
    vi.resetModules()
    useFileStore = (await import('./fileStore.js')).useFileStore
    api = (await import('../wailsjs/runtime')).default
    api.ListDirectory.mockReset()
    useFileStore.setState(s => ({
      activePanel: 'left',
      left: { ...s.left, path: '/d', files: [file('a', 30), file('b', 10), file('c', 20)], history: ['/d'], historyIndex: 0,
              cursor: 0, cursorOnParent: false, showHidden: false, sortBy: 'name', sortDir: 'asc' },
    }))
  })

  it('SORT-01: 크기순 정렬 후 refresh해도 크기순 유지', async () => {
    useFileStore.getState().setSort('left', 'size')
    api.ListDirectory.mockResolvedValue({ path: '/d', files: [file('a', 30), file('b', 10), file('c', 20)] })
    await useFileStore.getState().refresh('left')
    expect(useFileStore.getState().left.files.map(f => f.name)).toEqual(['b', 'c', 'a'])
  })

  it('SORT-02: 정렬해도 커서는 같은 파일을 가리킴', () => {
    useFileStore.setState(s => ({ left: { ...s.left, cursor: 0 } })) // 'a'
    useFileStore.getState().setSort('left', 'size') // b, c, a
    const left = useFileStore.getState().left
    const visible = left.files
    expect(visible[left.cursor].name).toBe('a')
  })

  it('SORT-03: 폴더는 항상 먼저', () => {
    useFileStore.setState(s => ({ left: { ...s.left, files: [file('z', 1), { ...file('dir', 0), isDir: true }] } }))
    useFileStore.getState().setSort('left', 'size')
    expect(useFileStore.getState().left.files[0].name).toBe('dir')
  })
})

// ─── Todo #95: 북마크 이동 시 숨김 필터 기준 커서 ─────────────────────────────
describe('Todo #95 — navigateToBookmark 커서', () => {
  it('BM-01: 숨김 파일이 앞에 있어도 북마크 파일에 커서', async () => {
    vi.resetModules()
    const useFileStore = (await import('./fileStore.js')).useFileStore
    const api = (await import('../wailsjs/runtime')).default
    api.ListDirectory.mockReset()
    api.ListDirectory.mockResolvedValue({ path: '/d', files: [
      { name: '.a', path: '/d/.a', isHidden: true, isDir: false },
      { name: '.b', path: '/d/.b', isHidden: true, isDir: false },
      { name: 'x.txt', path: '/d/x.txt', isHidden: false, isDir: false },
    ] })
    useFileStore.setState(s => ({ left: { ...s.left, showHidden: false } }))
    await useFileStore.getState().navigateToBookmark('left', { isFile: true, path: '/d/x.txt' })
    const left = useFileStore.getState().left
    const visible = left.files.filter(f => !f.isHidden)
    expect(visible[left.cursor].name).toBe('x.txt')
  })
})
