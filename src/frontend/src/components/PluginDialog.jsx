import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Puzzle, X } from 'lucide-react'
import Modal from './DialogModal.jsx'
import api from '../wailsjs/runtime'
import styles from '../styles/Dialogs.module.css'
import pg from '../styles/PluginDialog.module.css'

// ─── 플러그인 (Ctrl+Shift+X, Todo #133-13) — ~/.chobocho-commander/plugins/*.star 실행 ───────────
// getContext(): 실행할 때의 패널 정보 { panelPath, targetPath, cursor, selected }

export default function PluginDialog({ getContext, autoRun, onClose, onRefresh, onAddButton }) {
  const [plugins, setPlugins] = useState(null)
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState(null) // { name, output, error }
  const [busy, setBusy] = useState(false)
  const listRef = useRef(null)

  const load = useCallback(async () => {
    try { setPlugins((await api.ListPlugins()) || []) } catch { setPlugins([]) }
  }, [])

  const run = useCallback(async (file) => {
    if (!file || busy) return
    setBusy(true)
    try {
      const r = await api.RunPlugin(file, getContext())
      setResult({ file, output: r.output, error: r.error })
      if (r.refresh) onRefresh?.()
    } catch (err) {
      setResult({ file, output: '', error: String(err?.message ?? err) })
    } finally {
      setBusy(false)
    }
  }, [busy, getContext, onRefresh])

  useEffect(() => {
    load().then(() => { if (autoRun) run(autoRun) })
    requestAnimationFrame(() => listRef.current?.focus())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const list = plugins || []
  const current = list[index]

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(list.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(current?.file) }
  }

  return (
    <Modal onClose={onClose} width={640}>
      <div className={styles.header}>
        <Puzzle size={15} />
        <span>플러그인</span>
        <button className={styles.closeBtn} onClick={onClose}><X size={13} /></button>
      </div>
      <div className={styles.body}>
        <div className={pg.list} role="listbox" aria-label="플러그인 목록" tabIndex={0} ref={listRef} onKeyDown={onKeyDown}>
          {list.map((p, i) => (
            <div key={p.file} role="option" aria-selected={i === index} className={`${pg.item} ${i === index ? pg.active : ''}`}
              onClick={() => setIndex(i)} onDoubleClick={() => { setIndex(i); run(p.file) }} title={p.file}>
              <span className={pg.name}>{p.name}</span>
              {p.description && <span className={pg.desc}>{p.description}</span>}
            </div>
          ))}
          {plugins && !list.length && (
            <p className={styles.hint}>플러그인이 없습니다 — "폴더 열기"를 누르면 플러그인 폴더와 예제 두 개가 생깁니다.</p>
          )}
        </div>
        {result && (
          <div className={pg.result}>
            {result.output && <pre className={pg.output}>{result.output}</pre>}
            {result.error && <pre className={`${pg.output} ${pg.error}`}>{result.error}</pre>}
            {!result.output && !result.error && <p className={styles.hint}>끝났습니다 (출력 없음)</p>}
          </div>
        )}
        <p className={styles.hint}>
          Starlark 스크립트: panel_path · target_path · cursor · selected · targets, read_text · write_text · list_dir · exists · is_dir ·
          file_size · join_path · basename · dirname · mkdir · rename, print로 출력
        </p>
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.btnCancel} onClick={async () => { await api.OpenPluginsFolder(); await load() }}>폴더 열기</button>
        <button type="button" className={styles.btnCancel} onClick={load}>다시 읽기</button>
        <button type="button" className={styles.btnCancel} disabled={!current} onClick={() => onAddButton?.(current)}>단추로 만들기</button>
        <button type="button" className={styles.btnCancel} onClick={onClose}>닫기</button>
        <button type="button" className={styles.btnConfirm} disabled={!current || busy} onClick={() => run(current?.file)}>실행</button>
      </div>
    </Modal>
  )
}
