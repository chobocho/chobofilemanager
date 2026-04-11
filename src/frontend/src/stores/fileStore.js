import { create } from 'zustand'
import api from '../wailsjs/runtime'

// Windows(\) / Unix(/) 경로 구분자를 모두 처리하는 경로 조합 함수
// api.JoinPath(variadic)은 Wails2 바인딩에서 동작하지 않으므로 JS에서 직접 처리
export function joinPath(base, name) {
  const sep = base.includes('\\') ? '\\' : '/'
  return base.replace(/[/\\]+$/, '') + sep + name
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
      const newHistory = [...state.history.slice(0, state.historyIndex + 1), path]
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
    const parent = await api.GetParentPath(state.path)
    if (parent !== state.path) {
      await get().navigate(panel, parent)
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
      const cursor = state[panel].files[state[panel].cursor]
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
      await get().refresh(other)
      set({ status: `Copied ${selected.length} item(s)` })
    } catch (err) {
      set({ status: `Copy failed: ${err}` })
    }
    return { conflicts: [], sources: [], dest: '' }
  },

  copyWithMode: async (sources, dest, mode) => {
    set({ status: `Copying ${sources.length} item(s)...` })
    const state = get()
    const panel = state.activePanel
    const other = panel === 'left' ? 'right' : 'left'
    try {
      if (mode === 'overwrite') {
        await api.CopyItems(sources, dest)
      } else if (mode === 'rename') {
        await api.CopyItemsRename(sources, dest)
      } else if (mode === 'skip') {
        await api.CopyItemsSkipConflicts(sources, dest)
      }
      await get().refresh(other)
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
      const cursor = state[panel].files[state[panel].cursor]
      if (cursor) selected.push(cursor.path)
    }
    if (!selected.length) return

    set({ status: `Moving ${selected.length} item(s)...` })
    try {
      await api.MoveItems(selected, state[other].path)
      await get().refresh(panel)
      await get().refresh(other)
      set({ status: `Moved ${selected.length} item(s)` })
    } catch (err) {
      set({ status: `Move failed: ${err}` })
    }
  },

  delete: async () => {
    const state = get()
    const panel = state.activePanel
    const selected = [...state[panel].selected]
    if (!selected.length) {
      const cursor = state[panel].files[state[panel].cursor]
      if (cursor) selected.push(cursor.path)
    }
    if (!selected.length) {
      set({ status: '삭제할 파일이 없습니다.' })
      return { paths: [], count: 0 }
    }
    return { paths: selected, count: selected.length }
  },

  confirmDelete: async (paths) => {
    const panel = get().activePanel
    set({ status: `Deleting ${paths.length} item(s)...` })
    try {
      await api.DeleteItems(paths)
      await get().refresh(panel)
      set({ status: `Deleted ${paths.length} item(s)` })
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
    } catch (err) {
      set({ status: `Create directory failed: ${err}` })
      throw err
    }
  },

  rename: async (panel, oldPath, newName) => {
    const lastSep = Math.max(oldPath.lastIndexOf('/'), oldPath.lastIndexOf('\\'))
    const newPath = oldPath.substring(0, lastSep + 1) + newName
    try {
      await api.RenameItem(oldPath, newPath)
      await get().refresh(panel)
      set({ status: `Renamed → ${newName}` })
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

  readFile: async (path) => {
    return await api.ReadTextFile(path)
  },

  writeFile: async (path, content) => {
    await api.WriteTextFile(path, content)
  },

  setStatus: (status) => set({ status }),

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
