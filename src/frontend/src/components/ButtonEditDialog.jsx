import React, { useState, useEffect, useRef } from 'react'
import { SquarePen, X } from 'lucide-react'
import Modal from './DialogModal.jsx'
import { INTERNAL_COMMANDS } from '../utils/buttonParams.js'
import styles from '../styles/Dialogs.module.css'

// ─── 사용자 단추 고치기 / 만들기 (Todo #133-12) ────────────────────────────────────

export default function ButtonEditDialog({ button, onSave, onDelete, onMove, onClose }) {
  const [f, setF] = useState({
    name: button?.name || '', command: button?.command || '',
    params: button?.params || '', startDir: button?.startDir || '',
  })
  const [error, setError] = useState('')
  const nameRef = useRef(null)
  useEffect(() => { nameRef.current?.focus() }, [])

  const set = (k) => (e) => { setError(''); setF(prev => ({ ...prev, [k]: e.target.value })) }
  const ok = f.name.trim() && f.command.trim()
  const submit = async (e) => {
    e.preventDefault()
    if (!ok) return
    try {
      await onSave({ ...(button?.id ? { id: button.id } : {}), name: f.name.trim(), command: f.command.trim(), params: f.params, startDir: f.startDir })
    } catch (err) {
      setError(String(err?.message ?? err))
    }
  }

  return (
    <Modal onClose={onClose} width={520}>
      <div className={styles.header}>
        <SquarePen size={15} />
        <span>{button ? '단추 고치기' : '새 단추'}</span>
        <button className={styles.closeBtn} onClick={onClose}><X size={13} /></button>
      </div>
      <form onSubmit={submit}>
        <div className={styles.body}>
          <label className={styles.label} htmlFor="bb-name">이름</label>
          <input id="bb-name" ref={nameRef} className={styles.input} value={f.name} onChange={set('name')} />
          <label className={styles.label} htmlFor="bb-command">명령 (프로그램 · 문서 · 웹 주소, 또는 @기능)</label>
          <input id="bb-command" aria-label="명령" className={styles.input} list="bb-internal" value={f.command} onChange={set('command')} spellCheck={false}
            placeholder="notepad.exe" />
          <datalist id="bb-internal">
            {INTERNAL_COMMANDS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </datalist>
          <label className={styles.label} htmlFor="bb-params">인자</label>
          <input id="bb-params" className={styles.input} value={f.params} onChange={set('params')} spellCheck={false} placeholder='"%F"' />
          <label className={styles.label} htmlFor="bb-dir">시작 폴더</label>
          <input id="bb-dir" className={styles.input} value={f.startDir} onChange={set('startDir')} spellCheck={false} placeholder="%P" />
          <p className={styles.hint}>%P 활성 패널 폴더 · %T 반대 패널 · %N 커서 파일 이름 · %F 커서 파일 경로 · %S 고른 파일들("…" "…") · %% 글자 %</p>
          {error && <p className={styles.errorMsg}>{error}</p>}
        </div>
        <div className={styles.footer}>
          {button && <>
            <button type="button" className={styles.btnCancel} onClick={() => onMove?.(button.id, -1)}>앞으로</button>
            <button type="button" className={styles.btnCancel} onClick={() => onMove?.(button.id, 1)}>뒤로</button>
            <button type="button" className={styles.btnDanger} onClick={() => onDelete(button.id)}>지우기</button>
          </>}
          <button type="button" className={styles.btnCancel} onClick={onClose}>취소</button>
          <button type="submit" className={styles.btnConfirm} disabled={!ok}>저장</button>
        </div>
      </form>
    </Modal>
  )
}
