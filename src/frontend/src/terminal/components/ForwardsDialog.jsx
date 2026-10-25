import React, { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { termApi, onTermEvent, clipboardSetText } from '../core/termApi'
import { sessionById } from '../core/session'
import { sshOption, sshCommand, forwardStatus, FORWARD_HINTS } from '../core/forwards'
import { useTermStore } from '../store/termStore'
import styles from '../styles/Terminal.module.css'

// SSH 포트 포워딩 창 (Ctrl+Shift+P, Todo #124, choboTerm forwards.ts).
// 규칙은 서버별로 저장되어 다음 접속 때 다시 시작합니다.
export default function ForwardsDialog({ id }) {
  const req = sessionById(id)?.req
  const [rules, setRules] = useState([])
  const [sel, setSel] = useState(-1)
  const [form, setForm] = useState({ type: 'L', bindAddr: '', bindPort: '', host: '', port: '' })
  const [error, setError] = useState('')
  const portRef = useRef(null)
  const close = () => useTermStore.getState().closePanel()

  const refresh = useCallback(async () => {
    try {
      const list = (await termApi.ForwardList(id)) ?? []
      setRules(list)
      setSel(s => Math.min(s, list.length - 1))
      return list
    } catch (e) {
      setRules([])
      setError(String(e?.message ?? e))
      return []
    }
  }, [id])

  useEffect(() => {
    refresh()
    portRef.current?.focus()
    return onTermEvent('fwd:changed', (tab) => { if (tab === id) refresh() })
  }, [id, refresh])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: k.endsWith('ort') ? e.target.value.replace(/\D/g, '') : e.target.value }))

  async function add() {
    setError('')
    try {
      const st = await termApi.ForwardAdd(id, {
        type: form.type, bindAddr: form.bindAddr.trim(), bindPort: Number(form.bindPort),
        host: form.host.trim(), port: Number(form.port),
      })
      if (st.error) setError(`저장했지만 수신하지 못했습니다: ${st.error}`)
      setForm(f => ({ ...f, bindPort: '' }))
      const list = await refresh()
      setSel(list.findIndex(r => r.id === st.id))
      portRef.current?.focus()
    } catch (e) {
      setError(String(e?.message ?? e))
    }
  }

  async function remove() {
    const r = rules[sel]
    if (!r) return
    setError('')
    await termApi.ForwardRemove(id, r.id).catch(e => setError(String(e?.message ?? e)))
    await refresh()
  }

  function onKeyDown(e) {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.getAttribute('aria-label') !== 'ssh 명령') { e.preventDefault(); add() }
    else if (e.key === 'Delete' && e.target.tagName !== 'INPUT') { e.preventDefault(); remove() }
  }

  const cmd = sshCommand(req, rules)
  const dynamic = form.type === 'D'
  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.dialog} ${styles.forwards}`} role="dialog" aria-label={`포트 포워딩 - ${req?.host ?? ''}`} onKeyDown={onKeyDown}>
        <div className={styles.dialogHeader}>
          <span>{`포트 포워딩 - ${req?.host ?? ''}`}</span>
          <button type="button" className={styles.iconBtn} title="닫기 (Esc)" onClick={close}><X size={13} /></button>
        </div>
        <div className={styles.filesList}>
          <table role="grid" tabIndex={0} aria-label="포워딩 규칙">
            <thead><tr><th>종류</th><th>수신</th><th>대상</th><th>상태</th></tr></thead>
            <tbody>
              {rules.map((f, i) => {
                const st = forwardStatus(f)
                return (
                  <tr key={f.id} title={sshOption(f)} className={i === sel ? styles.fSel : ''} aria-selected={i === sel} onMouseDown={() => setSel(i)}>
                    <td>{f.type}</td>
                    <td>{`${f.bindAddr}:${f.bindPort}`}</td>
                    <td>{f.type === 'D' ? 'SOCKS5' : `${f.host}:${f.port}`}</td>
                    <td className={styles[`fw_${st.kind}`]} title={st.title}>{st.text}</td>
                  </tr>
                )
              })}
              {rules.length === 0 && <tr><td colSpan={4} className={styles.dim}>규칙이 없습니다. 아래에서 추가하세요.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className={styles.fwForm}>
          <select aria-label="종류" value={form.type} onChange={set('type')}>
            <option value="L">로컬 (-L)</option>
            <option value="R">원격 (-R)</option>
            <option value="D">동적 (-D)</option>
          </select>
          <input aria-label="수신 주소" value={form.bindAddr} onChange={set('bindAddr')} placeholder={form.type === 'R' ? 'localhost' : '127.0.0.1'} spellCheck={false} />
          <input aria-label="수신 포트" ref={portRef} value={form.bindPort} onChange={set('bindPort')} inputMode="numeric" className={styles.num} placeholder="포트" />
          {!dynamic && <>
            <span>→</span>
            <input aria-label="대상 호스트" value={form.host} onChange={set('host')} placeholder="localhost" spellCheck={false} />
            <input aria-label="대상 포트" value={form.port} onChange={set('port')} inputMode="numeric" className={styles.num} placeholder="포트" />
          </>}
          <button type="button" className={styles.primary} onClick={add}>추가</button>
          <button type="button" onClick={remove} disabled={sel < 0}>삭제</button>
        </div>
        <div className={styles.dim}>{FORWARD_HINTS[form.type]}</div>
        <div className={styles.hlRow}>
          <input aria-label="ssh 명령" value={cmd} readOnly />
          <button type="button" onClick={() => cmd && clipboardSetText(cmd).catch(e => setError(String(e)))}>복사</button>
        </div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.dialogActions}>
          <button type="button" onClick={close}>닫기</button>
        </div>
      </div>
    </div>
  )
}
