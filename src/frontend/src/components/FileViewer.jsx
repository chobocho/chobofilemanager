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

// 이미지 확장자 (Todo #52). F3 뷰어에서 base64 data URL로 표시.
export const IMAGE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico',
])

export function isImageFile(ext) {
  return IMAGE_EXTS.has(ext.toLowerCase())
}

// 이미지 뷰어에서 ←/→로 폴더 안 이전/다음 이미지로 이동.
// dir: 'prev' | 'next'. 끝에 도달하면 순환(wrap-around).
// 반환: 새 경로 또는 null(이동 불가 — siblings 비어있음/1개/현재 경로 못 찾음).
export function siblingImagePath(siblings, currentPath, dir) {
  if (!Array.isArray(siblings) || siblings.length < 2) return null
  const idx = siblings.indexOf(currentPath)
  if (idx === -1) return null
  const delta = dir === 'next' ? 1 : -1
  const newIdx = (idx + delta + siblings.length) % siblings.length
  return siblings[newIdx]
}

export function isViewableFile(ext) {
  const lower = ext.toLowerCase()
  return VIEWABLE_EXTS.has(lower) || IMAGE_EXTS.has(lower)
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

// 인코딩 순환 — F3/F4 뷰어/편집기 UI에서 자동 판별이 틀렸을 때 수동 변경.
// 백엔드 ReadTextFileWithEncoding 의 encName 인자와 일치해야 함.
export const ENCODINGS = ['auto', 'utf-8', 'utf-16le', 'utf-16be', 'cp949', 'johab']
export const ENCODING_LABELS = {
  'auto':     'Auto',
  'utf-8':    'UTF-8',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
  'cp949':    'CP949',
  'johab':    'Johab',
}
export function nextEncoding(current) {
  const idx = ENCODINGS.indexOf(current)
  if (idx === -1) return 'auto'
  return ENCODINGS[(idx + 1) % ENCODINGS.length]
}

const LINE_BUFFER = 10  // extra lines to render above/below viewport

// F4: 뷰어 → 에디터 전환 단축키 (Todo #59)
export function isSwitchToEditorShortcut(e) {
  return e.key === 'F4' && !e.ctrlKey && !e.metaKey && !e.altKey
}

// 이미지 줌 (Todo #63): Ctrl + +/-, Ctrl + 휠로 F3 이미지 뷰어 확대/축소
export const MIN_IMAGE_SCALE = 0.1
export const MAX_IMAGE_SCALE = 8
export const DEFAULT_IMAGE_SCALE = 1
export const IMAGE_SCALE_STEP = 1.25

export function multiplyImageScale(current, factor) {
  return Math.min(MAX_IMAGE_SCALE, Math.max(MIN_IMAGE_SCALE, current * factor))
}

export function isImageZoomInShortcut(e) {
  return Boolean((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '='))
}

export function isImageZoomOutShortcut(e) {
  return Boolean((e.ctrlKey || e.metaKey) && e.key === '-')
}

export function isImageZoomResetShortcut(e) {
  return Boolean((e.ctrlKey || e.metaKey) && e.key === '0')
}

export default function FileViewer({ path, onClose, onSwitchToEditor, siblingImages, onChangePath }) {
  const [content, setContent]     = useState('')
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [fontSize, setFontSize]   = useState(13)
  const [scrollTop, setScrollTop] = useState(0)
  const [wordWrap, setWordWrap]       = useState(false)
  const [searchOpen, setSearchOpen]   = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [noMatch, setNoMatch]         = useState(false)
  const [encoding, setEncoding]       = useState('auto')
  const [imageScale, setImageScale]   = useState(DEFAULT_IMAGE_SCALE)

  const ext = path ? '.' + (path.split('.').pop() || '') : ''
  const isMarkdown = isMarkdownFile(ext)
  const isImage    = isImageFile(ext)
  const [mdRendered, setMdRendered] = useState(true) // markdown 기본 렌더링 모드

  const lineNumbersRef = useRef(null)
  const textareaRef    = useRef(null)
  const bodyRef        = useRef(null)
  const searchInputRef = useRef(null)
  const mdBodyRef      = useRef(null)

  const { readFile, readImage } = useFileStore.getState()
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
        if (isImage) {
          const dataUrl = await readImage(path)
          setContent(dataUrl)
        } else {
          const text = await readFile(path, encoding)
          setContent(text)
        }
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
        setTimeout(() => (isMarkdown && mdRendered ? mdBodyRef.current : textareaRef.current)?.focus(), 0)
      }
    }
    load()
  }, [path, encoding, isImage])

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        e.stopPropagation()
        if (isImage) return  // 이미지에는 검색 불가
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
      if (isSwitchToEditorShortcut(e) && onSwitchToEditor) {
        e.preventDefault()
        e.stopPropagation()
        onSwitchToEditor()
        return
      }
      // 이미지 모드에서 Ctrl + +/- 줌, Ctrl + 0 리셋 (Todo #63)
      if (isImage) {
        if (isImageZoomInShortcut(e)) {
          e.preventDefault(); e.stopPropagation()
          setImageScale(prev => multiplyImageScale(prev, IMAGE_SCALE_STEP))
          return
        }
        if (isImageZoomOutShortcut(e)) {
          e.preventDefault(); e.stopPropagation()
          setImageScale(prev => multiplyImageScale(prev, 1 / IMAGE_SCALE_STEP))
          return
        }
        if (isImageZoomResetShortcut(e)) {
          e.preventDefault(); e.stopPropagation()
          setImageScale(DEFAULT_IMAGE_SCALE)
          return
        }
      }
      // 이미지 모드에서 ←/→ 로 폴더 안 이전/다음 이미지로 이동
      if (isImage && onChangePath && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const dir = e.key === 'ArrowRight' ? 'next' : 'prev'
        const newPath = siblingImagePath(siblingImages, path, dir)
        if (newPath) {
          e.preventDefault()
          e.stopPropagation()
          onChangePath(newPath)
        }
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose, onSwitchToEditor, searchOpen, isMarkdown, mdRendered, isImage, onChangePath, siblingImages, path])

  // Reset scroll when font size changes so line numbers re-sync
  useEffect(() => {
    setScrollTop(0)
    if (textareaRef.current) textareaRef.current.scrollTop = 0
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = 0
  }, [fontSize])

  // 이미지가 바뀌면 줌 리셋 (Todo #63)
  useEffect(() => {
    if (isImage) setImageScale(DEFAULT_IMAGE_SCALE)
  }, [path, isImage])

  // Ctrl + 휠로 이미지 확대/축소 (Todo #63). 비-passive 리스너로 등록해야 preventDefault가 동작.
  const imageContainerRef = useRef(null)
  useEffect(() => {
    if (!isImage) return
    const el = imageContainerRef.current
    if (!el) return
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const factor = e.deltaY < 0 ? IMAGE_SCALE_STEP : 1 / IMAGE_SCALE_STEP
      setImageScale(prev => multiplyImageScale(prev, factor))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [isImage, loading])

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
            {!isImage && (!isMarkdown || !mdRendered) && (
              <button
                className={`${styles.btnSearch} ${wordWrap ? styles.btnActive : ''}`}
                onClick={() => setWordWrap(v => !v)}
                title="자동 줄 바꿈 (Word Wrap)"
              >
                <WrapText size={13} />
              </button>
            )}
            {!isImage && (!isMarkdown || !mdRendered) && (
              <button
                className={`${styles.btnSearch} ${encoding !== 'auto' ? styles.btnActive : ''}`}
                onClick={() => setEncoding(prev => nextEncoding(prev))}
                title={`인코딩: ${ENCODING_LABELS[encoding]} (클릭하여 변경)`}
                style={{ width: 'auto', padding: '0 8px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
              >
                {ENCODING_LABELS[encoding]}
              </button>
            )}
            {!isImage && (!isMarkdown || !mdRendered) && (
              <button
                className={styles.btnSearch}
                onClick={() => { setSearchOpen(v => !v); setTimeout(() => searchInputRef.current?.focus(), 0) }}
                title="검색 (Ctrl+F)"
              >
                <Search size={13} />
              </button>
            )}
            {!isImage && (!isMarkdown || !mdRendered) && <>
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
          ) : isImage ? (
            <div
              ref={imageContainerRef}
              tabIndex={0}
              style={{
                width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'auto', padding: '12px',
              }}
            >
              <img
                src={content}
                alt={fileName}
                draggable={false}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  transform: `scale(${imageScale})`,
                  transformOrigin: 'center center',
                  transition: 'transform 80ms ease-out',
                  cursor: imageScale > 1 ? 'zoom-out' : 'zoom-in',
                }}
              />
            </div>
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
          {isImage ? (
            <span className={styles.viewMode}>
              이미지 — {ext.replace('.', '').toUpperCase()}
              {' — '}{Math.round(imageScale * 100)}% (Ctrl +/- · Ctrl+휠 · Ctrl+0 리셋)
              {Array.isArray(siblingImages) && siblingImages.length > 1 && siblingImages.indexOf(path) >= 0 &&
                ` — ${siblingImages.indexOf(path) + 1} / ${siblingImages.length} (←/→로 이동)`}
              {' — F3 / Esc to close'}
            </span>
          ) : isMarkdown && mdRendered ? (
            <span className={styles.viewMode}>Markdown 렌더링 — F3 / Esc to close</span>
          ) : (
            <>
              <span>{lineCount} lines</span>
              <span>{content.length} chars</span>
              <span>{fontSize}px</span>
              <span>{ENCODING_LABELS[encoding]}</span>
              {wordWrap && <span>WRAP</span>}
              <span className={styles.viewMode}>View Mode — F3 / Esc to close</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
