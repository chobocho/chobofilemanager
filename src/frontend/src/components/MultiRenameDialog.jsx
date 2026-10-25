import React, { useState, useMemo, useRef, useEffect } from 'react'
import { Edit3, X } from 'lucide-react'
import Modal from './DialogModal.jsx'
import { DEFAULT_RENAME, planRenames } from '../utils/multiRename.js'
import styles from '../styles/Dialogs.module.css'
import mr from '../styles/MultiRename.module.css'

// ─── 여러 이름 바꾸기 (Ctrl+M, Todo #133-4) ───────────────────────────────────────
// files: 바꿀 항목(패널에 보이는 순서), existingNames: 그 폴더에 지금 있는 이름들

const INSERTS = ['[N]', '[N1-3]', '[E]', '[C]', '[YMD]', '[hms]', '[P]']

export default function MultiRenameDialog({ files, existingNames, onConfirm, onClose }) {
  const [o, setO] = useState(DEFAULT_RENAME)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const nameRef = useRef(null)
  const lastFocus = useRef('nameMask')

  useEffect(() => { nameRef.current?.select() }, [])

  const plan = useMemo(() => planRenames(files, o, existingNames), [files, o, existingNames])
  const set = (k) => (e) => { setError(''); setO(prev => ({ ...prev, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })) }

  // 마스크 단추: 마지막으로 쓰던 마스크 칸(이름/확장자)의 커서 자리에 넣음
  const insert = (tag) => {
    const k = lastFocus.current
    const el = document.getElementById(`mr-${k}`)
    const v = o[k]
    const at = el && el.selectionStart != null ? el.selectionStart : v.length
    const end = el && el.selectionEnd != null ? el.selectionEnd : at
    setO(prev => ({ ...prev, [k]: v.slice(0, at) + tag + v.slice(end) }))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + tag.length, at + tag.length) })
  }

  const submit = async (e) => {
    e?.preventDefault()
    if (!plan.ok || busy) return
    setBusy(true)
    try {
      await onConfirm(plan.pairs)
    } catch (err) {
      setError(String(err?.message ?? err))
    } finally {
      setBusy(false)
    }
  }

  const errCount = plan.rows.filter(r => r.error).length
  const changed = plan.pairs.length

  return (
    <Modal onClose={onClose} width={760}>
      <div className={styles.header}>
        <Edit3 size={15} />
        <span>여러 이름 바꾸기 ({files.length}개)</span>
        <button className={styles.closeBtn} onClick={onClose}><X size={13} /></button>
      </div>
      <form onSubmit={submit}>
        <div className={styles.body}>
          <div className={mr.grid}>
            <label htmlFor="mr-nameMask">이름</label>
            <input id="mr-nameMask" aria-label="이름 마스크" ref={nameRef} className={styles.input} value={o.nameMask}
              onChange={set('nameMask')} onFocus={() => { lastFocus.current = 'nameMask' }} spellCheck={false} />
            <label htmlFor="mr-extMask">확장자</label>
            <input id="mr-extMask" aria-label="확장자 마스크" className={`${styles.input} ${mr.short}`} value={o.extMask}
              onChange={set('extMask')} onFocus={() => { lastFocus.current = 'extMask' }} spellCheck={false} />
          </div>
          <div className={mr.inserts}>
            {INSERTS.map(t => <button key={t} type="button" className={mr.tag} onClick={() => insert(t)}>{t}</button>)}
            <span className={styles.hint}>[N] 이름 · [N2-5] 글자 범위 · [E] 확장자 · [C] 번호 · [YMD] [hms] 수정 시각 · [P] 폴더</span>
          </div>
          <div className={mr.grid}>
            <label htmlFor="mr-search">찾기</label>
            <input id="mr-search" aria-label="찾기" className={styles.input} value={o.search} onChange={set('search')} spellCheck={false} />
            <label htmlFor="mr-replace">바꾸기</label>
            <input id="mr-replace" aria-label="바꾸기 글자" className={styles.input} value={o.replace} onChange={set('replace')} spellCheck={false} />
          </div>
          <div className={mr.row}>
            <label className={styles.checkLabel}><input type="checkbox" aria-label="정규식" checked={o.regex} onChange={set('regex')} /> 정규식 ($1 그룹)</label>
            <label>대소문자{' '}
              <select aria-label="대소문자" value={o.caseMode} onChange={set('caseMode')}>
                <option value="keep">그대로</option>
                <option value="lower">소문자</option>
                <option value="upper">대문자</option>
                <option value="title">단어 첫 글자 대문자</option>
              </select>
            </label>
            <label>번호 시작 <input aria-label="번호 시작" type="number" className={mr.num} value={o.counterStart} onChange={set('counterStart')} /></label>
            <label>증가 <input aria-label="증가" type="number" className={mr.num} value={o.counterStep} onChange={set('counterStep')} /></label>
            <label>자릿수 <input aria-label="자릿수" type="number" min="1" max="10" className={mr.num} value={o.counterDigits} onChange={set('counterDigits')} /></label>
          </div>

          <div className={mr.preview}>
            <table>
              <thead><tr><th>원래 이름</th><th>새 이름</th><th /></tr></thead>
              <tbody>
                {plan.rows.map(r => (
                  <tr key={r.file.path} className={r.error ? mr.bad : r.changed ? mr.changed : ''}>
                    <td>{r.file.name}</td>
                    <td data-new-name>{r.newName}</td>
                    <td className={mr.err}>{r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(plan.error || error) && <p className={styles.errorMsg}>{plan.error || error}</p>}
        </div>
        <div className={styles.footer}>
          <span className={styles.hint}>{errCount ? `충돌·오류 ${errCount}개` : `바뀌는 항목 ${changed}개`}</span>
          <button type="button" className={styles.btnCancel} onClick={onClose}>취소</button>
          <button type="submit" className={styles.btnConfirm} disabled={!plan.ok || busy}>바꾸기</button>
        </div>
      </form>
    </Modal>
  )
}
