import React, { useEffect, useRef, useCallback, useMemo, useState, forwardRef, useImperativeHandle, memo } from 'react'
import { useFileStore, isRootPath } from '../stores/fileStore'
import { useThemeStore } from '../stores/themeStore'
import { useFTPStore } from '../stores/ftpStore'
import { isFtpPath, ftpId, ftpRoot, ftpLabel } from '../utils/ftpPath.js'
import { isViewableFile, isTextFile, isArchiveName, formatSize, formatDate } from '../utils/fileTypes.js'
import styles from '../styles/FilePanel.module.css'
import {
  Folder, File, FileText, FileImage, FileArchive,
  FileCode, ArrowUp, RefreshCw, ChevronRight,
  Eye, EyeOff, Plus, X as XIcon, Unplug
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
  '.star': { icon: FileCode,    color: '#50d0a0' },
  '.bzl':  { icon: FileCode,    color: '#50d0a0' },
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
  '.star': { icon: FileCode,    color: '#207060' },
  '.bzl':  { icon: FileCode,    color: '#207060' },
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

// 빠른 검색 (Alt+글자, Todo #133-3): from부터 dir(1 / -1) 방향으로 돌며 처음 맞는 인덱스, 없으면 -1.
// 기본은 앞부분 일치, * 나 ? 가 있으면 와일드카드(끝에 * 생략). 대소문자 무시
export function findQuickSearch(files, text, from, dir) {
  const n = files.length
  if (!n || !text) return -1
  let test
  if (/[*?]/.test(text)) {
    const body = text.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
    const re = new RegExp(`^${body}`, 'i')
    test = (name) => re.test(name)
  } else {
    const lower = text.toLowerCase()
    test = (name) => name.toLowerCase().startsWith(lower)
  }
  const start = ((from % n) + n) % n
  for (let k = 0; k < n; k++) {
    const i = (((start + dir * k) % n) + n) % n
    if (test(files[i].name)) return i
  }
  return -1
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

const FTP_CONNECT = '__ftp_connect__'

const FilePanel = forwardRef(function FilePanel({ side, onEdit, onView, onSwitchToPanel, onPastePath, onMaskSelect, onFtpConnect, keyboardDisabled = false }, ref) {
  // Todo #98: 필요한 조각만 구독 — 상태 표시줄 등 무관한 변경으로 목록 전체가 다시 그려지지 않도록.
  // 액션은 안정적인 함수이므로 getState()로 사용
  const store = useFileStore.getState()
  const panel = useFileStore(s => s[side])
  const isActive = useFileStore(s => s.activePanel === side)
  const drives = useFileStore(s => s.drives)
  const ftpConns = useFTPStore(s => s.connections)
  const theme = useThemeStore(s => s.theme)
  const listRef = useRef(null)

  useImperativeHandle(ref, () => ({
    focus: () => listRef.current?.focus(),
  }))

  const [pathInput, setPathInput] = useState('')
  const [editingPath, setEditingPath] = useState(false)
  const cursorOnParent = panel.cursorOnParent
  const quickJumpRef = useRef({ char: '', matchPos: 0 })
  const [quickSearch, setQuickSearch] = useState(null) // Alt+글자 빠른 검색 칸의 글자, 닫혀 있으면 null (Todo #133-3)

  useEffect(() => {
    setPathInput(panel.path)
  }, [panel.path])


  // 오류·로딩 중에는 줄을 그리지 않으므로 키 조작 대상도 없음 (Todo #130-3 — 숨은 옛 목록에 Enter·F3 등이 먹던 문제)
  const unavailable = !!(panel.error || panel.loading)
  const visibleFiles = useMemo(
    () => unavailable ? [] : panel.showHidden ? panel.files : panel.files.filter(f => !f.isHidden),
    [panel.files, panel.showHidden, unavailable])

  // 루트 경로 여부 (더 이상 올라갈 수 없음)
  const isAtRoot = isRootPath(panel.path)
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

  // 행 컴포넌트(memo)에 안정적인 핸들러를 넘기기 위해 최신 핸들러를 ref로 참조 (Todo #98)
  const rowHandlersRef = useRef({})
  const onRowClick = useCallback((e, file, index) => rowHandlersRef.current.click(e, file, index), [])
  const onRowDoubleClick = useCallback((file) => rowHandlersRef.current.dbl(file), [])

  const handleRowDoubleClick = async (file) => {
    // 압축 파일은 폴더처럼 들어감 (Todo #133-5)
    if (file.isDir || isArchiveName(file.name)) {
      await store.navigate(side, file.path)
    } else {
      // .bat은 더블클릭 시 기존처럼 실행 (Enter는 뷰어)
      if (isTextFile(file.extension) && file.extension?.toLowerCase() !== '.bat') {
        onEdit(file)
      } else {
        await store.openFile(file.path)
      }
    }
  }

  // Enter 키 동작 (Todo #51): 텍스트/소스 파일이면 F3 뷰어, 그 외는 더블클릭과 동일.
  const handleEnter = async (file) => {
    if (file.isDir || isArchiveName(file.name)) {
      await store.navigate(side, file.path)
      return
    }
    if (isViewableFile(file.extension) && onView) {
      onView(file)
    } else {
      await store.openFile(file.path)
    }
  }

  const handleKeyDown = useCallback((e) => {
    if (!isActive) return
    // Todo #77: 오버레이(뷰어/대화상자)가 열려 있으면 포커스가 남아 있어도 패널 조작 금지
    if (keyboardDisabled) return
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
    const files = visibleFiles
    const cur = panel.cursor

    // Todo #133-3: Alt+글자 = 빠른 검색 칸 (Ctrl+Alt는 AltGr이라 제외)
    if (e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && e.key.length === 1 && /\S/.test(e.key)) {
      e.preventDefault()
      const idx = findQuickSearch(files, e.key, 0, 1)
      if (idx < 0) return
      jumpTo(idx)
      setQuickSearch(e.key)
      return
    }

    // Shift+a-z/0-9: 해당 글자로 시작하는 파일로 커서 이동 (반복 입력 시 순차 이동).
    // switch보다 먼저 처리 — 'C'/'T'/'W' case가 Ctrl 조합만 처리하고 break해 퀵 점프가 막히던 문제 (Todo #100)
    if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && /^[a-z0-9]$/i.test(e.key)) {
      e.preventDefault()
      const qj = quickJumpRef.current
      const result = getQuickJumpTarget(files, e.key, qj.char, qj.matchPos)
      if (result) {
        quickJumpRef.current = { char: e.key.toLowerCase(), matchPos: result.matchPos }
        store.setCursor(side, result.fileIdx)
        store.setCursorOnParent(side, false)
        scrollToCursor(result.fileIdx, showParent)
      }
      return
    }

    // 한 줄 위·아래 ([..] 줄 포함) — 화살표·vim(j/k)·WASD(w/s) 공용 (Todo #131-3)
    const moveUp = () => {
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
    const moveDown = () => {
      if (cursorOnParent) {
        store.setCursorOnParent(side, false)
        store.setCursor(side, 0)
        scrollToCursor(0, showParent)
      } else if (cur < files.length - 1) {
        store.setCursor(side, cur + 1)
        scrollToCursor(cur + 1, showParent)
      }
    }

    // Todo #133-2: 숫자 키패드 + / - / * = 마스크 선택 / 해제 / 반전, Ctrl과 함께면 모두 선택 / 모두 해제
    // (주 키보드의 - 는 그대로 '뒤로')
    if (!e.altKey && !e.metaKey && (e.code === 'NumpadAdd' || e.code === 'NumpadSubtract' || e.code === 'NumpadMultiply')) {
      e.preventDefault()
      if (e.code === 'NumpadMultiply') store.invertSelection(side)
      else if (e.code === 'NumpadAdd') e.ctrlKey ? store.selectAll(side) : onMaskSelect?.('select')
      else e.ctrlKey ? store.clearSelection(side) : onMaskSelect?.('deselect')
      return
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        moveUp()
        break
      case 'ArrowDown':
        e.preventDefault()
        moveDown()
        break
      case 'Enter':
        e.preventDefault()
        // Todo #133-1: Alt+Shift+Enter = 보이는 모든 폴더의 크기 (Total Commander와 같게)
        if (e.altKey && e.shiftKey) { store.calcAllDirSizes(side); break }
        // Todo #122: Ctrl+Enter 파일 이름 / Ctrl+Shift+Enter 전체 경로를 터미널 도크에 붙여넣기
        if (e.ctrlKey && onPastePath) {
          if (!cursorOnParent && files[cur]) onPastePath(files[cur], e.shiftKey)
          break
        }
        if (cursorOnParent) {
          store.navigateUp(side)
        } else if (files[cur]) {
          handleEnter(files[cur])
        }
        break
      case 'Backspace':
        e.preventDefault()
        store.navigateUp(side)
        break
      case '-':
        if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
          // 이전 방문 폴더로 이동 (히스토리 백)
          e.preventDefault()
          store.navigateBack(side)
        }
        break
      case ' ':
        e.preventDefault()
        if (files[cur]) {
          // Todo #133-1: 폴더를 선택하면 크기도 계산 (Total Commander와 같게)
          const willSelect = !panel.selected.has(files[cur].path)
          store.toggleSelect(side, files[cur].path)
          if (files[cur].isDir && willSelect) store.calcDirSize(side, files[cur].path)
        }
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
        // Toolbar의 window 핸들러가 처리 (F8/Delete=휴지통, Shift+Delete=영구삭제)
        e.preventDefault()
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
          moveDown()
        }
        break
      case 'k':
        if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
          // vim: k = 위로
          e.preventDefault()
          moveUp()
        }
        break
      case 's':
        if (!e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
          // WASD: s = 아래로
          e.preventDefault()
          moveDown()
        }
        break
      case 't':
      case 'T':
        if (e.ctrlKey) { e.preventDefault(); store.newTab(side) }
        break
      case 'w':
      case 'W':
        if (e.ctrlKey) { e.preventDefault(); store.closeTab(side, useFileStore.getState()[side].activeTabIdx) }
        else if (!e.shiftKey && !e.altKey && !e.metaKey && e.key === 'w') {
          // WASD: w = 위로
          e.preventDefault()
          moveUp()
        }
        break
      case 'Tab':
        // Ctrl+Tab = next tab, Ctrl+Shift+Tab = prev tab (only when Ctrl is held)
        if (e.ctrlKey) {
          e.preventDefault()
          // 탭 번호·개수는 지금 값으로 — 이 핸들러는 탭이 바뀌어도 다시 만들어지지 않을 수 있음 (Todo #130-3)
          const { activeTabIdx, tabs } = useFileStore.getState()[side]
          const nextIdx = e.shiftKey
            ? (activeTabIdx - 1 + tabs.length) % tabs.length
            : (activeTabIdx + 1) % tabs.length
          store.switchTab(side, nextIdx)
        }
        break
      default:
        break
    }
  }, [isActive, keyboardDisabled, panel.cursor, panel.path, panel.selected, visibleFiles, side, cursorOnParent, showParent, onSwitchToPanel, onPastePath, onMaskSelect])

  function jumpTo(idx) {
    store.setCursor(side, idx)
    scrollToCursor(idx, showParent)
  }

  const closeQuickSearch = () => {
    setQuickSearch(null)
    requestAnimationFrame(() => listRef.current?.focus())
  }

  // 빠른 검색 칸: 맞는 파일이 없는 글자는 받지 않음, ↑↓ 이전·다음 일치, Enter 열기, Esc 닫기
  const onQuickSearchChange = (e) => {
    const text = e.target.value
    if (!text) { setQuickSearch(''); return }
    const idx = findQuickSearch(visibleFiles, text, 0, 1)
    if (idx < 0) return
    setQuickSearch(text)
    jumpTo(idx)
  }
  const onQuickSearchKeyDown = (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); closeQuickSearch() }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const file = visibleFiles[useFileStore.getState()[side].cursor]
      closeQuickSearch()
      if (file) handleEnter(file)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const dir = e.key === 'ArrowDown' ? 1 : -1
      const cur = useFileStore.getState()[side].cursor
      const idx = findQuickSearch(visibleFiles, quickSearch, cur + dir, dir)
      if (idx >= 0) jumpTo(idx)
    } else if (e.key === 'Tab') { e.preventDefault(); closeQuickSearch() }
  }

  const scrollToCursor = (index, hasParent) => {
    if (!listRef.current) return
    const rows = listRef.current.querySelectorAll('[data-row]')
    // data-row="0" is the first file row; if [..] is shown it sits before all data-rows
    if (rows[index]) rows[index].scrollIntoView({ block: 'nearest' })
  }

  // Todo #56: store에서 외부로 커서를 옮긴 경우(파일 생성/이름 변경 등)에도
  // 자동 스크롤되도록 cursor 변경에 반응. 키보드 네비게이션 핸들러도 같은 동작을
  // 하지만 idempotent(scrollIntoView block:nearest)이므로 중복 호출은 무해.
  useEffect(() => {
    if (panel.cursorOnParent) return
    requestAnimationFrame(() => {
      if (!listRef.current) return
      const rows = listRef.current.querySelectorAll('[data-row]')
      if (rows[panel.cursor]) rows[panel.cursor].scrollIntoView({ block: 'nearest' })
    })
  }, [panel.cursor, panel.cursorOnParent])

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

  // 드라이브 목록: 드라이브 · FTP 연결 · "FTP 연결..." (Todo #133-8)
  const handleDriveChange = (e) => {
    if (e.target.value === FTP_CONNECT) { onFtpConnect?.(); return }
    store.navigate(side, e.target.value)
  }
  const onFtp = isFtpPath(panel.path)

  rowHandlersRef.current = { click: handleRowClick, dbl: handleRowDoubleClick }

  const selectedCount = panel.selected.size
  const dirSizes = panel.dirSizes || {}
  const totalSize = visibleFiles
    .filter(f => panel.selected.has(f.path))
    .reduce((acc, f) => acc + (f.isDir ? (dirSizes[f.path] ?? 0) : f.size), 0)

  return (
    <div
      className={`${styles.panel} ${isActive ? styles.active : ''}`}
      onClick={handleActivate}
      onFocus={handleActivate}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      ref={listRef}
    >
      <TabBar side={side} panel={panel} store={store} ftpConns={ftpConns} />
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
            {ftpConns.map(c => (
              <option key={c.id} value={ftpRoot(c.id)}>FTP: {ftpLabel(ftpRoot(c.id), ftpConns)}</option>
            ))}
            <option value={FTP_CONNECT}>FTP 연결...</option>
          </select>
        </div>
        <div className={styles.headerRight}>
          {onFtp && (
            <button className={styles.iconBtn} title="FTP 연결 끊기"
              onClick={(e) => { e.stopPropagation(); store.ftpDisconnect(ftpId(panel.path)) }}>
              <Unplug size={13} />
            </button>
          )}
          {panel.readOnly && <span className={styles.readOnlyBadge} title="압축 파일 안 — F5로 꺼내서 쓰세요">읽기 전용</span>}
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
            <BreadcrumbPath path={panel.path} ftpConns={ftpConns} onNavigate={(p) => store.navigate(side, p)} />
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
        {!panel.loading && !panel.error && visibleFiles.map((file, index) => (
          <FileRow
            key={file.path}
            file={file}
            index={index}
            highlighted={isActive && panel.cursor === index && !cursorOnParent}
            selected={panel.selected.has(file.path)}
            dirSize={file.isDir ? dirSizes[file.path] : undefined}
            theme={theme}
            onRowClick={onRowClick}
            onRowDoubleClick={onRowDoubleClick}
          />
        ))}
      </div>

      {quickSearch !== null && (
        <div className={styles.quickSearch} onClick={e => e.stopPropagation()}>
          <span>검색:</span>
          <input aria-label="빠른 검색" className={styles.quickSearchInput} value={quickSearch} autoFocus spellCheck={false}
            onChange={onQuickSearchChange} onKeyDown={onQuickSearchKeyDown} onBlur={() => setQuickSearch(null)} />
        </div>
      )}

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

// 파일 한 줄. 커서/선택이 바뀐 행만 다시 그려지도록 memo (Todo #98 — 큰 폴더에서 키 입력마다 전체 재렌더 방지)
const FileRow = memo(function FileRow({ file, index, highlighted, selected, dirSize, theme, onRowClick, onRowDoubleClick }) {
  const { icon: Icon, color } = getFileIcon(file, theme)
  return (
    <div
      data-row={index}
      className={`
        ${styles.fileRow}
        ${highlighted ? styles.cursor : ''}
        ${selected ? styles.selected : ''}
        ${file.isHidden ? styles.hidden : ''}
        ${index % 2 === 0 ? styles.even : styles.odd}
      `}
      onClick={(e) => onRowClick(e, file, index)}
      onDoubleClick={() => onRowDoubleClick(file)}
      title={file.path}
    >
      <div className={styles.colName} style={{ width: COLUMNS[0].width }}>
        <Icon size={14} style={{ color, flexShrink: 0 }} />
        <span className={styles.fileName}>{file.name}</span>
        {file.isSymlink && <ChevronRight size={10} className={styles.symlinkIcon} />}
      </div>
      <div className={styles.colCell} style={{ width: COLUMNS[1].width, textAlign: 'right' }}>
        {dirSize !== undefined ? formatSize(dirSize, false) : formatSize(file.size, file.isDir)}
      </div>
      <div className={styles.colCell} style={{ width: COLUMNS[2].width }}>
        {formatDate(file.modified)}
      </div>
      <div className={styles.colCell} style={{ width: COLUMNS[3].width }}>
        {!file.isDir ? file.extension?.replace('.', '') : ''}
      </div>
    </div>
  )
})

function TabBar({ side, panel, store, ftpConns }) {
  const getLabel = (path) => {
    if (!path) return 'Home'
    if (isFtpPath(path) && /^ftp:\/\/[^/]+\/?$/.test(path)) return ftpLabel(path, ftpConns)
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

function BreadcrumbPath({ path, ftpConns, onNavigate }) {
  if (!path) return <span>/</span>
  if (isFtpPath(path)) return <FtpBreadcrumb path={path} ftpConns={ftpConns} onNavigate={onNavigate} />
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

// FTP 경로: [user@host] / pub / docs (Todo #133-8)
function FtpBreadcrumb({ path, ftpConns, onNavigate }) {
  const root = ftpRoot(ftpId(path))
  const segs = path.slice(root.length).split('/').filter(Boolean)
  const parts = [{ name: ftpLabel(path, ftpConns), path: root }]
  segs.forEach((seg, i) => parts.push({ name: seg, path: root + segs.slice(0, i + 1).join('/') }))
  return (
    <div className={styles.breadcrumb}>
      {parts.map((part, i) => (
        <React.Fragment key={part.path}>
          <span className={styles.breadcrumbPart} onClick={(e) => { e.stopPropagation(); onNavigate(part.path) }}>{part.name}</span>
          {i < parts.length - 1 && <span className={styles.breadcrumbSep}>/</span>}
        </React.Fragment>
      ))}
    </div>
  )
}
