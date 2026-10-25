import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { termApi, browserOpenURL } from '../core/termApi'
import { sessionById } from '../core/session'
import { settings, saveSettings } from '../core/settings'
import { LOCAL_SOURCE, engineOf, withEngine, sourceOfTab, portPlan } from '../core/docker'
import { useTermStore } from '../store/termStore'
import styles from '../styles/Terminal.module.css'
import { errText } from '../core/errText'

// 도커 컨테이너 창 (Ctrl+Shift+J, Todo #124, choboTerm containers.ts): 활성 SSH 탭의 서버 또는 이 PC의 컨테이너.
// 셸·로그는 새 탭으로 엽니다 (서버면 그 탭의 접속을 함께 씀). 엔진(docker/podman)은 곳마다 기억합니다.
export default function ContainersDialog({ id }) {
  const [sources] = useState(() => {
    const s = sessionById(id)
    const tab = useTermStore.getState().tabs.find(t => t.id === id)
    const server = s && tab ? sourceOfTab(id, { state: s.state, proto: tab.proto, req: s.req }) : undefined
    return server ? [server, LOCAL_SOURCE] : [LOCAL_SOURCE]
  })
  const [srcIdx, setSrcIdx] = useState(0)
  const [all, setAll] = useState(false)
  const [engine, setEngine] = useState(() => engineOf(settings.dockerEngines, sources[0]))
  const [engineName, setEngineName] = useState('')
  const [list, setList] = useState([])
  const [sel, setSel] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [port, setPort] = useState('')
  const seq = useRef(0) // 늦게 온 이전 목록은 버림
  const panelRef = useRef(null)
  const src = sources[srcIdx]
  const c = list[sel]
  const close = () => useTermStore.getState().closePanel()

  async function refresh(keepId = list[sel]?.id) {
    const n = ++seq.current
    setError('')
    setLoading(true)
    termApi.DockerEngineInfo(src.tab, engine)
      .then(e => { if (n === seq.current) setEngineName(e.version ? `${e.name} ${e.version}` : e.name) })
      .catch(() => { if (n === seq.current) setEngineName('') })
    let got = []
    try {
      got = (await termApi.DockerList(src.tab, all, engine)) ?? []
    } catch (e) {
      if (n === seq.current) setError(errText(e))
    }
    if (n !== seq.current) return
    setLoading(false)
    setList(got)
    let i = got.findIndex(x => x.id === keepId)
    if (i < 0 && got.length) i = 0
    setSel(i)
    setPort(String(got[i]?.published?.[0]?.port ?? ''))
  }

  useEffect(() => { panelRef.current?.focus() }, [])
  useEffect(() => { refresh() }, [srcIdx, all, engine])

  function chooseEngine(e) {
    const next = e.target.value
    saveSettings(s => { s.dockerEngines = withEngine(s.dockerEngines, src, next) })
    setEngine(next)
  }

  function chooseSource(e) {
    const i = Number(e.target.value)
    setSrcIdx(i)
    setEngine(engineOf(settings.dockerEngines, sources[i]))
  }

  function pick(i) {
    setSel(i)
    setPort(String(list[i]?.published?.[0]?.port ?? ''))
  }

  function open(mode) {
    if (!c || (mode === 'shell' && !c.running)) return
    useTermStore.getState().closePanel()
    useTermStore.getState().openDocker(src, c, mode)
  }

  async function act(action) {
    if (!c) return
    if (action !== 'start') {
      const ok = window.confirm(action === 'stop' ? `"${c.name}" 컨테이너를 중지할까요?` : `"${c.name}" 컨테이너를 재시작할까요?`)
      panelRef.current?.focus()
      if (!ok) return
    }
    setError('')
    try {
      await termApi.DockerAction(src.tab, c.id, action, engine)
    } catch (e) {
      setError(errText(e))
      return
    }
    await refresh(c.id)
  }

  async function openPort() {
    const p = c?.published?.find(x => String(x.port) === port)
    if (!p) return
    setError('')
    try {
      const plan = portPlan(src, p, src.tab ? (await termApi.ForwardList(src.tab)) ?? [] : [])
      if (plan.kind === 'busy') return setError(plan.message)
      if (plan.kind === 'add') {
        const st = await termApi.ForwardAdd(src.tab, plan.forward)
        if (st.error) {
          await termApi.ForwardRemove(src.tab, st.id)
          return setError(`이 PC의 포트 ${p.port}를 열 수 없습니다: ${st.error}. 포트 포워딩 창(Ctrl+Shift+P)에서 다른 포트로 추가하세요.`)
        }
      }
    } catch (e) {
      return setError(errText(e))
    }
    browserOpenURL(`http://localhost:${p.port}/`)
  }

  function onKeyDown(e) {
    e.stopPropagation()
    const inField = ['SELECT', 'BUTTON', 'INPUT'].includes(e.target.tagName)
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'F5') { e.preventDefault(); refresh() }
    else if (e.key === 'Enter' && !inField) { e.preventDefault(); open('shell') }
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.tagName !== 'SELECT' && list.length) {
      e.preventDefault()
      pick(Math.max(0, Math.min(list.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))))
    }
  }

  const ports = c?.published ?? []
  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.dialog} ${styles.containers}`} role="dialog" aria-label="도커 컨테이너" tabIndex={-1} ref={panelRef} onKeyDown={onKeyDown}>
        <div className={styles.dialogHeader}>
          <span>도커 컨테이너</span>
          <button type="button" className={styles.iconBtn} title="닫기 (Esc)" onClick={close}><X size={13} /></button>
        </div>
        <div className={styles.filesBar}>
          <select aria-label="컨테이너가 있는 곳" value={srcIdx} onChange={chooseSource}>
            {sources.map((s, i) => <option key={i} value={i}>{s.tab ? `서버: ${s.label}` : s.label}</option>)}
          </select>
          <select aria-label="컨테이너 엔진" title="컨테이너 엔진 (이곳마다 기억)" value={engine} onChange={chooseEngine}>
            <option value="">자동 (docker → podman)</option>
            <option value="docker">docker</option>
            <option value="podman">podman</option>
          </select>
          <span className={styles.dim}>{engineName}</span>
          <label className={styles.check}><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> 중지된 컨테이너도 표시</label>
          <span className={styles.dockSpacer} />
          <button type="button" title="F5" onClick={() => refresh()}>새로고침</button>
        </div>
        <div className={styles.filesList}>
          <table role="grid" tabIndex={0} aria-label="컨테이너 목록">
            <thead><tr><th>이름</th><th>이미지</th><th>상태</th><th>포트</th></tr></thead>
            <tbody>
              {list.map((x, i) => (
                <tr key={x.id} title={`${x.id}\n${x.image}\n만든 지: ${x.created}`} aria-selected={i === sel}
                  className={i === sel ? styles.fSel : ''} onMouseDown={() => pick(i)} onDoubleClick={() => open('shell')}>
                  <td>{x.name}</td>
                  <td>{x.image}</td>
                  <td className={x.running ? styles.fw_ok : styles.dim}>{x.status}</td>
                  <td title={x.ports}>{x.ports}</td>
                </tr>
              ))}
              {list.length === 0 && !error && (
                <tr><td colSpan={4} className={styles.dim}>{loading ? '불러오는 중...' : all ? '컨테이너가 없습니다' : '실행 중인 컨테이너가 없습니다'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className={styles.fwForm}>
          <button type="button" title="docker exec -it (Enter · 더블클릭)" disabled={!c?.running} onClick={() => open('shell')}>셸 열기</button>
          <button type="button" title="docker logs -f --tail 200" disabled={!c} onClick={() => open('logs')}>로그 보기</button>
          <button type="button" disabled={!c || c.running} onClick={() => act('start')}>시작</button>
          <button type="button" disabled={!c?.running} onClick={() => act('stop')}>중지</button>
          <button type="button" disabled={!c} onClick={() => act('restart')}>재시작</button>
          <select aria-label="게시된 포트" value={port} onChange={e => setPort(e.target.value)} disabled={!c?.running || !ports.length}>
            {ports.map(p => <option key={p.port} value={String(p.port)}>{`${p.port} → ${p.to}`}</option>)}
          </select>
          <button type="button" disabled={!c?.running || !ports.length} onClick={openPort}>포트 열기</button>
        </div>
        <div className={styles.dim}>
          {src.tab
            ? '셸 · 로그는 이 접속을 함께 쓰는 새 탭으로 엽니다(접속을 끊으면 함께 닫힘). 포트 열기: 서버의 포트를 이 PC의 같은 포트로 포워딩(-L)하고 브라우저로 엽니다.'
            : '이 PC의 컨테이너입니다. 포트 열기: 브라우저로 http://localhost:포트 를 엽니다.'}
        </div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.dialogActions}>
          <button type="button" onClick={close}>닫기</button>
        </div>
      </div>
    </div>
  )
}
