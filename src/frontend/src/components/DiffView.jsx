import React, { useEffect, useRef, useState, useCallback } from 'react'
import { EditorView, lineNumbers, drawSelection, keymap } from '@codemirror/view'
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands'
import { syntaxHighlighting } from '@codemirror/language'
import { classHighlighter } from '@lezer/highlight'
import { MergeView, goToNextChunk, goToPreviousChunk } from '@codemirror/merge'
import { GitCompare, X, ChevronUp, ChevronDown, Save } from 'lucide-react'
import api from '../wailsjs/runtime'
import { languageKeyForPath, loadLanguage, MAX_HIGHLIGHT_LENGTH } from './codeLanguages.js'
import ed from '../styles/TextEditor.module.css'
import styles from '../styles/DiffView.module.css'

// ─── 파일 내용 비교 (Ctrl+Shift+D, Todo #133-7) ───────────────────────────────────
// @codemirror/merge(MIT)로 좌우 diff: 바뀐 줄·글자 강조, Alt+↑/↓ 이전·다음 차이, 같은 부분 접기,
// 양쪽 모두 고칠 수 있고 Ctrl+S가 고친 쪽만 저장. 바이너리는 첫 차이 위치만 보여 줌

const theme = EditorView.theme({
  '&': { fontSize: '13px', backgroundColor: 'transparent', color: 'var(--text-primary)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55' },
  '.cm-gutters': { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-dim)', border: 'none' },
  '&.cm-focused': { outline: 'none' },
})

async function languageFor(path, text) {
  const key = languageKeyForPath(path)
  if (!key || text.length > MAX_HIGHLIGHT_LENGTH) return []
  try { return (await loadLanguage(key)) || [] } catch { return [] }
}

const hex = (n) => `0x${n.toString(16).toUpperCase()}`

export default function DiffView({ leftPath, rightPath, onClose }) {
  const hostRef = useRef(null)
  const mvRef = useRef(null)
  const origRef = useRef({ a: '', b: '' })
  const [info, setInfo] = useState(null)       // CompareFileBytes 결과
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState({ a: false, b: false })
  const [chunks, setChunks] = useState(0)
  const [collapse, setCollapse] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [saving, setSaving] = useState(false)

  // 읽기 → 텍스트면 MergeView 만들기
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.CompareFileBytes(leftPath, rightPath)
        if (cancelled) return
        setInfo(res)
        if (res.binary) return
        const [a, b] = await Promise.all([api.ReadTextFile(leftPath), api.ReadTextFile(rightPath)])
        const [la, lb] = await Promise.all([languageFor(leftPath, a), languageFor(rightPath, b)])
        if (cancelled || !hostRef.current) return
        origRef.current = { a, b }
        const ext = (side, lang) => [
          lineNumbers(), drawSelection(), history(),
          keymap.of([...historyKeymap, ...defaultKeymap]),
          theme, lang, syntaxHighlighting(classHighlighter),
          EditorView.updateListener.of(u => {
            if (!u.docChanged) return
            setDirty(d => ({ ...d, [side]: u.state.doc.toString() !== origRef.current[side] }))
            requestAnimationFrame(() => setChunks(mvRef.current?.chunks.length ?? 0))
          }),
        ]
        const mv = new MergeView({
          a: { doc: a, extensions: ext('a', la) },
          b: { doc: b, extensions: ext('b', lb) },
          parent: hostRef.current,
          highlightChanges: true,
          gutter: true,
        })
        mvRef.current = mv
        setChunks(mv.chunks.length)
      } catch (err) {
        if (!cancelled) setError(String(err?.message ?? err))
      }
    })()
    return () => { cancelled = true; mvRef.current?.destroy(); mvRef.current = null }
  }, [leftPath, rightPath])

  useEffect(() => {
    mvRef.current?.reconfigure({ collapseUnchanged: collapse ? { margin: 3, minSize: 4 } : undefined })
  }, [collapse])

  const move = useCallback((next) => {
    const mv = mvRef.current
    if (!mv) return
    const view = mv.a.hasFocus ? mv.a : mv.b
    ;(next ? goToNextChunk : goToPreviousChunk)({ state: view.state, dispatch: view.dispatch })
    view.focus()
  }, [])

  const save = useCallback(async () => {
    const mv = mvRef.current
    if (!mv || saving) return
    setSaving(true)
    setError('')
    try {
      for (const [side, view, p] of [['a', mv.a, leftPath], ['b', mv.b, rightPath]]) {
        const text = view.state.doc.toString()
        if (text === origRef.current[side]) continue
        await api.WriteTextFileWithEncoding(p, text, 'auto')
        origRef.current[side] = text
      }
      setDirty({ a: false, b: false })
      setConfirmLeave(false)
    } catch (err) {
      setError(`저장 실패: ${err?.message ?? err}`)
    } finally {
      setSaving(false)
    }
  }, [leftPath, rightPath, saving])

  const anyDirty = dirty.a || dirty.b

  // 이 화면이 떠 있는 동안 키는 모두 여기서 (뒤 패널로 새지 않게)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        if (anyDirty && !confirmLeave) { setConfirmLeave(true); return }
        onClose()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault(); e.stopPropagation()
        save()
      } else if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault(); e.stopPropagation()
        move(e.key === 'ArrowDown')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [anyDirty, confirmLeave, onClose, save, move])

  return (
    <div className={ed.overlay} role="dialog" aria-label="파일 내용 비교">
      <div className={`${ed.editor} ${styles.diff}`}>
        <div className={ed.header}>
          <GitCompare size={14} />
          <span className={ed.fileName}>파일 내용 비교</span>
          <div className={ed.actions}>
            {info && !info.binary && <>
              <button className={ed.btnSearch} onClick={() => move(false)} title="이전 차이 (Alt+↑)"><ChevronUp size={13} /></button>
              <button className={ed.btnSearch} onClick={() => move(true)} title="다음 차이 (Alt+↓)"><ChevronDown size={13} /></button>
              <label className={styles.check}><input type="checkbox" checked={collapse} onChange={e => setCollapse(e.target.checked)} /> 같은 부분 접기</label>
              <button className={`${ed.btnSave} ${anyDirty ? ed.btnSaveDirty : ''}`} onClick={save} disabled={!anyDirty || saving} title="고친 쪽 저장 (Ctrl+S)">
                <Save size={12} /> 저장
              </button>
            </>}
            <button className={ed.btnClose} onClick={onClose} title="닫기 (Esc)"><X size={14} /></button>
          </div>
        </div>
        <div className={styles.paths}>
          <span title={leftPath}>{leftPath}</span>{dirty.a && <em className={styles.dirty}>저장 안 함</em>}
          <span title={rightPath}>{rightPath}</span>{dirty.b && <em className={styles.dirty}>저장 안 함</em>}
        </div>
        {info?.binary ? (
          <div className={styles.binary}>
            <p>바이너리 파일 — {info.equal ? '두 파일이 같습니다.' : `처음 다른 위치: ${info.firstDiff} (${hex(info.firstDiff)})`}</p>
            <p className={styles.dim}>크기: {info.sizeA.toLocaleString()} / {info.sizeB.toLocaleString()} 바이트</p>
          </div>
        ) : (
          <div className={styles.merge} ref={hostRef} />
        )}
        <div className={ed.statusBar}>
          {error ? <span className={styles.error}>{error}</span>
            : confirmLeave ? <span className={ed.unsaved}>저장하지 않은 변경이 있습니다 — Esc를 한 번 더 누르면 버리고 닫습니다 (Ctrl+S: 저장)</span>
            : info?.equal && !anyDirty ? <span>두 파일이 같습니다</span>
            : info && !info.binary ? <span>차이 {chunks}곳 · Alt+↑/↓ 이동 · Ctrl+S 저장 · Esc 닫기</span>
            : <span>{info ? '' : '읽는 중...'}</span>}
        </div>
      </div>
    </div>
  )
}
