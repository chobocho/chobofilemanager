import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Text } from '@codemirror/state'
import { Save, X, FileText, Search, ChevronUp, ChevronDown, Eye, Play, Terminal } from 'lucide-react'
import { useFileStore } from '../stores/fileStore'
import { ENCODING_LABELS, nextEncoding } from './FileViewer.jsx'
import CodeSurface from './CodeSurface.jsx'
import styles from '../styles/TextEditor.module.css'

export function isStarlarkFile(ext) {
  const lower = ext.toLowerCase()
  return lower === '.star' || lower === '.bzl'
}

export function buildCursorPosition(text, selectionStart) {
  const before = text.substring(0, selectionStart)
  const lines = before.split('\n')
  return { line: lines.length, col: lines[lines.length - 1].length + 1 }
}

// Starlark 실행 단축키 매처 (Todo #50). F5 또는 Ctrl/Cmd+Enter.
export function isStarlarkRunShortcut(e) {
  if (e.key === 'F5') return true
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') return true
  return false
}

// F3: 에디터 → 뷰어 전환 단축키 (Todo #59)
export function isSwitchToViewerShortcut(e) {
  return e.key === 'F3' && !e.ctrlKey && !e.metaKey && !e.altKey
}

// CodeMirror 상태의 주 선택 시작 위치 → 1부터 시작하는 줄/열
function cursorFromState(state) {
  const pos = state.selection.main.from
  const line = state.doc.lineAt(pos)
  return { line: line.number, col: pos - line.from + 1 }
}

export default function TextEditor({ path, onClose, onSwitchToViewer }) {
  // Todo #110: 편집 내용은 CodeMirror 문서가 보관 — 키 입력마다 전체 문자열을 상태로 복사하지 않음
  const [loadedText, setLoadedText]     = useState('')
  const [stats, setStats]               = useState({ lines: 1, length: 0 })
  const [isDirty, setIsDirty]           = useState(false)
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState(null)
  const [saveError, setSaveError]       = useState(null)
  const [cursor, setCursor]             = useState({ line: 1, col: 1 })
  // 미저장 상태에서 나가려 할 때 보류 중인 동작: null | 'close' | 'viewer' (Todo #75)
  const [pendingLeave, setPendingLeave] = useState(null)
  const [searchOpen, setSearchOpen]     = useState(false)
  const [searchQuery, setSearchQuery]   = useState('')
  const [noMatch, setNoMatch]           = useState(false)
  const [running, setRunning]           = useState(false)
  const [runOutput, setRunOutput]       = useState(null) // null = 패널 미표시
  const [encoding, setEncoding]         = useState('auto')
  // 원본 줄바꿈. 편집 영역은 항상 LF로 다루고 저장할 때 원래 줄바꿈으로 되돌림 (Todo #112)
  const eolRef = useRef('\n')

  const surfaceRef     = useRef(null)
  const originalDocRef = useRef(Text.empty) // 마지막으로 읽거나 저장한 문서 (미저장 판정 기준)
  const searchCacheRef = useRef({ doc: null, lower: '' })
  const searchInputRef = useRef(null)
  const saveConfirmRef = useRef(null)

  const { readFile, writeFile } = useFileStore.getState()
  const fileName = path?.split(/[/\\]/).pop() || 'file'
  const ext = path ? '.' + (path.split('.').pop() || '') : ''
  const isStarlark = isStarlarkFile(ext)

  useEffect(() => {
    let cancelled = false  // Todo #97: 늦게 끝난 이전 파일 로드 결과는 무시
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const raw = await readFile(path, encoding)
        if (cancelled) return
        eolRef.current = raw.includes('\r\n') ? '\r\n' : '\n'
        const text = raw.replace(/\r\n/g, '\n')
        const doc = Text.of(text.split('\n'))
        originalDocRef.current = doc
        setLoadedText(text)
        setStats({ lines: doc.lines, length: doc.length })
        setIsDirty(false)
        setCursor({ line: 1, col: 1 })
      } catch(e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) {
          setLoading(false)
          // 로딩 완료 후 포커스 — Ctrl+F 등 단축키가 뷰어/에디터로 먼저 전달되게 함
          setTimeout(() => surfaceRef.current?.focus(), 0)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [path, encoding])

  // 인코딩 변경: 미저장 변경분이 있으면 확인 — 사용자 실수로 편집 내용 잃는 걸 방지
  const handleEncodingCycle = useCallback(() => {
    const next = nextEncoding(encoding)
    if (isDirty) {
      const ok = window.confirm(
        `저장하지 않은 변경사항이 있습니다.\n인코딩을 "${ENCODING_LABELS[next]}"로 변경하면 변경 내용이 사라집니다. 계속하시겠습니까?`
      )
      if (!ok) return
    }
    setEncoding(next)
  }, [encoding, isDirty])

  // 저장 성공 여부를 반환. 로딩 중/읽기 오류 상태에서는 빈 내용으로 덮어쓰지 않도록 거부 (Todo #76).
  // 저장 실패는 편집 내용을 가리지 않도록 상태 표시줄에 표시.
  const handleSave = useCallback(async () => {
    if (loading || error) return false
    setSaving(true)
    try {
      const doc = surfaceRef.current?.getDoc() ?? originalDocRef.current
      const content = doc.toString()
      const data = eolRef.current === '\r\n' ? content.replace(/\n/g, '\r\n') : content
      await writeFile(path, data, encoding)
      originalDocRef.current = doc
      // 저장하는 동안 더 입력했다면 여전히 미저장
      const now = surfaceRef.current?.getDoc() ?? doc
      setIsDirty(!now.eq(doc))
      setSaveError(null)
      return true
    } catch(e) {
      setSaveError(String(e?.message ?? e))
      return false
    } finally {
      setSaving(false)
    }
  }, [path, encoding, writeFile, loading, error])

  const leave = useCallback((action) => {
    setPendingLeave(null)
    if (action === 'viewer') onSwitchToViewer?.()
    else onClose()
  }, [onClose, onSwitchToViewer])

  // 닫기/뷰어 전환 요청: 변경 사항이 있으면 확인창을 먼저 띄움
  const requestLeave = useCallback((action) => {
    if (isDirty) setPendingLeave(action)
    else leave(action)
  }, [isDirty, leave])

  const handleSaveAndLeave = useCallback(async () => {
    const action = pendingLeave
    if (await handleSave()) leave(action)
    else setPendingLeave(null)
  }, [handleSave, leave, pendingLeave])

  const handleRun = useCallback(async () => {
    if (running) return
    setRunning(true)
    setRunOutput('실행 중...')
    try {
      const api = (await import('../wailsjs/runtime.js')).default
      const result = await api.RunStarlarkFile(path)
      setRunOutput(result || '(출력 없음)')
    } catch (e) {
      setRunOutput('오류: ' + String(e))
    } finally {
      setRunning(false)
    }
  }, [path, running])

  // 최신 핸들러를 ref에 유지 — useEffect 클로저에서 안전하게 참조
  const handleRunRef  = useRef(handleRun)
  const handleSaveRef = useRef(handleSave)
  useEffect(() => { handleRunRef.current  = handleRun  }, [handleRun])
  useEffect(() => { handleSaveRef.current = handleSave }, [handleSave])

  // 미저장 확인창이 뜨면 버튼으로 포커스 — 뒤의 textarea에 계속 입력되지 않도록 (Todo #100)
  useEffect(() => {
    if (pendingLeave) saveConfirmRef.current?.focus()
  }, [pendingLeave])

  useEffect(() => {
    const handler = (e) => {
      if (e.isComposing) return // IME(한글) 조합 중인 키는 조합에 맡김 (Todo #100)
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        e.stopPropagation()
        setSearchOpen(true)
        setNoMatch(false)
        setTimeout(() => searchInputRef.current?.focus(), 0)
        return
      }
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (pendingLeave) {
          setPendingLeave(null)
          surfaceRef.current?.focus()
          return
        }
        if (searchOpen) {
          setSearchOpen(false)
          setNoMatch(false)
          surfaceRef.current?.focus()
          return
        }
        requestLeave('close')
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        e.stopPropagation()
        handleSaveRef.current()
      }
      if (isStarlark && isStarlarkRunShortcut(e)) {
        e.preventDefault()
        e.stopPropagation()
        handleRunRef.current()
      }
      if (isSwitchToViewerShortcut(e) && onSwitchToViewer) {
        e.preventDefault()
        e.stopPropagation()
        requestLeave('viewer')
        return
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [pendingLeave, searchOpen, isStarlark, onSwitchToViewer, requestLeave])

  // 문서 변경: 줄/문자 수와 미저장 여부만 갱신 (길이가 다르면 내용 비교 없이 dirty)
  const handleDocChange = useCallback((doc) => {
    setStats({ lines: doc.lines, length: doc.length })
    const orig = originalDocRef.current
    setIsDirty(doc.length !== orig.length || !doc.eq(orig))
  }, [])

  const handleSelectionChange = useCallback((state) => {
    setCursor(cursorFromState(state))
  }, [])

  // 검색용 소문자 텍스트 — 문서가 바뀌었을 때만 다시 계산
  const lowerText = useCallback(() => {
    const doc = surfaceRef.current?.getDoc()
    if (!doc) return ''
    if (searchCacheRef.current.doc !== doc) searchCacheRef.current = { doc, lower: doc.toString().toLowerCase() }
    return searchCacheRef.current.lower
  }, [])

  const showNoMatch = useCallback(() => {
    setNoMatch(true)
    setTimeout(() => setNoMatch(false), 600)
  }, [])

  const findNext = useCallback(() => {
    const surface = surfaceRef.current
    if (!surface || !searchQuery) return
    const lowerContent = lowerText()
    const lowerQuery = searchQuery.toLowerCase()
    const startIndex = surface.getSelection()[1]
    let matchIndex = lowerContent.indexOf(lowerQuery, startIndex)
    if (matchIndex === -1 && startIndex > 0) {
      matchIndex = lowerContent.indexOf(lowerQuery, 0)  // wrap around
    }
    if (matchIndex === -1) { showNoMatch(); return }
    surface.select(matchIndex, matchIndex + searchQuery.length)
  }, [searchQuery, showNoMatch, lowerText])

  const findPrev = useCallback(() => {
    const surface = surfaceRef.current
    if (!surface || !searchQuery) return
    const lowerContent = lowerText()
    const lowerQuery = searchQuery.toLowerCase()
    // 선택이 맨 앞(0)이면 lastIndexOf(q, 0)이 같은 위치를 다시 찾으므로 바로 끝에서부터 순환 (Todo #107)
    const sel = surface.getSelection()[0]
    let matchIndex = sel > 0 ? lowerContent.lastIndexOf(lowerQuery, sel - 1) : -1
    if (matchIndex === -1) {
      matchIndex = lowerContent.lastIndexOf(lowerQuery)  // wrap around
    }
    if (matchIndex === -1) { showNoMatch(); return }
    surface.select(matchIndex, matchIndex + searchQuery.length)
  }, [searchQuery, showNoMatch, lowerText])

  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setSearchOpen(false)
      setNoMatch(false)
      surfaceRef.current?.focus()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (e.shiftKey) findPrev()
      else findNext()
    }
  }, [findNext, findPrev])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setNoMatch(false)
    surfaceRef.current?.focus()
  }, [])

  return (
    <div className={styles.overlay}>
      {pendingLeave && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmDialog}>
            <div className={styles.confirmTitle}>저장하지 않은 변경사항</div>
            <div className={styles.confirmMsg}>
              <strong>{fileName}</strong>의 변경사항을 저장하시겠습니까?
            </div>
            <div className={styles.confirmActions}>
              <button ref={saveConfirmRef} className={styles.btnSaveConfirm} onClick={handleSaveAndLeave}>저장</button>
              <button className={styles.btnDiscard}     onClick={() => leave(pendingLeave)}>저장 안 함</button>
              <button className={styles.btnCancel}      onClick={() => setPendingLeave(null)}>취소</button>
            </div>
          </div>
        </div>
      )}
      <div className={styles.editor}>
        {/* Header */}
        <div className={styles.header}>
          <FileText size={14} className={styles.fileIcon} />
          <span className={styles.fileName}>
            {fileName}
            {isDirty && <span className={styles.dirty}>●</span>}
          </span>
          <span className={styles.filePath}>{path}</span>

          <div className={styles.actions}>
            {onSwitchToViewer && (
              <button
                className={styles.btnSearch}
                onClick={() => requestLeave('viewer')}
                title="뷰어로 열기 (F3)"
              >
                <Eye size={13} />
              </button>
            )}
            {isStarlark && (
              <button
                className={`${styles.btnRun} ${running ? styles.btnRunning : ''}`}
                onClick={handleRun}
                disabled={running}
                title="Starlark 스크립트 실행 (F5 / Ctrl+Enter)"
              >
                <Play size={13} />
                {running ? '실행 중...' : 'Run'}
              </button>
            )}
            <button
              className={styles.btnSearch}
              onClick={() => { setSearchOpen(v => !v); setTimeout(() => searchInputRef.current?.focus(), 0) }}
              title="검색 (Ctrl+F)"
            >
              <Search size={13} />
            </button>
            <button
              className={`${styles.btnSearch} ${encoding !== 'auto' ? styles.btnSaveDirty : ''}`}
              onClick={handleEncodingCycle}
              title={`인코딩: ${ENCODING_LABELS[encoding]} (클릭하여 변경)`}
              style={{ width: 'auto', padding: '0 8px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
            >
              {ENCODING_LABELS[encoding]}
            </button>
            <button
              className={`${styles.btnSave} ${isDirty ? styles.btnSaveDirty : ''}`}
              onClick={handleSave}
              disabled={saving || !isDirty}
            >
              <Save size={13} />
              {saving ? 'Saving...' : 'Save'}
              <span className={styles.shortcut}>Ctrl+S</span>
            </button>
            <button className={styles.btnClose} onClick={() => requestLeave('close')} title="Close (Esc)">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        {searchOpen && (
          <div className={styles.searchBar}>
            <Search size={12} className={styles.searchIcon} />
            <input
              ref={searchInputRef}
              type="text"
              className={`${styles.searchInput} ${noMatch ? styles.searchNoMatch : ''}`}
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setNoMatch(false) }}
              onKeyDown={handleSearchKeyDown}
              placeholder="검색... (Enter: 다음  Shift+Enter: 이전)"
            />
            <button className={styles.searchBtn} onClick={findPrev} title="이전 (Shift+Enter)">
              <ChevronUp size={13} />
            </button>
            <button className={styles.searchBtn} onClick={findNext} title="다음 (Enter)">
              <ChevronDown size={13} />
            </button>
            <button className={styles.searchBtnClose} onClick={closeSearch} title="닫기 (Esc)">
              <X size={13} />
            </button>
          </div>
        )}

        {/* Body */}
        <div className={styles.body}>
          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : error ? (
            <div className={styles.error}>⚠ {error}</div>
          ) : (
            <CodeSurface
              ref={surfaceRef}
              text={loadedText}
              onDocChange={handleDocChange}
              onSelectionChange={handleSelectionChange}
              className={styles.surface}
            />
          )}
        </div>

        {/* Run output panel */}
        {runOutput !== null && (
          <div className={styles.outputPanel}>
            <div className={styles.outputHeader}>
              <Terminal size={12} />
              <span>출력</span>
              <button className={styles.outputClose} onClick={() => setRunOutput(null)} title="닫기">
                <X size={12} />
              </button>
            </div>
            <pre className={styles.outputBody}>{runOutput}</pre>
          </div>
        )}

        {/* Status bar */}
        <div className={styles.statusBar}>
          <span>{stats.lines} lines</span>
          <span>Ln {cursor.line}, Col {cursor.col}</span>
          <span>{stats.length} chars</span>
          <span>{ENCODING_LABELS[encoding]}</span>
          {isDirty && <span className={styles.unsaved}>Unsaved changes</span>}
          {saveError && <span className={styles.unsaved}>저장 실패: {saveError}</span>}
          {isStarlark && <span className={styles.starlarkBadge}>Starlark</span>}
        </div>
      </div>
    </div>
  )
}
