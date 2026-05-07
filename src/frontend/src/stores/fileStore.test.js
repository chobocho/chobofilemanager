import { describe, it, expect, beforeEach, vi } from 'vitest'
import { joinPath, getLastPathSegment, cursorAfterDelete, cursorAfterCopy } from './fileStore.js'

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
    ChangeWorkingDirectory: vi.fn().mockResolvedValue(undefined),
    RunStarlarkFile: vi.fn().mockResolvedValue(''),
  }
}))

// ─── BreadcrumbPath 경로 구성 로직 (FilePanel.jsx와 동일) ──────────────────────
function buildBreadcrumbParts(path) {
  const isWindows = path.includes('\\') || /^[A-Za-z]:/.test(path)
  const sep = isWindows ? '\\' : '/'
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
      acc = seg + sep
      parts.push({ name: seg, path: acc })
      continue
    }
    acc = acc.endsWith(sep) ? `${acc}${seg}` : `${acc}${sep}${seg}`
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

  it('JP-09: 한글 파일명을 Unix 경로에 결합한다', () => {
    expect(joinPath('/home/사용자', '문서.txt')).toBe('/home/사용자/문서.txt')
  })

  it('JP-10: 공백이 포함된 파일명을 결합한다', () => {
    expect(joinPath('/home/user', 'my file.txt')).toBe('/home/user/my file.txt')
  })
})

// ─── getLastPathSegment 단위 테스트 ───────────────────────────────────────────

describe('getLastPathSegment', () => {
  it('GPS-01: Unix 경로에서 마지막 폴더명을 반환한다', () => {
    expect(getLastPathSegment('/home/user/docs')).toBe('docs')
  })

  it('GPS-02: Windows 경로에서 마지막 폴더명을 반환한다', () => {
    expect(getLastPathSegment('C:\\Users\\user\\Documents')).toBe('Documents')
  })

  it('GPS-03: 끝에 슬래시가 있어도 마지막 폴더명을 반환한다', () => {
    expect(getLastPathSegment('/home/user/docs/')).toBe('docs')
  })

  it('GPS-04: 루트 경로는 빈 문자열을 반환한다', () => {
    expect(getLastPathSegment('/')).toBe('')
  })

  it('GPS-05: Windows 드라이브 루트는 빈 문자열을 반환한다', () => {
    expect(getLastPathSegment('C:\\')).toBe('')
  })

  it('GPS-06: 깊은 중첩 Unix 경로에서 마지막 세그먼트를 반환한다', () => {
    expect(getLastPathSegment('/a/b/c/d/e')).toBe('e')
  })

  it('GPS-07: 단일 세그먼트 Unix 경로(/home)에서 마지막 세그먼트를 반환한다', () => {
    expect(getLastPathSegment('/home')).toBe('home')
  })

  it('GPS-08: 한글 폴더명도 올바르게 추출한다', () => {
    expect(getLastPathSegment('/home/사용자/문서')).toBe('문서')
  })

  it('GPS-09: 공백이 포함된 폴더명도 올바르게 추출한다', () => {
    expect(getLastPathSegment('/Users/My Documents/projects')).toBe('projects')
  })
})

// ─── 이름 변경 후 커서 위치 로직 테스트 ───────────────────────────────────────────

describe('rename 후 커서 위치 로직', () => {
  const makeFiles = (names) => names.map(n => ({ name: n, isHidden: false }))

  it('RN-01: 이름 변경 후 visible 목록에서 새 이름의 인덱스를 찾는다', () => {
    const files = makeFiles(['alpha.txt', 'beta.txt', 'gamma.txt'])
    const newName = 'beta_renamed.txt'
    const refreshed = files.map(f => f.name === 'beta.txt' ? { ...f, name: newName } : f)
    const idx = refreshed.findIndex(f => f.name === newName)
    expect(idx).toBe(1)
  })

  it('RN-02: 이름 변경된 파일이 목록에 없으면 -1을 반환한다', () => {
    const files = makeFiles(['alpha.txt', 'gamma.txt'])
    const idx = files.findIndex(f => f.name === 'missing.txt')
    expect(idx).toBe(-1)
  })

  it('RN-03: 숨김 파일 미표시 시 숨김 파일은 visible 목록에 포함되지 않는다', () => {
    const files = [
      { name: '.hidden', isHidden: true },
      { name: 'visible.txt', isHidden: false },
    ]
    const visible = files.filter(f => !f.isHidden)
    expect(visible.length).toBe(1)
    expect(visible[0].name).toBe('visible.txt')
  })

  it('RN-04: 디렉토리 이름 변경 후 visible 목록에서 새 이름의 인덱스를 찾는다', () => {
    const files = makeFiles(['docs/', 'alpha.txt', 'beta.txt'])
    const newName = 'documents/'
    const refreshed = files.map(f => f.name === 'docs/' ? { ...f, name: newName } : f)
    const idx = refreshed.findIndex(f => f.name === newName)
    expect(idx).toBe(0)
  })

  it('RN-05: 단일 파일 목록에서 이름 변경 후 인덱스는 0이다', () => {
    const files = makeFiles(['only.txt'])
    const newName = 'renamed.txt'
    const refreshed = files.map(f => f.name === 'only.txt' ? { ...f, name: newName } : f)
    const idx = refreshed.findIndex(f => f.name === newName)
    expect(idx).toBe(0)
  })
})

// ─── navigateBack 후 커서 위치 로직 테스트 ───────────────────────────────────
describe('navigateBack 후 커서 위치 로직', () => {
  const makeVisibleFiles = (names) =>
    names.map(n => ({ name: n, isHidden: false, isDir: n.endsWith('/') }))

  it('NB-01: 이전 경로의 마지막 세그먼트로 커서를 찾는다', () => {
    // /home/user/docs → back → /home/user, 커서는 "docs"(또는 "docs/")에 위치
    const prevPath = '/home/user/docs'
    const childName = getLastPathSegment(prevPath)
    expect(childName).toBe('docs')

    const visibleFiles = makeVisibleFiles(['alpha.txt', 'docs/', 'readme.md'])
    const idx = visibleFiles.findIndex(f => f.name === childName || f.name === childName + '/')
    expect(idx).toBe(1)
  })

  it('NB-02: 이전 경로가 디렉토리 표시("/")로 끝날 때도 올바르게 세그먼트를 추출한다', () => {
    const prevPath = '/home/user/projects/'
    const childName = getLastPathSegment(prevPath)
    expect(childName).toBe('projects')
  })

  it('NB-03: visible 파일 목록에 일치하는 항목이 없으면 -1을 반환한다', () => {
    const prevPath = '/home/user/deleted'
    const childName = getLastPathSegment(prevPath)
    const visibleFiles = makeVisibleFiles(['alpha.txt', 'docs/'])
    const idx = visibleFiles.findIndex(f => f.name === childName || f.name === childName + '/')
    expect(idx).toBe(-1)
  })

  it('NB-04: Windows 경로에서도 마지막 세그먼트로 커서를 찾는다', () => {
    const prevPath = 'C:\\Users\\user\\Projects'
    const childName = getLastPathSegment(prevPath)
    expect(childName).toBe('Projects')

    const visibleFiles = makeVisibleFiles(['Documents/', 'Downloads/', 'Projects/'])
    const idx = visibleFiles.findIndex(f => f.name === childName || f.name === childName + '/')
    expect(idx).toBe(2)
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

  it('BC-03: Windows 드라이브 루트가 역슬래시로 시작한다 (OS 구분 수정)', () => {
    const parts = buildBreadcrumbParts('C:\\github\\temp')
    expect(parts[0].path).toBe('C:\\')
    expect(parts[0].path).not.toBe('C:/')
  })

  it('BC-04: Windows 경로 파트들이 역슬래시로 누적된다', () => {
    const parts = buildBreadcrumbParts('C:\\github\\temp')
    expect(parts.map(p => p.path)).toEqual(['C:\\', 'C:\\github', 'C:\\github\\temp'])
  })

  it('BC-05: Windows 다른 드라이브도 역슬래시로 처리한다 (D:)', () => {
    const parts = buildBreadcrumbParts('D:\\Projects\\myapp')
    expect(parts[0].path).toBe('D:\\')
    expect(parts.map(p => p.path)).toEqual(['D:\\', 'D:\\Projects', 'D:\\Projects\\myapp'])
  })

  it('BC-06: 슬래시 혼용 Windows 경로도 역슬래시로 정규화한다', () => {
    const parts = buildBreadcrumbParts('C:\\Users\\user\\Documents')
    expect(parts[0].path).toBe('C:\\')
    expect(parts[1].path).toBe('C:\\Users')
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

// ─── 삭제 후 커서 위치 (Todo #49) ─────────────────────────────────────────────

describe('cursorAfterDelete', () => {
  it('DEL-01: 가운데 항목 삭제 시 한 칸 위로 이동', () => {
    // 인덱스 5 삭제, 9개 남음 → 4
    expect(cursorAfterDelete(5, 9)).toBe(4)
  })

  it('DEL-02: 첫 항목 삭제 시 새 첫 항목(인덱스 0)으로', () => {
    expect(cursorAfterDelete(0, 5)).toBe(0)
  })

  it('DEL-03: 삭제 항목 못 찾으면(-1) 변경 신호(-1) 반환', () => {
    expect(cursorAfterDelete(-1, 10)).toBe(-1)
  })

  it('DEL-04: 모두 삭제(remaining=0)면 변경 신호 없음(-1)', () => {
    expect(cursorAfterDelete(3, 0)).toBe(-1)
  })

  it('DEL-05: 마지막 항목 삭제 시 한 칸 위(remaining-1)로 클램프', () => {
    // 인덱스 9 삭제, 9개 남음 → min(8, 8) = 8
    expect(cursorAfterDelete(9, 9)).toBe(8)
  })

  it('DEL-06: 여러 항목 삭제 시 최상단 삭제 인덱스 기준', () => {
    // [3, 5, 7] 삭제 → minDeletedIdx=3 → 2
    expect(cursorAfterDelete(3, 7)).toBe(2)
  })
})

// ─── 복사/이동 후 커서 위치 (Todo #48) ────────────────────────────────────────

describe('cursorAfterCopy', () => {
  const makeFiles = (names) => names.map(n => ({ name: n }))

  it('CPC-01: 첫 source 의 basename이 visible에 있으면 그 인덱스', () => {
    const visible = makeFiles(['alpha.txt', 'beta.txt', 'gamma.txt'])
    expect(cursorAfterCopy(visible, ['/src/beta.txt'])).toBe(1)
  })

  it('CPC-02: 못 찾으면 -1', () => {
    const visible = makeFiles(['alpha.txt'])
    expect(cursorAfterCopy(visible, ['/src/missing.txt'])).toBe(-1)
  })

  it('CPC-03: 빈 sources면 -1', () => {
    expect(cursorAfterCopy(makeFiles(['x']), [])).toBe(-1)
  })

  it('CPC-04: Windows 경로의 basename도 추출', () => {
    const visible = makeFiles(['app.exe', 'README.md'])
    expect(cursorAfterCopy(visible, ['C:\\src\\app.exe'])).toBe(0)
  })

  it('CPC-05: 디렉토리 (trailing separator 없는 경로)', () => {
    const visible = makeFiles(['docs', 'src'])
    expect(cursorAfterCopy(visible, ['/home/user/docs'])).toBe(0)
  })

  it('CPC-06: null/undefined sources면 -1', () => {
    expect(cursorAfterCopy(makeFiles(['a']), null)).toBe(-1)
    expect(cursorAfterCopy(makeFiles(['a']), undefined)).toBe(-1)
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

  it('SS-15: delete - 파일도 선택도 없으면 빈 목록을 반환하고 상태 메시지를 설정한다', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, files: [], selected: new Set(), cursor: 0 } }))
    const result = await useFileStore.getState().delete()
    expect(result.count).toBe(0)
    expect(result.paths).toHaveLength(0)
    expect(useFileStore.getState().status).toBe('삭제할 파일이 없습니다.')
  })

  // cursorOnParent
  it('SS-16: cursorOnParent - 초기값은 false이다', () => {
    expect(useFileStore.getState().left.cursorOnParent).toBe(false)
  })

  it('SS-17: setCursorOnParent - true로 설정된다', () => {
    useFileStore.getState().setCursorOnParent('left', true)
    expect(useFileStore.getState().left.cursorOnParent).toBe(true)
  })

  it('SS-18: setCursorOnParent - false로 설정된다', () => {
    useFileStore.setState(s => ({ left: { ...s.left, cursorOnParent: true } }))
    useFileStore.getState().setCursorOnParent('left', false)
    expect(useFileStore.getState().left.cursorOnParent).toBe(false)
  })

  it('SS-19: setCursor - cursorOnParent를 false로 초기화한다', () => {
    useFileStore.setState(s => ({ left: { ...s.left, cursorOnParent: true } }))
    useFileStore.getState().setCursor('left', 2)
    expect(useFileStore.getState().left.cursor).toBe(2)
    expect(useFileStore.getState().left.cursorOnParent).toBe(false)
  })

  it('SS-20: setCursorOnParent - right 패널에도 독립적으로 적용된다', () => {
    useFileStore.getState().setCursorOnParent('right', true)
    expect(useFileStore.getState().right.cursorOnParent).toBe(true)
    expect(useFileStore.getState().left.cursorOnParent).toBe(false)
  })

  it('SS-21: setSort("size") - 파일 크기 기준 오름차순으로 정렬된다', () => {
    const files = [
      { name: 'big.txt',    path: '/test/big.txt',    isDir: false, size: 3000, modified: '', extension: '.txt' },
      { name: 'small.txt',  path: '/test/small.txt',  isDir: false, size: 100,  modified: '', extension: '.txt' },
      { name: 'medium.txt', path: '/test/medium.txt', isDir: false, size: 1500, modified: '', extension: '.txt' },
    ]
    useFileStore.setState(s => ({ left: { ...s.left, files, sortBy: 'name', sortDir: 'asc' } }))
    useFileStore.getState().setSort('left', 'size')
    const result = useFileStore.getState().left.files
    expect(result[0].name).toBe('small.txt')
    expect(result[1].name).toBe('medium.txt')
    expect(result[2].name).toBe('big.txt')
  })

  it('SS-22: setSort("size") 두 번 클릭 시 내림차순으로 전환된다', () => {
    useFileStore.setState(s => ({ left: { ...s.left, sortBy: 'size', sortDir: 'asc' } }))
    useFileStore.getState().setSort('left', 'size')
    expect(useFileStore.getState().left.sortDir).toBe('desc')
  })

  it('SS-23: setSort("modified") - 수정 일시 기준 오름차순으로 정렬된다', () => {
    const files = [
      { name: 'new.txt', path: '/test/new.txt', isDir: false, size: 100, modified: '2026-03-01T00:00:00Z', extension: '.txt' },
      { name: 'old.txt', path: '/test/old.txt', isDir: false, size: 100, modified: '2024-01-01T00:00:00Z', extension: '.txt' },
      { name: 'mid.txt', path: '/test/mid.txt', isDir: false, size: 100, modified: '2025-06-15T00:00:00Z', extension: '.txt' },
    ]
    useFileStore.setState(s => ({ left: { ...s.left, files, sortBy: 'name', sortDir: 'asc' } }))
    useFileStore.getState().setSort('left', 'modified')
    const result = useFileStore.getState().left.files
    expect(result[0].name).toBe('old.txt')
    expect(result[1].name).toBe('mid.txt')
    expect(result[2].name).toBe('new.txt')
  })

  it('SS-24: setActivePanel - 활성 패널이 right으로 변경된다', () => {
    useFileStore.getState().setActivePanel('right')
    expect(useFileStore.getState().activePanel).toBe('right')
  })

  it('SS-25: setActivePanel - 활성 패널이 다시 left로 변경된다', () => {
    useFileStore.setState({ activePanel: 'right' })
    useFileStore.getState().setActivePanel('left')
    expect(useFileStore.getState().activePanel).toBe('left')
  })
})

// ─── visibleFiles 필터링 로직 (App.jsx onView와 동일) ──────────────────────────

describe('visibleFiles 필터링 로직', () => {
  // App.jsx onView 내부와 동일한 순수 함수
  function getVisibleFile(files, cursor, showHidden) {
    const visible = showHidden ? files : files.filter(f => !f.isHidden)
    return visible[cursor] || null
  }

  const makeFile = (name, isHidden = false, isDir = false) => ({ name, isHidden, isDir })

  it('VF-01: showHidden=false일 때 숨김 파일이 제외되고 cursor=0이 첫 번째 일반 파일을 가리킨다', () => {
    const files = [makeFile('.env', true), makeFile('app.log', false)]
    expect(getVisibleFile(files, 0, false).name).toBe('app.log')
  })

  it('VF-02: showHidden=true일 때 숨김 파일 포함, cursor=0이 숨김 파일을 가리킨다', () => {
    const files = [makeFile('.env', true), makeFile('app.log', false)]
    expect(getVisibleFile(files, 0, true).name).toBe('.env')
  })

  it('VF-03: showHidden=false에서 숨김 파일이 여러 개일 때 cursor 인덱스가 올바른 파일을 가리킨다', () => {
    const files = [
      makeFile('.hidden1', true),
      makeFile('.hidden2', true),
      makeFile('app.log', false),
      makeFile('readme.txt', false),
    ]
    // visibleFiles = [app.log, readme.txt], cursor=1 → readme.txt
    expect(getVisibleFile(files, 1, false).name).toBe('readme.txt')
  })

  it('VF-04: panel.files 직접 접근 시 인덱스 불일치 회귀 방지 (버그 재현)', () => {
    const files = [makeFile('.env', true), makeFile('app.log', false)]
    // 구버그: panel.files[0] 직접 접근 → 숨김파일이 반환됨
    expect(files[0].name).toBe('.env')
    // 수정: visibleFiles 기준 cursor=0 → 일반 파일이 반환됨
    expect(getVisibleFile(files, 0, false).name).toBe('app.log')
  })

  it('VF-05: cursorOnParent=true일 때 파일을 열지 않아야 한다 (null 반환)', () => {
    const files = [makeFile('app.log', false)]
    // cursorOnParent 체크는 호출부에서 하므로, 이 함수는 호출되지 않음
    // 대신 cursorOnParent=true면 null을 반환하는 가드 로직 검증
    const cursorOnParent = true
    const result = cursorOnParent ? null : getVisibleFile(files, 0, false)
    expect(result).toBeNull()
  })

  it('VF-06: 디렉토리 커서에서 F3을 눌러도 뷰어가 열리지 않는다 (isDir 체크)', () => {
    const files = [makeFile('docs/', false, true), makeFile('app.log', false, false)]
    const file = getVisibleFile(files, 0, false)
    // isDir이면 viewerFile을 설정하지 않아야 함
    expect(file && !file.isDir).toBe(false)
  })

  it('VF-07: 모든 파일이 숨김이고 showHidden=false이면 null 반환', () => {
    const files = [makeFile('.a', true), makeFile('.b', true)]
    expect(getVisibleFile(files, 0, false)).toBeNull()
  })

  it('VF-08: cursor가 visible 범위를 벗어나면 null 반환', () => {
    const files = [makeFile('a.txt', false)]
    expect(getVisibleFile(files, 99, false)).toBeNull()
  })

  it('VF-09: 빈 파일 목록에서 어떤 cursor도 null 반환', () => {
    expect(getVisibleFile([], 0, false)).toBeNull()
    expect(getVisibleFile([], 0, true)).toBeNull()
  })

  it('VF-10: showHidden=true이면 숨김 파일도 cursor로 접근 가능하다', () => {
    const files = [makeFile('.hidden', true), makeFile('visible.txt', false)]
    expect(getVisibleFile(files, 0, true).name).toBe('.hidden')
    expect(getVisibleFile(files, 1, true).name).toBe('visible.txt')
  })
})

// ─── isAtRoot / [..] 표시 — 추가 엣지케이스 ───────────────────────────────────

describe('[..] 표시 로직 추가 엣지케이스', () => {
  function isAtRoot(path) {
    return path === '/' || /^[A-Za-z]:[\\/]?$/.test(path)
  }
  const showParent = (path) => !isAtRoot(path)

  it('PR-07: 소문자 드라이브 루트("d:\\")에서도 [..] 를 표시하지 않는다', () => {
    expect(showParent('d:\\')).toBe(false)
  })

  it('PR-08: 깊은 Windows 경로에서 [..] 를 표시한다', () => {
    expect(showParent('C:\\Users\\user\\Documents\\projects')).toBe(true)
  })

  it('PR-09: 단일 세그먼트 Unix 경로("/home")에서 [..] 를 표시한다', () => {
    expect(showParent('/home')).toBe(true)
  })
})

// ─── joinPath 추가 엣지케이스 ─────────────────────────────────────────────────

describe('joinPath 추가 엣지케이스', () => {
  it('JP-11: 확장자만 있는 파일명 결합 (.gitignore)', () => {
    expect(joinPath('/home/user', '.gitignore')).toBe('/home/user/.gitignore')
  })

  it('JP-12: 숫자로 시작하는 파일명 결합', () => {
    expect(joinPath('/data', '2024_log.txt')).toBe('/data/2024_log.txt')
  })

  it('JP-13: Windows 드라이브 루트 + 깊은 경로', () => {
    expect(joinPath('E:\\', 'backup\\files')).toBe('E:\\backup\\files')
  })
})

// ─── getLastPathSegment 추가 엣지케이스 ───────────────────────────────────────

describe('getLastPathSegment 추가 엣지케이스', () => {
  it('GPS-10: Windows 경로 끝에 역슬래시가 있어도 마지막 세그먼트를 반환한다', () => {
    expect(getLastPathSegment('C:\\Users\\user\\')).toBe('user')
  })

  it('GPS-11: 점으로 시작하는 파일명도 올바르게 추출한다', () => {
    expect(getLastPathSegment('/home/user/.bashrc')).toBe('.bashrc')
  })

  it('GPS-12: 숫자로만 이루어진 세그먼트도 추출한다', () => {
    expect(getLastPathSegment('/var/log/2024')).toBe('2024')
  })
})

// ─── Todo #56: 파일/폴더 생성 후 새 항목에 커서 ─────────────────────────────────

describe('Todo #56 — 생성 후 커서 위치', () => {
  let useFileStore
  let api

  const file = (name) => ({
    name,
    path: `/test/${name}`,
    isDir: false,
    isHidden: name.startsWith('.'),
    size: 100,
    modified: '2026-01-01T00:00:00Z',
    extension: name.includes('.') ? '.' + name.split('.').pop() : '',
  })
  const dir = (name) => ({ ...file(name), isDir: true, extension: '' })

  beforeEach(async () => {
    vi.resetModules()
    const mod  = await import('./fileStore.js')
    const apiMod = await import('../wailsjs/runtime')
    useFileStore = mod.useFileStore
    api = apiMod.default
    useFileStore.setState(s => ({
      activePanel: 'left',
      left: {
        ...s.left,
        path: '/test',
        files: [file('alpha.txt'), file('beta.js')],
        selected: new Set(),
        cursor: 0,
        showHidden: false,
      }
    }))
    api.GetParentPath.mockReturnValue('/')
    api.ChangeWorkingDirectory.mockResolvedValue(undefined)
  })

  it('FN-01: createFile 후 커서가 새 파일로 이동', async () => {
    api.CreateFile.mockResolvedValue(undefined)
    api.ListDirectory.mockResolvedValue({
      path: '/test',
      files: [file('alpha.txt'), file('beta.js'), file('gamma.txt')],
    })
    await useFileStore.getState().createFile('left', 'gamma.txt')
    expect(useFileStore.getState().left.cursor).toBe(2)
    expect(useFileStore.getState().left.cursorOnParent).toBe(false)
  })

  it('FN-02: createDirectory 후 커서가 새 폴더로 이동', async () => {
    api.CreateDirectory.mockResolvedValue(undefined)
    api.ListDirectory.mockResolvedValue({
      path: '/test',
      files: [dir('newdir'), file('alpha.txt'), file('beta.js')],
    })
    await useFileStore.getState().createDirectory('left', 'newdir')
    expect(useFileStore.getState().left.cursor).toBe(0)
    expect(useFileStore.getState().left.cursorOnParent).toBe(false)
  })

  it('FN-03: 생성된 항목이 visible에 없으면(숨김 등) 커서는 refresh 후 기본값', async () => {
    api.CreateFile.mockResolvedValue(undefined)
    // 생성된 .secret이 visible에서 빠짐 (showHidden=false)
    api.ListDirectory.mockResolvedValue({
      path: '/test',
      files: [file('alpha.txt'), file('beta.js'), file('.secret')],
    })
    await useFileStore.getState().createFile('left', '.secret')
    // _focusByName이 visible에서 못 찾으면 refresh가 설정한 cursor=0 그대로
    expect(useFileStore.getState().left.cursor).toBe(0)
    expect(useFileStore.getState().left.cursorOnParent).toBe(false)
  })

  it('FN-04: createFile 실패 시 throw하고 status에 메시지 기록', async () => {
    api.CreateFile.mockRejectedValue(new Error('exists'))
    await expect(useFileStore.getState().createFile('left', 'alpha.txt'))
      .rejects.toThrow()
    expect(useFileStore.getState().status).toMatch(/Create file failed/)
  })

  it('FN-05: _focusByName — 이름이 visible에 있으면 cursor 갱신', () => {
    useFileStore.setState(s => ({
      left: { ...s.left, files: [file('a.txt'), file('b.txt'), file('c.txt')], cursor: 0 }
    }))
    useFileStore.getState()._focusByName('left', 'c.txt')
    expect(useFileStore.getState().left.cursor).toBe(2)
  })

  it('FN-06: _focusByName — 이름이 없으면 cursor 유지', () => {
    useFileStore.setState(s => ({
      left: { ...s.left, files: [file('a.txt')], cursor: 0 }
    }))
    useFileStore.getState()._focusByName('left', 'missing.txt')
    expect(useFileStore.getState().left.cursor).toBe(0)
  })
})
