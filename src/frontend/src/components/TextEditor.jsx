import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Save, X, FileText, Search, ChevronUp, ChevronDown, Eye, Play, Terminal } from 'lucide-react'
import { useFileStore } from '../stores/fileStore'
import styles from '../styles/TextEditor.module.css'

export function isStarlarkFile(ext) {
  const lower = ext.toLowerCase()
  return lower === '.star' || lower === '.bzl'
}

const LINE_HEIGHT = 20  // matches CSS line-height: 20px
const LINE_BUFFER = 10  // extra lines to render above/below viewport

export default function TextEditor({ path, onClose, onSwitchToViewer }) {
  const [content, setContent]           = useState('')
  const [original, setOriginal]         = useState('')
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState(null)
  const [cursor, setCursor]             = useState({ line: 1, col: 1 })
  const [confirmClose, setConfirmClose] = useState(false)
  const [scrollTop, setScrollTop]       = useState(0)
  const [searchOpen, setSearchOpen]     = useState(false)
  const [searchQuery, setSearchQuery]   = useState('')
  const [noMatch, setNoMatch]           = useState(false)
  const [running, setRunning]           = useState(false)
  const [runOutput, setRunOutput]       = useState(null) // null = 패널 미표시

  const textareaRef    = useRef(null)
  const lineNumbersRef = useRef(null)
  const bodyRef        = useRef(null)
  const searchInputRef = useRef(null)

  const { readFile, writeFile } = useFileStore.getState()
  const fileName = path?.split(/[/\\]/).pop() || 'file'
  const ext = path ? '.' + (path.split('.').pop() || '') : ''
  const isStarlark = isStarlarkFile(ext)
  const isDirty = content !== original

  // Compute line count only when content changes
  const lineCount = useMemo(() => content.split('\n').length, [content])

  // Virtual line number range — only render lines near the viewport
  const viewHeight   = bodyRef.current?.clientHeight ?? 600
  const firstVisible = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - LINE_BUFFER)
  const lastVisible  = Math.min(lineCount - 1, Math.ceil((scrollTop + viewHeight) / LINE_HEIGHT) + LINE_BUFFER)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const text = await readFile(path)
        setContent(text)
        setOriginal(text)
      } catch(e) {
        setError(String(e))
      } finally {
        setLoading(false)
        // 로딩 완료 후 포커스 — Ctrl+F 등 단축키가 뷰어/에디터로 먼저 전달되게 함
        setTimeout(() => textareaRef.current?.focus(), 0)
      }
    }
    load()
  }, [path])

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        e.stopPropagation()  // 캡처 페이즈에서 부모 Ctrl+F 핸들러 차단
        setSearchOpen(true)
        setNoMatch(false)
        setTimeout(() => searchInputRef.current?.focus(), 0)
        return
      }
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (searchOpen) {
          setSearchOpen(false)
          setNoMatch(false)
          textareaRef.current?.focus()
          return
        }
        if (isDirty) {
          setConfirmClose(true)
        } else {
          onClose()
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        e.stopPropagation()
        handleSave()
      }
      if (e.key === 'F5' && isStarlark) {
        e.preventDefault()
        e.stopPropagation()
        handleRun()
      }
    }
    // capture: true — 버블 페이즈 Toolbar 핸들러보다 먼저 실행되어 이벤트를 선점
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [content, isDirty, searchOpen, isStarlark, handleRun])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await writeFile(path, content)
      setOriginal(content)
    } catch(e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }, [path, content, writeFile])

  const handleSaveAndClose = useCallback(async () => {
    await handleSave()
    onClose()
  }, [handleSave, onClose])

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

  // Sync line numbers scroll position with textarea (ssMemo pattern)
  const handleScroll = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    setScrollTop(ta.scrollTop)
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = ta.scrollTop
    }
  }, [])

  const handleCursorChange = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    const text = ta.value.substring(0, ta.selectionStart)
    const lines = text.split('\n')
    setCursor({ line: lines.length, col: lines[lines.length - 1].length + 1 })
  }, [])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = textareaRef.current
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const newContent = content.substring(0, start) + '  ' + content.substring(end)
      setContent(newContent)
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + 2
      }, 0)
    }
  }, [content])

  // Scroll to match: positions match 1/3 from top (ssMemo scrollToIndex pattern)
  const scrollToMatch = useCallback((el, index) => {
    const textBefore = el.value.slice(0, index)
    const lineIndex = textBefore.split('\n').length - 1
    const style = window.getComputedStyle(el)
    const lineHeight = parseFloat(style.lineHeight) || LINE_HEIGHT
    const paddingTop = parseFloat(style.paddingTop) || 12
    const targetTop = lineIndex * lineHeight + paddingTop
    const offset = el.clientHeight / 3
    el.scrollTop = Math.max(0, targetTop - offset)
  }, [])

  const showNoMatch = useCallback(() => {
    setNoMatch(true)
    setTimeout(() => setNoMatch(false), 600)
  }, [])

  const findNext = useCallback(() => {
    const ta = textareaRef.current
    if (!ta || !searchQuery) return
    const lowerContent = ta.value.toLowerCase()
    const lowerQuery = searchQuery.toLowerCase()
    const startIndex = ta.selectionEnd ?? 0
    let matchIndex = lowerContent.indexOf(lowerQuery, startIndex)
    if (matchIndex === -1 && startIndex > 0) {
      matchIndex = lowerContent.indexOf(lowerQuery, 0)  // wrap around
    }
    if (matchIndex === -1) { showNoMatch(); return }
    ta.focus()
    ta.setSelectionRange(matchIndex, matchIndex + searchQuery.length)
    scrollToMatch(ta, matchIndex)
    handleCursorChange()
  }, [searchQuery, scrollToMatch, showNoMatch, handleCursorChange])

  const findPrev = useCallback(() => {
    const ta = textareaRef.current
    if (!ta || !searchQuery) return
    const lowerContent = ta.value.toLowerCase()
    const lowerQuery = searchQuery.toLowerCase()
    const startIndex = Math.max(0, (ta.selectionStart ?? 1) - 1)
    let matchIndex = lowerContent.lastIndexOf(lowerQuery, startIndex)
    if (matchIndex === -1) {
      matchIndex = lowerContent.lastIndexOf(lowerQuery)  // wrap around
    }
    if (matchIndex === -1) { showNoMatch(); return }
    ta.focus()
    ta.setSelectionRange(matchIndex, matchIndex + searchQuery.length)
    scrollToMatch(ta, matchIndex)
    handleCursorChange()
  }, [searchQuery, scrollToMatch, showNoMatch, handleCursorChange])

  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setSearchOpen(false)
      setNoMatch(false)
      textareaRef.current?.focus()
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
    textareaRef.current?.focus()
  }, [])

  return (
    <div className={styles.overlay}>
      {confirmClose && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmDialog}>
            <div className={styles.confirmTitle}>저장하지 않은 변경사항</div>
            <div className={styles.confirmMsg}>
              <strong>{fileName}</strong>의 변경사항을 저장하시겠습니까?
            </div>
            <div className={styles.confirmActions}>
              <button className={styles.btnSaveConfirm} onClick={handleSaveAndClose}>저장</button>
              <button className={styles.btnDiscard}     onClick={onClose}>저장 안 함</button>
              <button className={styles.btnCancel}      onClick={() => setConfirmClose(false)}>취소</button>
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
                onClick={onSwitchToViewer}
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
                title="Starlark 스크립트 실행 (F5)"
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
              className={`${styles.btnSave} ${isDirty ? styles.btnSaveDirty : ''}`}
              onClick={handleSave}
              disabled={saving || !isDirty}
            >
              <Save size={13} />
              {saving ? 'Saving...' : 'Save'}
              <span className={styles.shortcut}>Ctrl+S</span>
            </button>
            <button className={styles.btnClose} onClick={onClose} title="Close (Esc)">
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
        <div className={styles.body} ref={bodyRef}>
          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : error ? (
            <div className={styles.error}>⚠ {error}</div>
          ) : (
            <>
              {/* Virtual line numbers — only visible range + buffer is in DOM */}
              <div className={styles.lineNumbers} ref={lineNumbersRef} aria-hidden>
                {/* Spacer for lines above viewport */}
                <div style={{ height: firstVisible * LINE_HEIGHT }} />
                {Array.from({ length: lastVisible - firstVisible + 1 }, (_, i) => {
                  const lineNum = firstVisible + i + 1
                  return (
                    <div
                      key={lineNum}
                      className={`${styles.lineNum} ${cursor.line === lineNum ? styles.lineNumActive : ''}`}
                    >
                      {lineNum}
                    </div>
                  )
                })}
                {/* Spacer for lines below viewport */}
                <div style={{ height: Math.max(0, lineCount - lastVisible - 1) * LINE_HEIGHT }} />
              </div>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                className={styles.textarea}
                value={content}
                onChange={e => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                onKeyUp={handleCursorChange}
                onClick={handleCursorChange}
                onScroll={handleScroll}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />
            </>
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
          <span>{lineCount} lines</span>
          <span>Ln {cursor.line}, Col {cursor.col}</span>
          <span>{content.length} chars</span>
          {isDirty && <span className={styles.unsaved}>Unsaved changes</span>}
          {isStarlark && <span className={styles.starlarkBadge}>Starlark</span>}
        </div>
      </div>
    </div>
  )
}
