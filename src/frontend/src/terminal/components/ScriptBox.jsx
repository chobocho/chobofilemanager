import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { sessionById } from '../core/session'
import { boxHead, historyStep } from '../core/luaScript'
import { useScriptStore } from '../store/scriptStore'
import { passesThroughInput } from '../core/workspaceKeys'
import styles from '../styles/Terminal.module.css'

// 칸 구석의 Lua 스크립트 상자 / Lua 콘솔 (Todo #124). 콘솔이면 아래에 입력 줄.
export default function ScriptBox({ id }) {
  const box = useScriptStore(s => s.tabs[id]?.box)
  const isConsole = useScriptStore(s => !!s.tabs[id]?.script?.console)
  const [, tick] = useState(0)
  const [text, setText] = useState('')
  const inputRef = useRef(null)
  const linesRef = useRef(null)
  const st = useScriptStore.getState()

  // 실행 중이면 제목의 시간이 흐름
  const running = box && (box.state === 'run' || box.busy)
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [running])
  useEffect(() => { if (isConsole) inputRef.current?.focus() }, [isConsole])
  useEffect(() => { const el = linesRef.current; if (el) el.scrollTop = el.scrollHeight }, [box?.lines])

  if (!box) return null

  async function onKeyDown(e) {
    if (passesThroughInput(e)) return // 작업 공간 단축키(Ctrl+Shift+K 닫기 등)는 통과 (Todo #127)
    e.stopPropagation()
    const input = e.currentTarget
    const lines = input.value.split('\n')
    const caretLine = input.value.slice(0, input.selectionStart).split('\n').length - 1
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    const plainCtrl = e.ctrlKey && !e.shiftKey && !e.altKey
    if (k === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const code = text
      if (await st.eval(id, code)) setText('')
    } else if (k === 'Escape') {
      e.preventDefault()
      sessionById(id)?.focus()
    } else if (k === 's' && plainCtrl) {
      e.preventDefault()
      st.save(id)
    } else if (k === 'o' && plainCtrl) {
      e.preventDefault()
      const loaded = await st.openFile(id)
      if (loaded != null) setText(loaded)
      inputRef.current?.focus()
    } else if (k === 'c' && plainCtrl && box.busy && input.selectionStart === input.selectionEnd) {
      e.preventDefault()
      st.interrupt(id)
    } else if (k === 'ArrowUp' || k === 'ArrowDown') {
      const step = historyStep(box.history, box.hpos, k === 'ArrowUp' ? -1 : 1, caretLine, lines.length)
      if (!step) return
      e.preventDefault()
      st.setHpos(id, step.pos)
      setText(step.text)
    }
  }

  const label = isConsole || box.state === 'console' ? 'Lua 콘솔' : `Lua 스크립트 ${box.name}`
  return (
    <div className={`${styles.scriptBox} ${styles[`sb_${box.state}`] ?? ''}`} role="region" aria-label={label}
      onMouseDown={e => e.stopPropagation()}>
      <div className={styles.memoTop}>
        <span>{boxHead(box, Date.now())}</span>
        {isConsole && box.busy && <button type="button" title="Ctrl+C" onClick={() => st.interrupt(id)}>중지</button>}
        {isConsole && <button type="button" title="Lua 파일을 입력창으로 불러오기 (Ctrl+O)"
          onClick={async () => { const t = await st.openFile(id); if (t != null) setText(t); inputRef.current?.focus() }}>열기</button>}
        {(isConsole || box.log.length > 0) && box.state !== 'run' && <button type="button" title="입력·출력을 파일로 저장 (Ctrl+S)" onClick={() => st.save(id)}>저장</button>}
        <button type="button" className={styles.iconBtn} title="닫기" onClick={() => (isConsole ? st.closeConsole(id) : st.closeBox(id))}><X size={12} /></button>
      </div>
      <div className={styles.scriptLines} ref={linesRef}>
        {box.lines.map((l, i) => <div key={i} data-kind={l.cls || undefined} className={l.cls ? styles[`sl_${l.cls}`] : ''}>{l.text}</div>)}
      </div>
      {isConsole && (
        <textarea ref={inputRef} className={styles.scriptInput} rows={Math.min(6, Math.max(1, text.split('\n').length))} value={text}
          onChange={e => setText(e.target.value)} onKeyDown={onKeyDown} spellCheck={false}
          placeholder="Lua · Enter 실행 · Shift+Enter 줄바꿈 · ↑↓ 이전 입력 · Ctrl+O 열기 · Ctrl+S 저장 · Esc 터미널로" />
      )}
    </div>
  )
}
