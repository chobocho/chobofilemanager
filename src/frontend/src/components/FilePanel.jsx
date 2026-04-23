import React, { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import { useFileStore } from '../stores/fileStore'
import { useThemeStore } from '../stores/themeStore'
import styles from '../styles/FilePanel.module.css'
import {
  Folder, File, FileText, FileImage, FileArchive,
  FileCode, ArrowUp, RefreshCw, ChevronRight,
  Eye, EyeOff, Plus, X as XIcon
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

export function getQuickJumpTarget(files, ch, lastChar, lastMatchIdx) {
  const lower = ch.toLowerCase()
  if (!/^[a-z0-9]$/.test(lower)) return null
  const matchIndices = []
  for (let i = 0; i < files.length; i++) {
    if (files[i].name.toLowerCase().startsWith(lower)) matchIndices.push(i)
  }
  if (matchIndices.length === 0) return null
  let matchPos = 0
  if (lastChar === lower) matchPos = (lastMatchIdx + 1) % matchIndices.length
  return { fileIdx: matchIndices[matchPos], matchPos }
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

const FilePanel = forwardRef(function FilePanel({ side, onEdit, onSwitchToPanel }, ref) {
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
  const cursorOnParent = panel.cursorOnParent
  const drives = store.drives
  const quickJumpRef = useRef({ char: '', matchPos: 0 })

  useEffect(() => {
    setPathInput(panel.path)
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
      const textExts = ['.txt','.md','.js','.jsx','.ts','.tsx','.go','.py','.rs','.c','.cpp','.h','.html','.css','.json','.xml','.yaml','.yml','.sh','.log','.ini','.cfg','.conf','.env']
      if (textExts.includes(ext)) {
        onEdit(file)
      } else {
        await store.openFile(file.path)
      }
    }
  }

  const handleKeyDown = useCallback((e) => {
    if (!isActive) return
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
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
          store.setCursorOnParent(side, true)
          scrollToParentRow()
        }
        break
      case 'ArrowDown':
        e.preventDefault()
        if (cursorOnParent) {
          store.setCursorOnParent(side, false)
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
      case 'F6':
      case 'F8':
      case 'Delete':
        e.preventDefault()
        // handled by toolbar / app global handler
        break
      case 'c':
      case 'C':
        if (e.ctrlKey && e.shiftKey) {
          e.preventDefault()
          const target = cursorOnParent ? null : files[cur]
          const pathToCopy = target ? target.path : panel.path
          navigator.clipboard.writeText(pathToCopy)
            .then(() => store.setStatus(`복사됨: ${pathToCopy}`))
            .catch(() => store.setStatus('클립보드 복사 실패'))
        }
        break
      case 'a':
        if (e.ctrlKey) { e.preventDefault(); store.selectAll(side) }
        else if (!e.shiftKey && !e.altKey && !e.metaKey) {
          // WASD: a = 왼쪽 패널로 이동
          e.preventDefault()
          onSwitchToPanel?.('left')
        }
        break
      case 'r':
        if (e.ctrlKey) { e.preventDefault(); store.refresh(side) }
        break
      case 'h':
        if (e.ctrlKey) { e.preventDefault(); store.toggleHidden(side) }
        else if (!e.shiftKey && !e.altKey && !e.metaKey) {
          // vim: h = 왼쪽 패널로 이동
          e.preventDefault()
          onSwitchToPanel?.('left')
        }
        break
      case 'l':
        if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
          // vim: l = 오른쪽 패널로 이동
          e.preventDefault()
          onSwitchToPanel?.('right')
        }
        break
      case 'd':
        if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
          // WASD: d = 오른쪽 패널로 이동
          e.preventDefault()
          onSwitchToPanel?.('right')
        }
        break
      case 'j':
        if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
          // vim: j = 아래로
          e.preventDefault()
          if (cursorOnParent) {
            store.setCursorOnParent(side, false)
            store.setCursor(side, 0)
            scrollToCursor(0, showParent)
          } else if (cur < files.length - 1) {
            store.setCursor(side, cur + 1)
            scrollToCursor(cur + 1, showParent)
          }
        }
        break
      case 'k':
        if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
          // vim: k = 위로
          e.preventDefault()
          if (cursorOnParent) {
            // already on [..], do nothing
          } else if (cur > 0) {
            store.setCursor(side, cur - 1)
            scrollToCursor(cur - 1, showParent)
          } else if (showParent) {
            store.setCursorOnParent(side, true)
            scrollToParentRow()
          }
        }
        break
      case 's':
        if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
          // WASD: s = 아래로
          e.preventDefault()
          if (cursorOnParent) {
            store.setCursorOnParent(side, false)
            store.setCursor(side, 0)
            scrollToCursor(0, showParent)
          } else if (cur < files.length - 1) {
            store.setCursor(side, cur + 1)
            scrollToCursor(cur + 1, showParent)
          }
        }
        break
      case 't':
      case 'T':
        if (e.ctrlKey) { e.preventDefault(); store.newTab(side) }
        break
      case 'w':
      case 'W':
        if (e.ctrlKey) { e.preventDefault(); store.closeTab(side, panel.activeTabIdx) }
        else if (!e.shiftKey && !e.altKey && !e.metaKey && e.key === 'w') {
          // WASD: w = 위로
          e.preventDefault()
          if (cursorOnParent) {
            // already on [..], do nothing
          } else if (cur > 0) {
            store.setCursor(side, cur - 1)
            scrollToCursor(cur - 1, showParent)
          } else if (showParent) {
            store.setCursorOnParent(side, true)
            scrollToParentRow()
          }
        }
        break
      case 'Tab':
        // Ctrl+Tab = next tab, Ctrl+Shift+Tab = prev tab (only when Ctrl is held)
        if (e.ctrlKey) {
          e.preventDefault()
          const nextIdx = e.shiftKey
            ? (panel.activeTabIdx - 1 + panel.tabs.length) % panel.tabs.length
            : (panel.activeTabIdx + 1) % panel.tabs.length
          store.switchTab(side, nextIdx)
        }
        break
      default:
        // Shift+a-z/0-9: 해당 글자로 시작하는 파일로 커서 이동 (반복 입력 시 순차 이동)
        if (e.shiftKey && !e.ctrlKey && !e.altKey && /^[a-z0-9]$/i.test(e.key)) {
          e.preventDefault()
          const qj = quickJumpRef.current
          const result = getQuickJumpTarget(files, e.key, qj.char, qj.matchPos)
          if (result) {
            quickJumpRef.current = { char: e.key.toLowerCase(), matchPos: result.matchPos }
            store.setCursor(side, result.fileIdx)
            store.setCursorOnParent(side, false)
            scrollToCursor(result.fileIdx, showParent)
          }
        }
        break
    }
  }, [isActive, panel.cursor, panel.path, visibleFiles, side, cursorOnParent, showParent, onSwitchToPanel])

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
      onFocus={handleActivate}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      ref={listRef}
    >
      <TabBar side={side} panel={panel} store={store} />
      {/* Panel Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <select
            className={styles.driveSelect}
            value=""
            onChange={handleDriveChange}
            onClick={e => e.stopPropagation()}
          >
            <option value="" disabled>Drives</option>
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
              ${isActive && cursorOnParent ? styles.cursor : ''}
              ${styles.even}
            `}
            onClick={(e) => { e.stopPropagation(); store.setActivePanel(side); store.setCursorOnParent(side, true) }}
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
                ${isActive && isCursor && !cursorOnParent ? styles.cursor : ''}
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

function TabBar({ side, panel, store }) {
  const getLabel = (path) => {
    if (!path) return 'Home'
    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
    return parts[parts.length - 1] || path
  }

  return (
    <div className={styles.tabBar}>
      {panel.tabs.map((tab, i) => {
        const isActive = i === panel.activeTabIdx
        const label = isActive ? getLabel(panel.path) : getLabel(tab.path)
        return (
          <div
            key={tab.id}
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
            onClick={(e) => { e.stopPropagation(); store.switchTab(side, i) }}
            title={isActive ? panel.path : tab.path}
          >
            <span className={styles.tabLabel}>{label}</span>
            {panel.tabs.length > 1 && (
              <button
                className={styles.tabClose}
                onClick={(e) => { e.stopPropagation(); store.closeTab(side, i) }}
                title="Close tab"
              >
                <XIcon size={10} />
              </button>
            )}
          </div>
        )
      })}
      <button
        className={styles.tabAdd}
        onClick={(e) => { e.stopPropagation(); store.newTab(side) }}
        title="New tab (Ctrl+T)"
      >
        <Plus size={12} />
      </button>
    </div>
  )
}

function BreadcrumbPath({ path, onNavigate }) {
  if (!path) return <span>/</span>
  const isWindows = path.includes('\\') || /^[A-Za-z]:/.test(path)
  const sep = isWindows ? '\\' : '/'
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
      acc = seg + sep
      parts.push({ name: seg, path: acc })
      continue
    }

    acc = acc.endsWith(sep) ? `${acc}${seg}` : `${acc}${sep}${seg}`
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
