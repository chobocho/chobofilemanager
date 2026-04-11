import React, { useState, useEffect, useRef } from 'react'
import { useFTPStore } from '../stores/ftpStore'
import { useFileStore } from '../stores/fileStore'
import { useThemeStore } from '../stores/themeStore'
import {
  Plus, Trash2, Download, Upload, FolderPlus,
  Link, Link2Off, Bookmark, RefreshCw, ArrowUp,
  Server, Wifi, WifiOff, Star,
  Folder, File, FileText, FileImage, FileArchive, FileCode,
  Eye, EyeOff,
} from 'lucide-react'
import styles from '../styles/FTPManager.module.css'

// ─── 아이콘 맵 (FilePanel 과 동일) ────────────────────────────
const FILE_ICONS_DARK = {
  '.txt': { icon: FileText,    color: '#c8d0e0' }, '.md':  { icon: FileText,    color: '#60d0ff' },
  '.js':  { icon: FileCode,    color: '#f0c040' }, '.jsx': { icon: FileCode,    color: '#40d0f0' },
  '.ts':  { icon: FileCode,    color: '#4080ff' }, '.tsx': { icon: FileCode,    color: '#4080ff' },
  '.go':  { icon: FileCode,    color: '#40c0d0' }, '.py':  { icon: FileCode,    color: '#50e090' },
  '.rs':  { icon: FileCode,    color: '#ff7050' }, '.c':   { icon: FileCode,    color: '#a0c0ff' },
  '.cpp': { icon: FileCode,    color: '#a0c0ff' }, '.html':{ icon: FileCode,    color: '#ff8040' },
  '.css': { icon: FileCode,    color: '#60a0ff' }, '.json':{ icon: FileCode,    color: '#f0c040' },
  '.xml': { icon: FileCode,    color: '#80d080' }, '.yaml':{ icon: FileCode,    color: '#d0a0ff' },
  '.yml': { icon: FileCode,    color: '#d0a0ff' }, '.sh':  { icon: FileCode,    color: '#50e090' },
  '.bat': { icon: FileCode,    color: '#80c0ff' },
  '.png': { icon: FileImage,   color: '#ff80c0' }, '.jpg': { icon: FileImage,   color: '#ff80a0' },
  '.jpeg':{ icon: FileImage,   color: '#ff80a0' }, '.gif': { icon: FileImage,   color: '#ff80d0' },
  '.webp':{ icon: FileImage,   color: '#d080ff' }, '.svg': { icon: FileImage,   color: '#ff9060' },
  '.ico': { icon: FileImage,   color: '#80a0ff' },
  '.zip': { icon: FileArchive, color: '#f0c040' }, '.tar': { icon: FileArchive, color: '#f0a040' },
  '.gz':  { icon: FileArchive, color: '#f0a040' }, '.rar': { icon: FileArchive, color: '#ff6040' },
  '.7z':  { icon: FileArchive, color: '#ff8040' },
}
const FILE_ICONS_LIGHT = {
  '.txt': { icon: FileText,    color: '#506070' }, '.md':  { icon: FileText,    color: '#0080b0' },
  '.js':  { icon: FileCode,    color: '#c09000' }, '.jsx': { icon: FileCode,    color: '#0090a0' },
  '.ts':  { icon: FileCode,    color: '#1050c0' }, '.tsx': { icon: FileCode,    color: '#1050c0' },
  '.go':  { icon: FileCode,    color: '#007890' }, '.py':  { icon: FileCode,    color: '#207040' },
  '.rs':  { icon: FileCode,    color: '#c04020' }, '.c':   { icon: FileCode,    color: '#3060a0' },
  '.cpp': { icon: FileCode,    color: '#3060a0' }, '.html':{ icon: FileCode,    color: '#b04000' },
  '.css': { icon: FileCode,    color: '#1060c0' }, '.json':{ icon: FileCode,    color: '#c09000' },
  '.xml': { icon: FileCode,    color: '#306030' }, '.yaml':{ icon: FileCode,    color: '#6030a0' },
  '.yml': { icon: FileCode,    color: '#6030a0' }, '.sh':  { icon: FileCode,    color: '#207040' },
  '.bat': { icon: FileCode,    color: '#2060a0' },
  '.png': { icon: FileImage,   color: '#c02080' }, '.jpg': { icon: FileImage,   color: '#c03060' },
  '.jpeg':{ icon: FileImage,   color: '#c03060' }, '.gif': { icon: FileImage,   color: '#c020a0' },
  '.webp':{ icon: FileImage,   color: '#8020c0' }, '.svg': { icon: FileImage,   color: '#c05020' },
  '.ico': { icon: FileImage,   color: '#2050c0' },
  '.zip': { icon: FileArchive, color: '#c09000' }, '.tar': { icon: FileArchive, color: '#b06000' },
  '.gz':  { icon: FileArchive, color: '#b06000' }, '.rar': { icon: FileArchive, color: '#c02000' },
  '.7z':  { icon: FileArchive, color: '#b04000' },
}

function getFileIcon(file, theme) {
  const icons = theme === 'light' ? FILE_ICONS_LIGHT : FILE_ICONS_DARK
  const folderColor = theme === 'light' ? '#b07800' : '#f0c040'
  const defaultColor = theme === 'light' ? '#4a5068' : '#7080a0'
  if (file.isDir) return { icon: Folder, color: folderColor }
  const ext = file.extension || (file.name?.includes('.') ? '.' + file.name.split('.').pop().toLowerCase() : '')
  return icons[ext] || { icon: File, color: defaultColor }
}

function getExt(file) {
  const ext = file.extension || (file.name?.includes('.') ? file.name.split('.').pop().toLowerCase() : '')
  return ext.replace(/^\./, '')
}

function formatSize(bytes, isDir) {
  if (isDir) return '<DIR>'
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─── 공유 파일 목록 패널 컴포넌트 ─────────────────────────────
function FileListPanel({
  title, titleColor, path,
  files, selected, cursor, cursorOnParent, showParent,
  loading, error,
  onCursorChange, onCursorOnParentChange, onToggleSelect,
  onNavigateUp, onNavigate,
  onRefresh,
  showHidden, onToggleHidden,
  notConnected,
  extraHeaderButtons,
  theme,
  listRef,
}) {
  const handleKeyDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        if (!cursorOnParent) {
          if (cursor > 0) onCursorChange(cursor - 1)
          else if (showParent) onCursorOnParentChange(true)
        }
        break
      case 'ArrowDown':
        e.preventDefault()
        if (cursorOnParent) { onCursorOnParentChange(false); onCursorChange(0) }
        else if (cursor < files.length - 1) onCursorChange(cursor + 1)
        break
      case 'Enter':
        e.preventDefault()
        if (cursorOnParent) onNavigateUp()
        else if (files[cursor]?.isDir) onNavigate(files[cursor].path)
        break
      case 'Backspace':
        e.preventDefault()
        onNavigateUp()
        break
      case ' ':
        e.preventDefault()
        if (!cursorOnParent && files[cursor]) onToggleSelect(files[cursor].path)
        break
      default: break
    }
  }

  return (
    <div className={styles.fileListPanel} ref={listRef} tabIndex={0} onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle} style={titleColor ? { color: titleColor } : {}}>
          {title}
        </span>
        <span className={styles.panelPath}>{path}</span>
        <button className={styles.iconBtn} onClick={onNavigateUp} title="Parent (Backspace)">
          <ArrowUp size={12} />
        </button>
        <button className={styles.iconBtn} onClick={onRefresh} title="Refresh">
          <RefreshCw size={12} />
        </button>
        {onToggleHidden && (
          <button
            className={`${styles.iconBtn} ${showHidden ? styles.iconBtnActive : ''}`}
            onClick={onToggleHidden}
            title={showHidden ? 'Hide dotfiles' : 'Show dotfiles'}
          >
            {showHidden ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        )}
        {extraHeaderButtons}
      </div>

      {/* Column headers */}
      <div className={styles.colHeaders}>
        <span className={styles.colName}>Name</span>
        <span className={styles.colSize}>Size</span>
        <span className={styles.colDate}>Modified</span>
        <span className={styles.colExt}>Ext</span>
      </div>

      {/* File list */}
      <div className={styles.fileList}>
        {loading && <div className={styles.loading}>Loading...</div>}
        {error   && <div className={styles.error}>⚠ {error}</div>}
        {notConnected}

        {!loading && !error && showParent && (
          <div
            className={`${styles.fileRow} ${cursorOnParent ? styles.cursor : ''} ${styles.even}`}
            onClick={() => onCursorOnParentChange(true)}
            onDoubleClick={onNavigateUp}
          >
            <span className={styles.colName}>
              <Folder size={13} style={{ color: theme === 'light' ? '#b07800' : '#f0c040', flexShrink: 0, marginRight: 5 }} />
              [..]
            </span>
            <span className={styles.colSize}>&lt;DIR&gt;</span>
            <span className={styles.colDate} />
            <span className={styles.colExt} />
          </div>
        )}

        {!loading && !error && files.map((file, i) => {
          const { icon: Icon, color } = getFileIcon(file, theme)
          const isCursor = cursor === i && !cursorOnParent
          const isSelected = selected.has(file.path)
          return (
            <div
              key={file.path}
              className={`${styles.fileRow} ${isCursor ? styles.cursor : ''} ${isSelected ? styles.selected : ''} ${i % 2 === 0 ? styles.even : styles.odd}`}
              onClick={(e) => {
                onCursorOnParentChange(false)
                onCursorChange(i)
                if (e.ctrlKey || e.metaKey) onToggleSelect(file.path)
              }}
              onDoubleClick={() => { if (file.isDir) onNavigate(file.path) }}
              title={file.path}
            >
              <span className={styles.colName}>
                <Icon size={13} style={{ color, flexShrink: 0, marginRight: 5 }} />
                {file.name}
              </span>
              <span className={styles.colSize}>{formatSize(file.size, file.isDir)}</span>
              <span className={styles.colDate}>{formatDate(file.modified)}</span>
              <span className={styles.colExt}>{!file.isDir ? getExt(file) : ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────
export default function FTPManager() {
  const ftpStore  = useFTPStore()
  const fileStore = useFileStore()
  const theme     = useThemeStore(s => s.theme)

  const [showConnect,   setShowConnect]   = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [activeConn,    setActiveConn]    = useState(null)
  const [ftpPath,       setFtpPath]       = useState('/')
  const [ftpFiles,      setFtpFiles]      = useState([])
  const [ftpLoading,    setFtpLoading]    = useState(false)
  const [ftpError,      setFtpError]      = useState(null)
  const [ftpSelected,   setFtpSelected]   = useState(new Set())
  const [ftpCursor,     setFtpCursor]     = useState(0)
  const [ftpCursorOnParent, setFtpCursorOnParent] = useState(false)
  const [ftpShowHidden, setFtpShowHidden] = useState(false)

  const [localPanel,    setLocalPanel]    = useState('left')
  const [localCursor,   setLocalCursor]   = useState(0)
  const [localCursorOnParent, setLocalCursorOnParent] = useState(false)
  const [status,        setStatus]        = useState('')

  const localListRef = useRef(null)
  const ftpListRef   = useRef(null)

  const localStore = fileStore[localPanel]
  const drives = fileStore.drives || []
  const localFiles = (localStore.showHidden ? localStore.files : localStore.files?.filter(f => !f.isHidden)) || []
  const visibleFtpFiles = ftpShowHidden ? ftpFiles : ftpFiles.filter(f => !f.name?.startsWith('.'))
  const isAtLocalRoot = localStore.path === '/' || /^[A-Za-z]:[\\/]?$/.test(localStore.path || '')
  const isAtFTPRoot   = ftpPath === '/'

  useEffect(() => { ftpStore.loadBookmarks() }, [])
  useEffect(() => { setLocalCursor(0); setLocalCursorOnParent(false) }, [localStore.path])
  useEffect(() => { setFtpCursor(0);  setFtpCursorOnParent(false); setFtpSelected(new Set()) }, [ftpPath])

  // ── FTP API helpers ──────────────────────────────────────────
  const navigateFTPDirect = async (connId, path) => {
    setFtpLoading(true); setFtpError(null)
    try {
      const api = (await import('../wailsjs/runtime')).default
      const result = await api.FTPListDirectory(connId, path)
      setFtpPath(result.path); setFtpFiles(result.files || [])
    } catch(e) { setFtpError(String(e)) }
    finally { setFtpLoading(false) }
  }

  const ftpParentPath = () => ftpPath === '/' ? '/' : ftpPath.replace(/\/[^/]+\/?$/, '') || '/'

  const handleConnect = async (config) => {
    setStatus('Connecting...')
    try {
      const api = (await import('../wailsjs/runtime')).default
      await api.FTPConnect(config)
      const conns = await api.FTPGetConnections()
      if (conns?.length > 0) {
        const conn = conns[conns.length - 1]
        setActiveConn(conn)
        await navigateFTPDirect(conn.id, '/')
        setStatus(`Connected to ${config.host}`)
      }
    } catch(e) { setStatus(`Connection failed: ${e}`) }
    setShowConnect(false)
  }

  const handleDisconnect = async () => {
    if (!activeConn) return
    try {
      const api = (await import('../wailsjs/runtime')).default
      await api.FTPDisconnect(activeConn.id)
      setActiveConn(null); setFtpFiles([]); setFtpPath('/'); setStatus('Disconnected')
    } catch(e) { setStatus(`Disconnect error: ${e}`) }
  }

  const handleDownload = async () => {
    if (!activeConn || ftpSelected.size === 0) return
    const api = (await import('../wailsjs/runtime')).default
    let count = 0
    for (const path of ftpSelected) {
      setStatus(`Downloading ${path}...`)
      try { await api.FTPDownload(activeConn.id, path, localStore.path); count++ }
      catch(e) { setStatus(`Download failed: ${e}`) }
    }
    await fileStore.refresh(localPanel)
    setStatus(`Downloaded ${count} file(s)`)
    setFtpSelected(new Set())
  }

  const handleUpload = async () => {
    if (!activeConn) return
    const localSelected = [...localStore.selected]
    if (!localSelected.length) return
    const api = (await import('../wailsjs/runtime')).default
    let count = 0
    for (const localPath of localSelected) {
      const fileName = localPath.split(/[/\\]/).pop()
      const remotePath = ftpPath.endsWith('/') ? ftpPath + fileName : ftpPath + '/' + fileName
      setStatus(`Uploading ${fileName}...`)
      try { await api.FTPUpload(activeConn.id, localPath, remotePath); count++ }
      catch(e) { setStatus(`Upload failed: ${e}`) }
    }
    await navigateFTPDirect(activeConn.id, ftpPath)
    fileStore.clearSelection(localPanel)
    setStatus(`Uploaded ${count} file(s)`)
  }

  const handleFTPDelete = async () => {
    if (!activeConn || ftpSelected.size === 0) return
    const api = (await import('../wailsjs/runtime')).default
    for (const path of ftpSelected) {
      try { await api.FTPDeleteItem(activeConn.id, path) }
      catch(e) { setStatus(`Delete failed: ${e}`); return }
    }
    await navigateFTPDirect(activeConn.id, ftpPath)
    setStatus(`Deleted ${ftpSelected.size} item(s)`)
    setFtpSelected(new Set())
  }

  const handleFTPMkdir = async () => {
    if (!activeConn) return
    const name = window.prompt('New directory name:')
    if (!name) return
    const api = (await import('../wailsjs/runtime')).default
    const newPath = ftpPath.endsWith('/') ? ftpPath + name : ftpPath + '/' + name
    try { await api.FTPCreateDirectory(activeConn.id, newPath); await navigateFTPDirect(activeConn.id, ftpPath); setStatus('Directory created') }
    catch(e) { setStatus(`Create dir failed: ${e}`) }
  }

  const handleSaveBookmark = () => {
    const name = window.prompt('Bookmark name:')
    if (!name || !activeConn) return
    ftpStore.saveBookmark({ name, config: { host: activeConn.host, port: activeConn.port, username: activeConn.username, password: '' } })
    setStatus('Bookmark saved')
  }

  const toggleFTPSelect = (path) => {
    setFtpSelected(prev => { const s = new Set(prev); s.has(path) ? s.delete(path) : s.add(path); return s })
  }

  return (
    <div className={styles.ftpManager}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.connInfo}>
          {activeConn ? (
            <><Wifi size={13} className={styles.connIcon} /><span className={styles.connLabel}>{activeConn.username}@{activeConn.host}:{activeConn.port}</span></>
          ) : (
            <><WifiOff size={13} className={styles.disconnIcon} /><span className={styles.noConn}>Not connected</span></>
          )}
        </div>

        <button className={styles.btn} onClick={() => setShowConnect(true)}><Plus size={12} /> Connect</button>
        {activeConn && <button className={`${styles.btn} ${styles.btnDanger}`} onClick={handleDisconnect}><Link2Off size={12} /> Disconnect</button>}
        <button className={styles.btn} onClick={() => setShowBookmarks(!showBookmarks)}><Star size={12} /> Bookmarks</button>

        <div className={styles.sep} />

        {activeConn && <>
          <button className={styles.btn} onClick={handleDownload} disabled={ftpSelected.size === 0}><Download size={12} /> Download</button>
          <button className={styles.btn} onClick={handleUpload}   disabled={!localStore.selected?.size}><Upload size={12} /> Upload</button>
          <button className={styles.btn} onClick={handleFTPMkdir}><FolderPlus size={12} /> New Dir</button>
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={handleFTPDelete} disabled={ftpSelected.size === 0}><Trash2 size={12} /> Delete</button>
          <button className={styles.btn} onClick={() => navigateFTPDirect(activeConn.id, ftpPath)}><RefreshCw size={12} /> Refresh</button>
          <button className={styles.btn} onClick={handleSaveBookmark}><Bookmark size={12} /> Bookmark</button>
        </>}

        <div className={styles.sep} />

        <select className={styles.panelSelect} value={localPanel} onChange={e => setLocalPanel(e.target.value)}>
          <option value="left">Left Panel (Local)</option>
          <option value="right">Right Panel (Local)</option>
        </select>

        {status && <span className={styles.statusMsg}>{status}</span>}
      </div>

      {/* Main area */}
      <div className={styles.mainArea}>
        {/* Bookmarks */}
        {showBookmarks && (
          <div className={styles.bookmarksPanel}>
            <div className={styles.bookmarksHeader}>
              <Server size={13} /><span>Bookmarks</span>
              <button className={styles.closeBtn} onClick={() => setShowBookmarks(false)}>✕</button>
            </div>
            <div className={styles.bookmarksList}>
              {ftpStore.bookmarks.length === 0 && <div className={styles.empty}>No bookmarks saved</div>}
              {ftpStore.bookmarks.map(bm => (
                <div key={bm.id} className={styles.bookmarkItem}>
                  <div className={styles.bookmarkName} onClick={() => handleConnect(bm.config)}>
                    <Star size={11} /><span>{bm.name}</span><span className={styles.bookmarkHost}>{bm.config.host}</span>
                  </div>
                  <button className={styles.bookmarkDelete} onClick={() => ftpStore.deleteBookmark(bm.id)}><Trash2 size={11} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Local panel */}
        <FileListPanel
          title="LOCAL"
          path={localStore.path}
          files={localFiles}
          selected={localStore.selected || new Set()}
          cursor={localCursor}
          cursorOnParent={localCursorOnParent}
          showParent={!isAtLocalRoot}
          loading={localStore.loading}
          error={localStore.error}
          onCursorChange={setLocalCursor}
          onCursorOnParentChange={setLocalCursorOnParent}
          onToggleSelect={(path) => fileStore.toggleSelect(localPanel, path)}
          onNavigateUp={() => fileStore.navigateUp(localPanel)}
          onNavigate={(path) => fileStore.navigate(localPanel, path)}
          onRefresh={() => fileStore.refresh(localPanel)}
          showHidden={localStore.showHidden}
          onToggleHidden={() => fileStore.toggleHidden(localPanel)}
          extraHeaderButtons={drives.length > 0 && (
            <select
              className={styles.driveSelect}
              value=""
              onChange={e => fileStore.navigate(localPanel, e.target.value)}
              onClick={e => e.stopPropagation()}
              title="드라이브 선택"
            >
              <option value="" disabled>Drives</option>
              {drives.map(d => (
                <option key={d.path} value={d.path}>{d.name} ({d.driveType})</option>
              ))}
            </select>
          )}
          theme={theme}
          listRef={localListRef}
        />

        {/* FTP panel */}
        <FileListPanel
          title={activeConn ? 'FTP' : 'FTP (offline)'}
          titleColor={activeConn ? 'var(--text-green)' : 'var(--text-muted)'}
          path={ftpPath}
          files={visibleFtpFiles}
          selected={ftpSelected}
          cursor={ftpCursor}
          cursorOnParent={ftpCursorOnParent}
          showParent={!isAtFTPRoot && !!activeConn}
          loading={ftpLoading}
          error={ftpError}
          onCursorChange={setFtpCursor}
          onCursorOnParentChange={setFtpCursorOnParent}
          onToggleSelect={toggleFTPSelect}
          onNavigateUp={() => activeConn && navigateFTPDirect(activeConn.id, ftpParentPath())}
          onNavigate={(path) => activeConn && navigateFTPDirect(activeConn.id, path)}
          onRefresh={() => activeConn && navigateFTPDirect(activeConn.id, ftpPath)}
          showHidden={ftpShowHidden}
          onToggleHidden={() => setFtpShowHidden(v => !v)}
          notConnected={!activeConn && !ftpLoading && (
            <div className={styles.notConnected}>
              <WifiOff size={32} />
              <p>Not connected to FTP server</p>
              <button className={styles.connectBtn} onClick={() => setShowConnect(true)}>
                <Plus size={13} /> Connect to server
              </button>
            </div>
          )}
          theme={theme}
          listRef={ftpListRef}
        />
      </div>

      {/* Connect modal */}
      {showConnect && <ConnectModal onConnect={handleConnect} onClose={() => setShowConnect(false)} />}
    </div>
  )
}

function ConnectModal({ onConnect, onClose }) {
  const [config, setConfig] = useState({ host: '', port: 21, username: '', password: '', passive: true })
  const upd = (k, v) => setConfig(c => ({ ...c, [k]: v }))

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <Link size={15} /><span>FTP Connect</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form className={styles.modalBody} onSubmit={(e) => { e.preventDefault(); if (config.host) onConnect(config) }}>
          <div className={styles.field}>
            <label>Host</label>
            <input placeholder="ftp.example.com" value={config.host} onChange={e => upd('host', e.target.value)} autoFocus />
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label>Port</label>
              <input type="number" value={config.port} onChange={e => upd('port', parseInt(e.target.value) || 21)} style={{width:70}} />
            </div>
            <div className={styles.field} style={{flex:1}}>
              <label>Username</label>
              <input placeholder="anonymous" value={config.username} onChange={e => upd('username', e.target.value)} />
            </div>
          </div>
          <div className={styles.field}>
            <label>Password</label>
            <input type="password" placeholder="(leave blank for anonymous)" value={config.password} onChange={e => upd('password', e.target.value)} />
          </div>
          <div className={styles.fieldCheck}>
            <label><input type="checkbox" checked={config.passive} onChange={e => upd('passive', e.target.checked)} /> Passive mode</label>
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.btnConnect}><Link size={13} /> Connect</button>
          </div>
        </form>
      </div>
    </div>
  )
}
