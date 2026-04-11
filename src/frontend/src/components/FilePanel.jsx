import React, { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import { useFileStore } from '../stores/fileStore'
import { useThemeStore } from '../stores/themeStore'
import styles from '../styles/FilePanel.module.css'
import {
  Folder, File, FileText, FileImage, FileArchive,
  FileCode, ArrowUp, RefreshCw, ChevronRight, HardDrive,
  Eye, EyeOff
} from 'lucide-react'

const FILE_ICONS_DARK = {
  '.txt':  { icon: FileText,    color: '#c8d0e0' },
  '.md':   { icon: FileText,    color: '#60d0ff' },
  '.js':   { icon: FileCode,    color: '#f0c040' },
  '.jsx':  { icon: FileCode,    color: '#40d0f0' },
  '.ts':   { icon: FileCode,    color: '#4080ff' },
  '.tsx':  { icon: FileCode,    color: '#4080ff' },
  '.go':   { icon: FileCode,    color: '#40c0d0' },
  '.py':   { icon: FileCode,    color: '#50e090' },
  '.rs':   { icon: FileCode,    color: '#ff7050' },
  '.c':    { icon: FileCode,    color: '#a0c0ff' },
  '.cpp':  { icon: FileCode,    color: '#a0c0ff' },
  '.html': { icon: FileCode,    color: '#ff8040' },
  '.css':  { icon: FileCode,    color: '#60a0ff' },
  '.json': { icon: FileCode,    color: '#f0c040' },
  '.xml':  { icon: FileCode,    color: '#80d080' },
  '.yaml': { icon: FileCode,    color: '#d0a0ff' },
  '.yml':  { icon: FileCode,    color: '#d0a0ff' },
  '.sh':   { icon: FileCode,    color: '#50e090' },
  '.bat':  { icon: FileCode,    color: '#80c0ff' },
  '.png':  { icon: FileImage,   color: '#ff80c0' },
  '.jpg':  { icon: FileImage,   color: '#ff80a0' },
  '.jpeg': { icon: FileImage,   color: '#ff80a0' },
  '.gif':  { icon: FileImage,   color: '#ff80d0' },
  '.webp': { icon: FileImage,   color: '#d080ff' },
  '.svg':  { icon: FileImage,   color: '#ff9060' },
  '.ico':  { icon: FileImage,   color: '#80a0ff' },
  '.zip':  { icon: FileArchive, color: '#f0c040' },
  '.tar':  { icon: FileArchive, color: '#f0a040' },
  '.gz':   { icon: FileArchive, color: '#f0a040' },
  '.rar':  { icon: FileArchive, color: '#ff6040' },
  '.7z':   { icon: FileArchive, color: '#ff8040' },
}

const FILE_ICONS_LIGHT = {
  '.txt':  { icon: FileText,    color: '#506070' },
  '.md':   { icon: FileText,    color: '#0080b0' },
  '.js':   { icon: FileCode,    color: '#c09000' },
  '.jsx':  { icon: FileCode,    color: '#0090a0' },
  '.ts':   { icon: FileCode,    color: '#1050c0' },
  '.tsx':  { icon: FileCode,    color: '#1050c0' },
  '.go':   { icon: FileCode,    color: '#007890' },
  '.py':   { icon: FileCode,    color: '#207040' },
  '.rs':   { icon: FileCode,    color: '#c04020' },
  '.c':    { icon: FileCode,    color: '#3060a0' },
  '.cpp':  { icon: FileCode,    color: '#3060a0' },
  '.html': { icon: FileCode,    color: '#b04000' },
  '.css':  { icon: FileCode,    color: '#1060c0' },
  '.json': { icon: FileCode,    color: '#c09000' },
  '.xml':  { icon: FileCode,    color: '#306030' },
  '.yaml': { icon: FileCode,    color: '#6030a0' },
  '.yml':  { icon: FileCode,    color: '#6030a0' },
  '.sh':   { icon: FileCode,    color: '#207040' },
  '.bat':  { icon: FileCode,    color: '#2060a0' },
  '.png':  { icon: FileImage,   color: '#c02080' },
  '.jpg':  { icon: FileImage,   color: '#c03060' },
  '.jpeg': { icon: FileImage,   color: '#c03060' },
  '.gif':  { icon: FileImage,   color: '#c020a0' },
  '.webp': { icon: FileImage,   color: '#8020c0' },
  '.svg':  { icon: FileImage,   color: '#c05020' },
  '.ico':  { icon: FileImage,   color: '#2050c0' },
  '.zip':  { icon: FileArchive, color: '#c09000' },
  '.tar':  { icon: FileArchive, color: '#b06000' },
  '.gz':   { icon: FileArchive, color: '#b06000' },
  '.rar':  { icon: FileArchive, color: '#c02000' },
  '.7z':   { icon: FileArchive, color: '#b04000' },
}

function formatSize(bytes, isDir) {
  if (isDir) return '<DIR>'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d)) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getFileIcon(file, theme) {
  const icons = theme === 'light' ? FILE_ICONS_LIGHT : FILE_ICONS_DARK
  const folderColor = theme === 'light' ? '#b07800' : '#f0c040'
  const defaultColor = theme === 'light' ? '#4a5068' : '#7080a0'
  if (file.isDir) return { icon: Folder, color: folderColor }
  const entry = icons[file.extension]
  if (entry) return entry
  return { icon: File, color: defaultColor }
}

const COLUMNS = [
  { key: 'name',     label: 'Name',     width: '45%' },
  { key: 'size',     label: 'Size',     width: '15%', align: 'right' },
  { key: 'modified', label: 'Modified', width: '28%' },
  { key: 'extension',label: 'Ext',      width: '12%' },
]

const FilePanel = forwardRef(function FilePanel({ side, onEdit }, ref) {
  const store = useFileStore()
  const panel = store[side]
  const isActive = store.activePanel === side
  const theme = useThemeStore(s => s.theme)
  const listRef = useRef(null)

  useImperativeHandle(ref, () => ({
    focus: () => listRef.current?.focus(),
  }))

  const [pathInput, setPathInput] = useState('')
  const [editingPath, setEditingPath] = useState(false)
  const [cursorOnParent, setCursorOnParent] = useState(false)
  const drives = store.drives

  useEffect(() => {
    setPathInput(panel.path)
    setCursorOnParent(false)   // 디렉토리 이동 시 .. 커서 초기화
  }, [panel.path])

  const visibleFiles = panel.showHidden
    ? panel.files
    : panel.files.filter(f => !f.isHidden)

  // 루트 경로 여부 (더 이상 올라갈 수 없음)
  const isAtRoot = panel.path === '/' || /^[A-Za-z]:[\\/]?$/.test(panel.path)
  const showParent = !isAtRoot

  const handleActivate = useCallback(() => {
    store.setActivePanel(side)
  }, [side])

  const handleRowClick = (e, file, index) => {
    store.setActivePanel(side)
    store.setCursor(side, index)
    if (e.ctrlKey || e.metaKey) {
      store.toggleSelect(side, file.path)
    } else if (e.shiftKey) {
      // range select
      const start = Math.min(panel.cursor, index)
      const end = Math.max(panel.cursor, index)
      const newSelected = new Set(panel.selected)
      visibleFiles.slice(start, end + 1).forEach(f => newSelected.add(f.path))
      useFileStore.setState(s => ({ [side]: { ...s[side], selected: newSelected } }))
    }
  }

  const handleRowDoubleClick = async (file) => {
    if (file.isDir) {
      await store.navigate(side, file.path)
    } else {
      const ext = file.extension
      const textExts = ['.txt','.md','.js','.jsx','.ts','.tsx','.go','.py','.rs','.c','.cpp','.h','.html','.css','.json','.xml','.yaml','.yml','.sh','.bat','.log','.ini','.cfg','.conf','.env']
      if (textExts.includes(ext)) {
        onEdit(file.path)
      } else {
        await store.openFile(file.path)
      }
    }
  }

  const handleKeyDown = useCallback((e) => {
    if (!isActive) return
    const files = visibleFiles
    const cur = panel.cursor

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        if (cursorOnParent) {
          // already on [..], do nothing
        } else if (cur > 0) {
          store.setCursor(side, cur - 1)
          scrollToCursor(cur - 1, showParent)
        } else if (showParent) {
          setCursorOnParent(true)
          scrollToParentRow()
        }
        break
      case 'ArrowDown':
        e.preventDefault()
        if (cursorOnParent) {
          setCursorOnParent(false)
          store.setCursor(side, 0)
          scrollToCursor(0, showParent)
        } else if (cur < files.length - 1) {
          store.setCursor(side, cur + 1)
          scrollToCursor(cur + 1, showParent)
        }
        break
      case 'Enter':
        e.preventDefault()
        if (cursorOnParent) {
          store.navigateUp(side)
        } else if (files[cur]) {
          handleRowDoubleClick(files[cur])
        }
        break
      case 'Backspace':
        e.preventDefault()
        store.navigateUp(side)
        break
      case ' ':
        e.preventDefault()
        if (files[cur]) store.toggleSelect(side, files[cur].path)
        break
      case 'Insert':
        e.preventDefault()
        if (files[cur]) {
          store.toggleSelect(side, files[cur].path)
          if (cur < files.length - 1) store.setCursor(side, cur + 1)
        }
        break
      case 'F5':
        e.preventDefault()
        store.copy()
        break
      case 'F6':
        e.preventDefault()
        store.move()
        break
      case 'F8':
      case 'Delete':
        e.preventDefault()
        // handled by toolbar / app
        break
      case 'a':
        if (e.ctrlKey) { e.preventDefault(); store.selectAll(side) }
        break
      case 'r':
        if (e.ctrlKey) { e.preventDefault(); store.refresh(side) }
        break
      case 'h':
        if (e.ctrlKey) { e.preventDefault(); store.toggleHidden(side) }
        break
      default:
        break
    }
  }, [isActive, panel.cursor, visibleFiles, side, cursorOnParent, showParent])

  const scrollToCursor = (index, hasParent) => {
    if (!listRef.current) return
    const rows = listRef.current.querySelectorAll('[data-row]')
    // data-row="0" is the first file row; if [..] is shown it sits before all data-rows
    if (rows[index]) rows[index].scrollIntoView({ block: 'nearest' })
  }

  const scrollToParentRow = () => {
    if (!listRef.current) return
    const parentRow = listRef.current.querySelector('[data-parent-row]')
    if (parentRow) parentRow.scrollIntoView({ block: 'nearest' })
  }

  const handlePathSubmit = (e) => {
    e.preventDefault()
    store.navigate(side, pathInput)
    setEditingPath(false)
    listRef.current?.focus()
  }

  const handleDriveChange = (e) => {
    store.navigate(side, e.target.value)
  }

  const selectedCount = panel.selected.size
  const totalSize = visibleFiles
    .filter(f => panel.selected.has(f.path) && !f.isDir)
    .reduce((acc, f) => acc + f.size, 0)

  return (
    <div
      className={`${styles.panel} ${isActive ? styles.active : ''}`}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      ref={listRef}
    >
      {/* Panel Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <select
            className={styles.driveSelect}
            value=""
            onChange={handleDriveChange}
            onClick={e => e.stopPropagation()}
          >
            <option value="" disabled>
              <HardDrive size={12} /> Drives
            </option>
            {drives.map(d => (
              <option key={d.path} value={d.path}>
                {d.name} ({d.driveType})
              </option>
            ))}
          </select>
        </div>
        <div className={styles.headerRight}>
          <button
            className={styles.iconBtn}
            onClick={(e) => { e.stopPropagation(); store.navigateUp(side) }}
            title="Parent directory (Backspace)"
          >
            <ArrowUp size={13} />
          </button>
          <button
            className={styles.iconBtn}
            onClick={(e) => { e.stopPropagation(); store.refresh(side) }}
            title="Refresh (Ctrl+R)"
          >
            <RefreshCw size={13} />
          </button>
          <button
            className={`${styles.iconBtn} ${panel.showHidden ? styles.iconBtnActive : ''}`}
            onClick={(e) => { e.stopPropagation(); store.toggleHidden(side) }}
            title={panel.showHidden ? 'Hide dotfiles (Ctrl+H)' : 'Show dotfiles (Ctrl+H)'}
          >
            {panel.showHidden ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </div>

      {/* Path bar */}
      <div className={styles.pathBar}>
        {editingPath ? (
          <form onSubmit={handlePathSubmit} className={styles.pathForm}>
            <input
              className={styles.pathInput}
              value={pathInput}
              onChange={e => setPathInput(e.target.value)}
              onBlur={() => setEditingPath(false)}
              autoFocus
              spellCheck={false}
            />
          </form>
        ) : (
          <div
            className={styles.pathDisplay}
            onClick={(e) => { e.stopPropagation(); setEditingPath(true) }}
            title="Click to edit path"
          >
            <BreadcrumbPath path={panel.path} onNavigate={(p) => store.navigate(side, p)} />
          </div>
        )}
      </div>

      {/* Column headers */}
      <div className={styles.columnHeaders}>
        {COLUMNS.map(col => (
          <div
            key={col.key}
            className={styles.colHeader}
            style={{ width: col.width, textAlign: col.align || 'left' }}
            onClick={(e) => { e.stopPropagation(); store.setSort(side, col.key) }}
          >
            {col.label}
            {panel.sortBy === col.key && (
              <span className={styles.sortArrow}>{panel.sortDir === 'asc' ? '↑' : '↓'}</span>
            )}
          </div>
        ))}
      </div>

      {/* File list */}
      <div className={styles.fileList}>
        {panel.loading && (
          <div className={styles.loading}>
            <span className="animate-pulse">Loading...</span>
          </div>
        )}
        {panel.error && (
          <div className={styles.error}>⚠ {panel.error}</div>
        )}
        {!panel.loading && !panel.error && showParent && (
          <div
            data-parent-row
            className={`
              ${styles.fileRow}
              ${cursorOnParent ? styles.cursor : ''}
              ${styles.even}
            `}
            onClick={(e) => { e.stopPropagation(); store.setActivePanel(side); setCursorOnParent(true) }}
            onDoubleClick={(e) => { e.stopPropagation(); store.navigateUp(side) }}
            title="Parent directory"
          >
            <div className={styles.colName} style={{ width: COLUMNS[0].width }}>
              <Folder size={14} style={{ color: theme === 'light' ? '#b07800' : '#f0c040', flexShrink: 0 }} />
              <span className={styles.fileName}>[..]</span>
            </div>
            <div className={styles.colCell} style={{ width: COLUMNS[1].width, textAlign: 'right' }}>
              {'<DIR>'}
            </div>
            <div className={styles.colCell} style={{ width: COLUMNS[2].width }} />
            <div className={styles.colCell} style={{ width: COLUMNS[3].width }} />
          </div>
        )}
        {!panel.loading && !panel.error && visibleFiles.map((file, index) => {
          const isCursor = panel.cursor === index
          const isSelected = panel.selected.has(file.path)
          const { icon: Icon, color } = getFileIcon(file, theme)

          return (
            <div
              key={file.path}
              data-row={index}
              className={`
                ${styles.fileRow}
                ${isCursor ? styles.cursor : ''}
                ${isSelected ? styles.selected : ''}
                ${file.isHidden ? styles.hidden : ''}
                ${index % 2 === 0 ? styles.even : styles.odd}
              `}
              onClick={(e) => handleRowClick(e, file, index)}
              onDoubleClick={() => handleRowDoubleClick(file)}
              title={file.path}
            >
              <div className={styles.colName} style={{ width: COLUMNS[0].width }}>
                <Icon size={14} style={{ color, flexShrink: 0 }} />
                <span className={styles.fileName}>{file.name}</span>
                {file.isSymlink && <ChevronRight size={10} className={styles.symlinkIcon} />}
              </div>
              <div className={styles.colCell} style={{ width: COLUMNS[1].width, textAlign: 'right' }}>
                {formatSize(file.size, file.isDir)}
              </div>
              <div className={styles.colCell} style={{ width: COLUMNS[2].width }}>
                {formatDate(file.modified)}
              </div>
              <div className={styles.colCell} style={{ width: COLUMNS[3].width }}>
                {!file.isDir ? file.extension?.replace('.', '') : ''}
              </div>
            </div>
          )
        })}
      </div>

      {/* Panel footer */}
      <div className={styles.footer}>
        <span className={styles.footerCount}>
          {visibleFiles.length} items
          {selectedCount > 0 && (
            <span className={styles.footerSelected}>
              {' '}· {selectedCount} selected ({formatSize(totalSize, false)})
            </span>
          )}
        </span>
        <span className={styles.footerFree}>
          {drives.find(d => panel.path?.startsWith(d.path)) && (() => {
            const d = drives.find(dr => panel.path?.startsWith(dr.path))
            return d ? `Free: ${formatSize(d.freeSpace, false)}` : ''
          })()}
        </span>
      </div>
    </div>
  )
})

export default FilePanel

function BreadcrumbPath({ path, onNavigate }) {
  if (!path) return <span>/</span>
  const parts = []
  const segments = path.replace(/\\/g, '/').split('/')
  let acc = ''

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]

    // Unix 루트: 첫 세그먼트가 빈 문자열 (경로가 /로 시작)
    if (i === 0 && seg === '') {
      acc = '/'
      parts.push({ name: '/', path: '/' })
      continue
    }

    if (!seg) continue

    // Windows 드라이브 문자 (예: "C:", "D:")
    if (i === 0 && /^[A-Za-z]:$/.test(seg)) {
      acc = seg + '/'
      parts.push({ name: seg, path: acc })
      continue
    }

    acc = acc.endsWith('/') ? `${acc}${seg}` : `${acc}/${seg}`
    parts.push({ name: seg, path: acc })
  }

  return (
    <div className={styles.breadcrumb}>
      {parts.map((part, i) => (
        <React.Fragment key={part.path}>
          <span
            className={styles.breadcrumbPart}
            onClick={(e) => { e.stopPropagation(); onNavigate(part.path) }}
          >
            {part.name}
          </span>
          {i < parts.length - 1 && <span className={styles.breadcrumbSep}>/</span>}
        </React.Fragment>
      ))}
    </div>
  )
}
