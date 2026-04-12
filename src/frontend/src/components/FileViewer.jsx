import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Eye, X, AArrowDown, AArrowUp, FileText } from 'lucide-react'
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
])

export function isViewableFile(ext) {
  return VIEWABLE_EXTS.has(ext.toLowerCase())
}

export function clampFontSize(current, delta) {
  return Math.min(MAX_FONT, Math.max(MIN_FONT, current + delta))
}

const LINE_BUFFER = 10  // extra lines to render above/below viewport

export default function FileViewer({ path, onClose }) {
  const [content, setContent]     = useState('')
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [fontSize, setFontSize]   = useState(13)
  const [scrollTop, setScrollTop] = useState(0)
  const lineNumbersRef = useRef(null)
  const preRef         = useRef(null)
  const bodyRef        = useRef(null)
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
      }
    }
    load()
  }, [path])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'F3') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Reset scroll when font size changes so line numbers re-sync
  useEffect(() => {
    setScrollTop(0)
    if (preRef.current) preRef.current.scrollTop = 0
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = 0
  }, [fontSize])

  // Sync line numbers scroll position with pre (ssMemo pattern)
  const handleScroll = useCallback(() => {
    const pre = preRef.current
    if (!pre) return
    setScrollTop(pre.scrollTop)
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = pre.scrollTop
    }
  }, [])

  const changeFontSize = useCallback((delta) => {
    setFontSize(prev => clampFontSize(prev, delta))
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
            <button className={styles.btnClose} onClick={onClose} title="Close (Esc / F3)">
              <X size={14} />
            </button>
          </div>
        </div>

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
                {/* Spacer for lines below viewport */}
                <div style={{ height: Math.max(0, lineCount - lastVisible - 1) * lineHeight }} />
              </div>

              {/* Content */}
              <pre
                ref={preRef}
                className={styles.pre}
                style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
                onScroll={handleScroll}
              >
                {content}
              </pre>
            </>
          )}
        </div>

        {/* Status bar */}
        <div className={styles.statusBar}>
          <span>{lineCount} lines</span>
          <span>{content.length} chars</span>
          <span>{fontSize}px</span>
          <span className={styles.viewMode}>View Mode — F3 / Esc to close</span>
        </div>
      </div>
    </div>
  )
}
