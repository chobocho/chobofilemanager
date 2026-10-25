import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { RotateCw, X, FolderOpen } from 'lucide-react'
import { TermSession } from '../core/session'
import { acquireTerminalEvents } from '../store/termEvents'
import { lookOptions } from '../core/look'
import { settings, loadSettings } from '../core/settings'
import { DOCK_ID_BASE, DOCK_SHELLS, cdCommand, quoteForShell, clampDockHeight, localPathFromCwd } from '../core/dock'
import { useDockStore } from '../../stores/dockStore'
import { startWindowDrag } from '../core/drag'
import { useFileStore } from '../../stores/fileStore'
import styles from '../styles/Terminal.module.css'

const defaultCreateTerminal = (opts) => new Terminal(opts)
// 이 PC의 폴더일 때만 (FTP · 압축 파일 안은 셸이 갈 수 없음, Todo #133-8)
const activePath = (s) => {
  const p = s[s.activePanel]
  return p && !p.readOnly && !p.path?.startsWith('ftp://') ? p.path : undefined
}

// 파일 패널 아래 터미널 도크 (Todo #122): 활성 패널 폴더에서 로컬 셸을 시작하고,
// "패널 따라가기"를 켜면 패널 폴더가 바뀔 때마다 cd 합니다. F9로 열고 닫습니다.
export default function TerminalDock({ createTerminal = defaultCreateTerminal, addons = true }) {
  const height = useDockStore(s => s.height)
  const follow = useDockStore(s => s.follow)
  const shell = useDockStore(s => s.shell)
  const focusSeq = useDockStore(s => s.focusSeq)
  const panelPath = useFileStore(activePath)
  const hostRef = useRef(null)
  const sessionRef = useRef(null)
  const shellRef = useRef(shell)
  shellRef.current = shell
  const restarting = useRef(false) // 셸을 바꿔 다시 시작할 때 이전 셸의 종료 안내는 생략
  const [shellDir, setShellDir] = useState(undefined) // 셸이 알려 준 폴더 (OSC 7), 이 PC의 경로일 때만

  // 지금 셸로 패널 폴더에서 시작 (실패하면 화면에 이유, Enter로 다시 시도)
  async function start() {
    const s = sessionRef.current
    if (!s) return
    try {
      await s.connect({ host: shellRef.current, port: 0, login: '', pass: '', encoding: 'UTF-8', jump: '',
        dir: activePath(useFileStore.getState()) ?? '' })
      const p = useDockStore.getState().takePending()
      if (p != null) void s.sendInput(quoteForShell(shellRef.current, p) + ' ')
    } catch (e) {
      s.notice(`${e?.message ?? e} — Enter: 다시 시도`)
    } finally {
      restarting.current = false
    }
  }

  useEffect(() => {
    const releaseEvents = acquireTerminalEvents() // Terminal 보기와 함께 씀
    loadSettings().then(() => { const s = sessionRef.current; if (s) Object.assign(s.term.options, lookOptions(settings)) })
    const s = new TermSession(DOCK_ID_BASE, { createTerminal, addons, options: lookOptions(settings) })
    sessionRef.current = s
    s.open(hostRef.current)
    // F9는 셸로 보내지 않고 도크를 닫는 키
    s.term.attachCustomKeyEventHandler(ev => !(ev.key === 'F9' && !ev.ctrlKey && !ev.altKey && !ev.shiftKey))
    const offs = [
      s.onCwd(cwd => setShellDir(localPathFromCwd(cwd))),
      s.onClosed(() => { if (!restarting.current) s.notice('셸이 끝났습니다 — Enter: 다시 시작') }),
      s.onIdleInput(data => { if (data === '\r') start() }),
    ]
    useDockStore.getState().setSink(text => {
      if (s.state === 'on') void s.sendInput(quoteForShell(shellRef.current, text) + ' ')
      else useDockStore.setState({ pending: text }) // 셸이 뜨면 입력
      s.focus()
    })
    start()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => s.fit()) : null
    ro?.observe(hostRef.current)
    return () => {
      offs.forEach(off => off())
      ro?.disconnect()
      useDockStore.getState().setSink(null)
      sessionRef.current = null
      s.close()
      releaseEvents()
    }
  }, [createTerminal, addons])

  // 셸을 바꾸면 그 셸로 다시 시작
  const firstShell = useRef(true)
  useEffect(() => {
    if (firstShell.current) { firstShell.current = false; return }
    restart()
  }, [shell])

  function restart() {
    restarting.current = true
    start()
  }

  // 패널 따라가기: 패널 폴더(또는 활성 패널)가 바뀌면 cd
  const lastPath = useRef(panelPath)
  useEffect(() => {
    if (panelPath === lastPath.current) return
    lastPath.current = panelPath
    const s = sessionRef.current
    if (follow && panelPath && s?.state === 'on') void s.sendInput(cdCommand(shellRef.current, panelPath))
  }, [panelPath, follow])

  useEffect(() => {
    if (!focusSeq) return
    const s = sessionRef.current
    requestAnimationFrame(() => { s?.fit(); s?.focus() })
  }, [focusSeq])

  useEffect(() => { sessionRef.current?.fit() }, [height])

  function dragGrip(e) {
    if (e.button !== 0) return
    e.preventDefault()
    const startY = e.clientY
    const startH = useDockStore.getState().height
    startWindowDrag(ev => useDockStore.getState().setHeight(clampDockHeight(startH + (startY - ev.clientY), window.innerHeight)))
  }

  function onKeyDown(e) {
    if (e.key === 'F9' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      useDockStore.getState().hide()
    }
  }

  const st = useDockStore.getState()
  return (
    <section className={styles.dock} role="region" aria-label="터미널 도크" data-terminal-root
      style={{ height: clampDockHeight(height, typeof window !== 'undefined' ? window.innerHeight : 800) }} onKeyDown={onKeyDown}>
      <div className={styles.dockGrip} title="끌어서 높이 조절" onMouseDown={dragGrip} />
      <div className={styles.dockBar}>
        <span className={styles.dockTitle}>터미널</span>
        <select aria-label="셸" value={shell} onChange={e => st.setShell(e.target.value)}>
          {DOCK_SHELLS.map(x => <option key={x.host} value={x.host}>{x.label}</option>)}
        </select>
        <label className={styles.check}>
          <input type="checkbox" checked={follow} onChange={e => st.setFollow(e.target.checked)} /> 패널 따라가기
        </label>
        <span className={styles.dim}>Ctrl+Enter: 파일 이름 · Ctrl+Shift+Enter: 전체 경로 붙여넣기</span>
        <span className={styles.dockSpacer} />
        <button type="button" className={styles.iconBtn} title="셸의 지금 폴더를 파일 패널에서 열기" disabled={!shellDir}
          onClick={() => { const fs = useFileStore.getState(); fs.navigate(fs.activePanel, shellDir) }}><FolderOpen size={12} /></button>
        <button type="button" className={styles.iconBtn} title="셸 다시 시작" onClick={restart}><RotateCw size={12} /></button>
        <button type="button" className={styles.iconBtn} title="도크 닫기 (F9)" onClick={() => st.hide()}><X size={13} /></button>
      </div>
      <div className={styles.dockTerm} ref={hostRef} />
    </section>
  )
}
