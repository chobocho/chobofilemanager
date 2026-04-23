import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Eye, X, AArrowDown, AArrowUp, FileText, Search, ChevronUp, ChevronDown, Code, BookOpen, Pencil, WrapText } from 'lucide-react'
import { marked } from 'marked'
import { useFileStore } from '../stores/fileStore'
import styles from '../styles/FileViewer.module.css'

export const MIN_FONT = 10
export const MAX_FONT = 28

export const VIEWABLE_EXTS = new Set([
  '.txt', '.md', '.js', '.jsx', '.ts', '.tsx',
  '.go', '.py', '.rs', '.c', '.cpp', '.h',
  '.html', '.css', '.json', '.xml', '.yaml', '.yml',
  '.sh', '.bat', '.log', '.ini', '.cfg', '.conf', '.env',
  '.csv', '.sql', '.toml', '.gitignore', '.dockerfile',
  '.star', '.bzl',
])

export function isViewableFile(ext) {
  return VIEWABLE_EXTS.has(ext.toLowerCase())
}

export function isMarkdownFile(ext) {
  return ext.toLowerCase() === '.md'
}

export function clampFontSize(current, delta) {
  return Math.min(MAX_FONT, Math.max(MIN_FONT, current + delta))
}

export function getWordWrapStyle(wordWrap) {
  if (wordWrap) {
    return { whiteSpace: 'pre-wrap', overflowX: 'hidden', overflowWrap: 'break-word' }
  }
  return { whiteSpace: 'pre', overflowX: 'auto', overflowWrap: 'normal' }
}

const LINE_BUFFER = 10  // extra lines to render above/below viewport

export default function FileViewer({ path, onClose, onSwitchToEditor }) {
  const [content, setContent]     = useState('')
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [fontSize, setFontSize]   = useState(13)
  const [scrollTop, setScrollTop] = useState(0)
  const [wordWrap, setWordWrap]       = useState(false)
  const [searchOpen, setSearchOpen]   = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [noMatch, setNoMatch]         = useState(false)

  const ext = path ? '.' + (path.split('.').pop() || '') : ''
  const isMarkdown = isMarkdownFile(ext)
  const [mdRendered, setMdRendered] = useState(true) // markdown 기본 렌더링 모드

  const lineNumbersRef = useRef(null)
  const textareaRef    = useRef(null)
  const bodyRef        = useRef(null)
  const searchInputRef = useRef(null)
  const mdBodyRef      = useRef(null)

  const { readFile } = useFileStore.getState()
  const fileName = path?.split(/[/\\]/).pop() || 'file'

  const lineHeight = fontSize + 7  // matches CSS lineHeight formula

  // Compute line count only when content changes
  const lineCount = useMemo(() => content.split('\n').length, [content])

  // Virtual line number range — only render lines near the viewport
  const viewHeight   = bodyRef.current?.clientHeight ?? 600
  const firstVisible = Math.max(0, Math.floor(scrollTop / lineHeight) - LINE_BUFFER)
  const lastVisible  = Math.min(lineCount - 1, Math.ceil((scrollTop + viewHeight) / lineHeight) + LINE_BUFFER)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const text = await readFile(path)
        setContent(text)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
        setTimeout(() => (isMarkdown && mdRendered ? mdBodyRef.current : textareaRef.current)?.focus(), 0)
      }
    }
    load()
  }, [path])

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        e.stopPropagation()
        if (isMarkdown && mdRendered) return  // 렌더링 모드에서는 검색 불가
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
        onClose()
      }
      if (e.key === 'F3') { e.preventDefault(); e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose, searchOpen, isMarkdown, mdRendered])

  // Reset scroll when font size changes so line numbers re-sync
  useEffect(() => {
    setScrollTop(0)
    if (textareaRef.current) textareaRef.current.scrollTop = 0
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = 0
  }, [fontSize])

  // Sync line numbers scroll position with textarea (ssMemo pattern)
  const handleScroll = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    setScrollTop(ta.scrollTop)
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = ta.scrollTop
    }
  }, [])

  const changeFontSize = useCallback((delta) => {
    setFontSize(prev => clampFontSize(prev, delta))
  }, [])

  // Scroll to match: positions match 1/3 from top (ssMemo scrollToIndex pattern)
  const scrollToMatch = useCallback((el, index) => {
    const textBefore = el.value.slice(0, index)
    const lineIndex = textBefore.split('\n').length - 1
    const style = window.getComputedStyle(el)
    const lh = parseFloat(style.lineHeight) || lineHeight
    const paddingTop = parseFloat(style.paddingTop) || 12
    const targetTop = lineIndex * lh + paddingTop
    const offset = el.clientHeight / 3
    el.scrollTop = Math.max(0, targetTop - offset)
  }, [lineHeight])

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
  }, [searchQuery, scrollToMatch, showNoMatch])

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
  }, [searchQuery, scrollToMatch, showNoMatch])

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

  const mdHtml = useMemo(() => {
    if (!isMarkdown || !content) return ''
    return marked.parse(content)
  }, [isMarkdown, content])

  return (
    <div className={styles.overlay}>
      <div className={styles.viewer}>
        {/* Header */}
        <div className={styles.header}>
          <Eye size={14} className={styles.fileIcon} />
          <span className={styles.fileName}>{fileName}</span>
          <span className={styles.filePath}>{path}</span>
          <span className={styles.readonlyBadge}>READ ONLY</span>

          <div className={styles.actions}>
            {onSwitchToEditor && (
              <button
                className={styles.btnSearch}
                onClick={onSwitchToEditor}
                title="편집기로 열기 (F4)"
              >
                <Pencil size={13} />
              </button>
            )}
            {isMarkdown && (
              <button
                className={`${styles.btnSearch} ${mdRendered ? styles.btnActive : ''}`}
                onClick={() => {
                  setMdRendered(v => !v)
                  setSearchOpen(false)
                }}
                title={mdRendered ? '원본 텍스트 보기' : '마크다운 렌더링 보기'}
              >
                {mdRendered ? <Code size={13} /> : <BookOpen size={13} />}
              </button>
            )}
            {(!isMarkdown || !mdRendered) && (
              <button
                className={`${styles.btnSearch} ${wordWrap ? styles.btnActive : ''}`}
                onClick={() => setWordWrap(v => !v)}
                title="자동 줄 바꿈 (Word Wrap)"
              >
                <WrapText size={13} />
              </button>
            )}
            {(!isMarkdown || !mdRendered) && (
              <button
                className={styles.btnSearch}
                onClick={() => { setSearchOpen(v => !v); setTimeout(() => searchInputRef.current?.focus(), 0) }}
                title="검색 (Ctrl+F)"
              >
                <Search size={13} />
              </button>
            )}
            {(!isMarkdown || !mdRendered) && <>
              <button
                className={styles.btnFont}
                onClick={() => changeFontSize(-1)}
                title="글자 작게 (A-)"
              >
                <AArrowDown size={14} />
              </button>
              <span className={styles.fontSizeLabel}>{fontSize}px</span>
              <button
                className={styles.btnFont}
                onClick={() => changeFontSize(1)}
                title="글자 크게 (A+)"
              >
                <AArrowUp size={14} />
              </button>
            </>}
            <button className={styles.btnClose} onClick={onClose} title="Close (Esc / F3)">
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
          ) : isMarkdown && mdRendered ? (
            <div
              ref={mdBodyRef}
              className={styles.markdownBody}
              tabIndex={0}
              dangerouslySetInnerHTML={{ __html: mdHtml }}
            />
          ) : (
            <>
              {/* Virtual line numbers — hidden when word wrap is on (wrapped lines break alignment) */}
              {!wordWrap && (
                <div className={styles.lineNumbers} ref={lineNumbersRef} aria-hidden>
                  <div style={{ height: firstVisible * lineHeight }} />
                  {Array.from({ length: lastVisible - firstVisible + 1 }, (_, i) => {
                    const lineNum = firstVisible + i + 1
                    return (
                      <div
                        key={lineNum}
                        className={styles.lineNum}
                        style={{ lineHeight: `${lineHeight}px`, height: `${lineHeight}px` }}
                      >
                        {lineNum}
                      </div>
                    )
                  })}
                  <div style={{ height: Math.max(0, lineCount - lastVisible - 1) * lineHeight }} />
                </div>
              )}

              {/* Readonly textarea — supports setSelectionRange for search highlighting */}
              <textarea
                ref={textareaRef}
                className={styles.pre}
                value={content}
                readOnly
                style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px`, ...getWordWrapStyle(wordWrap) }}
                onScroll={handleScroll}
                spellCheck={false}
              />
            </>
          )}
        </div>

        {/* Status bar */}
        <div className={styles.statusBar}>
          {isMarkdown && mdRendered ? (
            <span className={styles.viewMode}>Markdown 렌더링 — F3 / Esc to close</span>
          ) : (
            <>
              <span>{lineCount} lines</span>
              <span>{content.length} chars</span>
              <span>{fontSize}px</span>
              {wordWrap && <span>WRAP</span>}
              <span className={styles.viewMode}>View Mode — F3 / Esc to close</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
