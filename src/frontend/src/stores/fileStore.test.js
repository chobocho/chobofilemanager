import { describe, it, expect, beforeEach, vi } from 'vitest'
import { joinPath } from './fileStore.js'

// wailsjs/runtime mock (store 동기 테스트에 필요)
vi.mock('../wailsjs/runtime', () => ({
  default: {
    GetHomeDirectory: vi.fn(),
    GetDrives: vi.fn(),
    ListDirectory: vi.fn(),
    GetParentPath: vi.fn(),
    CopyItems: vi.fn(),
    MoveItems: vi.fn(),
    DeleteItems: vi.fn(),
    CreateDirectory: vi.fn(),
    CreateFile: vi.fn(),
    RenameItem: vi.fn(),
    CompressItems: vi.fn(),
    ExtractArchive: vi.fn(),
    OpenFile: vi.fn(),
    ReadTextFile: vi.fn(),
    WriteTextFile: vi.fn(),
  }
}))

// ─── BreadcrumbPath 경로 구성 로직 (FilePanel.jsx와 동일) ──────────────────────
function buildBreadcrumbParts(path) {
  const parts = []
  const segments = path.replace(/\\/g, '/').split('/')
  let acc = ''

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (i === 0 && seg === '') {
      acc = '/'
      parts.push({ name: '/', path: '/' })
      continue
    }
    if (!seg) continue
    if (i === 0 && /^[A-Za-z]:$/.test(seg)) {
      acc = seg + '/'
      parts.push({ name: seg, path: acc })
      continue
    }
    acc = acc.endsWith('/') ? `${acc}${seg}` : `${acc}/${seg}`
    parts.push({ name: seg, path: acc })
  }
  return parts
}

// ─── joinPath 단위 테스트 ──────────────────────────────────────────────────────

describe('joinPath', () => {
  // Unix 경로
  it('JP-01: Unix 경로에 이름을 결합한다', () => {
    expect(joinPath('/home/user', 'file.txt')).toBe('/home/user/file.txt')
  })

  it('JP-02: Unix 경로 끝에 슬래시가 있어도 중복 없이 결합한다', () => {
    expect(joinPath('/home/user/', 'file.txt')).toBe('/home/user/file.txt')
  })

  it('JP-03: Unix 루트 경로에 결합한다', () => {
    expect(joinPath('/', 'tmp')).toBe('/tmp')
  })

  // Windows 경로
  it('JP-04: Windows 경로에 이름을 결합한다', () => {
    expect(joinPath('C:\\Users\\user', 'file.txt')).toBe('C:\\Users\\user\\file.txt')
  })

  it('JP-05: Windows 경로 끝에 역슬래시가 있어도 중복 없이 결합한다', () => {
    expect(joinPath('C:\\Users\\user\\', 'file.txt')).toBe('C:\\Users\\user\\file.txt')
  })

  it('JP-06: Windows 드라이브 루트에 결합한다', () => {
    expect(joinPath('C:\\', 'Documents')).toBe('C:\\Documents')
  })

  it('JP-07: 디렉토리 이름을 결합한다 (Unix)', () => {
    expect(joinPath('/home/user', 'new_folder')).toBe('/home/user/new_folder')
  })

  it('JP-08: 디렉토리 이름을 결합한다 (Windows)', () => {
    expect(joinPath('D:\\Projects', 'my_app')).toBe('D:\\Projects\\my_app')
  })
})

// ─── BreadcrumbPath 경로 구성 테스트 ──────────────────────────────────────────

describe('BreadcrumbPath 경로 구성', () => {
  it('BC-01: Unix 경로의 첫 번째 파트가 "/" 이다', () => {
    const parts = buildBreadcrumbParts('/home/user/docs')
    expect(parts[0].path).toBe('/')
    expect(parts[0].name).toBe('/')
  })

  it('BC-02: Unix 경로 파트들이 올바르게 누적된다', () => {
    const parts = buildBreadcrumbParts('/home/user/docs')
    expect(parts.map(p => p.path)).toEqual(['/', '/home', '/home/user', '/home/user/docs'])
  })

  it('BC-03: Windows 드라이브 루트가 "/C:" 가 아닌 "C:/" 로 시작한다 (핵심 버그 수정)', () => {
    const parts = buildBreadcrumbParts('C:\\github\\temp')
    expect(parts[0].path).toBe('C:/')
    expect(parts[0].path).not.toBe('/C:')
  })

  it('BC-04: Windows 경로 파트들이 올바르게 누적된다', () => {
    const parts = buildBreadcrumbParts('C:\\github\\temp')
    expect(parts.map(p => p.path)).toEqual(['C:/', 'C:/github', 'C:/github/temp'])
  })

  it('BC-05: Windows 다른 드라이브도 올바르게 처리한다 (D:)', () => {
    const parts = buildBreadcrumbParts('D:\\Projects\\myapp')
    expect(parts[0].path).toBe('D:/')
    expect(parts.map(p => p.path)).toEqual(['D:/', 'D:/Projects', 'D:/Projects/myapp'])
  })

  it('BC-06: Windows 경로에서 중간에 슬래시 혼용도 처리한다', () => {
    const parts = buildBreadcrumbParts('C:/Users/user/Documents')
    expect(parts[0].path).toBe('C:/')
    expect(parts[1].path).toBe('C:/Users')
  })
})

// ─── rename 경로 구성 로직 테스트 ─────────────────────────────────────────────

describe('rename 경로 구성', () => {
  // rename 함수 내부와 동일한 로직
  function buildRenamePath(oldPath, newName) {
    const lastSep = Math.max(oldPath.lastIndexOf('/'), oldPath.lastIndexOf('\\'))
    return oldPath.substring(0, lastSep + 1) + newName
  }

  it('RP-01: Unix 경로에서 파일명을 교체한다', () => {
    expect(buildRenamePath('/home/user/old.txt', 'new.txt')).toBe('/home/user/new.txt')
  })

  it('RP-02: Unix 경로에서 확장자 변경도 처리한다', () => {
    expect(buildRenamePath('/home/user/doc.md', 'doc.txt')).toBe('/home/user/doc.txt')
  })

  it('RP-03: Windows 경로에서 파일명을 교체한다', () => {
    expect(buildRenamePath('C:\\Users\\user\\old.txt', 'new.txt')).toBe('C:\\Users\\user\\new.txt')
  })

  it('RP-04: Windows 중첩 경로에서 파일명을 교체한다', () => {
    expect(buildRenamePath('D:\\Projects\\app\\main.go', 'app.go')).toBe('D:\\Projects\\app\\app.go')
  })

  it('RP-05: 디렉토리 이름을 교체한다 (Unix)', () => {
    expect(buildRenamePath('/home/user/old_folder', 'new_folder')).toBe('/home/user/new_folder')
  })

  it('RP-06: 디렉토리 이름을 교체한다 (Windows)', () => {
    expect(buildRenamePath('C:\\Users\\user\\old_folder', 'new_folder')).toBe('C:\\Users\\user\\new_folder')
  })
})

// ─── [..] 상위 디렉토리 표시 여부 (isAtRoot / showParent) ──────────────────────

describe('[..] 표시 로직 (isAtRoot)', () => {
  function isAtRoot(path) {
    return path === '/' || /^[A-Za-z]:[\\/]?$/.test(path)
  }
  const showParent = (path) => !isAtRoot(path)

  it('PR-01: Unix 루트("/")에서는 [..] 를 표시하지 않는다', () => {
    expect(showParent('/')).toBe(false)
  })

  it('PR-02: Windows 드라이브 루트("C:\\")에서는 [..] 를 표시하지 않는다', () => {
    expect(showParent('C:\\')).toBe(false)
  })

  it('PR-03: Windows 드라이브 루트("C:/")에서는 [..] 를 표시하지 않는다', () => {
    expect(showParent('C:/')).toBe(false)
  })

  it('PR-04: Windows 드라이브 루트("C:")에서는 [..] 를 표시하지 않는다', () => {
    expect(showParent('C:')).toBe(false)
  })

  it('PR-05: Unix 하위 디렉토리에서는 [..] 를 표시한다', () => {
    expect(showParent('/home/user')).toBe(true)
  })

  it('PR-06: Windows 하위 디렉토리에서는 [..] 를 표시한다', () => {
    expect(showParent('C:\\Users\\user')).toBe(true)
  })
})

// ─── fileStore 동기 작업 단위 테스트 ────────────────────────────────────────────

describe('fileStore 동기 작업', () => {
  let useFileStore

  const makeFiles = (...names) => names.map((name, i) => ({
    name,
    path: `/test/${name}`,
    isDir: name.endsWith('/'),
    isHidden: name.startsWith('.'),
    size: 100 * (i + 1),
    modified: '2026-01-01T00:00:00Z',
    extension: name.includes('.') ? '.' + name.split('.').pop() : '',
  }))

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./fileStore.js')
    useFileStore = mod.useFileStore
    // 왼쪽 패널에 테스트 파일 세팅
    useFileStore.setState(s => ({
      activePanel: 'left',
      left: {
        ...s.left,
        path: '/test',
        files: makeFiles('alpha.txt', 'beta.js', 'gamma.go'),
        selected: new Set(),
        cursor: 0,
        showHidden: false,
        sortBy: 'name',
        sortDir: 'asc',
      }
    }))
  })

  // toggleSelect
  it('SS-01: toggleSelect - 파일 경로를 selected에 추가한다', () => {
    const { toggleSelect } = useFileStore.getState()
    toggleSelect('left', '/test/alpha.txt')
    expect(useFileStore.getState().left.selected.has('/test/alpha.txt')).toBe(true)
  })

  it('SS-02: toggleSelect - 이미 선택된 경로를 다시 호출하면 선택 해제된다', () => {
    useFileStore.setState(s => ({ left: { ...s.left, selected: new Set(['/test/alpha.txt']) } }))
    useFileStore.getState().toggleSelect('left', '/test/alpha.txt')
    expect(useFileStore.getState().left.selected.has('/test/alpha.txt')).toBe(false)
  })

  it('SS-03: toggleSelect - 복수 파일을 각각 선택할 수 있다', () => {
    useFileStore.getState().toggleSelect('left', '/test/alpha.txt')
    useFileStore.getState().toggleSelect('left', '/test/beta.js')
    expect(useFileStore.getState().left.selected.size).toBe(2)
  })

  // selectAll
  it('SS-04: selectAll - 패널의 모든 파일이 selected에 추가된다', () => {
    useFileStore.getState().selectAll('left')
    const selected = useFileStore.getState().left.selected
    expect(selected.size).toBe(3)
    expect(selected.has('/test/alpha.txt')).toBe(true)
    expect(selected.has('/test/gamma.go')).toBe(true)
  })

  // clearSelection
  it('SS-05: clearSelection - selected가 빈 Set이 된다', () => {
    useFileStore.setState(s => ({
      left: { ...s.left, selected: new Set(['/test/alpha.txt', '/test/beta.js']) }
    }))
    useFileStore.getState().clearSelection('left')
    expect(useFileStore.getState().left.selected.size).toBe(0)
  })

  // setCursor
  it('SS-06: setCursor - 커서 인덱스가 갱신된다', () => {
    useFileStore.getState().setCursor('left', 2)
    expect(useFileStore.getState().left.cursor).toBe(2)
  })

  it('SS-07: setCursor - 0으로 다시 이동할 수 있다', () => {
    useFileStore.setState(s => ({ left: { ...s.left, cursor: 2 } }))
    useFileStore.getState().setCursor('left', 0)
    expect(useFileStore.getState().left.cursor).toBe(0)
  })

  // toggleHidden
  it('SS-08: toggleHidden - showHidden이 false → true로 전환된다', () => {
    useFileStore.setState(s => ({ left: { ...s.left, showHidden: false } }))
    useFileStore.getState().toggleHidden('left')
    expect(useFileStore.getState().left.showHidden).toBe(true)
  })

  it('SS-09: toggleHidden - showHidden이 true → false로 전환된다', () => {
    useFileStore.setState(s => ({ left: { ...s.left, showHidden: true } }))
    useFileStore.getState().toggleHidden('left')
    expect(useFileStore.getState().left.showHidden).toBe(false)
  })

  // setSort
  it('SS-10: setSort("name") - 이름 기준 오름차순 정렬된다', () => {
    const files = makeFiles('gamma.go', 'alpha.txt', 'beta.js')
    useFileStore.setState(s => ({ left: { ...s.left, files, sortBy: 'size', sortDir: 'asc' } }))
    useFileStore.getState().setSort('left', 'name')
    const names = useFileStore.getState().left.files.map(f => f.name)
    expect(names).toEqual(['alpha.txt', 'beta.js', 'gamma.go'])
  })

  it('SS-11: setSort - 같은 키 재클릭 시 내림차순으로 토글된다', () => {
    useFileStore.setState(s => ({ left: { ...s.left, sortBy: 'name', sortDir: 'asc' } }))
    useFileStore.getState().setSort('left', 'name')
    expect(useFileStore.getState().left.sortDir).toBe('desc')
  })

  it('SS-12: setSort - 디렉토리가 파일보다 앞에 정렬된다', () => {
    const mixed = [
      { name: 'zfile.txt', path: '/test/zfile.txt', isDir: false, size: 100, modified: '', extension: '.txt' },
      { name: 'adir/',     path: '/test/adir/',     isDir: true,  size: 0,   modified: '', extension: '' },
      { name: 'bfile.go',  path: '/test/bfile.go',  isDir: false, size: 200, modified: '', extension: '.go' },
    ]
    useFileStore.setState(s => ({ left: { ...s.left, files: mixed, sortBy: 'size', sortDir: 'desc' } }))
    useFileStore.getState().setSort('left', 'name')
    const result = useFileStore.getState().left.files
    expect(result[0].isDir).toBe(true)   // 디렉토리 항상 첫 번째
    expect(result[0].name).toBe('adir/')
  })

  // delete (동기 - 경로 수집 로직)
  it('SS-13: delete - selected 파일 경로와 개수를 반환한다', async () => {
    useFileStore.setState(s => ({
      left: { ...s.left, selected: new Set(['/test/alpha.txt', '/test/beta.js']) }
    }))
    const result = await useFileStore.getState().delete()
    expect(result.count).toBe(2)
    expect(result.paths).toContain('/test/alpha.txt')
    expect(result.paths).toContain('/test/beta.js')
  })

  it('SS-14: delete - selected가 없으면 커서 위치 파일을 반환한다', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, selected: new Set(), cursor: 1 } }))
    const result = await useFileStore.getState().delete()
    expect(result.count).toBe(1)
    expect(result.paths[0]).toBe('/test/beta.js')
  })

  it('SS-15: delete - 파일도 선택도 없으면 빈 목록을 반환한다', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, files: [], selected: new Set(), cursor: 0 } }))
    const result = await useFileStore.getState().delete()
    expect(result.count).toBe(0)
    expect(result.paths).toHaveLength(0)
  })
})
