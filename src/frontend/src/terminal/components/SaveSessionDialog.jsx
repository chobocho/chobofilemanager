import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { termApi } from '../core/termApi'
import { sessionWhere, groupsOf } from '../core/sessions'
import { useTermStore } from '../store/termStore'
import styles from '../styles/Terminal.module.css'
import { errText } from '../core/errText'

// "세션으로 저장" 창 (Todo #121, choboTerm sessions.ts openSaveSession).
// 접속 창의 ☆ 저장(Alt+S)과 탭 메뉴에서 엽니다. 고른 세션에서 왔으면 그 세션을 고칩니다.
export default function SaveSessionDialog({ request }) {
  const s = request.session
  const [name, setName] = useState(s?.name ?? request.host)
  const [group, setGroup] = useState(s?.group ?? '')
  const [keepPass, setKeepPass] = useState(!!request.pass && !!s?.pass)
  const [groups, setGroups] = useState([])
  const [error, setError] = useState('')
  const nameRef = useRef(null)

  useEffect(() => {
    nameRef.current?.focus()
    nameRef.current?.select()
    Promise.resolve(termApi.GetSessions()).then(list => setGroups(groupsOf(list ?? []))).catch(() => undefined)
  }, [])

  const finish = (saved) => useTermStore.getState().finishSaveSession(saved)

  async function save() {
    try {
      const saved = await termApi.SaveSession({
        id: s?.id ?? '', name: name.trim() || request.host, group: group.trim(),
        host: request.host, port: request.port, login: request.login, encoding: request.encoding, pass: request.pass, jump: request.jump,
      }, keepPass)
      finish(saved)
    } catch (e) {
      setError(errText(e))
    }
  }

  function onKeyDown(e) {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); finish(null) }
    else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); save() }
  }

  const title = s ? '세션 수정' : '세션으로 저장'
  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.dialog} ${styles.saveDialog}`} role="dialog" aria-label={title} onKeyDown={onKeyDown}>
        <div className={styles.dialogHeader}>
          <span>{title}</span>
          <button type="button" className={styles.iconBtn} title="닫기 (Esc)" onClick={() => finish(null)}><X size={13} /></button>
        </div>
        <div className={styles.where}>{sessionWhere(request)}</div>
        <div className={styles.fieldGrid}>
          <label htmlFor="sess-name">이름</label>
          <input id="sess-name" ref={nameRef} value={name} onChange={e => setName(e.target.value)} spellCheck={false} autoComplete="off" />
          <label htmlFor="sess-group">그룹</label>
          <input id="sess-group" list="sess-groups" value={group} onChange={e => setGroup(e.target.value)} spellCheck={false} autoComplete="off"
            placeholder="비우면 그룹 없음" />
          <datalist id="sess-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={keepPass} disabled={!request.pass} onChange={e => setKeepPass(e.target.checked)} />
          비밀번호도 저장 (Windows 사용자 계정으로 암호화)
        </label>
        {error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.dialogActions}>
          <button type="button" onClick={() => finish(null)}>취소</button>
          <button type="button" className={styles.primary} onClick={save}>저장</button>
        </div>
      </div>
    </div>
  )
}
