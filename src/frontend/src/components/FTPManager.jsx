import React, { useState, useEffect } from 'react'
import { useFTPStore } from '../stores/ftpStore'
import { useFileStore } from '../stores/fileStore'
import {
  Plus, Trash2, Download, Upload, FolderPlus,
  Link, Link2Off, Bookmark, RefreshCw, ArrowUp,
  Server, Wifi, WifiOff, Star
} from 'lucide-react'
import styles from '../styles/FTPManager.module.css'

function formatSize(bytes, isDir) {
  if (isDir) return '<DIR>'
  if (!bytes) return '0 B'
  const units = ['B','KB','MB','GB']
  const i = Math.floor(Math.log(Math.max(bytes,1)) / Math.log(1024))
  return `${(bytes/Math.pow(1024,i)).toFixed(i>0?1:0)} ${units[i]}`
}

function formatDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return ''
  return dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString()
}

export default function FTPManager() {
  const ftpStore = useFTPStore()
  const fileStore = useFileStore()

  const [showConnect, setShowConnect]   = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [activeConn, setActiveConn]     = useState(null)
  const [ftpPath, setFtpPath]           = useState('/')
  const [ftpFiles, setFtpFiles]         = useState([])
  const [ftpLoading, setFtpLoading]     = useState(false)
  const [ftpError, setFtpError]         = useState(null)
  const [selected, setSelected]         = useState(new Set())
  const [localPanel, setLocalPanel]     = useState('left')
  const [status, setStatus]             = useState('')

  const localStore = fileStore[localPanel]

  useEffect(() => {
    ftpStore.loadBookmarks()
  }, [])

  const navigateFTP = async (path) => {
    if (!activeConn) return
    setFtpLoading(true)
    setFtpError(null)
    try {
      const result = await useFTPStore.getState().listDirectory === undefined
        ? { path, files: [] }
        : await (async () => {
            const r = await import('../wailsjs/runtime').then(m => m.default.FTPListDirectory(activeConn.id, path))
            return r
          })()
      setFtpPath(result.path)
      setFtpFiles(result.files || [])
      setSelected(new Set())
    } catch(e) {
      setFtpError(String(e))
    } finally {
      setFtpLoading(false)
    }
  }

  const handleConnect = async (config) => {
    setStatus('Connecting...')
    try {
      const api = (await import('../wailsjs/runtime')).default
      await api.FTPConnect(config)
      const conns = await api.FTPGetConnections()
      if (conns && conns.length > 0) {
        const conn = conns[conns.length - 1]
        setActiveConn(conn)
        await navigateFTPDirect(conn.id, '/')
        setStatus(`Connected to ${config.host}`)
      }
    } catch(e) {
      setStatus(`Connection failed: ${e}`)
    }
    setShowConnect(false)
  }

  const navigateFTPDirect = async (connId, path) => {
    setFtpLoading(true)
    setFtpError(null)
    try {
      const api = (await import('../wailsjs/runtime')).default
      const result = await api.FTPListDirectory(connId, path)
      setFtpPath(result.path)
      setFtpFiles(result.files || [])
      setSelected(new Set())
    } catch(e) {
      setFtpError(String(e))
    } finally {
      setFtpLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (!activeConn) return
    try {
      const api = (await import('../wailsjs/runtime')).default
      await api.FTPDisconnect(activeConn.id)
      setActiveConn(null)
      setFtpFiles([])
      setFtpPath('/')
      setStatus('Disconnected')
    } catch(e) {
      setStatus(`Disconnect error: ${e}`)
    }
  }

  const handleDownload = async () => {
    if (!activeConn || selected.size === 0) return
    const api = (await import('../wailsjs/runtime')).default
    const localPath = localStore.path
    let count = 0
    for (const path of selected) {
      setStatus(`Downloading ${path}...`)
      try {
        await api.FTPDownload(activeConn.id, path, localPath)
        count++
      } catch(e) {
        setStatus(`Download failed: ${e}`)
      }
    }
    await fileStore.refresh(localPanel)
    setStatus(`Downloaded ${count} file(s)`)
    setSelected(new Set())
  }

  const handleUpload = async () => {
    if (!activeConn) return
    const localSelected = [...localStore.selected]
    if (!localSelected.length) return
    const api = (await import('../wailsjs/runtime')).default
    let count = 0
    for (const localPath of localSelected) {
      const fileName = localPath.split('/').pop() || localPath.split('\\').pop()
      const remotePath = ftpPath.endsWith('/') ? ftpPath + fileName : ftpPath + '/' + fileName
      setStatus(`Uploading ${fileName}...`)
      try {
        await api.FTPUpload(activeConn.id, localPath, remotePath)
        count++
      } catch(e) {
        setStatus(`Upload failed: ${e}`)
      }
    }
    await navigateFTPDirect(activeConn.id, ftpPath)
    fileStore.clearSelection(localPanel)
    setStatus(`Uploaded ${count} file(s)`)
  }

  const handleFTPDelete = async () => {
    if (!activeConn || selected.size === 0) return
    const api = (await import('../wailsjs/runtime')).default
    for (const path of selected) {
      try {
        await api.FTPDeleteItem(activeConn.id, path)
      } catch(e) {
        setStatus(`Delete failed: ${e}`)
        return
      }
    }
    await navigateFTPDirect(activeConn.id, ftpPath)
    setStatus(`Deleted ${selected.size} item(s)`)
    setSelected(new Set())
  }

  const handleFTPMkdir = async () => {
    if (!activeConn) return
    const name = window.prompt('New directory name:')
    if (!name) return
    const api = (await import('../wailsjs/runtime')).default
    const newPath = ftpPath.endsWith('/') ? ftpPath + name : ftpPath + '/' + name
    try {
      await api.FTPCreateDirectory(activeConn.id, newPath)
      await navigateFTPDirect(activeConn.id, ftpPath)
      setStatus('Directory created')
    } catch(e) {
      setStatus(`Create dir failed: ${e}`)
    }
  }

  const handleSaveBookmark = () => {
    const name = window.prompt('Bookmark name:')
    if (!name || !activeConn) return
    ftpStore.saveBookmark({
      name,
      config: {
        host: activeConn.host,
        port: activeConn.port,
        username: activeConn.username,
        password: '',
      }
    })
    setStatus('Bookmark saved')
  }

  const toggleSelect = (path) => {
    const s = new Set(selected)
    s.has(path) ? s.delete(path) : s.add(path)
    setSelected(s)
  }

  return (
    <div className={styles.ftpManager}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.connInfo}>
          {activeConn ? (
            <>
              <Wifi size={13} className={styles.connIcon} />
              <span className={styles.connLabel}>
                {activeConn.username}@{activeConn.host}:{activeConn.port}
              </span>
            </>
          ) : (
            <>
              <WifiOff size={13} className={styles.disconnIcon} />
              <span className={styles.noConn}>Not connected</span>
            </>
          )}
        </div>

        <button className={styles.btn} onClick={() => setShowConnect(true)}>
          <Plus size={12} /> Connect
        </button>
        {activeConn && (
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={handleDisconnect}>
            <Link2Off size={12} /> Disconnect
          </button>
        )}
        <button className={styles.btn} onClick={() => setShowBookmarks(!showBookmarks)}>
          <Star size={12} /> Bookmarks
        </button>

        <div className={styles.sep} />

        {activeConn && <>
          <button className={styles.btn} onClick={handleDownload} disabled={selected.size === 0}>
            <Download size={12} /> Download
          </button>
          <button className={styles.btn} onClick={handleUpload} disabled={localStore.selected?.size === 0}>
            <Upload size={12} /> Upload
          </button>
          <button className={styles.btn} onClick={handleFTPMkdir}>
            <FolderPlus size={12} /> New Dir
          </button>
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={handleFTPDelete} disabled={selected.size === 0}>
            <Trash2 size={12} /> Delete
          </button>
          <button className={styles.btn} onClick={() => navigateFTPDirect(activeConn.id, ftpPath)}>
            <RefreshCw size={12} /> Refresh
          </button>
          {!activeConn && null}
          <button className={styles.btn} onClick={handleSaveBookmark}>
            <Bookmark size={12} /> Bookmark
          </button>
        </>}

        <div className={styles.sep} />

        <select
          className={styles.panelSelect}
          value={localPanel}
          onChange={e => setLocalPanel(e.target.value)}
        >
          <option value="left">Left Panel (Local)</option>
          <option value="right">Right Panel (Local)</option>
        </select>

        {status && <span className={styles.statusMsg}>{status}</span>}
      </div>

      {/* Main area */}
      <div className={styles.mainArea}>
        {/* Bookmarks panel */}
        {showBookmarks && (
          <div className={styles.bookmarksPanel}>
            <div className={styles.bookmarksHeader}>
              <Server size={13} />
              <span>Bookmarks</span>
              <button className={styles.closeBtn} onClick={() => setShowBookmarks(false)}>✕</button>
            </div>
            <div className={styles.bookmarksList}>
              {ftpStore.bookmarks.length === 0 && (
                <div className={styles.empty}>No bookmarks saved</div>
              )}
              {ftpStore.bookmarks.map(bm => (
                <div key={bm.id} className={styles.bookmarkItem}>
                  <div
                    className={styles.bookmarkName}
                    onClick={() => { setShowConnect(false); handleConnect(bm.config) }}
                  >
                    <Star size={11} />
                    <span>{bm.name}</span>
                    <span className={styles.bookmarkHost}>{bm.config.host}</span>
                  </div>
                  <button
                    className={styles.bookmarkDelete}
                    onClick={() => ftpStore.deleteBookmark(bm.id)}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Local panel */}
        <div className={styles.localPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>LOCAL</span>
            <span className={styles.panelPath}>{localStore.path}</span>
            <button className={styles.iconBtn} onClick={() => fileStore.navigateUp(localPanel)}>
              <ArrowUp size={12} />
            </button>
            <button className={styles.iconBtn} onClick={() => fileStore.refresh(localPanel)}>
              <RefreshCw size={12} />
            </button>
          </div>
          <div className={styles.fileList}>
            <div className={styles.colHeaders}>
              <span style={{flex:'1'}}>Name</span>
              <span style={{width:80,textAlign:'right'}}>Size</span>
              <span style={{width:140}}>Modified</span>
            </div>
            {localStore.files?.map((file, i) => (
              <div
                key={file.path}
                className={`${styles.fileRow} ${localStore.selected?.has(file.path) ? styles.selected : ''} ${i%2===0?styles.even:styles.odd}`}
                onClick={(e) => {
                  if (e.ctrlKey) fileStore.toggleSelect(localPanel, file.path)
                }}
                onDoubleClick={() => {
                  if (file.isDir) fileStore.navigate(localPanel, file.path)
                }}
              >
                <span className={styles.rowName}>
                  {file.isDir ? '📁' : '📄'} {file.name}
                </span>
                <span className={styles.rowSize}>{formatSize(file.size, file.isDir)}</span>
                <span className={styles.rowDate}>{formatDate(file.modified)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* FTP panel */}
        <div className={styles.ftpPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle} style={{color: activeConn ? 'var(--text-green)' : 'var(--text-muted)'}}>
              {activeConn ? 'FTP' : 'FTP (offline)'}
            </span>
            <span className={styles.panelPath}>{ftpPath}</span>
            {activeConn && (
              <>
                <button className={styles.iconBtn} onClick={async () => {
                  const parentPath = ftpPath === '/' ? '/' : ftpPath.replace(/\/[^/]+\/?$/, '') || '/'
                  await navigateFTPDirect(activeConn.id, parentPath)
                }}>
                  <ArrowUp size={12} />
                </button>
                <button className={styles.iconBtn} onClick={() => navigateFTPDirect(activeConn.id, ftpPath)}>
                  <RefreshCw size={12} />
                </button>
              </>
            )}
          </div>
          <div className={styles.fileList}>
            <div className={styles.colHeaders}>
              <span style={{flex:'1'}}>Name</span>
              <span style={{width:80,textAlign:'right'}}>Size</span>
              <span style={{width:140}}>Modified</span>
            </div>
            {ftpLoading && <div className={styles.loading}>Loading...</div>}
            {ftpError && <div className={styles.error}>⚠ {ftpError}</div>}
            {!activeConn && !ftpLoading && (
              <div className={styles.notConnected}>
                <WifiOff size={32} />
                <p>Not connected to FTP server</p>
                <button className={styles.connectBtn} onClick={() => setShowConnect(true)}>
                  <Plus size={13} /> Connect to server
                </button>
              </div>
            )}
            {activeConn && !ftpLoading && ftpFiles.map((file, i) => (
              <div
                key={file.path}
                className={`${styles.fileRow} ${selected.has(file.path) ? styles.selected : ''} ${i%2===0?styles.even:styles.odd}`}
                onClick={(e) => {
                  if (e.ctrlKey) toggleSelect(file.path)
                  else setSelected(new Set([file.path]))
                }}
                onDoubleClick={() => {
                  if (file.isDir) navigateFTPDirect(activeConn.id, file.path)
                }}
              >
                <span className={styles.rowName}>
                  {file.isDir ? '📁' : '📄'} {file.name}
                </span>
                <span className={styles.rowSize}>{formatSize(file.size, file.isDir)}</span>
                <span className={styles.rowDate}>{formatDate(file.modified)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Connect modal */}
      {showConnect && (
        <ConnectModal
          onConnect={handleConnect}
          onClose={() => setShowConnect(false)}
        />
      )}
    </div>
  )
}

function ConnectModal({ onConnect, onClose }) {
  const [config, setConfig] = useState({
    host: '', port: 21, username: '', password: '', passive: true
  })

  const set = (k, v) => setConfig(c => ({ ...c, [k]: v }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!config.host) return
    onConnect(config)
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <Link size={15} />
          <span>FTP Connect</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form className={styles.modalBody} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label>Host</label>
            <input
              placeholder="ftp.example.com"
              value={config.host}
              onChange={e => set('host', e.target.value)}
              autoFocus
            />
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Port</label>
              <input
                type="number"
                value={config.port}
                onChange={e => set('port', parseInt(e.target.value) || 21)}
                style={{width:70}}
              />
            </div>
            <div className={styles.field} style={{flex:1}}>
              <label>Username</label>
              <input
                placeholder="anonymous"
                value={config.username}
                onChange={e => set('username', e.target.value)}
              />
            </div>
          </div>
          <div className={styles.field}>
            <label>Password</label>
            <input
              type="password"
              placeholder="(leave blank for anonymous)"
              value={config.password}
              onChange={e => set('password', e.target.value)}
            />
          </div>
          <div className={styles.fieldCheck}>
            <label>
              <input
                type="checkbox"
                checked={config.passive}
                onChange={e => set('passive', e.target.checked)}
              />
              Passive mode
            </label>
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnConnect}>
              <Link size={13} /> Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
