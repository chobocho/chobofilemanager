import { describe, it, expect, vi, afterEach } from 'vitest'

// 브라우저 개발용 mock API (window.go 없음) 와 Wails 분기 검사
describe('wailsjs/runtime.js 브라우저 mock', () => {
  afterEach(() => { delete window.go; vi.resetModules(); vi.restoreAllMocks() })

  async function loadMock() {
    vi.resetModules()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    return await import('./runtime.js')
  }

  it('RT-01: window.go가 없으면 isWails=false, getAPI는 mock 반환 + 경고', async () => {
    const m = await loadMock()
    expect(m.isWails()).toBe(false)
    const api = m.getAPI()
    expect(typeof api.ListDirectory).toBe('function')
    expect(console.warn).toHaveBeenCalled()
  })

  it('RT-02: window.go.main.App가 있으면 getAPI는 그 객체를 반환', async () => {
    vi.resetModules()
    const App = { ListDirectory: vi.fn() }
    window.go = { main: { App } }
    const m = await import('./runtime.js')
    expect(m.isWails()).toBe(true)
    expect(m.getAPI()).toBe(App)
    expect(m.default).toBe(App)
  })

  it('RT-03: window.go는 있으나 main.App이 없으면 mock으로 폴백', async () => {
    vi.resetModules()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.go = {}
    const m = await import('./runtime.js')
    expect(m.isWails()).toBe(true)
    expect(typeof m.getAPI().GetDrives).toBe('function')
  })

  it('RT-04: 디렉터리/드라이브/홈 mock 형태', async () => {
    const api = (await loadMock()).default
    const d = await api.ListDirectory('/x')
    expect(d.path).toBe('/x')
    expect(d.files.length).toBe(8)
    expect(d.files[0]).toMatchObject({ name: 'Documents', isDir: true })
    expect((await api.ListDirectory('')).path).toBe('/home/user')
    expect(await api.GetHomeDirectory()).toBe('/home/user')
    const drives = await api.GetDrives()
    expect(drives.map(x => x.path)).toEqual(['/', '/home'])
  })

  it('RT-05: 파일 정보/읽기 mock', async () => {
    const api = (await loadMock()).default
    expect((await api.GetFileInfo('/home/user/main.go')).name).toBe('main.go')
    expect((await api.GetFileInfo('/nope')).name).toBe('Documents')
    expect(await api.ReadTextFile('/a')).toMatch(/Hello, World/)
    expect(await api.ReadTextFileWithEncoding('/a', 'utf-8')).toMatch(/Hello/)
    expect(await api.ReadImageFile('/a.png')).toMatch(/^data:image\/png;base64,/)
    expect(await api.CreateStarlarkScratchFile()).toMatch(/\.star$/)
    expect(await api.RunShellCommand('ls')).toBe('(mock) ls')
    expect(await api.RunStarlarkFile('/a.star')).toMatch(/starlark/)
    expect(await api.GetFileSize('/a')).toBe(1024000)
    expect((await api.SearchFiles('/', 'x', true)).length).toBe(3)
  })

  it('RT-06: 경로 유틸 mock (GetPathParts/JoinPath/GetParentPath)', async () => {
    const api = (await loadMock()).default
    expect(await api.GetPathParts('/home/user')).toEqual([
      { name: '/', path: '/' },
      { name: 'home', path: '/home' },
      { name: 'user', path: '/home/user' },
    ])
    expect(await api.GetPathParts('/')).toEqual([{ name: '/', path: '/' }])
    expect(await api.JoinPath('/a/', '/b', 'c')).toBe('/a/b/c')
    expect(await api.GetParentPath('/a/b')).toBe('/a')
    expect(await api.GetParentPath('/a')).toBe('/')
  })

  it('RT-07: 컬렉션/세션 mock 은 빈 값 반환', async () => {
    const api = (await loadMock()).default
    expect(await api.LoadPanelPaths()).toEqual({})
    expect(await api.CheckCopyConflicts()).toEqual([])
    expect(await api.GetFileBookmarks()).toEqual([])
    expect(await api.FTPGetConnections()).toEqual([])
    expect(await api.FTPGetBookmarks()).toEqual([])
    expect(await api.FTPGetHistory()).toEqual([])
    const ftpList = await api.FTPListDirectory('/')
    expect(ftpList.path).toBe('/')
    expect(ftpList.files.length).toBe(8)
  })

  it('RT-08: 부수효과 mock 함수는 모두 null로 resolve', async () => {
    const api = (await loadMock()).default
    const nullFns = ['CopyItems', 'MoveItems', 'DeleteItems', 'TrashItems', 'CreateDirectory', 'CreateFile',
      'RenameItem', 'WriteTextFile', 'WriteTextFileWithEncoding', 'CopyItemsRename', 'CopyItemsSkipConflicts',
      'MoveItemsOverwrite', 'MoveItemsRename', 'AddFileBookmark', 'DeleteFileBookmark', 'OpenFile',
      'SaveSessionState', 'CompressItems', 'ExtractArchive', 'OpenCmdWindow',
      'FTPConnect', 'FTPDisconnect', 'FTPDownload', 'FTPUpload', 'FTPDeleteItem', 'FTPCreateDirectory',
      'FTPRenameItem', 'FTPSaveBookmark', 'FTPDeleteBookmark', 'FTPDeleteHistory', 'FTPClearHistory', 'FTPAddHistory']
    for (const n of nullFns) {
      expect(typeof api[n], n).toBe('function')
      expect(await api[n](), n).toBeNull()
    }
  })
})
