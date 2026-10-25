import { describe, it, expect, beforeEach, vi } from 'vitest'

// 가상 파일 시스템: 경로 → 파일 목록
const fs = {}
const f = (dir, name, extra = {}) => ({
  name, path: dir.replace(/\/$/, '') + '/' + name, isDir: false, isHidden: false,
  size: 1, modified: '2026-01-01T00:00:00Z', extension: '.' + name.split('.').pop(), ...extra,
})
const d = (dir, name, extra = {}) => f(dir, name, { isDir: true, extension: '', ...extra })

vi.mock('../wailsjs/runtime', () => {
  const api = {
    GetHomeDirectory: vi.fn(),
    GetDrives: vi.fn(),
    LoadPanelPaths: vi.fn(),
    ListDirectory: vi.fn(),
    GetParentPath: vi.fn(),
    CheckCopyConflicts: vi.fn(),
    CopyItems: vi.fn(),
    CopyItemsRename: vi.fn(),
    CopyItemsSkipConflicts: vi.fn(),
    MoveItems: vi.fn(),
    MoveItemsOverwrite: vi.fn(),
    MoveItemsRename: vi.fn(),
    DeleteItems: vi.fn(),
    TrashItems: vi.fn(),
    CreateDirectory: vi.fn(),
    CreateFile: vi.fn(),
    RenameItem: vi.fn(),
    CompressItems: vi.fn(),
    ExtractArchive: vi.fn(),
    OpenFile: vi.fn(),
    ReadTextFile: vi.fn(),
    ReadTextFileWithEncoding: vi.fn(),
    ReadImageFile: vi.fn(),
    WriteTextFile: vi.fn(),
    WriteTextFileWithEncoding: vi.fn(),
    ChangeWorkingDirectory: vi.fn(),
    SaveSessionState: vi.fn(),
  }
  return { default: api }
})

import api from '../wailsjs/runtime'
import { useFileStore, sortFiles, getCursorFile } from './fileStore.js'

const initial = useFileStore.getState()

function resetApi() {
  for (const fn of Object.values(api)) fn.mockReset()
  api.ListDirectory.mockImplementation(async (p) => {
    if (!(p in fs)) throw new Error('not found: ' + p)
    return { path: p, files: fs[p] }
  })
  api.ChangeWorkingDirectory.mockResolvedValue(undefined)
  api.SaveSessionState.mockResolvedValue(undefined)
  api.CheckCopyConflicts.mockResolvedValue([])
  for (const k of ['CopyItems', 'CopyItemsRename', 'CopyItemsSkipConflicts', 'MoveItems',
    'MoveItemsOverwrite', 'MoveItemsRename', 'DeleteItems', 'TrashItems', 'CreateDirectory',
    'CreateFile', 'RenameItem', 'CompressItems', 'ExtractArchive', 'OpenFile',
    'WriteTextFile', 'WriteTextFileWithEncoding']) api[k].mockResolvedValue(undefined)
}

function panel(path, files, extra = {}) {
  return {
    ...initial.left, path, files, selected: new Set(), cursor: 0, cursorOnParent: false,
    history: [path], historyIndex: 0, tabs: [{ id: 't0', path }], activeTabIdx: 0, ...extra,
  }
}

beforeEach(() => {
  for (const k of Object.keys(fs)) delete fs[k]
  fs['/a'] = [f('/a', 'x.txt'), f('/a', 'y.txt'), d('/a', 'sub')]
  fs['/b'] = [f('/b', 'x.txt'), f('/b', 'z.txt')]
  fs['/home'] = [d('/home', 'docs')]
  resetApi()
  useFileStore.setState({
    ...initial,
    activePanel: 'left',
    status: '',
    left: panel('/a', sortFiles(fs['/a'])),
    right: panel('/b', sortFiles(fs['/b'])),
  }, true)
})

const st = () => useFileStore.getState()

describe('fileStore 커버리지 — init / 세션 복원', () => {
  it('FC-01: 저장된 세션 없으면 양쪽 패널이 홈으로 이동', async () => {
    api.GetHomeDirectory.mockResolvedValue('/home')
    api.GetDrives.mockResolvedValue([{ name: 'C:', path: 'C:\\' }])
    api.LoadPanelPaths.mockResolvedValue({})
    await st().init()
    expect(st().drives).toHaveLength(1)
    expect(st().left.path).toBe('/home')
    expect(st().right.path).toBe('/home')
    expect(st().left.tabs).toHaveLength(1)
    expect(api.SaveSessionState).toHaveBeenCalled()
  })

  it('FC-02: 저장된 탭 목록/활성 인덱스 복원 (활성 탭만 로딩)', async () => {
    api.GetHomeDirectory.mockResolvedValue('/home')
    api.GetDrives.mockResolvedValue([])
    api.LoadPanelPaths.mockResolvedValue({
      leftTabs: { paths: ['/a', '/b'], activeIdx: 1 },
      rightTabs: { paths: ['/a'], activeIdx: 5 },
    })
    await st().init()
    expect(st().left.tabs.map(t => t.path)).toEqual(['/a', '/b'])
    expect(st().left.activeTabIdx).toBe(1)
    expect(st().left.path).toBe('/b')
    expect(st().right.activeTabIdx).toBe(0) // 범위 밖 인덱스는 보정
    expect(st().right.path).toBe('/a')
    expect(api.ListDirectory).toHaveBeenCalledTimes(2)
  })

  it('FC-03: 레거시 leftPath/rightPath 사용', async () => {
    api.GetHomeDirectory.mockResolvedValue('/home')
    api.GetDrives.mockResolvedValue([])
    api.LoadPanelPaths.mockResolvedValue({ leftPath: '/b', rightPath: '/a' })
    await st().init()
    expect(st().left.path).toBe('/b')
    expect(st().right.path).toBe('/a')
  })
})

describe('fileStore 커버리지 — 패널/정렬/새로고침', () => {
  // Todo #126: 프로세스 작업 폴더(os.Chdir)는 터미널과 함께 쓰므로 패널이 바꾸지 않음 — 작업마다 폴더를 넘김
  it('FC-04: setActivePanel은 활성 패널만 바꾸고 프로세스 작업 폴더는 그대로', () => {
    st().setActivePanel('right')
    expect(st().activePanel).toBe('right')
    expect(api.ChangeWorkingDirectory).not.toHaveBeenCalled()
  })

  it('FC-06: setSort 같은 컬럼 반복 시 asc ↔ desc 토글, 커서 파일 유지', () => {
    // 정렬: sub, x.txt, y.txt → 커서 1 = x.txt
    useFileStore.setState(s => ({ left: { ...s.left, cursor: 1 } }))
    st().setSort('left', 'name')
    expect(st().left.sortDir).toBe('desc')
    const vis = st().left.files
    expect(vis[st().left.cursor].name).toBe('x.txt')
    st().setSort('left', 'name')
    expect(st().left.sortDir).toBe('asc')
    st().setSort('left', 'size')
    expect(st().left.sortBy).toBe('size')
    expect(st().left.sortDir).toBe('asc')
  })

  it('FC-07: refresh 실패 시 error 설정, loading 해제', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, path: '/gone' } }))
    await st().refresh('left')
    expect(st().left.error).toBe('not found: /gone')
    expect(st().left.loading).toBe(false)
  })

  it('FC-08: 문자열 에러도 메시지로 저장', async () => {
    api.ListDirectory.mockRejectedValueOnce('denied')
    await st().navigate('left', '/a')
    expect(st().left.error).toBe('denied')
  })

  it('FC-09: 같은 경로 refresh는 history에 중복 추가 안 함', async () => {
    await st().refresh('left')
    await st().refresh('left')
    expect(st().left.history).toEqual(['/a'])
  })

  // Todo #130-3: 새로 고침(편집 저장·이동 원본 등)이 커서를 첫 줄로, 선택을 비우지 않음
  it('FC-09b: refresh — 커서는 같은 파일로(앞에 새 파일이 생겨도), 남아 있는 선택은 유지', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, cursor: 2, selected: new Set(['/a/x.txt', '/a/sub']) } }))
    fs['/a'] = [f('/a', 'a0.txt'), ...fs['/a']]
    await st().refresh('left')
    const l = st().left
    expect(l.files[l.cursor].name).toBe('y.txt')
    expect([...l.selected].sort()).toEqual(['/a/sub', '/a/x.txt'])
  })

  it('FC-09c: refresh — 커서 파일·선택 파일이 사라지면 같은 자리(끝이면 마지막), 선택에서 빠짐', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, cursor: 2, selected: new Set(['/a/y.txt', '/a/x.txt']) } }))
    fs['/a'] = fs['/a'].filter(e => e.name !== 'y.txt')
    await st().refresh('left')
    const l = st().left
    expect(l.files[l.cursor].name).toBe('x.txt')
    expect([...l.selected]).toEqual(['/a/x.txt'])
  })

  it('FC-09d: refresh — [..]에 있던 커서는 [..]에', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, cursorOnParent: true } }))
    await st().refresh('left')
    expect(st().left.cursorOnParent).toBe(true)
  })

  it('FC-09e: 편집기 저장(writeFile) 뒤에도 커서·선택 유지', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, cursor: 2, selected: new Set(['/a/x.txt']) } }))
    await st().writeFile('/a/y.txt', 'new')
    expect(st().left.files[st().left.cursor].name).toBe('y.txt')
    expect([...st().left.selected]).toEqual(['/a/x.txt'])
  })

  // Todo #130-3: 폴더를 못 읽어 오류만 보이거나 읽는 중이면, 숨은 옛 목록에 작업하지 않음
  it('FC-09f: 오류·로딩 중인 패널 — 복사·이동·삭제·압축 대상 없음, 커서 파일 없음', async () => {
    for (const extra of [{ error: 'cannot read' }, { loading: true }]) {
      resetApi()
      useFileStore.setState(s => ({ left: { ...s.left, cursor: 1, selected: new Set(['/a/x.txt']), ...extra } }))
      expect(getCursorFile(st().left)).toBeNull()
      await st().copy()
      await st().move()
      expect((await st().delete()).paths).toEqual([])
      await st().compress('left')
      for (const k of ['CheckCopyConflicts', 'CopyItems', 'MoveItems', 'CompressItems']) {
        expect(api[k], `${k} ${JSON.stringify(extra)}`).not.toHaveBeenCalled()
      }
      useFileStore.setState(s => ({ left: { ...s.left, error: null, loading: false } }))
    }
  })

  it('FC-10: 패널 이동도 프로세스 작업 폴더를 바꾸지 않음 (활성·비활성 모두)', async () => {
    await st().navigate('right', '/home')
    await st().navigate('left', '/home')
    expect(api.ChangeWorkingDirectory).not.toHaveBeenCalled()
  })

  it('FC-11: setCursorOnParent / clearSelection / toggleSelect', () => {
    st().setCursorOnParent('left', true)
    expect(st().left.cursorOnParent).toBe(true)
    st().toggleSelect('left', '/a/x.txt')
    expect(st().left.selected.has('/a/x.txt')).toBe(true)
    st().toggleSelect('left', '/a/x.txt')
    expect(st().left.selected.size).toBe(0)
    st().toggleSelect('left', '/a/y.txt')
    st().clearSelection('left')
    expect(st().left.selected.size).toBe(0)
  })

  it('FC-12: setStatus / setSearchState 부분 갱신', () => {
    st().setStatus('hello')
    expect(st().status).toBe('hello')
    st().setSearchState({ query: 'abc' })
    st().setSearchState({ recursive: false })
    expect(st().searchState).toEqual({ query: 'abc', recursive: false, results: [] })
  })
})

describe('fileStore 커버리지 — 복사/이동', () => {
  it('FC-13: copy 선택 없음+커서 없음 → 빈 결과, API 호출 없음', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, files: [] } }))
    const r = await st().copy()
    expect(r).toEqual({ conflicts: [], sources: [], dest: '' })
    expect(api.CheckCopyConflicts).not.toHaveBeenCalled()
  })

  it('FC-14: copy 충돌 있으면 CopyItems 호출하지 않고 충돌 반환', async () => {
    api.CheckCopyConflicts.mockResolvedValue(['x.txt'])
    useFileStore.setState(s => ({ left: { ...s.left, cursor: 1 } })) // x.txt
    const r = await st().copy()
    expect(r).toEqual({ conflicts: ['x.txt'], sources: ['/a/x.txt'], dest: '/b' })
    expect(api.CopyItems).not.toHaveBeenCalled()
  })

  it('FC-15: copy 성공 → 대상 패널 refresh + 복사된 파일에 커서', async () => {
    fs['/b'] = [f('/b', 'a1.txt'), f('/b', 'y.txt'), f('/b', 'z.txt')]
    useFileStore.setState(s => ({ left: { ...s.left, selected: new Set(['/a/y.txt']) } }))
    await st().copy()
    expect(api.CopyItems).toHaveBeenCalledWith(['/a/y.txt'], '/b')
    expect(st().right.files).toHaveLength(3)
    expect(st().right.cursor).toBe(1)
    expect(st().status).toBe('Copied 1 item(s)')
  })

  it('FC-16: copy 실패 → 상태에 오류 표시', async () => {
    api.CopyItems.mockRejectedValue('disk full')
    await st().copy()
    expect(st().status).toBe('Copy failed: disk full')
  })

  it.each([
    ['overwrite', 'CopyItems'],
    ['rename', 'CopyItemsRename'],
    ['skip', 'CopyItemsSkipConflicts'],
  ])('FC-17: copyWithMode(%s) → %s 호출', async (mode, fn) => {
    await st().copyWithMode(['/a/x.txt'], '/b', mode)
    expect(api[fn]).toHaveBeenCalledWith(['/a/x.txt'], '/b')
    expect(st().status).toBe('Copied 1 item(s)')
    expect(st().right.cursor).toBe(0)
  })

  it('FC-18: copyWithMode 실패 상태', async () => {
    api.CopyItemsRename.mockRejectedValue('err')
    await st().copyWithMode(['/a/x.txt'], '/b', 'rename')
    expect(st().status).toBe('Copy failed: err')
  })

  it('FC-19: move 성공 → 원본/대상 모두 refresh', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, cursor: 2 } })) // y.txt
    api.MoveItems.mockImplementation(async () => {
      fs['/a'] = fs['/a'].filter(x => x.name !== 'y.txt')
      fs['/b'] = [...fs['/b'], f('/b', 'y.txt')]
    })
    await st().move()
    expect(api.MoveItems).toHaveBeenCalledWith(['/a/y.txt'], '/b')
    expect(st().left.files.map(x => x.name)).not.toContain('y.txt')
    expect(st().right.files.map(x => x.name)).toContain('y.txt')
    expect(st().status).toBe('Moved 1 item(s)')
  })

  it('FC-20: move 충돌/빈 선택/실패', async () => {
    api.CheckCopyConflicts.mockResolvedValueOnce(['x.txt'])
    useFileStore.setState(s => ({ left: { ...s.left, cursor: 1 } }))
    expect((await st().move()).conflicts).toEqual(['x.txt'])
    api.MoveItems.mockRejectedValueOnce('locked')
    await st().move()
    expect(st().status).toBe('Move failed: locked')
    useFileStore.setState(s => ({ left: { ...s.left, cursorOnParent: true } }))
    expect((await st().move()).sources).toEqual([])
  })

  it.each([
    ['overwrite', 'MoveItemsOverwrite'],
    ['rename', 'MoveItemsRename'],
  ])('FC-21: moveWithMode(%s) → %s 호출', async (mode, fn) => {
    await st().moveWithMode(['/a/x.txt'], '/b', mode)
    expect(api[fn]).toHaveBeenCalledWith(['/a/x.txt'], '/b')
    expect(st().status).toBe('Moved 1 item(s)')
  })

  it('FC-22: moveWithMode 실패 상태', async () => {
    api.MoveItemsOverwrite.mockRejectedValue('nope')
    await st().moveWithMode(['/a/x.txt'], '/b', 'overwrite')
    expect(st().status).toBe('Move failed: nope')
  })

  it('FC-23: _focusCopiedFile은 대소문자 무시하고 양쪽 패널에 적용', () => {
    useFileStore.setState(s => ({
      left: { ...s.left, path: '/B', files: fs['/b'], cursor: 0 },
      right: { ...s.right, cursor: 0 },
    }))
    st()._focusCopiedFile('/b', ['/src/z.txt'])
    expect(st().left.cursor).toBe(1)
    expect(st().right.cursor).toBe(1)
  })

  it('FC-24: _focusCopiedFile 이름 못 찾으면 커서 유지', () => {
    useFileStore.setState(s => ({ right: { ...s.right, cursor: 1 } }))
    st()._focusCopiedFile('/b', ['/src/none.txt'])
    expect(st().right.cursor).toBe(1)
  })
})

describe('fileStore 커버리지 — 삭제/생성/이름변경/압축', () => {
  it('FC-25: confirmDelete 성공 → DeleteItems, 커서 위로 이동', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, cursor: 2 } }))
    api.DeleteItems.mockImplementation(async () => { fs['/a'] = fs['/a'].filter(x => x.name !== 'y.txt') })
    await st().confirmDelete(['/a/y.txt'])
    expect(api.DeleteItems).toHaveBeenCalledWith(['/a/y.txt'])
    expect(st().status).toBe('Deleted 1 item(s)')
    expect(st().left.cursor).toBe(1)
  })

  it('FC-26: confirmDelete 실패 → 예외 전파 + 상태', async () => {
    api.DeleteItems.mockRejectedValue('perm')
    await expect(st().confirmDelete(['/a/x.txt'])).rejects.toBe('perm')
    expect(st().status).toBe('Delete failed: perm')
  })

  it('FC-27: 모두 삭제되어 빈 폴더 → 커서가 [..]', async () => {
    api.TrashItems.mockImplementation(async () => { fs['/a'] = [] })
    await st().confirmTrash(fs['/a'].map(x => x.path))
    expect(st().left.cursorOnParent).toBe(true)
    expect(st().status).toMatch(/Recycle Bin/)
  })

  it('FC-28: delete 대상 없음 → 상태 메시지', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, files: [] } }))
    const r = await st().delete()
    expect(r.count).toBe(0)
    expect(st().status).toBe('삭제할 파일이 없습니다.')
  })

  it('FC-29: createDirectory 성공 시 새 폴더에 커서, 실패 시 throw', async () => {
    api.CreateDirectory.mockImplementation(async () => { fs['/a'] = [...fs['/a'], d('/a', 'newdir')] })
    await st().createDirectory('left', 'newdir')
    expect(api.CreateDirectory).toHaveBeenCalledWith('/a/newdir')
    expect(st().left.files[st().left.cursor].name).toBe('newdir')
    api.CreateDirectory.mockRejectedValueOnce('exists')
    await expect(st().createDirectory('left', 'q')).rejects.toBe('exists')
    expect(st().status).toBe('Create directory failed: exists')
  })

  it('FC-30: createFile 실패 시 상태 + throw', async () => {
    api.CreateFile.mockRejectedValueOnce('bad')
    await expect(st().createFile('left', 'n.txt')).rejects.toBe('bad')
    expect(st().status).toBe('Create file failed: bad')
  })

  it('FC-31: rename 성공 → 커서 새 이름, Windows 경로 처리', async () => {
    api.RenameItem.mockImplementation(async () => {
      fs['/a'] = fs['/a'].map(x => x.name === 'x.txt' ? f('/a', 'w.txt') : x)
    })
    await st().rename('left', '/a/x.txt', 'w.txt')
    expect(api.RenameItem).toHaveBeenCalledWith('/a/x.txt', '/a/w.txt')
    expect(st().status).toBe('Renamed → w.txt')
    expect(st().left.files[st().left.cursor].name).toBe('w.txt')
    await st().rename('left', 'C:\\dir\\a.txt', 'b.txt')
    expect(api.RenameItem).toHaveBeenLastCalledWith('C:\\dir\\a.txt', 'C:\\dir\\b.txt')
  })

  it('FC-32: rename 실패 상태', async () => {
    api.RenameItem.mockRejectedValue('dup')
    await st().rename('left', '/a/x.txt', 'y.txt')
    expect(st().status).toBe('Rename failed: dup')
  })

  it('FC-33: compress 선택 없으면 무동작, 있으면 archive.zip 생성', async () => {
    await st().compress('left')
    expect(api.CompressItems).not.toHaveBeenCalled()
    useFileStore.setState(s => ({ left: { ...s.left, selected: new Set(['/a/x.txt']) } }))
    await st().compress('left')
    expect(api.CompressItems).toHaveBeenCalledWith(['/a/x.txt'], '/a/archive.zip')
    expect(st().status).toBe('Archive created')
  })

  it('FC-34: compress 실패 상태', async () => {
    api.CompressItems.mockRejectedValue('io')
    useFileStore.setState(s => ({ left: { ...s.left, selected: new Set(['/a/x.txt']) } }))
    await st().compress('left')
    expect(st().status).toBe('Compress failed: io')
  })

  it('FC-35: extract 성공 상태 + refresh', async () => {
    await st().extract('left', '/a/z.zip')
    expect(api.ExtractArchive).toHaveBeenCalledWith('/a/z.zip', '/a')
    expect(st().status).toBe('Extracted successfully')
  })

  it('FC-36: openFile / readFile / readImage / writeFile 위임', async () => {
    await st().openFile('/a/x.txt')
    expect(api.OpenFile).toHaveBeenCalledWith('/a/x.txt')
    api.ReadTextFile.mockResolvedValue('auto')
    api.ReadTextFileWithEncoding.mockResolvedValue('enc')
    expect(await st().readFile('/a/x.txt')).toBe('auto')
    expect(await st().readFile('/a/x.txt', 'auto')).toBe('auto')
    expect(await st().readFile('/a/x.txt', 'euc-kr')).toBe('enc')
    expect(api.ReadTextFileWithEncoding).toHaveBeenCalledWith('/a/x.txt', 'euc-kr')
    api.ReadImageFile.mockResolvedValue('data:x')
    expect(await st().readImage('/a/p.png')).toBe('data:x')
    await st().writeFile('/a/x.txt', 'body')
    expect(api.WriteTextFileWithEncoding).toHaveBeenCalledWith('/a/x.txt', 'body', 'auto')
  })
})

describe('fileStore 커버리지 — 탭', () => {
  it('FC-37: newTab은 현재 경로로 새 탭 추가하고 활성화', async () => {
    await st().newTab('left')
    expect(st().left.tabs).toHaveLength(2)
    expect(st().left.activeTabIdx).toBe(1)
    expect(st().left.tabs[1].path).toBe('/a')
    expect(st().left.path).toBe('/a')
    expect(st().left.history).toEqual(['/a'])
  })

  it('FC-38: closeTab 탭 하나뿐이면 무동작', async () => {
    await st().closeTab('left', 0)
    expect(st().left.tabs).toHaveLength(1)
  })

  it('FC-39: switchTab → 대상 탭 상태 복원 후 경로 로딩', async () => {
    await st().newTab('left')
    await st().navigate('left', '/home')
    await st().switchTab('left', 0)
    expect(st().left.activeTabIdx).toBe(0)
    expect(st().left.path).toBe('/a')
    expect(st().left.tabs[1].path).toBe('/home')
    // 같은 인덱스/범위 밖은 무동작
    await st().switchTab('left', 0)
    await st().switchTab('left', 9)
    expect(st().left.activeTabIdx).toBe(0)
  })

  it('FC-40: 활성 탭 닫기 → 인접 탭으로 전환', async () => {
    await st().newTab('left')
    await st().navigate('left', '/home')
    await st().closeTab('left', 1)
    expect(st().left.tabs).toHaveLength(1)
    expect(st().left.activeTabIdx).toBe(0)
    expect(st().left.path).toBe('/a')
  })

  it('FC-41: 비활성 탭 닫기 → 현재 탭 유지, 인덱스 보정', async () => {
    await st().newTab('left')
    await st().navigate('left', '/home')
    await st().closeTab('left', 0)
    expect(st().left.tabs).toHaveLength(1)
    expect(st().left.activeTabIdx).toBe(0)
    expect(st().left.path).toBe('/home')
    await st().newTab('left')
    await st().closeTab('left', 7) // 범위 밖
    expect(st().left.tabs).toHaveLength(2)
  })

  it('FC-42: switchTab/closeTab 로딩 실패 시 error', async () => {
    await st().newTab('left')
    useFileStore.setState(s => ({
      left: { ...s.left, tabs: [{ ...s.left.tabs[0], path: '/gone' }, s.left.tabs[1]] },
    }))
    await st().switchTab('left', 0)
    expect(st().left.error).toBe('not found: /gone')
    await st().newTab('left') // 경로 '/gone' 탭 추가 (실패)
    useFileStore.setState(s => ({
      left: { ...s.left, tabs: s.left.tabs.map(t => ({ ...t, path: '/gone' })) },
    }))
    await st().closeTab('left', st().left.activeTabIdx)
    expect(st().left.error).toBe('not found: /gone')
    expect(st().left.loading).toBe(false)
  })

  it('FC-43: _saveSession은 탭 경로와 활성 인덱스를 저장', () => {
    st()._saveSession()
    expect(api.SaveSessionState).toHaveBeenCalledWith(['/a'], 0, ['/b'], 0)
  })
})

describe('fileStore 커버리지 — 히스토리 이동', () => {
  it('FC-44: navigateBack → 이전 폴더, 직전 폴더명에 커서; navigateForward', async () => {
    await st().navigate('left', '/home')
    fs['/home/docs'] = []
    await st().navigate('left', '/home/docs')
    await st().navigateBack('left')
    expect(st().left.path).toBe('/home')
    expect(st().left.files[st().left.cursor].name).toBe('docs')
    await st().navigateForward('left')
    expect(st().left.path).toBe('/home/docs')
    await st().navigateForward('left') // 끝이면 무동작
    expect(st().left.path).toBe('/home/docs')
  })

  it('FC-45: _navigateHistory 실패 시 historyIndex 유지', async () => {
    await st().navigate('left', '/home')
    delete fs['/a']
    const before = st().left.historyIndex
    await st().navigateBack('left')
    expect(st().left.historyIndex).toBe(before)
    expect(st().left.error).toMatch(/not found/)
  })

  it('FC-46: navigateUp — 루트면 무동작, 아니면 부모로 이동 + 자식에 커서', async () => {
    api.GetParentPath.mockResolvedValueOnce('/')
    useFileStore.setState(s => ({ left: { ...s.left, path: '/' } }))
    await st().navigateUp('left')
    expect(api.ListDirectory).not.toHaveBeenCalled()
    fs['/home/docs'] = []
    await st().navigate('left', '/home/docs')
    api.GetParentPath.mockResolvedValueOnce('/home')
    await st().navigateUp('left')
    expect(st().left.path).toBe('/home')
    expect(st().left.files[st().left.cursor].name).toBe('docs')
  })
})
