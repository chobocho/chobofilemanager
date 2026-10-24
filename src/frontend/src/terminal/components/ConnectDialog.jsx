import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Plug, X } from 'lucide-react'
import { termApi } from '../core/termApi'
import { sessionById } from '../core/session'
import { buildEntries, filterEntries, protocolLabel, isLocal, isSerial, DEFAULT_BAUD, ENCODINGS } from '../core/connect'
import { useTermStore } from '../store/termStore'
import styles from '../styles/Terminal.module.css'

// 연결 대화상자 (Todo #120, choboTerm connectdialog.ts 이식).
// Host에 cmd/powershell/pwsh/wsl → 로컬 셸, COMn·/dev/... → 시리얼(Port = 속도), 그 밖은 SSH/Telnet/FTP (포트·인사말로 판단)
export default function ConnectDialog({ tab }) {
  const [fields, setFields] = useState({ host: '', port: '22', login: '', pass: '', encoding: 'UTF-8', jump: '' })
  const [entries, setEntries] = useState([])
  const [listOpen, setListOpen] = useState(false)
  const [sessionName, setSessionName] = useState(undefined)
  const hostRef = useRef(null)
  const serverPort = useRef('22')

  useEffect(() => {
    let cancelled = false
    Promise.all([termApi.GetHistory(), termApi.GetSessions(), termApi.GetSSHConfigHosts(), termApi.GetLocalShells(), termApi.GetSerialPorts()]
      .map(p => Promise.resolve(p).catch(() => [])))
      .then(([history, sessions, config, shells, ports]) => {
        if (cancelled) return
        const list = buildEntries(history, sessions, config, shells, ports)
        setEntries(list)
        // 다시 접속할 때는 이 탭의 마지막 연결 정보, 아니면 최근 접속
        const last = sessionById(tab.id)?.req
        if (last) apply(last)
        else if (history?.length) apply(history[0])
      })
    hostRef.current?.focus()
    return () => { cancelled = true }
  }, [])

  const local = isLocal(fields.host)
  const serial = isSerial(fields.host)
  const proto = protocolLabel(fields.host, fields.port)
  const visible = useMemo(() => filterEntries(entries, listOpen === 'filter' ? fields.host : ''), [entries, listOpen, fields.host])

  function apply(e) {
    setFields({ host: e.host, port: String(e.port || (isSerial(e.host) ? DEFAULT_BAUD : 22)), login: e.login || '', pass: e.pass || '',
      encoding: e.encoding || 'UTF-8', jump: e.jump || '' })
    setSessionName(e.session?.name)
    setListOpen(false)
  }

  function setHost(host) {
    setSessionName(undefined)
    setFields(f => {
      const next = { ...f, host }
      // 시리얼로 바뀌면 Port를 속도로, 다시 서버로 바뀌면 원래 포트로
      if (isSerial(host) && !isSerial(f.host)) { serverPort.current = f.port; next.port = DEFAULT_BAUD }
      if (!isSerial(host) && isSerial(f.host)) next.port = serverPort.current || '22'
      return next
    })
    setListOpen('filter')
  }

  const set = (k) => (e) => setFields(f => ({ ...f, [k]: e.target.value }))

  function submit(e) {
    e.preventDefault()
    if (!fields.host.trim()) return
    setListOpen(false)
    useTermStore.getState().connect(tab.id, fields, sessionName)
  }

  function onKeyDown(e) {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      if (listOpen) setListOpen(false)
      else useTermStore.getState().cancelDialog(tab.id)
    }
  }

  return (
    <div className={styles.dialogOverlay}>
      <form className={styles.dialog} onSubmit={submit} onKeyDown={onKeyDown}>
        <div className={styles.dialogHeader}>
          <Plug size={14} /><span>연결</span>
          <span className={styles.proto}>{proto}</span>
          <button type="button" className={styles.iconBtn} title="닫기 (Esc)" onClick={() => useTermStore.getState().cancelDialog(tab.id)}><X size={13} /></button>
        </div>
        <div className={styles.hostRow}>
          <label htmlFor="term-host">Host</label>
          <div className={styles.hostBox}>
            <input id="term-host" ref={hostRef} value={fields.host} onChange={e => setHost(e.target.value)} autoComplete="off" spellCheck={false}
              placeholder="서버 주소, ssh 명령, cmd/powershell/wsl, COM3 ..." />
            <button type="button" className={styles.iconBtn} title="목록 열기" onClick={() => setListOpen(o => (o ? false : 'all'))}><ChevronDown size={13} /></button>
            {listOpen && visible.length > 0 && (
              <ul className={styles.hostList} role="listbox">
                {visible.map(e => (
                  <li key={`${e.session?.id ?? ''}${e.host}:${e.port}:${e.login}`} onMouseDown={ev => { ev.preventDefault(); apply(e) }}>
                    <span>{e.label ?? e.host}</span>
                    {e.label && <span className={styles.dim}>{e.host}</span>}
                    {e.login && <span className={styles.dim}>{e.login}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className={styles.fieldGrid}>
          <label htmlFor="term-port">{serial ? 'Baud' : 'Port'}</label>
          <input id="term-port" value={fields.port} onChange={set('port')} disabled={local} inputMode="numeric" />
          <label htmlFor="term-login">Login</label>
          <input id="term-login" value={fields.login} onChange={set('login')} disabled={local || serial} autoComplete="off" />
          <label htmlFor="term-pass">Password</label>
          <input id="term-pass" type="password" value={fields.pass} onChange={set('pass')} disabled={local || serial} autoComplete="off" />
          <label htmlFor="term-enc">Encoding</label>
          <select id="term-enc" value={fields.encoding} onChange={set('encoding')} disabled={local}>
            {ENCODINGS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <label htmlFor="term-jump">Jump</label>
          <input id="term-jump" value={fields.jump} onChange={set('jump')} disabled={local || serial || ['21', '23'].includes(fields.port)}
            placeholder="경유 서버 (user@host:port, 쉼표로 여러 개)" />
        </div>
        {tab.error && <div className={styles.error} role="alert">{tab.error}</div>}
        <div className={styles.dialogActions}>
          <button type="button" onClick={() => useTermStore.getState().cancelDialog(tab.id)}>취소</button>
          <button type="submit" className={styles.primary} disabled={tab.connecting}>{tab.connecting ? '연결 중...' : '연결'}</button>
        </div>
      </form>
    </div>
  )
}
