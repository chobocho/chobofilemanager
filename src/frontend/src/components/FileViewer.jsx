import React, { useState, useEffect } from 'react'
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

export default function FileViewer({ path, onClose }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [fontSize, setFontSize] = useState(13)
  const { readFile } = useFileStore.getState()
  const fileName = path?.split(/[/\\]/).pop() || 'file'
  const lineCount = content.split('\n').length

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

  const changeFontSize = (delta) => setFontSize(prev => clampFontSize(prev, delta))

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
        <div className={styles.body}>
          {loading ? (
            <div className={styles.loading}>Loading...</div>
          ) : error ? (
            <div className={styles.error}>⚠ {error}</div>
          ) : (
            <>
              {/* Line numbers */}
              <div className={styles.lineNumbers} aria-hidden>
                {Array.from({ length: lineCount }, (_, i) => (
                  <div
                    key={i}
                    className={styles.lineNum}
                    style={{ lineHeight: `${fontSize + 7}px`, height: `${fontSize + 7}px` }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* Content */}
              <pre
                className={styles.pre}
                style={{ fontSize: `${fontSize}px`, lineHeight: `${fontSize + 7}px` }}
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
