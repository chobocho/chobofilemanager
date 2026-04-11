import { create } from 'zustand'
import api from '../wailsjs/runtime'

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
})

export const useFileStore = create((set, get) => ({
  left: createPanelState('left'),
  right: createPanelState('right'),
  activePanel: 'left',
  drives: [],
  clipboard: { items: [], operation: null },
  status: '',

  init: async () => {
    const [home, drives] = await Promise.all([
      api.GetHomeDirectory(),
      api.GetDrives(),
    ])
    set({ drives })
    await get().navigate('left', home)
    await get().navigate('right', home)
  },

  setActivePanel: (panel) => set({ activePanel: panel }),

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
        }
      }))
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
    set(s => ({ [panel]: { ...s[panel], cursor: index } }))
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
    if (!selected.length) return

    set({ status: `Copying ${selected.length} item(s)...` })
    try {
      await api.CopyItems(selected, state[other].path)
      await get().refresh(other)
      set({ status: `Copied ${selected.length} item(s)` })
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
    if (!selected.length) return { paths: [], count: 0 }
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
    }
  },

  createDirectory: async (panel, name) => {
    const state = get()[panel]
    const path = await api.JoinPath(state.path, name)
    await api.CreateDirectory(path)
    await get().refresh(panel)
  },

  rename: async (panel, oldPath, newName) => {
    const dir = await api.GetParentPath(oldPath)
    const newPath = await api.JoinPath(dir, newName)
    await api.RenameItem(oldPath, newPath)
    await get().refresh(panel)
  },

  compress: async (panel) => {
    const state = get()[panel]
    const selected = [...state.selected]
    if (!selected.length) return
    const destPath = await api.JoinPath(state.path, 'archive.zip')
    await api.CompressItems(selected, destPath)
    await get().refresh(panel)
    set({ status: 'Archive created' })
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
}))
