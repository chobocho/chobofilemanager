import React, { useState, useEffect, useRef } from 'react'
import { Save, X, FileText } from 'lucide-react'
import { useFileStore } from '../stores/fileStore'
import styles from '../styles/TextEditor.module.css'

export default function TextEditor({ path, onClose }) {
  const [content, setContent]   = useState('')
  const [original, setOriginal] = useState('')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)
  const [cursor, setCursor]     = useState({ line: 1, col: 1 })
  const textareaRef = useRef(null)
  const { readFile, writeFile } = useFileStore.getState()
  const fileName = path?.split('/').pop() || path?.split('\\').pop() || 'file'
  const isDirty = content !== original

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
      }
    }
    load()
  }, [path])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [content])

  const handleSave = async () => {
    setSaving(true)
    try {
      await writeFile(path, content)
      setOriginal(content)
    } catch(e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleCursorChange = () => {
    const ta = textareaRef.current
    if (!ta) return
    const text = ta.value.substring(0, ta.selectionStart)
    const lines = text.split('\n')
    setCursor({ line: lines.length, col: lines[lines.length-1].length + 1 })
  }

  const handleKeyDown = (e) => {
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
  }

  const lineCount = content.split('\n').length

  return (
    <div className={styles.overlay}>
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
                  <div key={i} className={`${styles.lineNum} ${cursor.line === i+1 ? styles.lineNumActive : ''}`}>
                    {i + 1}
                  </div>
                ))}
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
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />
            </>
          )}
        </div>

        {/* Status bar */}
        <div className={styles.statusBar}>
          <span>{lineCount} lines</span>
          <span>Ln {cursor.line}, Col {cursor.col}</span>
          <span>{content.length} chars</span>
          {isDirty && <span className={styles.unsaved}>Unsaved changes</span>}
        </div>
      </div>
    </div>
  )
}
