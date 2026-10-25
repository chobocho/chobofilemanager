import React, { useEffect, useRef } from 'react'
import { TermSession } from '../core/session'
import { Reconnector } from '../core/reconnect'
import { lookOptions, isWorkspaceKey, isPaneMoveKey } from '../core/look'
import { leaves } from '../core/layout'
import { settings } from '../core/settings'
import { attachHighlight } from '../core/highlight'
import { macroForKey } from '../core/macros'
import { needsPasteConfirm, copySelection, pasteClipboard, isLocalPasteKey } from '../core/clipboard'
import { toast } from '../core/toast'
import { useTermStore } from '../store/termStore'
import { rectStyle } from '../core/drag'
import styles from '../styles/Terminal.module.css'

// 탭 하나의 터미널 화면 (Todo #120). 탭이 살아 있는 동안 마운트를 유지하고
// 비활성 탭은 hidden으로 숨깁니다 (xterm을 다시 만들면 화면 내용이 사라지므로).
// 여러 줄을 붙여넣으면 확인을 거침 (설정에서 끌 수 있음, core/clipboard)
export { needsPasteConfirm }

export default function TerminalPane({ id, active, visible = active, rect, createTerminal, addons = true, onPasteRequest }) {
  const hostRef = useRef(null)
  const sessionRef = useRef(null)
  const onPasteRequestRef = useRef(onPasteRequest)
  onPasteRequestRef.current = onPasteRequest

  useEffect(() => {
    const s = new TermSession(id, { createTerminal, addons, options: lookOptions(settings) })
    sessionRef.current = s
    s.open(hostRef.current)
    if (addons) s.highlighter = attachHighlight(s.term) // xterm 꾸밈(decoration) API가 필요 — 실제 xterm에서만
    // 탭·분할 단축키는 xterm 입력으로 보내지 않고 작업 공간이 처리 (Alt+방향키는 분할된 탭에서만)
    const inSplit = () => leaves(useTermStore.getState().groupOfPane(id)?.layout ?? { type: 'pane', id }).length > 1
    // 매크로를 지정한 F키도 작업 공간이 보냄 (지정 안 된 F키는 셸로)
    // 로컬 셸의 Ctrl+V는 브라우저 붙여넣기로 (Windows Terminal처럼, Todo #124)
    s.term.attachCustomKeyEventHandler(ev => !isWorkspaceKey(ev) && !macroForKey(ev) && !(isPaneMoveKey(ev) && inSplit()) && !isLocalPasteKey(s, ev))
    const store = useTermStore.getState()
    const rc = new Reconnector(s, { autoReconnect: () => settings.autoReconnect })
    s.reconnector = rc
    const offs = [
      store.bindSession(id, s),
      s.onOutput(() => useTermStore.getState().markActivity(id)),
      s.onClosed((msg, lost) => rc.handleClosed(msg, lost)),
      // 재접속 대기 중 Enter/Esc는 재접속이 처리, 그 밖의 Enter는 연결 대화상자
      s.onIdleInput(data => {
        if (rc.onIdleKey(data)) return
        if (data !== '\r') return
        const st = useTermStore.getState()
        if (st.tabs.find(t => t.id === id)?.docker) st.startDocker(id) // 도커 탭은 그 컨테이너로 다시
        else st.openDialog(id)
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
    // 선택하고 놓으면 바로 복사. 선택은 칸 밖에서 끝날 수 있어 놓는 것은 window에서 봄 (Todo #124)
    const onMouseDown = (ev) => {
      if (ev.button !== 0) return
      const up = (e) => {
        if (e.button !== 0) return
        window.removeEventListener('mouseup', up, true)
        copySelection(s)
        // 프로그램(vim, mc, tmux...)이 끌기를 가져감: 여기서는 아무것도 선택되지 않음
        const dragged = Math.abs(e.clientX - ev.clientX) + Math.abs(e.clientY - ev.clientY) > 8
        if (dragged && !ev.shiftKey && s.term.modes?.mouseTrackingMode !== 'none' && !s.term.hasSelection?.()) {
          toast('프로그램이 마우스를 쓰는 중입니다. Shift+드래그로 선택 · 복사')
        }
      }
      window.addEventListener('mouseup', up, true)
    }
    // 우클릭 = 붙여넣기 (마우스를 쓰는 프로그램에는 클릭을 넘기고, Shift+우클릭은 붙여넣기)
    const onContextMenu = (ev) => {
      ev.preventDefault()
      if (s.term.modes?.mouseTrackingMode !== 'none' && !ev.shiftKey) return
      pasteClipboard(s, (r) => onPasteRequestRef.current?.(r))
    }
    // Ctrl+휠: 글꼴 크기 (모든 탭)
    const onWheel = (ev) => {
      if (!ev.ctrlKey || !ev.deltaY) return
      ev.preventDefault()
      useTermStore.getState().changeFontSize(ev.deltaY < 0 ? 1 : -1)
    }
    host.addEventListener('mousedown', onMouseDown)
    host.addEventListener('contextmenu', onContextMenu)
    host.addEventListener('wheel', onWheel, { passive: false })
    useTermStore.getState().startPendingConnect(id)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => s.fit()) : null
    ro?.observe(hostRef.current)
    return () => {
      offs.forEach(off => off())
      host.removeEventListener('paste', onPaste, true)
      host.removeEventListener('mousedown', onMouseDown)
      host.removeEventListener('contextmenu', onContextMenu)
      host.removeEventListener('wheel', onWheel)
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

  // 분할 비율이 바뀌면 다시 맞춤
  useEffect(() => { if (visible) sessionRef.current?.fit() }, [visible, rect?.x, rect?.y, rect?.w, rect?.h])

  const style = rect ? rectStyle(rect) : undefined
  return (
    <div data-term-pane={id} hidden={!visible} style={style} ref={hostRef}
      className={`${styles.pane} ${active ? styles.paneActive : ''}`}
      onMouseDown={() => { if (!active) useTermStore.getState().setActive(id) }} />
  )
}
