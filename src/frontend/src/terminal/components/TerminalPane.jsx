import React, { useEffect, useRef } from 'react'
import { TermSession } from '../core/session'
import { lookOptions, isWorkspaceKey } from '../core/look'
import { settings } from '../core/settings'
import { useTermStore } from '../store/termStore'
import styles from '../styles/Terminal.module.css'

// 탭 하나의 터미널 화면 (Todo #120). 탭이 살아 있는 동안 마운트를 유지하고
// 비활성 탭은 hidden으로 숨깁니다 (xterm을 다시 만들면 화면 내용이 사라지므로).
export default function TerminalPane({ id, active, createTerminal, addons = true }) {
  const hostRef = useRef(null)
  const sessionRef = useRef(null)

  useEffect(() => {
    const s = new TermSession(id, { createTerminal, addons, options: lookOptions(settings) })
    sessionRef.current = s
    s.open(hostRef.current)
    // 탭 단축키는 xterm 입력으로 보내지 않고 작업 공간이 처리
    s.term.attachCustomKeyEventHandler(ev => !isWorkspaceKey(ev))
    const store = useTermStore.getState()
    const offs = [
      store.bindSession(id, s),
      s.onOutput(() => useTermStore.getState().markActivity(id)),
      s.onIdleInput(data => { if (data === '\r') useTermStore.getState().openDialog(id) }),
    ]
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => s.fit()) : null
    ro?.observe(hostRef.current)
    return () => {
      offs.forEach(off => off())
      ro?.disconnect()
      s.dispose()
    }
  }, [id, createTerminal, addons])

  useEffect(() => {
    if (!active) return
    const s = sessionRef.current
    s?.fit()
    s?.focus()
  }, [active])

  return <div data-term-pane={id} hidden={!active} className={styles.pane} ref={hostRef} />
}
