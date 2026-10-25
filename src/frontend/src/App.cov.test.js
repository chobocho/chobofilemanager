import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'

// 가상 파일 시스템 (경로 → 파일 목록)
const fs = vi.hoisted(() => ({}))

vi.mock('./wailsjs/runtime', () => {
  const api = {}
  return { default: api }
})
vi.mock('../wailsjs/runtime/runtime', () => ({ Quit: vi.fn() }))

import api from './wailsjs/runtime'
import App from './App.jsx'
import { useFileStore } from './stores/fileStore'
import { findSurfaceWithText } from './test/textSurface.js'
import { setTermBackend } from './terminal/core/termApi'
import { stopEventRouter } from './terminal/core/session'
import { DOCK_ID_BASE } from './terminal/core/dock'
import { useDockStore, DOCK_PREFS_KEY } from './stores/dockStore'
import { useEditorStore } from './stores/editorStore'

const h = React.createElement
Element.prototype.scrollIntoView = vi.fn()

const file = (dir, name, extra = {}) => ({
  name, path: `${dir}/${name}`, isDir: false, isHidden: false, size: 10,
  modified: '2026-01-01T00:00:00Z', extension: '.' + name.split('.').pop(), ...extra,
})
const dir = (d, name) => file(d, name, { isDir: true, extension: '', size: 0 })

function setupApi() {
  for (const k of Object.keys(api)) delete api[k]
  const ok = () => vi.fn().mockResolvedValue(null)
  Object.assign(api, {
    GetHomeDirectory: vi.fn().mockResolvedValue('/a'),
    GetDrives: vi.fn().mockResolvedValue([{ name: '/', path: '/' }]),
    LoadPanelPaths: vi.fn().mockResolvedValue({
      leftTabs: { paths: ['/a'], activeIdx: 0 },
      rightTabs: { paths: ['/b'], activeIdx: 0 },
      leftPath: '/a', rightPath: '/b',
    }),
    ListDirectory: vi.fn(async (p) => {
      if (!(p in fs)) throw new Error('not found')
      return { path: p, files: fs[p] }
    }),
    GetParentPath: vi.fn(async (p) => p.split('/').slice(0, -1).join('/') || '/'),
    SaveSessionState: ok(), ChangeWorkingDirectory: ok(),
    FTPGetBookmarks: vi.fn().mockResolvedValue([]),
    FTPGetHistory: vi.fn().mockResolvedValue([]),
    FTPGetConnections: vi.fn().mockResolvedValue([]),
    TrashItems: ok(), DeleteItems: ok(),
    CheckCopyConflicts: vi.fn().mockResolvedValue([]),
    CopyItems: ok(), CopyItemsRename: ok(), CopyItemsSkipConflicts: ok(),
    MoveItems: ok(), MoveItemsOverwrite: ok(), MoveItemsRename: ok(),
    CreateDirectory: ok(), CreateFile: ok(), RenameItem: ok(),
    CompressItems: ok(), ExtractArchive: ok(), OpenFile: ok(), OpenCmdWindow: ok(),
    ReadTextFile: vi.fn().mockResolvedValue('hello content'),
    ReadTextFileWithEncoding: vi.fn().mockResolvedValue('hello content'),
    ReadImageFile: vi.fn().mockResolvedValue('data:image/png;base64,AA'),
    WriteTextFile: ok(), WriteTextFileWithEncoding: ok(),
    CreateStarlarkScratchFile: vi.fn().mockResolvedValue('/tmp/scratch.star'),
    RunStarlarkFile: vi.fn().mockResolvedValue('ok'),
    GetFileBookmarks: vi.fn().mockResolvedValue([]),
    AddFileBookmark: ok(), DeleteFileBookmark: ok(),
    RunShellCommand: vi.fn().mockResolvedValue('out'),
    SearchFiles: vi.fn().mockResolvedValue([]),
  })
}

beforeEach(() => {
  for (const k of Object.keys(fs)) delete fs[k]
  fs['/a'] = [dir('/a', 'sub'), file('/a', 'x.txt'), file('/a', 'y.txt'),
    file('/a', 'big.txt', { size: 33 * 1024 * 1024 }), file('/a', 'pic.png')]
  fs['/a/sub'] = []
  fs['/b'] = [file('/b', 'x.txt'), file('/b', 'z.txt')]
  setupApi()
  useFileStore.setState({ activePanel: 'left', status: '' })
  useDockStore.getState().resetForTest()
  useEditorStore.getState().reset() // 뷰어/에디터 상태는 스토어라 테스트마다 비움
})
afterEach(() => cleanup())

async function renderApp() {
  const utils = render(h(App))
  await screen.findByText('y.txt')
  await waitFor(() => expect(useFileStore.getState().right.path).toBe('/b'))
  return utils
}
// 왼쪽 패널 visible 목록에서 이름으로 커서 이동
function cursorTo(name) {
  act(() => {
    const files = useFileStore.getState().left.files
    useFileStore.getState().setCursor('left', files.findIndex(f => f.name === name))
  })
}
async function key(ev) {
  await act(async () => { fireEvent.keyDown(window, ev) })
}
const flush = () => act(async () => {})

describe('App 커버리지 — 초기화', () => {
  it('AP-01: 마운트 시 init + FTP 북마크 로딩, 양쪽 패널 렌더', async () => {
    await renderApp()
    expect(api.LoadPanelPaths).toHaveBeenCalled()
    expect(api.FTPGetBookmarks).toHaveBeenCalled()
    expect(screen.getByText('z.txt')).toBeTruthy()
    expect(screen.getAllByText('x.txt')).toHaveLength(2)
  })

  it('AP-02: init 실패해도 앱은 렌더 (오류 로그)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    api.LoadPanelPaths.mockRejectedValue(new Error('boom'))
    render(h(App))
    await waitFor(() => expect(err).toHaveBeenCalled())
    expect(screen.getByText('Files')).toBeTruthy()
    err.mockRestore()
  })
})

describe('App 커버리지 — 휴지통/영구 삭제', () => {
  it('AP-03: F8 → 확인 → TrashItems 호출, 대화상자 닫힘', async () => {
    await renderApp()
    cursorTo('x.txt')
    await key({ key: 'F8' })
    expect(screen.getByText('1개 항목을 휴지통으로 이동하시겠습니까?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '휴지통으로 이동' }))
    await flush()
    expect(api.TrashItems).toHaveBeenCalledWith(['/a/x.txt'])
    expect(screen.queryByText(/휴지통으로 이동하시겠습니까/)).toBeNull()
  })

  it('AP-04: 휴지통 이동 실패 시 대화상자 유지 + 오류 메시지, 취소로 닫힘', async () => {
    await renderApp()
    cursorTo('x.txt')
    api.TrashItems.mockRejectedValue('locked')
    await key({ key: 'Delete' })
    fireEvent.click(screen.getByRole('button', { name: '휴지통으로 이동' }))
    await flush()
    expect(screen.getByText('휴지통 이동 실패: locked')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/휴지통 이동 실패/)).toBeNull()
  })

  it('AP-05: Shift+Delete → 영구 삭제 확인 → DeleteItems', async () => {
    await renderApp()
    cursorTo('y.txt')
    await key({ key: 'Delete', shiftKey: true })
    expect(screen.getByText(/영구 삭제하시겠습니까/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '영구 삭제' }))
    await flush()
    expect(api.DeleteItems).toHaveBeenCalledWith(['/a/y.txt'])
    expect(api.TrashItems).not.toHaveBeenCalled()
    expect(screen.queryByText(/영구 삭제하시겠습니까/)).toBeNull()
  })

  it('AP-06: 영구 삭제 실패 시 오류 표시 후 Escape로 닫힘', async () => {
    await renderApp()
    cursorTo('y.txt')
    api.DeleteItems.mockRejectedValue('perm')
    await key({ key: 'Delete', shiftKey: true })
    fireEvent.click(screen.getByRole('button', { name: '영구 삭제' }))
    await flush()
    expect(screen.getByText('삭제 실패: perm')).toBeTruthy()
    await key({ key: 'Escape' })
    expect(screen.queryByText('삭제 실패: perm')).toBeNull()
  })

  it('AP-07: [..]에 커서가 있으면 F8 대화상자 열리지 않음', async () => {
    await renderApp()
    act(() => useFileStore.getState().setCursorOnParent('left', true))
    await key({ key: 'F8' })
    expect(screen.queryByText(/휴지통으로 이동하시겠습니까/)).toBeNull()
    expect(useFileStore.getState().status).toBe('삭제할 파일이 없습니다.')
  })
})

describe('App 커버리지 — 복사/이동 충돌', () => {
  it('AP-08: F5 충돌 없음 → 다른 패널로 CopyItems', async () => {
    await renderApp()
    cursorTo('y.txt')
    await key({ key: 'F5' })
    expect(api.CopyItems).toHaveBeenCalledWith(['/a/y.txt'], '/b')
    expect(screen.queryByText('파일 복사 충돌')).toBeNull()
  })

  it.each([
    ['덮어쓰기', 'CopyItems'],
    ['이름 바꾸어 복사', 'CopyItemsRename'],
    ['건너뛰기', 'CopyItemsSkipConflicts'],
  ])('AP-09: F5 충돌 → "%s" → %s', async (label, fn) => {
    await renderApp()
    cursorTo('x.txt')
    api.CheckCopyConflicts.mockResolvedValue([{ name: 'x.txt', destPath: '/b/x.txt' }])
    await key({ key: 'F5' })
    expect(screen.getByText('파일 복사 충돌')).toBeTruthy()
    fireEvent.click(screen.getByText(label))
    await flush()
    expect(api[fn]).toHaveBeenCalledWith(['/a/x.txt'], '/b')
    expect(screen.queryByText('파일 복사 충돌')).toBeNull()
  })

  it('AP-10: F5 충돌 대화상자 취소 → 아무것도 복사 안 함', async () => {
    await renderApp()
    cursorTo('x.txt')
    api.CheckCopyConflicts.mockResolvedValue([{ name: 'x.txt', destPath: '/b/x.txt' }])
    await key({ key: 'F5' })
    fireEvent.click(screen.getByText('취소'))
    expect(screen.queryByText('파일 복사 충돌')).toBeNull()
    expect(api.CopyItems).not.toHaveBeenCalled()
  })

  it('AP-11: F6 충돌 없음 → MoveItems', async () => {
    await renderApp()
    cursorTo('y.txt')
    await key({ key: 'F6' })
    expect(api.MoveItems).toHaveBeenCalledWith(['/a/y.txt'], '/b')
  })

  it.each([
    ['덮어쓰기', 'MoveItemsOverwrite'],
    ['이름 바꾸어 이동', 'MoveItemsRename'],
  ])('AP-12: F6 충돌 → "%s" → %s', async (label, fn) => {
    await renderApp()
    cursorTo('x.txt')
    api.CheckCopyConflicts.mockResolvedValue([{ name: 'x.txt', destPath: '/b/x.txt' }])
    await key({ key: 'F6' })
    expect(screen.getByText('파일 이동 충돌')).toBeTruthy()
    fireEvent.click(screen.getByText(label))
    await flush()
    expect(api[fn]).toHaveBeenCalledWith(['/a/x.txt'], '/b')
    expect(screen.queryByText('파일 이동 충돌')).toBeNull()
    expect(api.MoveItems).not.toHaveBeenCalled()
  })

  it('AP-13: F6 충돌 대화상자 취소', async () => {
    await renderApp()
    cursorTo('x.txt')
    api.CheckCopyConflicts.mockResolvedValue([{ name: 'x.txt', destPath: '/b/x.txt' }])
    await key({ key: 'F6' })
    fireEvent.click(screen.getByText('취소'))
    expect(screen.queryByText('파일 이동 충돌')).toBeNull()
  })
})

describe('App 커버리지 — 생성/이름 변경', () => {
  it('AP-14: F7 → 새 폴더 이름 입력 → CreateDirectory', async () => {
    await renderApp()
    await key({ key: 'F7' })
    const input = screen.getByPlaceholderText('new_folder')
    fireEvent.change(input, { target: { value: 'newdir' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await flush()
    expect(api.CreateDirectory).toHaveBeenCalledWith('/a/newdir')
    expect(screen.queryByPlaceholderText('new_folder')).toBeNull()
  })

  it('AP-15: 새 폴더 생성 실패 시 대화상자에 오류 유지', async () => {
    await renderApp()
    api.CreateDirectory.mockRejectedValue('exists')
    await key({ key: 'F7' })
    fireEvent.change(screen.getByPlaceholderText('new_folder'), { target: { value: 'sub' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await flush()
    expect(screen.getByText('exists')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByPlaceholderText('new_folder')).toBeNull()
  })

  it('AP-16: Ctrl+N → 새 파일 → CreateFile', async () => {
    await renderApp()
    await key({ key: 'n', ctrlKey: true })
    fireEvent.change(screen.getByPlaceholderText('file.txt'), { target: { value: 'new.txt' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await flush()
    expect(api.CreateFile).toHaveBeenCalledWith('/a/new.txt')
    expect(screen.queryByPlaceholderText('file.txt')).toBeNull()
  })

  it('AP-17: F2 → 이름 변경 → RenameItem', async () => {
    await renderApp()
    cursorTo('x.txt')
    await key({ key: 'F2' })
    const input = screen.getByDisplayValue('x.txt')
    fireEvent.change(input, { target: { value: 'w.txt' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    await flush()
    expect(api.RenameItem).toHaveBeenCalledWith('/a/x.txt', '/a/w.txt')
    expect(screen.queryByDisplayValue('w.txt')).toBeNull()
  })

  it('AP-18: [..]에서 F2는 대화상자를 열지 않음', async () => {
    await renderApp()
    act(() => useFileStore.getState().setCursorOnParent('left', true))
    await key({ key: 'F2' })
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull()
  })
})

describe('App 커버리지 — 뷰어/에디터', () => {
  it('AP-19: F3 텍스트 파일 → 뷰어 열림, Escape로 닫힘', async () => {
    await renderApp()
    cursorTo('x.txt')
    await key({ key: 'F3' })
    // 뷰어는 지연 로딩 조각 — 불러올 때까지 대기
    await waitFor(() => expect(api.ReadTextFile).toHaveBeenCalledWith('/a/x.txt'))
    await key({ key: 'Escape' })
    await flush()
    // 뷰어가 닫혀 단축키가 다시 패널에 동작
    await key({ key: 'F5' })
    expect(api.CheckCopyConflicts).toHaveBeenCalled()
  })

  it('AP-20: F3/F4는 폴더/[..]에서 열리지 않음', async () => {
    await renderApp()
    cursorTo('sub')
    await key({ key: 'F3' })
    await key({ key: 'F4' })
    act(() => useFileStore.getState().setCursorOnParent('left', true))
    await key({ key: 'F3' })
    await key({ key: 'F4' })
    await flush()
    expect(api.ReadTextFile).not.toHaveBeenCalled()
    expect(api.ReadTextFileWithEncoding).not.toHaveBeenCalled()
  })

  it('AP-21: F4 → 에디터에 내용 표시', async () => {
    await renderApp()
    cursorTo('y.txt')
    await key({ key: 'F4' })
    expect(await findSurfaceWithText('hello content')).toBeTruthy()
    expect(api.ReadTextFile).toHaveBeenCalledWith('/a/y.txt')
  })

  it('AP-22: 32MB 초과 파일은 크기 초과 안내, 확인으로 닫힘 (Todo #114)', async () => {
    await renderApp()
    cursorTo('big.txt')
    await key({ key: 'F3' })
    expect(screen.getByText('파일 크기 초과')).toBeTruthy()
    expect(screen.getByText(/big\.txt.*32MB/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    expect(screen.queryByText('파일 크기 초과')).toBeNull()
    await key({ key: 'F4' })
    expect(screen.getByText('파일 크기 초과')).toBeTruthy()
    expect(api.ReadTextFile).not.toHaveBeenCalled()
  })

  it('AP-23: 이미지 F3 → ReadImageFile', async () => {
    await renderApp()
    cursorTo('pic.png')
    await key({ key: 'F3' })
    await flush()
    expect(api.ReadImageFile).toHaveBeenCalledWith('/a/pic.png')
  })

  it('AP-24: Ctrl+Shift+M → 스크래치 파일 생성 후 에디터 열기', async () => {
    await renderApp()
    await key({ key: 'M', ctrlKey: true, shiftKey: true })
    await flush()
    expect(api.CreateStarlarkScratchFile).toHaveBeenCalled()
    await waitFor(() => expect(api.ReadTextFile).toHaveBeenCalledWith('/tmp/scratch.star'))
  })

  it('AP-25: 스크래치 생성 실패는 오류 로그만', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    api.CreateStarlarkScratchFile.mockRejectedValue('no tmp')
    await renderApp()
    await key({ key: 'M', ctrlKey: true, shiftKey: true })
    await flush()
    expect(err).toHaveBeenCalled()
    expect(api.ReadTextFile).not.toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('사용자 단추 막대 (Todo #133-12)', () => {
  afterEach(() => cleanup())

  it('AP-BB1: 저장된 단추를 그리고, 프로그램 단추는 자리 표시를 바꿔 실행, @sync는 동기화 창', async () => {
    api.GetUserButtons = vi.fn().mockResolvedValue([
      { id: '1', name: '편집기', command: 'code.exe', params: '"%F" %T', startDir: '%P' },
      { id: '2', name: '동기화', command: '@sync' },
    ])
    api.RunUserCommand = vi.fn().mockResolvedValue(null)
    api.CompareDirs = vi.fn().mockResolvedValue([])
    await renderApp()
    cursorTo('x.txt')
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: '편집기' })) })
    expect(api.RunUserCommand).toHaveBeenCalledWith('code.exe', '"/a/x.txt" /b', '/a')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '동기화' })) })
    expect(await screen.findByText('폴더 동기화')).toBeTruthy()
  })

  it('AP-BB2: + → 새 단추 창, 저장하면 SaveUserButtons, 창이 떠 있는 동안 F5는 막힘', async () => {
    api.GetUserButtons = vi.fn().mockResolvedValue([])
    api.SaveUserButtons = vi.fn().mockResolvedValue(null)
    await renderApp()
    fireEvent.click(screen.getByTitle('단추 추가'))
    await key({ key: 'F5' })
    expect(api.CheckCopyConflicts).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '메모장' } })
    fireEvent.change(screen.getByLabelText('명령'), { target: { value: 'notepad.exe' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '저장' })) })
    expect(api.SaveUserButtons).toHaveBeenCalledWith([expect.objectContaining({ name: '메모장', command: 'notepad.exe' })])
    expect(screen.getByRole('button', { name: '메모장' })).toBeTruthy()
  })
})

describe('플러그인 (Todo #133-13)', () => {
  afterEach(() => cleanup())

  it('AP-PG1: Ctrl+Shift+X → 플러그인 창, 실행하면 지금 패널 정보를 넘김', async () => {
    api.ListPlugins = vi.fn().mockResolvedValue([{ file: 'c.star', name: '세기', description: '' }])
    api.RunPlugin = vi.fn().mockResolvedValue({ output: 'ok', error: '', refresh: true })
    await renderApp()
    cursorTo('x.txt')
    await key({ key: 'X', ctrlKey: true, shiftKey: true })
    expect(await screen.findByText('세기')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '실행' })) })
    expect(api.RunPlugin).toHaveBeenCalledWith('c.star', { panelPath: '/a', targetPath: '/b', cursor: '/a/x.txt', selected: [] })
    await waitFor(() => expect(screen.getByText('ok')).toBeTruthy())
  })
})

describe('빠른 보기 (Todo #133-9)', () => {
  afterEach(() => cleanup())

  it('AP-QV1: Ctrl+Q → 반대 패널 자리에 커서 파일 미리 보기, 커서를 옮기면 따라감, 다시 Ctrl+Q로 닫기', async () => {
    await renderApp()
    cursorTo('x.txt')
    await key({ key: 'q', ctrlKey: true })
    expect(await screen.findByRole('region', { name: '빠른 보기' })).toBeTruthy()
    expect(screen.queryByText('z.txt')).toBeNull() // 오른쪽 패널 자리
    await waitFor(() => expect(api.ReadTextFile).toHaveBeenCalledWith('/a/x.txt'))
    cursorTo('y.txt')
    await waitFor(() => expect(api.ReadTextFile).toHaveBeenCalledWith('/a/y.txt'))
    await key({ key: 'Tab' }) // 빠른 보기 중에는 패널 전환 없음
    expect(useFileStore.getState().activePanel).toBe('left')
    await key({ key: 'q', ctrlKey: true })
    expect(screen.queryByRole('region', { name: '빠른 보기' })).toBeNull()
    expect(screen.getByText('z.txt')).toBeTruthy()
  })
})

describe('FTP를 패널에서 (Todo #133-8)', () => {
  afterEach(() => cleanup())

  it('AP-FTP1: 드라이브 목록 "FTP 연결..." → 접속하면 활성 패널이 FTP 루트', async () => {
    const id = 'h_21_1_1'
    fs[`ftp://${id}/`] = [file(`ftp://${id}`, 'remote.txt')]
    api.FTPConnect = vi.fn().mockResolvedValue(id)
    api.FTPGetConnections = vi.fn().mockResolvedValue([{ id, host: 'h', port: 21, username: 'u' }])
    api.FTPAddHistory = vi.fn().mockResolvedValue(null)
    await renderApp()
    const select = document.querySelectorAll('select')[0]
    await act(async () => { fireEvent.change(select, { target: { value: '__ftp_connect__' } }) })
    fireEvent.change(screen.getByPlaceholderText('ftp.example.com'), { target: { value: 'h' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Connect/ })) })
    expect(api.FTPConnect).toHaveBeenCalledWith(expect.objectContaining({ host: 'h' }))
    await waitFor(() => expect(useFileStore.getState().left.path).toBe(`ftp://${id}/`))
    expect(screen.getAllByText('remote.txt').length).toBeGreaterThan(0)
  })

  it('AP-FTP2: FTP 패널에서 F8은 휴지통 대신 영구 삭제 확인', async () => {
    const id = 'h_21_1_1'
    fs[`ftp://${id}/`] = [file(`ftp://${id}`, 'remote.txt')]
    await renderApp()
    await act(async () => { await useFileStore.getState().navigate('left', `ftp://${id}/`) })
    await key({ key: 'F8' })
    expect(screen.getByText('영구 삭제', { selector: 'span' })).toBeTruthy()
    expect(api.TrashItems).not.toHaveBeenCalled()
  })
})

describe('파일 내용 비교 (Todo #133-7)', () => {
  afterEach(() => cleanup())

  it('AP-DF1: Ctrl+Shift+D → 커서 파일과 반대 패널의 같은 이름 파일을 비교, Esc로 닫기', async () => {
    api.CompareFileBytes = vi.fn().mockResolvedValue({ equal: true, binary: true, firstDiff: -1, sizeA: 1, sizeB: 1 })
    await renderApp()
    cursorTo('x.txt')
    await key({ key: 'D', ctrlKey: true, shiftKey: true })
    await waitFor(() => expect(api.CompareFileBytes).toHaveBeenCalledWith('/a/x.txt', '/b/x.txt'))
    expect(await screen.findByRole('dialog', { name: '파일 내용 비교' })).toBeTruthy()
    // 비교 화면이 떠 있는 동안 F5는 패널 복사로 새지 않음
    await key({ key: 'F5' })
    expect(api.CheckCopyConflicts).not.toHaveBeenCalled()
    await key({ key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '파일 내용 비교' })).toBeNull()
  })

  it('AP-DF2: 대상이 없으면 상태 표시줄 안내', async () => {
    await renderApp()
    cursorTo('sub')
    await key({ key: 'D', ctrlKey: true, shiftKey: true })
    expect(useFileStore.getState().status).toMatch(/비교할 파일/)
  })
})

describe('여러 이름 바꾸기 (Todo #133-4)', () => {
  afterEach(() => cleanup())

  it('AP-MR1: Ctrl+M → 선택한 파일(없으면 커서 파일)로 여러 이름 바꾸기 창, 바꾸면 RenameBatch', async () => {
    api.RenameBatch = vi.fn().mockResolvedValue(null)
    await renderApp()
    cursorTo('x.txt')
    await key({ key: 'm', ctrlKey: true })
    expect(screen.getByText('여러 이름 바꾸기 (1개)')).toBeTruthy()
    expect(api.CreateStarlarkScratchFile).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('이름 마스크'), { target: { value: 'renamed' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '바꾸기' })) })
    expect(api.RenameBatch).toHaveBeenCalledWith([{ old: '/a/x.txt', new: '/a/renamed.txt' }])
    expect(screen.queryByText(/여러 이름 바꾸기/)).toBeNull()
  })
})

describe('App 커버리지 — 패널/뷰/도움말/기타', () => {
  it('AP-26: Tab으로 활성 패널 전환', async () => {
    await renderApp()
    await key({ key: 'Tab' })
    expect(useFileStore.getState().activePanel).toBe('right')
    expect(screen.getByText('RIGHT')).toBeTruthy()
    await key({ key: 'Tab' })
    expect(useFileStore.getState().activePanel).toBe('left')
  })

  it('AP-27: FTP 보기로 전환 시 파일 패널 숨김, Files로 복귀', async () => {
    await renderApp()
    fireEvent.click(screen.getByTitle('FTP Manager'))
    await flush()
    expect(screen.getByText('Not connected')).toBeTruthy()
    // FTP 화면의 로컬 영역은 왼쪽 패널만 표시 — 오른쪽 패널(z.txt)은 사라짐
    expect(screen.queryByText('z.txt')).toBeNull()
    fireEvent.click(screen.getByTitle('File Manager'))
    expect(await screen.findByText('z.txt')).toBeTruthy()
  })

  it('AP-28: F1 도움말 열기/F1로 닫기, 닫기 버튼', async () => {
    await renderApp()
    await key({ key: 'F1' })
    expect(screen.getByText(/도움말 — Chobocho Commander/)).toBeTruthy()
    await key({ key: 'F1' })
    expect(screen.queryByText(/도움말 — Chobocho Commander/)).toBeNull()
    fireEvent.click(screen.getByTitle('Help (F1)'))
    expect(screen.getByText(/도움말 — Chobocho Commander/)).toBeTruthy()
    fireEvent.click(screen.getByText('닫기'))
    expect(screen.queryByText(/도움말 — Chobocho Commander/)).toBeNull()
  })

  it('AP-29: Ctrl+O 셸 대화상자 / Shift+F9 바깥 명령 창 (F9는 도크, Todo #122)', async () => {
    await renderApp()
    await key({ key: 'F9', shiftKey: true })
    await flush()
    expect(api.OpenCmdWindow).toHaveBeenCalledWith('/a')
    await key({ key: 'o', ctrlKey: true })
    expect(screen.getByRole('textbox')).toBeTruthy()
    await key({ key: 'Escape' })
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('AP-30: Shift+F9 실패 시 상태 표시', async () => {
    api.OpenCmdWindow.mockRejectedValue('no cmd')
    await renderApp()
    await key({ key: 'F9', shiftKey: true })
    await waitFor(() => expect(useFileStore.getState().status).toBe('명령 창 열기 실패: no cmd'))
  })

  it('AP-31: F키바 버튼 클릭 (Copy/Move/NewDir/Trash/Shell/Term/Rename/View/Edit)', async () => {
    await renderApp()
    cursorTo('y.txt')
    fireEvent.click(screen.getByTitle('Copy (F5)'))
    await flush()
    expect(api.CopyItems).toHaveBeenCalled()
    fireEvent.click(screen.getByTitle('Move (F6)'))
    await flush()
    expect(api.MoveItems).toHaveBeenCalled()
    fireEvent.click(screen.getByTitle('NewDir (F7)'))
    expect(screen.getByPlaceholderText('new_folder')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    cursorTo('x.txt')
    fireEvent.click(screen.getByTitle('Trash (F8)'))
    await flush()
    expect(screen.getByText(/휴지통으로 이동하시겠습니까/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByTitle('Term (F9)'))
    await flush()
    expect(useDockStore.getState().open).toBe(true)
    act(() => useDockStore.getState().hide())
    fireEvent.click(screen.getByTitle('Shell (Ctrl+O)'))
    expect(screen.getByRole('textbox')).toBeTruthy()
    await key({ key: 'Escape' })
    fireEvent.click(screen.getByTitle('Rename (F2)'))
    expect(screen.getByDisplayValue('x.txt')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByTitle('View (F3)'))
    await flush()
    expect(api.ReadTextFile).toHaveBeenCalledWith('/a/x.txt')
    await key({ key: 'Escape' })
    await flush()
    fireEvent.click(screen.getByTitle('Edit (F4)'))
    expect(await findSurfaceWithText('hello content')).toBeTruthy()
  })

  it('AP-32: 툴바 New File/Search/압축/압축 풀기 버튼', async () => {
    await renderApp()
    fireEvent.click(screen.getByTitle('New File'))
    expect(screen.getByPlaceholderText('file.txt')).toBeTruthy()
    await key({ key: 'Escape' })
    act(() => useFileStore.getState().toggleSelect('left', '/a/x.txt'))
    fireEvent.click(screen.getByTitle('압축하기'))
    await flush()
    expect(api.CompressItems).toHaveBeenCalledWith(['/a/x.txt'], '/a/archive.zip')
    cursorTo('x.txt')
    fireEvent.click(screen.getByTitle('압축 풀기'))
    await flush()
    expect(api.ExtractArchive).toHaveBeenCalledWith('/a/x.txt', '/a')
    fireEvent.click(screen.getByTitle('Search'))
    await flush()
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0)
  })

  it('AP-33: 폴더에서 압축 풀기는 호출 안 함', async () => {
    await renderApp()
    cursorTo('sub')
    fireEvent.click(screen.getByTitle('압축 풀기'))
    await flush()
    expect(api.ExtractArchive).not.toHaveBeenCalled()
  })

  it('AP-34: Ctrl+D 북마크 대화상자 → GetFileBookmarks', async () => {
    await renderApp()
    await key({ key: 'd', ctrlKey: true })
    await flush()
    expect(api.GetFileBookmarks).toHaveBeenCalled()
  })

  it('AP-35: 테마 토글 버튼으로 data-theme 변경', async () => {
    const { container } = await renderApp()
    const before = container.firstChild.getAttribute('data-theme')
    fireEvent.click(screen.getByLabelText('Toggle theme'))
    expect(container.firstChild.getAttribute('data-theme')).not.toBe(before)
    fireEvent.click(screen.getByLabelText('Toggle theme'))
  })

  it('AP-36: 오버레이가 열려 있으면 F5 무시', async () => {
    await renderApp()
    await key({ key: 'F1' })
    await key({ key: 'F5' })
    expect(api.CheckCopyConflicts).not.toHaveBeenCalled()
  })
})

// ─── Todo #119: 키보드 소유권 — 터미널 안에서 누른 앱 전역 단축키는 무시 ─────────
describe('App 키보드 소유권 (KO)', () => {
  afterEach(() => cleanup())

  it('KO-10: 터미널 안에서 F9 / Ctrl+O / Ctrl+M은 앱이 처리하지 않음', async () => {
    await renderApp()
    const root = document.createElement('div')
    root.className = 'xterm'
    const ta = document.createElement('textarea')
    root.appendChild(ta)
    document.body.appendChild(root)
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'F9' })
      fireEvent.keyDown(ta, { key: 'o', ctrlKey: true })
      fireEvent.keyDown(ta, { key: 'm', ctrlKey: true })
      fireEvent.keyDown(ta, { key: 'M', ctrlKey: true, shiftKey: true })
    })
    expect(api.OpenCmdWindow).not.toHaveBeenCalled()
    expect(api.CreateStarlarkScratchFile).not.toHaveBeenCalled()
    // 셸 대화상자 입력창이 열리지 않음 (가짜 터미널 textarea는 제외)
    expect(screen.queryAllByRole('textbox').filter(el => el !== ta)).toEqual([])
    root.remove()
  })
})

// ─── Todo #120: Terminal 보기 ─────────────────────────────────────────────────
describe('App Terminal 보기 (TV)', () => {
  afterEach(() => cleanup())

  it('TV-01: Terminal 버튼 → 터미널 작업 공간(연결 대화상자)이 처음 열 때 로드됨', async () => {
    await renderApp()
    expect(document.querySelector('[data-terminal-root]')).toBeNull()
    fireEvent.click(screen.getByTitle('Terminal'))
    expect(await screen.findByLabelText('Host')).toBeTruthy()
    expect(document.querySelector('[data-terminal-root]')).toBeTruthy()
  })

  it('TV-02: 다른 보기로 가도 터미널은 마운트 유지(숨김), 파일 패널 다시 표시', async () => {
    await renderApp()
    fireEvent.click(screen.getByTitle('Terminal'))
    await screen.findByLabelText('Host')
    fireEvent.click(screen.getByTitle('File Manager'))
    const root = document.querySelector('[data-terminal-root]')
    expect(root).toBeTruthy()
    expect(root.closest('[hidden]')).toBeTruthy()
    expect(screen.getByText('y.txt')).toBeTruthy()
  })

  it('TV-03: Terminal 보기에서는 파일 관리자 F키 단축키가 동작하지 않음', async () => {
    await renderApp()
    fireEvent.click(screen.getByTitle('Terminal'))
    await screen.findByLabelText('Host')
    await key({ key: 'F8' })
    expect(screen.queryByText('휴지통으로 이동')).toBeNull()
  })
})

// ─── Todo #122: 하단 터미널 도크 ──────────────────────────────────────────────
describe('App 터미널 도크 (DKA)', () => {
  let term
  beforeEach(() => {
    try { localStorage.removeItem(DOCK_PREFS_KEY) } catch { /* 없음 */ }
    useDockStore.getState().resetForTest()
    const ok = () => vi.fn().mockResolvedValue(undefined)
    term = { GetSettings: vi.fn().mockResolvedValue({}), Connect: vi.fn().mockResolvedValue('local'), Send: ok(), Resize: ok(), CloseTab: ok(), Disconnect: ok() }
    setTermBackend(term, { EventsOn: () => () => {}, ClipboardSetText: vi.fn() })
  })
  afterEach(() => { cleanup(); stopEventRouter(); setTermBackend(null) })
  // 숨긴 도크도 찾도록 (getByRole은 hidden을 건너뜀)
  const dock = () => document.querySelector('[aria-label="터미널 도크"]')

  it('DKA-01: F9 → 도크가 처음 열 때 로드되고 활성 패널 폴더에서 셸 시작, 다시 F9로 닫힘(셸 유지)', async () => {
    await renderApp()
    expect(dock()).toBeNull()
    await key({ key: 'F9' })
    await waitFor(() => expect(dock()).toBeTruthy())
    await waitFor(() => expect(term.Connect).toHaveBeenCalledWith(DOCK_ID_BASE, expect.objectContaining({ host: 'cmd', dir: '/a' })))
    expect(api.OpenCmdWindow).not.toHaveBeenCalled()
    await key({ key: 'F9' })
    expect(dock().closest('[hidden]')).toBeTruthy()
    expect(term.CloseTab).not.toHaveBeenCalled()
    expect(screen.getByText('y.txt')).toBeTruthy()
  })

  it('DKA-02: F키 막대 Term(F9) 버튼도 도크 토글', async () => {
    await renderApp()
    fireEvent.click(screen.getByTitle('Term (F9)'))
    await waitFor(() => expect(dock()).toBeTruthy())
    expect(useDockStore.getState().open).toBe(true)
  })

  it('DKA-03: 패널에서 Ctrl+Enter → 커서 파일 이름, Ctrl+Shift+Enter → 전체 경로를 셸에 붙여넣기', async () => {
    await renderApp()
    await key({ key: 'F9' })
    await waitFor(() => expect(term.Connect).toHaveBeenCalled())
    await flush()
    cursorTo('y.txt')
    const panel = document.activeElement?.closest?.('[tabindex]') ?? document.body
    await act(async () => { fireEvent.keyDown(screen.getByText('y.txt'), { key: 'Enter', ctrlKey: true }) })
    await waitFor(() => expect(term.Send).toHaveBeenCalledWith(DOCK_ID_BASE, 'y.txt '))
    await act(async () => { fireEvent.keyDown(screen.getByText('y.txt'), { key: 'Enter', ctrlKey: true, shiftKey: true }) })
    await waitFor(() => expect(term.Send).toHaveBeenCalledWith(DOCK_ID_BASE, '/a/y.txt '))
    expect(api.ReadTextFile).not.toHaveBeenCalled() // 파일을 열지 않음
    void panel
  })

  it('DKA-04: 도크가 닫혀 있어도 Ctrl+Enter는 도크를 열고 셸이 뜬 뒤 붙여넣기', async () => {
    await renderApp()
    cursorTo('x.txt')
    await act(async () => { fireEvent.keyDown(screen.getByText('y.txt'), { key: 'Enter', ctrlKey: true }) })
    await waitFor(() => expect(term.Send).toHaveBeenCalledWith(DOCK_ID_BASE, 'x.txt '))
    expect(useDockStore.getState().open).toBe(true)
  })

  it('DKA-05: 도크는 파일 보기에서만 — Terminal 보기로 가면 숨김', async () => {
    await renderApp()
    await key({ key: 'F9' })
    await waitFor(() => expect(dock()).toBeTruthy())
    fireEvent.click(screen.getByTitle('Terminal'))
    await screen.findByLabelText('Host')
    expect(dock().closest('[hidden]')).toBeTruthy()
    fireEvent.click(screen.getByTitle('File Manager'))
    expect(dock().closest('[hidden]')).toBeNull()
  })
})

// ─── Todo #123: 원격 파일도 App의 뷰어/에디터로 ───────────────────────────────
describe('App 원격 보기 (AV)', () => {
  afterEach(() => { cleanup(); useEditorStore.getState().reset() })
  const src = () => ({ remote: true, read: vi.fn().mockResolvedValue('remote body'), write: vi.fn().mockResolvedValue(), readImage: vi.fn(), label: p => `srv:${p}`, note: () => '' })

  it('AV-01: 스토어로 연 원격 파일 → 뷰어 표시, 닫으면 onClose (파일 패널 포커스 대신)', async () => {
    await renderApp()
    const onClose = vi.fn()
    const s = src()
    await act(async () => { useEditorStore.getState().openViewer('/r/a.txt', { source: s, onClose }) })
    await findSurfaceWithText('remote body')
    expect(screen.getByText('srv:/r/a.txt')).toBeTruthy()
    expect(api.ReadTextFile).not.toHaveBeenCalled()
    await key({ key: 'Escape' })
    await waitFor(() => expect(useEditorStore.getState().viewer).toBeNull())
    expect(onClose).toHaveBeenCalled()
  })

  it('AV-02: 원격 뷰어에서 F4 → 같은 소스로 에디터', async () => {
    await renderApp()
    const s = src()
    await act(async () => { useEditorStore.getState().openViewer('/r/a.txt', { source: s }) })
    await findSurfaceWithText('remote body')
    await key({ key: 'F4' })
    await waitFor(() => expect(useEditorStore.getState().editor?.source).toBe(s))
  })

  it('AV-03: 로컬 F3/F4는 그대로 스토어를 거쳐 열림', async () => {
    await renderApp()
    cursorTo('x.txt')
    await key({ key: 'F3' })
    await waitFor(() => expect(useEditorStore.getState().viewer?.path).toBe('/a/x.txt'))
    expect(useEditorStore.getState().viewer.source).toBeUndefined()
  })
})

// ─── Todo #124: 브라우저 화면(웹 서버) — 터미널만 ───────────────────────────────
describe('App 웹 화면 (WM)', () => {
  afterEach(() => { cleanup(); delete window.__cbt; setTermBackend(null); stopEventRouter() })

  it('WM-01: window.__cbt가 있으면 파일 관리자 없이 터미널만', async () => {
    window.__cbt = { platform: 'windows', arch: 'amd64' }
    setTermBackend({ GetSettings: vi.fn().mockResolvedValue({}), GetHistory: vi.fn().mockResolvedValue([]), GetSessions: vi.fn().mockResolvedValue([]),
      GetSSHConfigHosts: vi.fn().mockResolvedValue([]), GetLocalShells: vi.fn().mockResolvedValue([]), GetSerialPorts: vi.fn().mockResolvedValue([]),
      GetLanguage: vi.fn().mockResolvedValue('ko'), CloseTab: vi.fn().mockResolvedValue() }, { EventsOn: () => () => {} })
    render(h(App))
    expect(await screen.findByLabelText('Host')).toBeTruthy()
    expect(api.LoadPanelPaths).not.toHaveBeenCalled()
    expect(screen.queryByTitle('File Manager')).toBeNull()
  })

  it('WM-02: 창 닫기 확인은 파일 관리자 화면에 항상 붙어 있음 (터미널 보기를 안 열어도)', async () => {
    const handlers = {}
    setTermBackend({ Quit: vi.fn().mockResolvedValue() }, { EventsOn: (n, fn) => { handlers[n] = fn; return () => {} } })
    await renderApp()
    act(() => handlers['app:close']())
    expect(screen.getByRole('dialog', { name: '종료' })).toBeTruthy()
  })
})

// ─── Todo #126: 앱 단축키는 파일 보기에서만, 입력 칸에서는 무시 ───────────────────
describe('App 단축키 범위 (SC)', () => {
  afterEach(() => cleanup())

  it('SC-01: FTP 보기에서 Ctrl+O·Ctrl+M·F9·Shift+F9는 숨은 파일 패널에 작용하지 않음', async () => {
    await renderApp()
    fireEvent.click(screen.getByTitle('FTP Manager'))
    await key({ key: 'o', ctrlKey: true })
    await key({ key: 'm', ctrlKey: true })
    await key({ key: 'M', ctrlKey: true, shiftKey: true })
    await key({ key: 'F9' })
    await key({ key: 'F9', shiftKey: true })
    await flush()
    expect(screen.queryByText('Shell Command')).toBeNull()
    expect(api.CreateStarlarkScratchFile).not.toHaveBeenCalled()
    expect(api.OpenCmdWindow).not.toHaveBeenCalled()
    expect(useDockStore.getState().open).toBe(false)
  })

  it('SC-02: 입력 칸 안의 Ctrl+O·Ctrl+M은 그 칸의 키', async () => {
    await renderApp()
    const input = document.createElement('input')
    document.body.appendChild(input)
    await act(async () => {
      fireEvent.keyDown(input, { key: 'o', ctrlKey: true })
      fireEvent.keyDown(input, { key: 'm', ctrlKey: true })
      fireEvent.keyDown(input, { key: 'M', ctrlKey: true, shiftKey: true })
    })
    expect(api.CreateStarlarkScratchFile).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('textbox').filter(el => el !== input)).toEqual([])
    input.remove()
  })

  it('SC-03: F키 막대도 FTP 보기에서는 Copy 등이 꺼짐', async () => {
    await renderApp()
    fireEvent.click(screen.getByTitle('FTP Manager'))
    expect(screen.getByText('Copy').closest('button').disabled).toBe(true)
    fireEvent.click(screen.getByTitle('File Manager'))
    expect(screen.getByText('Copy').closest('button').disabled).toBe(false)
  })
})

// ─── Todo #126: 대화상자를 닫으면 연 곳으로 포커스 ────────────────────────────────
describe('App 포커스 복귀 (AF)', () => {
  afterEach(() => cleanup())

  it('AF-01: FTP 보기에서 F1 도움말을 닫으면 원래 있던 곳으로 (숨은 파일 패널이 아니라)', async () => {
    await renderApp()
    fireEvent.click(screen.getByTitle('FTP Manager'))
    const here = document.createElement('button')
    here.textContent = 'ftp-here'
    document.body.appendChild(here)
    here.focus()
    await key({ key: 'F1' })
    expect(screen.getByText(/도움말 — Chobocho Commander/)).toBeTruthy()
    await key({ key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(here))
    here.remove()
  })

  it('AF-02: 연 곳이 사라졌으면 활성 파일 패널로', async () => {
    await renderApp()
    const gone = document.createElement('button')
    document.body.appendChild(gone)
    gone.focus()
    await key({ key: 'F1' })
    gone.remove()
    await key({ key: 'Escape' })
    await waitFor(() => expect(document.activeElement?.closest('[data-panel], [tabindex]')).toBeTruthy())
    expect(document.activeElement).not.toBe(document.body)
  })
})
