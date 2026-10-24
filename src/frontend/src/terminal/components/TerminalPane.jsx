import React, { useEffect, useRef } from 'react'
import { TermSession } from '../core/session'
import { Reconnector } from '../core/reconnect'
import { lookOptions, isWorkspaceKey } from '../core/look'
import { settings } from '../core/settings'
import { useTermStore } from '../store/termStore'
import styles from '../styles/Terminal.module.css'

// 탭 하나의 터미널 화면 (Todo #120). 탭이 살아 있는 동안 마운트를 유지하고
// 비활성 탭은 hidden으로 숨깁니다 (xterm을 다시 만들면 화면 내용이 사라지므로).
// 여러 줄을 붙여넣으면 확인을 거침 (설정에서 끌 수 있음)
export function needsPasteConfirm(text) {
  return !settings.pasteNoConfirm && /[\r\n]/.test(text)
}

export default function TerminalPane({ id, active, createTerminal, addons = true, onPasteRequest }) {
  const hostRef = useRef(null)
  const sessionRef = useRef(null)
  const onPasteRequestRef = useRef(onPasteRequest)
  onPasteRequestRef.current = onPasteRequest

  useEffect(() => {
    const s = new TermSession(id, { createTerminal, addons, options: lookOptions(settings) })
    sessionRef.current = s
    s.open(hostRef.current)
    // 탭 단축키는 xterm 입력으로 보내지 않고 작업 공간이 처리
    s.term.attachCustomKeyEventHandler(ev => !isWorkspaceKey(ev))
    const store = useTermStore.getState()
    const rc = new Reconnector(s, { autoReconnect: () => settings.autoReconnect })
    const offs = [
      store.bindSession(id, s),
      s.onOutput(() => useTermStore.getState().markActivity(id)),
      s.onClosed((msg, lost) => rc.handleClosed(msg, lost)),
      // 재접속 대기 중 Enter/Esc는 재접속이 처리, 그 밖의 Enter는 연결 대화상자
      s.onIdleInput(data => {
        if (rc.onIdleKey(data)) return
        if (data === '\r') useTermStore.getState().openDialog(id)
      }),
    ]
    const host = hostRef.current
    const onPaste = (e) => {
      const text = e.clipboardData?.getData('text') ?? ''
      if (!text || !needsPasteConfirm(text)) return
      e.preventDefault()
      e.stopPropagation()
      onPasteRequestRef.current?.({ text, paste: () => s.term.paste(text) })
    }
    host.addEventListener('paste', onPaste, true)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => s.fit()) : null
    ro?.observe(hostRef.current)
    return () => {
      offs.forEach(off => off())
      host.removeEventListener('paste', onPaste, true)
      ro?.disconnect()
      rc.dispose()
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
