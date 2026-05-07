import { create } from 'zustand'
import api from '../wailsjs/runtime'

// Windows(\) / Unix(/) 경로 구분자를 모두 처리하는 경로 조합 함수
// api.JoinPath(variadic)은 Wails2 바인딩에서 동작하지 않으므로 JS에서 직접 처리
// 경로에서 부모 디렉토리를 반환합니다.
function parentDir(path) {
  const last = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return last > 0 ? path.substring(0, last) : path
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
    const paths = (tabsState?.paths?.length > 0) ? tabsState.paths : [legacyPath || home]
    const activeIdx = Math.min(tabsState?.activeIdx ?? 0, paths.length - 1)

    // 탭 배열 미리 구성 (비활성 탭은 lazy 로딩)
    const tabs = paths.map(p => createTabState(p))
    set(s => ({
      [panel]: { ...s[panel], tabs, activeTabIdx: activeIdx }
    }))

    // 활성 탭만 실제로 로딩
    await get().navigate(panel, paths[activeIdx] || home)
  },

  setActivePanel: (panel) => {
    set({ activePanel: panel })
    const path = get()[panel].path
    if (path) api.ChangeWorkingDirectory(path).catch(() => {})
  },

  navigate: async (panel, path) => {
    const state = get()[panel]
    set(s => ({ [panel]: { ...s[panel], loading: true, error: null } }))
    try {
      const result = await api.ListDirectory(path)
      const newHistory = [...state.history.slice(0, state.historyIndex + 1), result.path]
      set(s => ({
        [panel]: {
          ...s[panel],
          path: result.path,
          files: result.files || [],
          selected: new Set(),
          loading: false,
          history: newHistory,
          historyIndex: newHistory.length - 1,
          cursor: 0,
          cursorOnParent: false,
        }
      }))
      // 세션 저장 (에러는 무시)
      get()._saveSession()
      // 활성 패널이 이동한 경우 프로세스 작업 폴더도 변경
      if (get().activePanel === panel) {
        api.ChangeWorkingDirectory(result.path).catch(() => {})
      }
    } catch (err) {
      set(s => ({
        [panel]: {
          ...s[panel],
          loading: false,
          error: err.message || String(err),
        }
      }))
    }
  },

  navigateBack: async (panel) => {
    const state = get()[panel]
    if (state.historyIndex > 0) {
      const prevPath = state.history[state.historyIndex]
      const newIndex = state.historyIndex - 1
      const path = state.history[newIndex]
      set(s => ({ [panel]: { ...s[panel], historyIndex: newIndex } }))
      const result = await api.ListDirectory(path)
      set(s => ({
        [panel]: {
          ...s[panel],
          path: result.path,
          files: result.files || [],
          selected: new Set(),
          loading: false,
        }
      }))
      // 직전에 있던 폴더명으로 커서 이동
      const childName = getLastPathSegment(prevPath)
      if (!childName) return
      const newState = get()[panel]
      const visible = newState.showHidden ? newState.files : newState.files.filter(f => !f.isHidden)
      const idx = visible.findIndex(f => f.name === childName || f.name === childName + '/')
      if (idx >= 0) {
        set(s => ({ [panel]: { ...s[panel], cursor: idx, cursorOnParent: false } }))
      }
    }
  },

  navigateForward: async (panel) => {
    const state = get()[panel]
    if (state.historyIndex < state.history.length - 1) {
      const newIndex = state.historyIndex + 1
      const path = state.history[newIndex]
      set(s => ({ [panel]: { ...s[panel], historyIndex: newIndex } }))
      const result = await api.ListDirectory(path)
      set(s => ({
        [panel]: {
          ...s[panel],
          path: result.path,
          files: result.files || [],
          selected: new Set(),
          loading: false,
        }
      }))
    }
  },

  navigateUp: async (panel) => {
    const state = get()[panel]
    const currentPath = state.path
    const parent = await api.GetParentPath(currentPath)
    if (parent === currentPath) return
    await get().navigate(panel, parent)
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

  refresh: async (panel) => {
    const state = get()[panel]
    await get().navigate(panel, state.path)
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

  selectAll: (panel) => {
    set(s => {
      const selected = new Set(s[panel].files.map(f => f.path))
      return { [panel]: { ...s[panel], selected } }
    })
  },

  clearSelection: (panel) => {
    set(s => ({ [panel]: { ...s[panel], selected: new Set() } }))
  },

  setCursor: (panel, index) => {
    set(s => ({ [panel]: { ...s[panel], cursor: index, cursorOnParent: false } }))
  },

  setCursorOnParent: (panel, val) => {
    set(s => ({ [panel]: { ...s[panel], cursorOnParent: val } }))
  },

  setSort: (panel, sortBy) => {
    set(s => {
      const current = s[panel]
      const sortDir = current.sortBy === sortBy && current.sortDir === 'asc' ? 'desc' : 'asc'
      const files = [...current.files].sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        let va = a[sortBy], vb = b[sortBy]
        if (typeof va === 'string') va = va.toLowerCase()
        if (typeof vb === 'string') vb = vb.toLowerCase()
        if (va < vb) return sortDir === 'asc' ? -1 : 1
        if (va > vb) return sortDir === 'asc' ? 1 : -1
        return 0
      })
      return { [panel]: { ...current, sortBy, sortDir, files } }
    })
  },

  toggleHidden: (panel) => {
    set(s => ({ [panel]: { ...s[panel], showHidden: !s[panel].showHidden } }))
  },

  // ─── File Operations ──────────────────────────────────────────────────────

  copy: async () => {
    const state = get()
    const panel = state.activePanel
    const other = panel === 'left' ? 'right' : 'left'
    const selected = [...state[panel].selected]
    if (!selected.length) {
      const visibleFiles = state[panel].showHidden ? state[panel].files : state[panel].files.filter(f => !f.isHidden)
      const cursor = visibleFiles[state[panel].cursor]
      if (cursor) selected.push(cursor.path)
    }
    if (!selected.length) return { conflicts: [], sources: [], dest: '' }

    const dest = state[other].path
    const conflicts = await api.CheckCopyConflicts(selected, dest)
    if (conflicts && conflicts.length > 0) {
      return { conflicts, sources: selected, dest }
    }

    set({ status: `Copying ${selected.length} item(s)...` })
    try {
      await api.CopyItems(selected, dest)
      await get()._refreshAffected([dest])
      get()._focusCopiedFile(dest, selected)
      set({ status: `Copied ${selected.length} item(s)` })
    } catch (err) {
      set({ status: `Copy failed: ${err}` })
    }
    return { conflicts: [], sources: [], dest: '' }
  },

  copyWithMode: async (sources, dest, mode) => {
    set({ status: `Copying ${sources.length} item(s)...` })
    try {
      if (mode === 'overwrite') {
        await api.CopyItems(sources, dest)
      } else if (mode === 'rename') {
        await api.CopyItemsRename(sources, dest)
      } else if (mode === 'skip') {
        await api.CopyItemsSkipConflicts(sources, dest)
      }
      await get()._refreshAffected([dest])
      get()._focusCopiedFile(dest, sources)
      set({ status: `Copied ${sources.length} item(s)` })
    } catch (err) {
      set({ status: `Copy failed: ${err}` })
    }
  },

  move: async () => {
    const state = get()
    const panel = state.activePanel
    const other = panel === 'left' ? 'right' : 'left'
    const selected = [...state[panel].selected]
    if (!selected.length) {
      const visibleFiles = state[panel].showHidden ? state[panel].files : state[panel].files.filter(f => !f.isHidden)
      const cursor = visibleFiles[state[panel].cursor]
      if (cursor) selected.push(cursor.path)
    }
    if (!selected.length) return { conflicts: [], sources: [], dest: '' }

    const dest = state[other].path
    const conflicts = await api.CheckCopyConflicts(selected, dest)
    if (conflicts && conflicts.length > 0) {
      return { conflicts, sources: selected, dest }
    }

    set({ status: `Moving ${selected.length} item(s)...` })
    try {
      await api.MoveItems(selected, dest)
      const affectedDirs = [...new Set([...selected.map(p => parentDir(p)), dest])]
      await get()._refreshAffected(affectedDirs)
      get()._focusCopiedFile(dest, selected)
      set({ status: `Moved ${selected.length} item(s)` })
    } catch (err) {
      set({ status: `Move failed: ${err}` })
    }
    return { conflicts: [], sources: [], dest: '' }
  },

  moveWithMode: async (sources, dest, mode) => {
    set({ status: `Moving ${sources.length} item(s)...` })
    try {
      if (mode === 'overwrite') {
        await api.MoveItemsOverwrite(sources, dest)
      } else if (mode === 'rename') {
        await api.MoveItemsRename(sources, dest)
      }
      const affectedDirs = [...new Set([...sources.map(p => parentDir(p)), dest])]
      await get()._refreshAffected(affectedDirs)
      get()._focusCopiedFile(dest, sources)
      set({ status: `Moved ${sources.length} item(s)` })
    } catch (err) {
      set({ status: `Move failed: ${err}` })
    }
  },

  delete: async () => {
    const state = get()
    const panel = state.activePanel
    const selected = [...state[panel].selected]
    if (!selected.length) {
      const visibleFiles = state[panel].showHidden ? state[panel].files : state[panel].files.filter(f => !f.isHidden)
      const cursor = visibleFiles[state[panel].cursor]
      if (cursor) selected.push(cursor.path)
    }
    if (!selected.length) {
      set({ status: '삭제할 파일이 없습니다.' })
      return { paths: [], count: 0 }
    }
    return { paths: selected, count: selected.length }
  },

  confirmDelete: async (paths) => {
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

    set({ status: `Deleting ${paths.length} item(s)...` })
    try {
      await api.DeleteItems(paths)
      await get()._refreshAffected([...new Set(paths.map(p => parentDir(p)))])
      set({ status: `Deleted ${paths.length} item(s)` })

      // 삭제된 위치 바로 위 파일로 커서 이동
      const after = get()[panel]
      const visibleAfter = after.showHidden
        ? after.files
        : after.files.filter(f => !f.isHidden)
      const newCursor = cursorAfterDelete(minDeletedIdx, visibleAfter.length)
      if (newCursor >= 0) {
        set(s => ({ [panel]: { ...s[panel], cursor: newCursor, cursorOnParent: false } }))
      }
    } catch (err) {
      set({ status: `Delete failed: ${err}` })
      throw err
    }
  },

  createDirectory: async (panel, name) => {
    const state = get()[panel]
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

  compress: async (panel) => {
    const state = get()[panel]
    const selected = [...state.selected]
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

  extract: async (panel, archivePath) => {
    const state = get()[panel]
    await api.ExtractArchive(archivePath, state.path)
    await get().refresh(panel)
    set({ status: 'Extracted successfully' })
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
  readImage: async (path) => {
    if (api.ReadImageFile) {
      return await api.ReadImageFile(path)
    }
    return ''
  },

  writeFile: async (path, content) => {
    await api.WriteTextFile(path, content)
    await get()._refreshAffected([parentDir(path)])
  },

  navigateToBookmark: async (panel, bm) => {
    if (bm.isFile) {
      const lastSep = Math.max(bm.path.lastIndexOf('/'), bm.path.lastIndexOf('\\'))
      const parentPath = lastSep > 0 ? bm.path.substring(0, lastSep) : bm.path
      const fileName = bm.path.substring(lastSep + 1)
      await get().navigate(panel, parentPath)
      const files = get()[panel].files
      const idx = files.findIndex(f => f.name === fileName)
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

    // Save current state first
    const updatedTabs = get()._saveCurrentTab(panel).filter((_, i) => i !== idx)
    const newIdx = Math.min(idx, updatedTabs.length - 1)
    const target = updatedTabs[newIdx]

    set(st => ({
      [panel]: {
        ...st[panel],
        tabs: updatedTabs,
        activeTabIdx: newIdx,
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

    try {
      const result = await api.ListDirectory(target.path)
      set(st => ({
        [panel]: { ...st[panel], path: result.path, files: result.files || [], loading: false }
      }))
      get()._saveSession()
    } catch (err) {
      set(st => ({ [panel]: { ...st[panel], loading: false, error: err.message || String(err) } }))
    }
  },

  switchTab: async (panel, idx) => {
    const s = get()[panel]
    if (idx === s.activeTabIdx || idx < 0 || idx >= s.tabs.length) return

    const updatedTabs = get()._saveCurrentTab(panel)
    const target = updatedTabs[idx]

    set(st => ({
      [panel]: {
        ...st[panel],
        tabs: updatedTabs,
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

    try {
      const result = await api.ListDirectory(target.path)
      set(st => ({
        [panel]: { ...st[panel], path: result.path, files: result.files || [], loading: false }
      }))
      get()._saveSession()
    } catch (err) {
      set(st => ({ [panel]: { ...st[panel], loading: false, error: err.message || String(err) } }))
    }
  },
}))
