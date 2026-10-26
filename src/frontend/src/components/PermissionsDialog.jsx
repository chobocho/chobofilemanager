import React, { useState, useEffect, useRef } from 'react'
import { Shield, X } from 'lucide-react'
import Modal from './DialogModal.jsx'
import api from '../wailsjs/runtime'
import { formatMode } from '../utils/fileTypes.js'
import styles from '../styles/Dialogs.module.css'

// ─── 권한 · 소유자 (Alt+A, Todo #137-2 — mc의 chmod · chown) ────────────────────────────

const WHO = [['소유자', 6], ['그룹', 3], ['기타', 0]]
const WHAT = [['읽기', 4], ['쓰기', 2], ['실행', 1]]
const SPECIAL = [['setuid', 0o4000], ['setgid', 0o2000], ['sticky', 0o1000]]

// permChanges: 처음 값에서 바뀐 비트만 — 여러 파일이면 손대지 않은 비트는 파일마다 그대로
export function permChanges(initial, bits) {
  return { set: bits & ~initial & 0o7777, clear: initial & ~bits & 0o7777 }
}

export const toOctal = (bits) => (bits & 0o7777).toString(8).padStart(4, '0')

export function parseOctal(text) {
  const t = text.trim()
  return /^[0-7]{1,4}$/.test(t) ? parseInt(t, 8) : null
}

const same = (files, key) => files.every(f => f[key] === files[0][key]) ? (files[0][key] || '') : ''

export default function PermissionsDialog({ files, onConfirm, onClose }) {
  const initial = (files[0]?.mode || 0) & 0o7777
  const initialOwner = same(files, 'owner')
  const initialGroup = same(files, 'group')
  const [bits, setBits] = useState(initial)
  const [octal, setOctal] = useState(toOctal(initial))
  const [owner, setOwner] = useState(initialOwner)
  const [group, setGroup] = useState(initialGroup)
  const [recursive, setRecursive] = useState(false)
  const [choices, setChoices] = useState({ users: [], groups: [] })
  const octalRef = useRef(null)
  const anyDir = files.some(f => f.isDir && !f.isSymlink)

  useEffect(() => { octalRef.current?.select() }, [])
  useEffect(() => {
    let live = true
    Promise.resolve(api.GetOwnerChoices?.()).then(c => { if (live && c) setChoices({ users: c.users || [], groups: c.groups || [] }) }).catch(() => {})
    return () => { live = false }
  }, [])

  const update = (next) => { setBits(next); setOctal(toOctal(next)) }
  const toggle = (bit) => update(bits ^ bit)
  const onOctal = (text) => {
    setOctal(text)
    const v = parseOctal(text)
    if (v !== null) setBits(v)
  }

  const octalBad = parseOctal(octal) === null
  const { set, clear } = permChanges(initial, bits)
  const newOwner = owner.trim() !== initialOwner ? owner.trim() : ''
  const newGroup = group.trim() !== initialGroup ? group.trim() : ''
  // 하위까지면 적은 소유자 · 그룹을 안의 항목에도 맞춤 (같은 값이어도)
  const ownerOut = recursive ? owner.trim() : newOwner
  const groupOut = recursive ? group.trim() : newGroup
  const changed = !!(set || clear || ownerOut || groupOut)
  const title = files.length === 1 ? files[0].name : `${files.length}개 항목`

  const submit = (e) => {
    e.preventDefault()
    if (octalBad || !changed) return
    // 권한은 하위까지여도 바꾼 비트만 (chmod -R g+w처럼 — 파일에 폴더의 실행 비트가 퍼지지 않게)
    onConfirm({ set, clear, owner: ownerOut, group: groupOut, recursive })
  }

  return (
    <Modal onClose={onClose} width={420}>
      <div className={styles.header}>
        <Shield size={15} />
        <span>권한 · 소유자 — {title}</span>
        <button className={styles.closeBtn} onClick={onClose}><X size={13} /></button>
      </div>
      <form onSubmit={submit}>
        <div className={styles.body}>
          <table style={{ borderCollapse: 'collapse', marginBottom: 8 }}>
            <thead>
              <tr><th />{WHAT.map(([label]) => <th key={label} style={{ padding: '0 10px', fontWeight: 'normal' }}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {WHO.map(([who, shift]) => (
                <tr key={who}>
                  <td style={{ paddingRight: 10 }}>{who}</td>
                  {WHAT.map(([what, b]) => (
                    <td key={what} style={{ textAlign: 'center' }}>
                      <input type="checkbox" aria-label={`${who} ${what}`} checked={!!(bits & (b << shift))} onChange={() => toggle(b << shift)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            {SPECIAL.map(([label, b]) => (
              <label key={label} className={styles.label}>
                <input type="checkbox" aria-label={label} checked={!!(bits & b)} onChange={() => toggle(b)} />{' '}{label}
              </label>
            ))}
          </div>
          <label className={styles.label} htmlFor="perm-octal">숫자 ({formatMode(bits, files.length === 1 ? files[0] : {})})</label>
          <input id="perm-octal" aria-label="숫자 권한" ref={octalRef} className={styles.input} value={octal}
            onChange={e => onOctal(e.target.value)} spellCheck={false} style={octalBad ? { borderColor: 'var(--danger, #e05050)' } : undefined} />
          <label className={styles.label} htmlFor="perm-owner">소유자</label>
          <input id="perm-owner" aria-label="소유자" className={styles.input} list="perm-users" value={owner}
            placeholder={initialOwner ? '' : '(그대로)'} onChange={e => setOwner(e.target.value)} spellCheck={false} />
          <datalist id="perm-users">{choices.users.map(u => <option key={u} value={u} />)}</datalist>
          <label className={styles.label} htmlFor="perm-group">그룹</label>
          <input id="perm-group" aria-label="그룹" className={styles.input} list="perm-groups" value={group}
            placeholder={initialGroup ? '' : '(그대로)'} onChange={e => setGroup(e.target.value)} spellCheck={false} />
          <datalist id="perm-groups">{choices.groups.map(g => <option key={g} value={g} />)}</datalist>
          {anyDir && (
            <label className={styles.label}>
              <input type="checkbox" aria-label="하위 폴더까지" checked={recursive} onChange={e => setRecursive(e.target.checked)} />
              {' '}하위 폴더까지 (안의 링크는 따라가지 않음)
            </label>
          )}
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>취소</button>
          <button type="submit" className={styles.btnConfirm} disabled={octalBad || !changed}>바꾸기</button>
        </div>
      </form>
    </Modal>
  )
}
