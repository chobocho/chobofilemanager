import { create } from 'zustand'
import api from '../wailsjs/runtime'

export const useFTPStore = create((set, get) => ({
  connections: [],
  bookmarks: [],
  history: [],
  activeConnection: null,
  panels: {
    left: { path: '/', files: [], loading: false, error: null },
    right: { path: '/', files: [], loading: false, error: null },
  },

  loadBookmarks: async () => {
    try {
      const bookmarks = await api.FTPGetBookmarks()
      set({ bookmarks: bookmarks || [] })
    } catch (e) {
      console.error('Failed to load FTP bookmarks', e)
    }
  },

  loadHistory: async () => {
    try {
      const history = await api.FTPGetHistory()
      set({ history: history || [] })
    } catch (e) {
      console.error('Failed to load FTP history', e)
    }
  },

  addHistory: async (config) => {
    try {
      await api.FTPAddHistory(config)
      await get().loadHistory()
    } catch (e) {
      console.error('Failed to save FTP history', e)
    }
  },

  deleteHistory: async (id) => {
    await api.FTPDeleteHistory(id)
    await get().loadHistory()
  },

  clearHistory: async () => {
    await api.FTPClearHistory()
    set({ history: [] })
  },

  connect: async (config) => {
    await api.FTPConnect(config)
    const connections = await api.FTPGetConnections()
    set({ connections: connections || [] })
    return connections[connections.length - 1]
  },

  disconnect: async (id) => {
    await api.FTPDisconnect(id)
    const connections = await api.FTPGetConnections()
    set({ connections: connections || [] })
  },

  refreshConnections: async () => {
    const connections = await api.FTPGetConnections()
    set({ connections: connections || [] })
  },

  listDirectory: async (connectionId, path, panelSide) => {
    set(s => ({
      panels: {
        ...s.panels,
        [panelSide]: { ...s.panels[panelSide], loading: true, error: null }
      }
    }))
    try {
      const result = await api.FTPListDirectory(connectionId, path)
      set(s => ({
        panels: {
          ...s.panels,
          [panelSide]: {
            path: result.path,
            files: result.files || [],
            loading: false,
            error: null,
          }
        }
      }))
    } catch (err) {
      set(s => ({
        panels: {
          ...s.panels,
          [panelSide]: {
            ...s.panels[panelSide],
            loading: false,
            error: err.message || String(err),
          }
        }
      }))
    }
  },

  download: async (connectionId, remotePath, localPath) => {
    await api.FTPDownload(connectionId, remotePath, localPath)
  },

  upload: async (connectionId, localPath, remotePath) => {
    await api.FTPUpload(connectionId, localPath, remotePath)
  },

  deleteItem: async (connectionId, path) => {
    await api.FTPDeleteItem(connectionId, path)
  },

  createDirectory: async (connectionId, path) => {
    await api.FTPCreateDirectory(connectionId, path)
  },

  renameItem: async (connectionId, oldPath, newPath) => {
    await api.FTPRenameItem(connectionId, oldPath, newPath)
  },

  saveBookmark: async (bookmark) => {
    await api.FTPSaveBookmark(bookmark)
    await get().loadBookmarks()
  },

  deleteBookmark: async (id) => {
    await api.FTPDeleteBookmark(id)
    await get().loadBookmarks()
  },
}))
