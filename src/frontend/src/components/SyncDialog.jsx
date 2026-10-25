import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { RefreshCw, X } from 'lucide-react'
import Modal from './DialogModal.jsx'
import api from '../wailsjs/runtime'
import { formatSize, formatDate } from '../utils/fileTypes.js'
import styles from '../styles/Dialogs.module.css'
import sy from '../styles/SyncDialog.module.css'

// ─── 폴더 동기화 (Alt+F2, Todo #133-6) — Total Commander "Synchronize dirs" ─────────────
// 왼쪽·오른쪽 패널 폴더를 비교하고, 줄마다 복사 방향(→ ←)을 골라 한 번에 복사

// 기본 방향: 새것·한쪽에만 있는 것 → 반대쪽으로 복사, 같음·다름(날짜 같고 크기 다름 등)은 고르지 않음
export function defaultDirection(item) {
  if (item.state === 'left-newer' || item.state === 'left-only') return 'right'
  if (item.state === 'right-newer' || item.state === 'right-only') return 'left'
  return null
}

// 보기 필터 묶음
function group(item) {
  if (item.state === 'left-newer' || item.state === 'left-only') return 'toRight'
  if (item.state === 'right-newer' || item.state === 'right-only') return 'toLeft'
  return item.state === 'equal' ? 'equal' : 'different'
}

const NEXT = { right: 'left', left: null, null: 'right' }
const ARROW = (dir, state) => dir === 'right' ? '→' : dir === 'left' ? '←' : state === 'equal' ? '=' : state === 'different' ? '≠' : ''

const joinRel = (root, rel) => {
  const sep = root.includes('\\') ? '\\' : '/'
  return root.replace(/[/\\]+$/, '') + sep + rel.split('/').join(sep)
}

export default function SyncDialog({ left, right, onClose, onDone, onDiff }) {
  const [opts, setOpts] = useState({ recursive: true, byContent: false, ignoreDate: false })
  const [show, setShow] = useState({ toRight: true, toLeft: true, equal: false, different: true })
  const [items, setItems] = useState(null)
  const [dirs, setDirs] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const compare = useCallback(async (o = opts) => {
    setBusy(true)
    setError('')
    try {
      const res = (await api.CompareDirs(left, right, o)) || []
      setItems(res)
      setDirs(Object.fromEntries(res.map(it => [it.rel, defaultDirection(it)])))
    } catch (err) {
      setError(String(err?.message ?? err))
    } finally {
      setBusy(false)
    }
  }, [left, right, opts])

  useEffect(() => { compare() }, []) // 열자마자 비교

  const visible = useMemo(() => (items || []).filter(it => show[group(it)]), [items, show])
  const actions = visible.filter(it => dirs[it.rel]).map(it => ({ rel: it.rel, to: dirs[it.rel] }))

  const sync = async () => {
    if (!actions.length || busy) return
    setBusy(true)
    setError('')
    try {
      await api.SyncDirs(left, right, actions)
      onDone?.()
    } catch (err) {
      setError(String(err?.message ?? err))
      setBusy(false)
      return
    }
    setBusy(false)
    await compare()
  }

  const opt = (k) => (e) => setOpts(o => ({ ...o, [k]: e.target.checked }))
  const filt = (k) => (e) => setShow(s => ({ ...s, [k]: e.target.checked }))
  const counts = (items || []).reduce((c, it) => ({ ...c, [group(it)]: (c[group(it)] || 0) + 1 }), {})

  const side = (s) => s ? <>
    <td className={sy.num}>{s.isDir ? '<DIR>' : formatSize(s.size, false)}</td>
    <td className={sy.date}>{formatDate(s.modified)}</td>
  </> : <><td /><td /></>

  return (
    <Modal onClose={onClose} width={900}>
      <div className={styles.header}>
        <RefreshCw size={15} />
        <span>폴더 동기화</span>
        <button className={styles.closeBtn} onClick={onClose}><X size={13} /></button>
      </div>
      <div className={styles.body}>
        <div className={sy.roots}>
          <span title={left}>왼쪽: {left}</span>
          <span title={right}>오른쪽: {right}</span>
        </div>
        <div className={sy.bar}>
          <label className={styles.checkLabel}><input type="checkbox" aria-label="하위 폴더" checked={opts.recursive} onChange={opt('recursive')} /> 하위 폴더</label>
          <label className={styles.checkLabel}><input type="checkbox" aria-label="내용 비교" checked={opts.byContent} onChange={opt('byContent')} /> 내용 비교</label>
          <label className={styles.checkLabel}><input type="checkbox" aria-label="날짜 무시" checked={opts.ignoreDate} onChange={opt('ignoreDate')} /> 날짜 무시</label>
          <button type="button" className={styles.btnSearch} disabled={busy} onClick={() => compare()}>비교</button>
          <span className={sy.spacer} />
          <label className={sy.filter}><input type="checkbox" aria-label="→ 보기" checked={show.toRight} onChange={filt('toRight')} /> → {counts.toRight || 0}</label>
          <label className={sy.filter}><input type="checkbox" aria-label="← 보기" checked={show.toLeft} onChange={filt('toLeft')} /> ← {counts.toLeft || 0}</label>
          <label className={sy.filter}><input type="checkbox" aria-label="같음 보기" checked={show.equal} onChange={filt('equal')} /> = {counts.equal || 0}</label>
          <label className={sy.filter}><input type="checkbox" aria-label="다름 보기" checked={show.different} onChange={filt('different')} /> ≠ {counts.different || 0}</label>
        </div>
        <div className={sy.list}>
          <table>
            <thead><tr><th>이름</th><th>크기</th><th>날짜</th><th className={sy.dirCol}>방향</th><th>크기</th><th>날짜</th></tr></thead>
            <tbody>
              {visible.map(it => (
                <tr key={it.rel} data-sync-row={it.rel} className={sy[group(it)]}
                  onDoubleClick={() => { if (it.left && it.right && !it.isDir) onDiff?.(joinRel(left, it.rel), joinRel(right, it.rel)) }}
                  title={it.left && it.right && !it.isDir ? '더블클릭: 내용 비교' : undefined}>
                  <td className={sy.name}>{it.rel}{it.isDir ? '/' : ''}</td>
                  {side(it.left)}
                  <td className={sy.dirCol} data-dir onClick={() => setDirs(d => ({ ...d, [it.rel]: NEXT[d[it.rel] ?? null] }))}
                    title="클릭: → ← 없음">{ARROW(dirs[it.rel], it.state)}</td>
                  {side(it.right)}
                </tr>
              ))}
            </tbody>
          </table>
          {items && !visible.length && <p className={styles.hint}>{items.length ? '보이는 항목이 없습니다' : '두 폴더가 같습니다'}</p>}
          {!items && busy && <p className={styles.hint}>비교하는 중...</p>}
        </div>
        {error && <p className={styles.errorMsg}>{error}</p>}
      </div>
      <div className={styles.footer}>
        <span className={styles.hint}>방향 칸을 눌러 바꿈 · 더블클릭: 내용 비교</span>
        <button type="button" className={styles.btnCancel} onClick={onClose}>닫기</button>
        <button type="button" className={styles.btnConfirm} disabled={!actions.length || busy} onClick={sync}>동기화 ({actions.length})</button>
      </div>
    </Modal>
  )
}
