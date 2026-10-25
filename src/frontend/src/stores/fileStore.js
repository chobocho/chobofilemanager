import { create } from 'zustand'
import api from '../wailsjs/runtime'
import { formatSize } from '../utils/fileTypes.js'
import { parseMask, matchMask } from '../utils/mask.js'
import { compareListings } from '../utils/compareDirs.js'
import { isFtpPath, ftpId, ftpRoot } from '../utils/ftpPath.js'
import { useFTPStore } from './ftpStore'

// Windows(\) / Unix(/) 경로 구분자를 모두 처리하는 경로 조합 함수
// api.JoinPath(variadic)은 Wails2 바인딩에서 동작하지 않으므로 JS에서 직접 처리
// 경로에서 부모 디렉토리를 반환합니다.
// 드라이브 루트('C:\\foo' → 'C:\\')와 '/'('/foo' → '/')도 처리 (Todo #91)
export function parentDir(path) {
  // FTP 패널 경로 (Todo #133-8): 루트는 "ftp://id/"
  if (isFtpPath(path)) {
    const root = ftpRoot(ftpId(path))
    const rest = path.slice(root.length).replace(/\/+$/, '')
    const i = rest.lastIndexOf('/')
    return i < 0 ? root : root + rest.slice(0, i)
  }
  const last = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (last < 0) return path
  if (last === 0) return path.substring(0, 1)
  // 'C:\\foo' 처럼 드라이브 문자 바로 뒤 구분자면 구분자까지 포함
  if (last === 2 && path[1] === ':') return path.substring(0, 3)
  return path.substring(0, last)
}

export function joinPath(base, name) {
  const sep = base.includes('\\') ? '\\' : '/'
  return base.replace(/[/\\]+$/, '') + sep + name
}

export function getLastPathSegment(path) {
  const clean = path.replace(/[/\\]+$/, '')
  if (clean === '' || /^[A-Za-z]:$/.test(clean)) return ''
  return clean.split(/[/\\]/).pop() || ''
}

// 삭제 후 커서 위치 계산 (Todo #49).
// minDeletedIdx: 삭제 전 visible 목록에서 삭제된 항목들의 최소 인덱스 (-1이면 못 찾음)
// remainingCount: 삭제 후 visible 목록 길이
// 반환: 새 커서 인덱스, 또는 -1(변경하지 않음 — 못 찾았거나 빈 목록)
// 루트 경로 여부 ('/' 또는 'C:', 'C:\', 'C:/') — [..] 표시 여부 판단에 사용
export function isRootPath(path) {
  return path === '/' || /^[A-Za-z]:[\\/]?$/.test(path) || /^ftp:\/\/[^/]+\/?$/.test(path)
}

// 보이는 항목이 없고 [..]가 표시되는 폴더면 커서를 [..]에 둡니다 (Todo #103).
function emptyCursorOnParent(path, files, showHidden) {
  const visibleCount = showHidden ? files.length : files.filter(f => !f.isHidden).length
  return visibleCount === 0 && !isRootPath(path)
}

// 패널의 "현재 커서 파일" — 숨김 필터를 적용한 visible 목록 기준, [..]에 있으면 null (Todo #78)
export function getCursorFile(panelState) {
  // 목록을 못 읽어 오류만 보이거나 읽는 중이면 숨은 옛 목록의 파일을 대상으로 삼지 않음 (Todo #130-3)
  if (!panelState || panelState.cursorOnParent || panelState.error || panelState.loading) return null
  const visible = panelState.showHidden ? panelState.files : panelState.files.filter(f => !f.isHidden)
  return visible[panelState.cursor] || null
}

// 복사·이동·삭제 대상: 선택한 항목, 없으면 커서 파일. 오류·로딩 중인 패널은 없음 (Todo #130-3)
export function operationPaths(panelState) {
  if (!panelState || panelState.error || panelState.loading) return []
  const selected = [...panelState.selected]
  if (selected.length) return selected
  const cursor = getCursorFile(panelState)
  return cursor ? [cursor.path] : []
}

// 폴더 우선 + sortBy/sortDir 정렬 (Todo #93 — 새로고침/이동 후에도 선택한 정렬 유지)
export function sortFiles(files, sortBy = 'name', sortDir = 'asc') {
  return [...files].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    let va = a[sortBy], vb = b[sortBy]
    if (typeof va === 'string') va = va.toLowerCase()
    if (typeof vb === 'string') vb = vb.toLowerCase()
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })
}

// 압축 파일 안(Todo #133-5)은 읽기 전용 — 백엔드도 거부하지만 확인 창 전에 바로 알림
export const READ_ONLY_MSG = '압축 파일 안은 읽기 전용입니다 (F5로 꺼내서 쓰세요)'

// 복사·이동 방식별 백엔드 함수 이름(api는 테스트에서 바뀌므로 호출할 때 찾음)과 새로 고칠 폴더
const TRANSFERS = {
  copy: {
    doing: 'Copying', done: 'Copied', failed: 'Copy failed',
    calls: { plain: 'CopyItems', overwrite: 'CopyItems', rename: 'CopyItemsRename', skip: 'CopyItemsSkipConflicts' },
    affected: (_sources, dest) => [dest],
  },
  move: {
    doing: 'Moving', done: 'Moved', failed: 'Move failed',
    calls: { plain: 'MoveItems', overwrite: 'MoveItemsOverwrite', rename: 'MoveItemsRename' },
    affected: (sources, dest) => [...new Set([...sources.map(p => parentDir(p)), dest])],
  },
}

// 패널별 목록 요청 순번 — 늦게 도착한 이전 응답이 최신 이동 결과를 덮어쓰지 않도록 (Todo #92)
const navTokens = { left: 0, right: 0 }
// 진행 중인 이동이 가는 경로 — 끝난 작업의 새로 고침이 다른 폴더로 가는 이동을 버리지 않게 (Todo #130-3)
const navTargets = { left: null, right: null }
function beginNav(panel, path) {
  const token = ++navTokens[panel]
  navTargets[panel] = path
  return () => navTokens[panel] === token
}

export function cursorAfterDelete(minDeletedIdx, remainingCount) {
  if (minDeletedIdx < 0 || remainingCount === 0) return -1
  return Math.min(Math.max(0, minDeletedIdx - 1), remainingCount - 1)
}

// 복사/이동 후 대상 패널 커서 위치 계산 (Todo #48).
// visibleAfter: 대상 패널의 refresh 후 visible 파일 목록
// sourcePaths: 복사/이동된 source 절대 경로 배열
// 반환: 첫 source의 basename에 해당하는 인덱스, 또는 -1(못 찾음/빈 입력)
export function cursorAfterCopy(visibleAfter, sourcePaths) {
  if (!sourcePaths || sourcePaths.length === 0) return -1
  const first = sourcePaths[0]
  const sep = Math.max(first.lastIndexOf('/'), first.lastIndexOf('\\'))
  const basename = sep >= 0 ? first.substring(sep + 1) : first
  return visibleAfter.findIndex(f => f.name === basename)
}

let _tabCounter = 0
const createTabState = (path = '') => ({
  id: `tab-${++_tabCounter}`,
  path,
  cursor: 0,
  cursorOnParent: false,
  showHidden: false,
  selected: new Set(),
  history: [],
  historyIndex: -1,
  sortBy: 'name',
  sortDir: 'asc',
})

const createPanelState = (side) => ({
  path: '',
  files: [],
  selected: new Set(),
  loading: false,
  error: null,
  sortBy: 'name',
  sortDir: 'asc',
  showHidden: false,
  history: [],
  historyIndex: -1,
  cursor: 0,
  cursorOnParent: false,
  dirSizes: {}, // Space로 계산한 폴더 크기 (경로 → 바이트), 다른 폴더로 가면 비움 (Todo #133-1)
  readOnly: false, // 압축 파일 안 (Todo #133-5)
  showTree: false, // 폴더 트리 (Ctrl+F8, Todo #133-10)
  viewMode: 'full', // 보기 방식 full · brief · thumbs (Todo #133-11)
  tabs: [createTabState('')],
  activeTabIdx: 0,
})

export const useFileStore = create((set, get) => ({
  left: createPanelState('left'),
  right: createPanelState('right'),
  activePanel: 'left',
  drives: [],
  clipboard: { items: [], operation: null },
  status: '',

  // Todo #65 (Todo.md): Ctrl+F 검색 모달이 닫혀도 query/recursive/results를
  // 보관해 다시 열 때 동일 상태로 복원. SearchDialog가 setSearchState로 갱신.
  searchState: { query: '', recursive: true, results: [] },
  setSearchState: (partial) => set(s => ({
    searchState: { ...s.searchState, ...partial }
  })),

  init: async () => {
    const [home, drives, saved] = await Promise.all([
      api.GetHomeDirectory(),
      api.GetDrives(),
      api.LoadPanelPaths(),
    ])
    set({ drives })
    await get()._restorePanel('left',  saved.leftTabs,  saved.leftPath,  home)
    await get()._restorePanel('right', saved.rightTabs, saved.rightPath, home)
  },

  // 저장된 탭 목록으로 패널을 복원합니다.
  _restorePanel: async (panel, tabsState, legacyPath, home) => {
    // FTP 탭은 다시 시작하면 연결이 없으므로 홈으로 (Todo #133-8)
    const paths = ((tabsState?.paths?.length > 0) ? tabsState.paths : [legacyPath || home]).map(p => isFtpPath(p) ? home : p)
    const activeIdx = Math.min(tabsState?.activeIdx ?? 0, paths.length - 1)

    // 탭 배열 미리 구성 (비활성 탭은 lazy 로딩)
    const tabs = paths.map(p => createTabState(p))
    set(s => ({
      [panel]: { ...s[panel], tabs, activeTabIdx: activeIdx }
    }))

    // 활성 탭만 실제로 로딩
    await get().navigate(panel, paths[activeIdx] || home)
  },

  // Todo #126: 프로세스 작업 폴더는 바꾸지 않음 (터미널과 함께 쓰는 전역 상태) — 셸·명령 창 등은 폴더를 직접 넘김
  setActivePanel: (panel) => {
    set({ activePanel: panel })
  },

  // 반환값: 결과가 적용되었으면 true (더 새로운 이동에 밀렸거나 실패하면 false)
  navigate: async (panel, path) => {
    const isCurrent = beginNav(panel, path)
    set(s => ({ [panel]: { ...s[panel], loading: true, error: null } }))
    try {
      const result = await api.ListDirectory(path)
      if (!isCurrent()) return false
      const { sortBy, sortDir } = get()[panel]
      const files = sortFiles(result.files || [], sortBy, sortDir)
      // 응답 시점의 history 기준 (await 전 상태를 쓰면 그 사이 변경이 사라짐)
      const state = get()[panel]
      // 같은 경로 재조회(refresh)는 history에 중복 추가하지 않음 (Todo #103)
      const kept = state.history.slice(0, state.historyIndex + 1)
      const newHistory = kept[kept.length - 1] === result.path ? kept : [...kept, result.path]
      set(s => ({
        [panel]: {
          ...s[panel],
          path: result.path,
          files,
          selected: new Set(),
          dirSizes: result.path === s[panel].path ? s[panel].dirSizes : {},
          readOnly: !!result.readOnly,
          loading: false,
          history: newHistory,
          historyIndex: newHistory.length - 1,
          cursor: 0,
          cursorOnParent: emptyCursorOnParent(result.path, files, s[panel].showHidden),
        }
      }))
      get()._afterNavigate(panel, result.path)
      return true
    } catch (err) {
      if (!isCurrent()) return false
      set(s => ({
        [panel]: {
          ...s[panel],
          loading: false,
          error: err.message || String(err),
        }
      }))
      return false
    }
  },

  // 이동 후 공통 처리: 세션 저장, 활성 패널이면 프로세스 작업 폴더 변경
  _afterNavigate: () => {
    get()._saveSession()
  },

  // history의 다른 위치로 이동 (뒤로/앞으로 공통). 성공했을 때만 historyIndex를 바꿈 (Todo #92)
  _navigateHistory: async (panel, newIndex) => {
    const state = get()[panel]
    const path = state.history[newIndex]
    const isCurrent = beginNav(panel, path)
    set(s => ({ [panel]: { ...s[panel], loading: true, error: null } }))
    try {
      const result = await api.ListDirectory(path)
      if (!isCurrent()) return false
      const { sortBy, sortDir } = get()[panel]
      const files = sortFiles(result.files || [], sortBy, sortDir)
      set(s => ({
        [panel]: {
          ...s[panel],
          path: result.path,
          files,
          selected: new Set(),
          dirSizes: {},
          readOnly: !!result.readOnly,
          loading: false,
          historyIndex: newIndex,
          cursor: 0,
          cursorOnParent: emptyCursorOnParent(result.path, files, s[panel].showHidden),
        }
      }))
      get()._afterNavigate(panel, result.path)
      return true
    } catch (err) {
      if (!isCurrent()) return false
      set(s => ({ [panel]: { ...s[panel], loading: false, error: err.message || String(err) } }))
      return false
    }
  },

  // Todo.md #66: 검색 결과에서 파일 선택 시 부모 폴더로 이동한 뒤 해당 파일에
  // 커서를 둔다. FilePanel이 panel.cursor 변경에 반응해 scrollIntoView 처리.
  // navigateBack의 cursor 복원 로직과 동일 패턴(showHidden 필터링 후 인덱스 검색).
  navigateAndFocus: async (panel, dirPath, fileName) => {
    if (!(await get().navigate(panel, dirPath))) return
    if (!fileName) return
    const st = get()[panel]
    const visible = st.showHidden ? st.files : st.files.filter(f => !f.isHidden)
    const idx = visible.findIndex(f => f.name === fileName)
    if (idx >= 0) {
      set(s => ({ [panel]: { ...s[panel], cursor: idx, cursorOnParent: false } }))
    }
  },

  navigateBack: async (panel) => {
    const state = get()[panel]
    if (state.historyIndex <= 0) return
    const prevPath = state.history[state.historyIndex]
    if (!(await get()._navigateHistory(panel, state.historyIndex - 1))) return
    // 직전에 있던 폴더명으로 커서 이동
    const childName = getLastPathSegment(prevPath)
    if (!childName) return
    const newState = get()[panel]
    const visible = newState.showHidden ? newState.files : newState.files.filter(f => !f.isHidden)
    const idx = visible.findIndex(f => f.name === childName || f.name === childName + '/')
    if (idx >= 0) {
      set(s => ({ [panel]: { ...s[panel], cursor: idx, cursorOnParent: false } }))
    }
  },

  navigateForward: async (panel) => {
    const state = get()[panel]
    if (state.historyIndex >= state.history.length - 1) return
    await get()._navigateHistory(panel, state.historyIndex + 1)
  },

  navigateUp: async (panel) => {
    const state = get()[panel]
    const currentPath = state.path
    const parent = await api.GetParentPath(currentPath)
    if (parent === currentPath) return
    if (!(await get().navigate(panel, parent))) return
    // 이전 폴더 위에 커서 위치
    const childName = getLastPathSegment(currentPath)
    if (!childName) return
    const newState = get()[panel]
    const visible = newState.showHidden ? newState.files : newState.files.filter(f => !f.isHidden)
    const idx = visible.findIndex(f => f.name === childName)
    if (idx >= 0) {
      set(s => ({ [panel]: { ...s[panel], cursor: idx, cursorOnParent: false } }))
    }
  },

  // 새로 고침: 커서는 같은 파일(없어졌으면 같은 자리), 선택은 남아 있는 것만 유지 (Todo #130-3 —
  // 전에는 편집 저장·이동 원본 새로 고침마다 첫 줄로 가고 선택이 사라짐). 이름 바꾸기·복사·삭제는 뒤에서 커서를 다시 정함
  refresh: async (panel) => {
    const before = get()[panel]
    const cursorPath = getCursorFile(before)?.path
    if (!(await get().navigate(panel, before.path))) return
    const now = get()[panel]
    const visible = now.showHidden ? now.files : now.files.filter(f => !f.isHidden)
    if (!visible.length) return
    const selected = new Set(visible.filter(f => before.selected.has(f.path)).map(f => f.path))
    const onParent = before.cursorOnParent && !isRootPath(now.path)
    const found = cursorPath ? visible.findIndex(f => f.path === cursorPath) : -1
    const cursor = onParent ? 0 : found >= 0 ? found : Math.min(before.cursor, visible.length - 1)
    set(s => ({ [panel]: { ...s[panel], selected, cursor, cursorOnParent: onParent } }))
  },

  toggleSelect: (panel, filePath) => {
    set(s => {
      const selected = new Set(s[panel].selected)
      if (selected.has(filePath)) {
        selected.delete(filePath)
      } else {
        selected.add(filePath)
      }
      return { [panel]: { ...s[panel], selected } }
    })
  },

  // Todo #79: 숨김 파일이 안 보일 때는 선택하지 않음 (보이지 않는 파일까지 삭제되는 것 방지)
  selectAll: (panel) => {
    set(s => {
      const p = s[panel]
      const visible = p.showHidden ? p.files : p.files.filter(f => !f.isHidden)
      const selected = new Set(visible.map(f => f.path))
      return { [panel]: { ...s[panel], selected } }
    })
  },

  // 폴더 크기 계산 (Space / Alt+Shift+Enter, Todo #133-1). 결과는 그 폴더가 아직 보일 때만 반영
  calcDirSize: async (panel, path) => {
    const name = getLastPathSegment(path) || path
    set({ status: `크기 계산 중: ${name}...` })
    try {
      const r = await api.DirSize(path)
      set(s => {
        if (!s[panel].files.some(f => f.path === path)) return {}
        return {
          [panel]: { ...s[panel], dirSizes: { ...s[panel].dirSizes, [path]: r.size } },
          status: `${name}: ${formatSize(r.size, false)} (파일 ${r.files}개, 폴더 ${r.dirs}개)`,
        }
      })
      return r.size
    } catch (err) {
      set({ status: `크기 계산 실패: ${name}: ${err?.message ?? err}` })
      return null
    }
  },

  calcAllDirSizes: async (panel) => {
    const p = get()[panel]
    const dirs = (p.showHidden ? p.files : p.files.filter(f => !f.isHidden)).filter(f => f.isDir)
    let total = 0
    for (const d of dirs) {
      if (get()[panel].path !== p.path) return // 다른 폴더로 갔으면 그만
      total += (await get().calcDirSize(panel, d.path)) ?? 0
    }
    if (dirs.length) set({ status: `폴더 ${dirs.length}개: ${formatSize(total, false)}` })
  },

  // 마스크로 선택 / 해제 (Num+ / Num-, Todo #133-2). 보이는 항목만, 폴더는 includeDirs일 때만
  lastMask: '*.*',
  selectByMask: (panel, mask, { select = true, includeDirs = false } = {}) => {
    const m = parseMask(mask)
    set(s => {
      const p = s[panel]
      const visible = p.showHidden ? p.files : p.files.filter(f => !f.isHidden)
      const hits = visible.filter(f => (includeDirs || !f.isDir) && matchMask(f.name, m))
      const selected = new Set(p.selected)
      for (const f of hits) select ? selected.add(f.path) : selected.delete(f.path)
      return {
        [panel]: { ...p, selected },
        lastMask: mask,
        status: `${mask}: ${hits.length}개 ${select ? '선택' : '선택 해제'}`,
      }
    })
  },

  // 반전 (Num*): 보이는 파일만 뒤집음, 폴더 선택은 그대로 (Total Commander와 같게)
  invertSelection: (panel) => {
    set(s => {
      const p = s[panel]
      const visible = p.showHidden ? p.files : p.files.filter(f => !f.isHidden)
      const selected = new Set(p.selected)
      for (const f of visible) {
        if (f.isDir) continue
        selected.has(f.path) ? selected.delete(f.path) : selected.add(f.path)
      }
      return { [panel]: { ...p, selected } }
    })
  },

  // Shift+F2 폴더 비교 (Todo #133-6): 양쪽에서 더 새 파일·한쪽에만 있는 파일을 선택
  compareDirsSelect: () => {
    set(s => {
      const vis = (p) => p.showHidden ? p.files : p.files.filter(f => !f.isHidden)
      const { left, right } = compareListings(vis(s.left), vis(s.right))
      const status = left.size || right.size
        ? `다른 파일: 왼쪽 ${left.size}개 · 오른쪽 ${right.size}개 선택`
        : '두 폴더의 파일이 같습니다'
      return { left: { ...s.left, selected: left }, right: { ...s.right, selected: right }, status }
    })
  },

  // FTP 연결 끊기 (Todo #133-8): 그 연결을 보던 패널은 홈으로
  ftpDisconnect: async (id) => {
    try {
      await useFTPStore.getState().disconnect(id)
    } catch (err) {
      set({ status: `FTP 연결 끊기 실패: ${err?.message ?? err}` })
    }
    const home = await api.GetHomeDirectory()
    for (const p of ['left', 'right']) {
      if (ftpId(get()[p].path) === id) await get().navigate(p, home)
    }
  },

  setViewMode: (panel, viewMode) => set(s => ({ [panel]: { ...s[panel], viewMode } })),

  toggleTree: (panel) => set(s => ({ [panel]: { ...s[panel], showTree: !s[panel].showTree } })),

  clearSelection: (panel) => {
    set(s => ({ [panel]: { ...s[panel], selected: new Set() } }))
  },

  setCursor: (panel, index) => {
    set(s => ({ [panel]: { ...s[panel], cursor: index, cursorOnParent: false } }))
  },

  setCursorOnParent: (panel, val) => {
    set(s => ({ [panel]: { ...s[panel], cursorOnParent: val } }))
  },

  // 정렬 후에도 커서가 같은 파일을 가리키도록 인덱스 보정 (Todo #93)
  setSort: (panel, sortBy) => {
    set(s => {
      const current = s[panel]
      const sortDir = current.sortBy === sortBy && current.sortDir === 'asc' ? 'desc' : 'asc'
      const cursorFile = getCursorFile(current)
      const files = sortFiles(current.files, sortBy, sortDir)
      let cursor = current.cursor
      if (cursorFile) {
        const visible = current.showHidden ? files : files.filter(f => !f.isHidden)
        const idx = visible.findIndex(f => f.path === cursorFile.path)
        if (idx >= 0) cursor = idx
      }
      return { [panel]: { ...current, sortBy, sortDir, files, cursor } }
    })
  },


  // 숨김 표시를 끄면 숨겨지는 항목의 선택도 해제 (Todo #79)
  toggleHidden: (panel) => {
    set(s => {
      const p = s[panel]
      const showHidden = !p.showHidden
      if (showHidden) return { [panel]: { ...p, showHidden } }
      const hidden = new Set(p.files.filter(f => f.isHidden).map(f => f.path))
      const selected = new Set([...p.selected].filter(path => !hidden.has(path)))
      return { [panel]: { ...p, showHidden, selected } }
    })
  },

  // ─── File Operations ──────────────────────────────────────────────────────

  // 복사·이동 (F5/F6): 같은 흐름을 TRANSFERS 표로 (Todo #131-2)
  copy: () => get()._startTransfer('copy'),
  copyWithMode: (sources, dest, mode) => get()._transfer('copy', sources, dest, mode),
  move: () => get()._startTransfer('move'),
  moveWithMode: (sources, dest, mode) => get()._transfer('move', sources, dest, mode),

  // 대상(선택 또는 커서 파일) → 충돌 검사. 충돌이 있으면 실행하지 않고 돌려줘 창에서 방식을 고르게 함
  _startTransfer: async (kind) => {
    const state = get()
    const panel = state.activePanel
    const other = panel === 'left' ? 'right' : 'left'
    const selected = operationPaths(state[panel])
    const none = { conflicts: [], sources: [], dest: '' }
    if (!selected.length) return none

    // 압축 파일 안으로는 복사·이동 불가, 안에서 밖으로는 복사(풀기)만 (Todo #133-5)
    if (state[other].readOnly || (kind === 'move' && state[panel].readOnly)) {
      set({ status: READ_ONLY_MSG })
      return none
    }
    const dest = state[other].path
    const conflicts = await api.CheckCopyConflicts(selected, dest)
    if (conflicts && conflicts.length > 0) {
      return { conflicts, sources: selected, dest }
    }
    await get()._transfer(kind, selected, dest, 'plain')
    return none
  },

  // 실행 → 바뀐 폴더 새로 고침 → 대상 패널에서 옮긴 파일에 커서
  _transfer: async (kind, sources, dest, mode) => {
    const t = TRANSFERS[kind]
    set({ status: `${t.doing} ${sources.length} item(s)...` })
    try {
      const call = t.calls[mode]
      if (call) await api[call](sources, dest)
      await get()._refreshAffected(t.affected(sources, dest))
      get()._focusCopiedFile(dest, sources)
      set({ status: `${t.done} ${sources.length} item(s)` })
    } catch (err) {
      set({ status: `${t.failed}: ${err}` })
    }
  },

  delete: async () => {
    const state = get()
    const panel = state.activePanel
    if (state[panel].readOnly) {
      set({ status: READ_ONLY_MSG })
      return { paths: [], count: 0 }
    }
    const selected = operationPaths(state[panel])
    if (!selected.length) {
      set({ status: '삭제할 파일이 없습니다.' })
      return { paths: [], count: 0 }
    }
    return { paths: selected, count: selected.length }
  },

  // Todo #57: 휴지통(F8/Delete)도 동일한 선택→대상 추출 로직.
  // delete()와 의미적으로 같지만 호출자가 의도를 명확히 구분할 수 있도록 별도 메서드로 노출.
  trash: async () => {
    return get().delete()
  },

  confirmDelete: async (paths) => {
    return get()._removePaths(paths, { mode: 'permanent' })
  },

  // Todo #57: 휴지통 이동. confirmDelete와 동일한 후처리(커서 이동/리프레시)이지만
  // 백엔드 API만 다르게 호출.
  confirmTrash: async (paths) => {
    return get()._removePaths(paths, { mode: 'trash' })
  },

  _removePaths: async (paths, { mode }) => {
    const state = get()
    const panel = state.activePanel
    // 삭제 전 visible 인덱스를 기록 — 삭제 후 커서 위치 계산용 (Todo #49)
    const before = state[panel]
    const visibleBefore = before.showHidden
      ? before.files
      : before.files.filter(f => !f.isHidden)
    const deletedSet = new Set(paths)
    const deletedIndices = visibleBefore
      .map((f, i) => deletedSet.has(f.path) ? i : -1)
      .filter(i => i >= 0)
    const minDeletedIdx = deletedIndices.length > 0 ? Math.min(...deletedIndices) : -1

    const verb = mode === 'trash' ? '휴지통으로 이동' : 'Deleting'
    set({ status: `${verb} ${paths.length} item(s)...` })
    try {
      if (mode === 'trash') await api.TrashItems(paths)
      else                  await api.DeleteItems(paths)
      await get()._refreshAffected([...new Set(paths.map(p => parentDir(p)))])
      const past = mode === 'trash' ? `Moved ${paths.length} item(s) to Recycle Bin` : `Deleted ${paths.length} item(s)`
      set({ status: past })

      // 삭제된 위치 바로 위 파일로 커서 이동
      const after = get()[panel]
      const visibleAfter = after.showHidden
        ? after.files
        : after.files.filter(f => !f.isHidden)
      const newCursor = cursorAfterDelete(minDeletedIdx, visibleAfter.length)
      if (newCursor >= 0) {
        set(s => ({ [panel]: { ...s[panel], cursor: newCursor, cursorOnParent: false } }))
      } else if (emptyCursorOnParent(after.path, after.files, after.showHidden)) {
        set(s => ({ [panel]: { ...s[panel], cursor: 0, cursorOnParent: true } }))
      }
    } catch (err) {
      const failVerb = mode === 'trash' ? 'Trash' : 'Delete'
      set({ status: `${failVerb} failed: ${err}` })
      throw err
    }
  },

  createDirectory: async (panel, name) => {
    const state = get()[panel]
    if (state.readOnly) throw new Error(READ_ONLY_MSG)
    const path = joinPath(state.path, name)
    try {
      await api.CreateDirectory(path)
      await get().refresh(panel)
      // Todo #56: 생성된 폴더에 커서 위치 (visible 인덱스). 스크롤은 FilePanel useEffect가 처리.
      get()._focusByName(panel, name)
    } catch (err) {
      set({ status: `Create directory failed: ${err}` })
      throw err
    }
  },

  // Todo #56: 새 파일 생성 후 해당 파일에 커서를 위치시키기 위한 store 진입점.
  // (이전에는 App.jsx handleNewFile에서 직접 api.CreateFile을 호출했음)
  createFile: async (panel, name) => {
    const state = get()[panel]
    if (state.readOnly) throw new Error(READ_ONLY_MSG)
    const path = joinPath(state.path, name)
    try {
      await api.CreateFile(path)
      await get().refresh(panel)
      get()._focusByName(panel, name)
    } catch (err) {
      set({ status: `Create file failed: ${err}` })
      throw err
    }
  },

  // Todo #56: 패널 안에서 이름으로 visible 인덱스 찾아 커서 이동. 못 찾으면 무동작.
  _focusByName: (panel, name) => {
    const st = get()[panel]
    const visible = st.showHidden ? st.files : st.files.filter(f => !f.isHidden)
    const idx = visible.findIndex(f => f.name === name)
    if (idx >= 0) {
      set(s => ({ [panel]: { ...s[panel], cursor: idx, cursorOnParent: false } }))
    }
  },

  rename: async (panel, oldPath, newName) => {
    if (get()[panel].readOnly) { set({ status: READ_ONLY_MSG }); return }
    const lastSep = Math.max(oldPath.lastIndexOf('/'), oldPath.lastIndexOf('\\'))
    const newPath = oldPath.substring(0, lastSep + 1) + newName
    try {
      await api.RenameItem(oldPath, newPath)
      await get()._refreshAffected([parentDir(oldPath)])
      set({ status: `Renamed → ${newName}` })
      // 이름 변경 후 해당 항목에 커서 위치
      const newState = get()[panel]
      const visible = newState.showHidden ? newState.files : newState.files.filter(f => !f.isHidden)
      const idx = visible.findIndex(f => f.name === newName)
      if (idx >= 0) {
        set(s => ({ [panel]: { ...s[panel], cursor: idx, cursorOnParent: false } }))
      }
    } catch (err) {
      set({ status: `Rename failed: ${err}` })
    }
  },

  // 여러 이름 바꾸기 (Ctrl+M, Todo #133-4): 실패는 예외로 — 창이 오류를 보여 줌
  multiRename: async (panel, pairs) => {
    await api.RenameBatch(pairs)
    await get()._refreshAffected([get()[panel].path])
    const first = pairs[0] && getLastPathSegment(pairs[0].new)
    if (first) get()._focusByName(panel, first)
    set({ status: `이름 ${pairs.length}개 바꿈` })
  },

  compress: async (panel) => {
    const state = get()[panel]
    if (state.readOnly) { set({ status: READ_ONLY_MSG }); return }
    const selected = state.error || state.loading ? [] : [...state.selected]
    if (!selected.length) return
    const destPath = joinPath(state.path, 'archive.zip')
    try {
      await api.CompressItems(selected, destPath)
      await get().refresh(panel)
      set({ status: 'Archive created' })
    } catch (err) {
      set({ status: `Compress failed: ${err}` })
    }
  },

  // 백엔드가 실패(손상, 안전하지 않은 경로 등)를 보고하므로 상태 표시줄에 표시 (Todo #89)
  extract: async (panel, archivePath) => {
    const state = get()[panel]
    if (state.readOnly) { set({ status: READ_ONLY_MSG }); return }
    try {
      await api.ExtractArchive(archivePath, state.path)
      set({ status: 'Extracted successfully' })
    } catch (err) {
      set({ status: `Extract failed: ${err}` })
    }
    await get().refresh(panel)
  },

  openFile: async (path) => {
    await api.OpenFile(path)
  },

  readFile: async (path, encoding) => {
    // encoding 미지정/auto는 기존 자동 판별 경로 사용
    if (!encoding || encoding === 'auto') {
      return await api.ReadTextFile(path)
    }
    // 명시적 인코딩 — UI에서 사용자가 선택한 경우
    if (api.ReadTextFileWithEncoding) {
      return await api.ReadTextFileWithEncoding(path, encoding)
    }
    return await api.ReadTextFile(path)
  },

  // 이미지 파일을 base64 data URL로 읽는다 (Todo #52).
  // 마크다운의 GitHub 이미지에 대응하는 로컬 저장소 파일(data URL), 없으면 '' (Todo #116)
  resolveRepoImage: async (markdownPath, owner, repo, relPath) => {
    if (!api.ResolveRepoImage) return ''
    return await api.ResolveRepoImage(markdownPath, owner, repo, relPath)
  },

  readImage: async (path) => {
    if (api.ReadImageFile) {
      return await api.ReadImageFile(path)
    }
    return ''
  },

  // encoding: 'auto'면 백엔드가 기존 파일의 인코딩을 유지 (Todo #74)
  writeFile: async (path, content, encoding = 'auto') => {
    if (api.WriteTextFileWithEncoding) await api.WriteTextFileWithEncoding(path, content, encoding)
    else await api.WriteTextFile(path, content)
    await get()._refreshAffected([parentDir(path)])
  },

  navigateToBookmark: async (panel, bm) => {
    if (bm.isFile) {
      const lastSep = Math.max(bm.path.lastIndexOf('/'), bm.path.lastIndexOf('\\'))
      const parentPath = parentDir(bm.path)
      const fileName = bm.path.substring(lastSep + 1)
      if (!(await get().navigate(panel, parentPath))) return
      // 커서 인덱스는 숨김 필터 적용 목록 기준 (Todo #95)
      const st = get()[panel]
      const visible = st.showHidden ? st.files : st.files.filter(f => !f.isHidden)
      const idx = visible.findIndex(f => f.name === fileName)
      if (idx >= 0) {
        set(s => ({ [panel]: { ...s[panel], cursor: idx, cursorOnParent: false } }))
      }
    } else {
      await get().navigate(panel, bm.path)
    }
  },

  setStatus: (status) => set({ status }),

  // 영향 받은 디렉토리를 표시 중인 패널의 활성 탭을 모두 리프레시합니다.
  // 복사/이동 후 dest 폴더를 표시 중인 패널의 커서를 첫 source 파일에 위치시킨다 (Todo #48).
  // dest와 일치하는 패널이 양쪽 모두에 있을 수 있으므로 둘 다 처리.
  _focusCopiedFile: (dest, sources) => {
    const st = get()
    const lowerDest = dest.toLowerCase()
    for (const p of ['left', 'right']) {
      if (st[p].path.toLowerCase() !== lowerDest) continue
      const visible = st[p].showHidden ? st[p].files : st[p].files.filter(f => !f.isHidden)
      const idx = cursorAfterCopy(visible, sources)
      if (idx >= 0) {
        set(s => ({ [p]: { ...s[p], cursor: idx, cursorOnParent: false } }))
      }
    }
  },

  _refreshAffected: async (dirs) => {
    const lower = new Set(dirs.map(d => d.toLowerCase()))
    const st = get()
    await Promise.all(
      ['left', 'right']
        .filter(panel => lower.has(st[panel].path.toLowerCase()))
        // 다른 폴더로 이동하는 중이면 건너뜀 — 새로 고침이 그 이동을 밀어내면 사용자가 연 폴더가 무시됨
        .filter(panel => !st[panel].loading || (navTargets[panel] ?? '').toLowerCase() === st[panel].path.toLowerCase())
        .map(panel => get().refresh(panel))
    )
  },

  // 현재 세션(양쪽 패널의 모든 탭 경로)을 백엔드에 저장합니다.
  _saveSession: () => {
    const st = get()
    const getTabPaths = (panel) => {
      const s = st[panel]
      const tabs = [...s.tabs]
      // 활성 탭의 live path를 동기화
      tabs[s.activeTabIdx] = { ...tabs[s.activeTabIdx], path: s.path }
      return tabs.map(t => t.path || '')
    }
    api.SaveSessionState(
      getTabPaths('left'),  st.left.activeTabIdx,
      getTabPaths('right'), st.right.activeTabIdx
    ).catch(() => {})
  },

  // Helper: save current live panel state into tabs[activeTabIdx]
  _saveCurrentTab: (panel) => {
    const s = get()[panel]
    const updatedTabs = [...s.tabs]
    updatedTabs[s.activeTabIdx] = {
      ...updatedTabs[s.activeTabIdx],
      path: s.path,
      cursor: s.cursor,
      cursorOnParent: s.cursorOnParent,
      showHidden: s.showHidden,
      selected: s.selected,
      history: s.history,
      historyIndex: s.historyIndex,
      sortBy: s.sortBy,
      sortDir: s.sortDir,
    }
    return updatedTabs
  },

  newTab: async (panel) => {
    const s = get()[panel]
    const updatedTabs = get()._saveCurrentTab(panel)
    const newTab = createTabState(s.path)
    updatedTabs.push(newTab)
    const newIdx = updatedTabs.length - 1

    set(st => ({
      [panel]: {
        ...st[panel],
        tabs: updatedTabs,
        activeTabIdx: newIdx,
        cursor: 0,
        cursorOnParent: false,
        selected: new Set(),
        history: [],
        historyIndex: -1,
      }
    }))
    await get().navigate(panel, s.path)
    // navigate 내부에서 _saveSession이 호출되므로 별도 저장 불필요
  },

  closeTab: async (panel, idx) => {
    const s = get()[panel]
    if (s.tabs.length <= 1) return // last tab — can't close

    // 비활성 탭을 닫으면 현재 탭은 그대로 유지 (Todo #100)
    if (idx !== s.activeTabIdx) {
      if (idx < 0 || idx >= s.tabs.length) return
      const tabs = get()._saveCurrentTab(panel).filter((_, i) => i !== idx)
      const activeTabIdx = idx < s.activeTabIdx ? s.activeTabIdx - 1 : s.activeTabIdx
      set(st => ({ [panel]: { ...st[panel], tabs, activeTabIdx } }))
      get()._saveSession()
      return
    }

    // Save current state first
    const updatedTabs = get()._saveCurrentTab(panel).filter((_, i) => i !== idx)
    return get()._openTab(panel, updatedTabs, Math.min(idx, updatedTabs.length - 1))
  },

  switchTab: async (panel, idx) => {
    const s = get()[panel]
    if (idx === s.activeTabIdx || idx < 0 || idx >= s.tabs.length) return

    return get()._openTab(panel, get()._saveCurrentTab(panel), idx)
  },

  // 탭 idx를 활성으로: 저장해 둔 커서·선택·기록·정렬을 되살리고 그 폴더를 읽음 (탭 전환·닫기 공용, Todo #131-2b)
  _openTab: async (panel, tabs, idx) => {
    const target = tabs[idx]
    set(st => ({
      [panel]: {
        ...st[panel],
        tabs,
        activeTabIdx: idx,
        cursor: target.cursor || 0,
        cursorOnParent: target.cursorOnParent || false,
        showHidden: target.showHidden || false,
        selected: target.selected || new Set(),
        history: target.history || [],
        historyIndex: target.historyIndex ?? -1,
        sortBy: target.sortBy || 'name',
        sortDir: target.sortDir || 'asc',
        loading: true,
        error: null,
      }
    }))

    const isCurrent = beginNav(panel, target.path)
    try {
      const result = await api.ListDirectory(target.path)
      if (!isCurrent()) return
      set(st => ({
        [panel]: { ...st[panel], path: result.path, files: sortFiles(result.files || [], st[panel].sortBy, st[panel].sortDir), dirSizes: {}, readOnly: !!result.readOnly, loading: false }
      }))
      get()._saveSession()
    } catch (err) {
      if (!isCurrent()) return
      set(st => ({ [panel]: { ...st[panel], loading: false, error: err.message || String(err) } }))
    }
  },
}))
