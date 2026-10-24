import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Eye, X, AArrowDown, AArrowUp, FileText, Search, ChevronUp, ChevronDown, Code, BookOpen, Pencil, WrapText } from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useFileStore } from '../stores/fileStore'
import { isImageFile } from '../utils/fileTypes.js'
import CodeSurface from './CodeSurface.jsx'
import { languageKeyForPath } from './codeLanguages.js'
import styles from '../styles/FileViewer.module.css'

// Todo #73: 마크다운의 원시 HTML이 Wails 웹뷰에서 실행되면 Go 바인딩(셸 실행·삭제)을 호출할 수 있으므로
// marked 출력을 DOMPurify로 정리합니다 (script, 이벤트 핸들러, javascript: URL, iframe 등 제거).
export function renderMarkdown(content) {
  if (!content) return ''
  return DOMPurify.sanitize(marked.parse(content), { FORBID_TAGS: ['style', 'form'] })
}

// 마크다운 링크 클릭 시 외부 브라우저로 열 URL. 허용하지 않는 스킴/앵커는 null.
export function externalLinkUrl(href) {
  if (!href) return null
  return /^(https?:|mailto:)/i.test(href) ? href : null
}

export const MIN_FONT = 10
export const MAX_FONT = 28

// 확장자 목록/판별 함수는 공통 모듈에서 관리 (Todo #102). 기존 import 호환을 위해 다시 export
export { TEXT_EXTS as VIEWABLE_EXTS, IMAGE_EXTS, isImageFile, isViewableFile } from '../utils/fileTypes.js'


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

// 이미지 뷰어 vi 스타일 스크롤 (Todo #64): 확대로 스크롤바가 생겼을 때
// h/l = 좌/우, j/k = 하/상. 다른 키는 null.
export const IMAGE_SCROLL_STEP = 40
export function imageScrollDelta(key) {
  if (key === 'h') return { dx: -IMAGE_SCROLL_STEP, dy: 0 }
  if (key === 'l') return { dx: IMAGE_SCROLL_STEP, dy: 0 }
  if (key === 'j') return { dx: 0, dy: IMAGE_SCROLL_STEP }
  if (key === 'k') return { dx: 0, dy: -IMAGE_SCROLL_STEP }
  return null
}

// Todo #65: transform: scale()은 시각만 키우고 레이아웃 박스는 그대로라
// transformOrigin: center 와 결합되면 확대된 이미지가 컨테이너 바깥으로 사방 overflow,
// scrollLeft=0이 시각적 좌측 끝이 아니라 좌측이 잘려 보였음.
// CSS `zoom`은 시각과 레이아웃(스크롤 영역) 모두 확대하므로 정확히 스크롤됨.
//
// Todo #65 후속: scale != 1일 때 maxWidth/maxHeight 100%가 부모 컨테이너 크기로
// zoom된 이미지를 다시 제한해 확대가 거의 안 보이는 문제. scale=1 (fit-to-window)일
// 때만 100% 제한을 두고, 사용자가 명시적으로 zoom을 조정하면 제한을 푼다.
export function getImageStyle(imageScale) {
  if (imageScale === DEFAULT_IMAGE_SCALE) {
    return {
      maxWidth: '100%',
      maxHeight: '100%',
      objectFit: 'contain',
      zoom: imageScale,
      cursor: 'zoom-in',
    }
  }
  return {
    objectFit: 'contain',
    zoom: imageScale,
    cursor: imageScale > 1 ? 'zoom-out' : 'zoom-in',
  }
}

export default function FileViewer({ path, onClose, onSwitchToEditor, siblingImages, onChangePath }) {
  const [content, setContent]     = useState('')
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [fontSize, setFontSize]   = useState(13)
  const [wordWrap, setWordWrap]       = useState(false)
  const [searchOpen, setSearchOpen]   = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [noMatch, setNoMatch]         = useState(false)
  const [encoding, setEncoding]       = useState('auto')
  const [imageScale, setImageScale]   = useState(DEFAULT_IMAGE_SCALE)

  const ext = path ? '.' + (path.split('.').pop() || '') : ''
  const isMarkdown = isMarkdownFile(ext)
  const isImage    = isImageFile(ext)
  const languageKey = isImage ? null : languageKeyForPath(path)
  const [mdRendered, setMdRendered] = useState(true) // markdown 기본 렌더링 모드

  const surfaceRef        = useRef(null)  // Todo #111: 텍스트 모드는 CodeMirror(읽기 전용)
  const searchInputRef    = useRef(null)
  const mdBodyRef         = useRef(null)
  const imageContainerRef = useRef(null)

  const { readFile, readImage } = useFileStore.getState()
  const fileName = path?.split(/[/\\]/).pop() || 'file'


  // Compute line count only when content changes
  const lineCount = useMemo(() => content.split('\n').length, [content])

  // 검색용 소문자 텍스트 — 파일을 읽을 때 한 번만 계산
  const lowerContent = useMemo(() => (isImage ? '' : content.toLowerCase()), [content, isImage])

  // Todo #97: 새 파일을 읽을 때 이전 오류를 지우고, 더 늦게 끝난 이전 로드 결과는 버림
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = isImage ? await readImage(path) : await readFile(path, encoding)
        // 텍스트는 LF로 통일해 표시 (줄 수 계산이 편집기와 같도록, Todo #112)
        if (!cancelled) setContent(isImage ? data : data.replace(/\r\n/g, '\n'))
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) {
          setLoading(false)
          setTimeout(() => (isMarkdown && mdRendered ? mdBodyRef.current : surfaceRef.current)?.focus(), 0)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [path, encoding, isImage])

  useEffect(() => {
    const handler = (e) => {
      if (e.isComposing) return // IME 조합 중인 키는 무시 (Todo #100)
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
          surfaceRef.current?.focus()
          return
        }
        onClose()
      }
      if (e.key === 'F3') { e.preventDefault(); e.stopPropagation(); onClose() }
      // 이미지는 텍스트 에디터로 열면 저장 시 손상되므로 전환 불가 (Todo #100)
      if (isSwitchToEditorShortcut(e) && onSwitchToEditor && !isImage) {
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
        // h/j/k/l vi 스타일 스크롤 (Todo #64) — 모디파이어 없을 때만
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
          const delta = imageScrollDelta(e.key)
          if (delta && imageContainerRef.current) {
            e.preventDefault(); e.stopPropagation()
            imageContainerRef.current.scrollBy(delta.dx, delta.dy)
            return
          }
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

  // 이미지가 바뀌면 줌 리셋 (Todo #63)
  useEffect(() => {
    if (isImage) setImageScale(DEFAULT_IMAGE_SCALE)
  }, [path, isImage])

  // Ctrl + 휠로 이미지 확대/축소 (Todo #63). 비-passive 리스너로 등록해야 preventDefault가 동작.
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

  const changeFontSize = useCallback((delta) => {
    setFontSize(prev => clampFontSize(prev, delta))
  }, [])

  const showNoMatch = useCallback(() => {
    setNoMatch(true)
    setTimeout(() => setNoMatch(false), 600)
  }, [])

  const findNext = useCallback(() => {
    const surface = surfaceRef.current
    if (!surface || !searchQuery) return
    const lowerQuery = searchQuery.toLowerCase()
    const startIndex = surface.getSelection()[1]
    let matchIndex = lowerContent.indexOf(lowerQuery, startIndex)
    if (matchIndex === -1 && startIndex > 0) {
      matchIndex = lowerContent.indexOf(lowerQuery, 0)  // wrap around
    }
    if (matchIndex === -1) { showNoMatch(); return }
    surface.select(matchIndex, matchIndex + searchQuery.length)
  }, [searchQuery, showNoMatch, lowerContent])

  const findPrev = useCallback(() => {
    const surface = surfaceRef.current
    if (!surface || !searchQuery) return
    const lowerQuery = searchQuery.toLowerCase()
    // 선택이 맨 앞(0)이면 lastIndexOf(q, 0)이 같은 위치를 다시 찾으므로 바로 끝에서부터 순환 (Todo #107)
    const sel = surface.getSelection()[0]
    let matchIndex = sel > 0 ? lowerContent.lastIndexOf(lowerQuery, sel - 1) : -1
    if (matchIndex === -1) {
      matchIndex = lowerContent.lastIndexOf(lowerQuery)  // wrap around
    }
    if (matchIndex === -1) { showNoMatch(); return }
    surface.select(matchIndex, matchIndex + searchQuery.length)
  }, [searchQuery, showNoMatch, lowerContent])

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

  const mdHtml = useMemo(() => {
    if (!isMarkdown || !content) return ''
    return renderMarkdown(content)
  }, [isMarkdown, content])

  // 링크 클릭이 앱 웹뷰 자체를 이동시키지 않도록 가로채고, http(s)/mailto만 외부 브라우저로 엽니다.
  const handleMarkdownClick = useCallback((e) => {
    const a = e.target.closest?.('a')
    if (!a) return
    e.preventDefault()
    const url = externalLinkUrl(a.getAttribute('href'))
    if (url) window.runtime?.BrowserOpenURL?.(url)
  }, [])

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
            {onSwitchToEditor && !isImage && (
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
        <div className={styles.body}>
          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : error ? (
            <div className={styles.error}>⚠ {error}</div>
          ) : isImage ? (
            <div
              ref={imageContainerRef}
              tabIndex={0}
              className={styles.imageContainer}
            >
              <img
                src={content}
                alt={fileName}
                draggable={false}
                style={getImageStyle(imageScale)}
              />
            </div>
          ) : isMarkdown && mdRendered ? (
            <div
              ref={mdBodyRef}
              className={styles.markdownBody}
              tabIndex={0}
              onClick={handleMarkdownClick}
              dangerouslySetInnerHTML={{ __html: mdHtml }}
            />
          ) : (
            <CodeSurface
              ref={surfaceRef}
              language={languageKey}
              text={content}
              readOnly
              fontSize={fontSize}
              wordWrap={wordWrap}
              className={styles.surface}
            />
          )}
        </div>

        {/* Status bar */}
        <div className={styles.statusBar}>
          {isImage ? (
            <span className={styles.viewMode}>
              이미지 — {ext.replace('.', '').toUpperCase()}
              {' — '}{Math.round(imageScale * 100)}% (Ctrl +/- · Ctrl+휠 · Ctrl+0 리셋 · h/j/k/l 스크롤)
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
              {languageKey && <span>{languageKey}</span>}
              {wordWrap && <span>WRAP</span>}
              <span className={styles.viewMode}>View Mode — F3 / Esc to close</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
