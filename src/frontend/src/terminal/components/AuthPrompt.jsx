import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { KeyRound, X } from 'lucide-react'
import { onTermEvent, termApi } from '../core/termApi'
import styles from '../styles/Terminal.module.css'

// 로그인 중 Go가 묻는 질문 (키 암호, 일회용 코드, keyboard-interactive) — Todo #120, choboTerm authprompt.ts 이식.
// 질문이 겹치면 차례로 보여 주고, Go가 기다림을 그만두면(auth:promptDone) 해당 질문을 버립니다.
// 터미널 보기가 숨겨져 있어도 보이도록 document.body에 그립니다.
export default function AuthPrompt({ describeTab = () => '' }) {
  const [queue, setQueue] = useState([])
  const current = queue[0]

  useEffect(() => {
    const offs = [
      onTermEvent('auth:prompt', p => setQueue(q => [...q, p])),
      onTermEvent('auth:promptDone', id => setQueue(q => q.filter(p => p.id !== id))),
    ]
    return () => offs.forEach(off => off())
  }, [])

  if (!current) return null
  return createPortal(
    <PromptDialog key={current.id} prompt={current} where={describeTab(current.tab)}
      onDone={(ok, values) => {
        termApi.AnswerPrompt(current.id, ok ? values : [], ok).catch(() => undefined)
        setQueue(q => q.slice(1))
      }} />,
    document.body,
  )
}

function PromptDialog({ prompt, where, onDone }) {
  const fields = prompt.fields ?? []
  const [values, setValues] = useState(() => fields.map(() => ''))
  const inputs = useRef([])
  const okRef = useRef(null)

  useEffect(() => { (inputs.current[0] ?? okRef.current)?.focus() }, [])

  function onKeyDown(e) {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      onDone(false)
    } else if (e.key === 'Enter' && e.target.dataset.role !== 'cancel') {
      e.preventDefault()
      // Enter는 다음 칸으로, 마지막 칸에서는 응답
      const i = inputs.current.indexOf(e.target)
      if (i >= 0 && i < fields.length - 1) inputs.current[i + 1].focus()
      else onDone(true, values)
    }
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.dialog} onKeyDown={onKeyDown} role="dialog" aria-label={prompt.title}>
        <div className={styles.dialogHeader}>
          <KeyRound size={14} /><span>{prompt.title}</span>
          <button type="button" className={styles.iconBtn} title="취소 (Esc)" onClick={() => onDone(false)}><X size={13} /></button>
        </div>
        {where && <div className={styles.dim}>{where}</div>}
        {prompt.message && <div className={styles.message}>{prompt.message}</div>}
        <div className={styles.fieldGrid}>
          {fields.map((f, i) => {
            const id = `term-prompt-${prompt.id}-${i}`
            return (
              <React.Fragment key={i}>
                <label htmlFor={id}>{f.label || `입력 ${i + 1}`}</label>
                <input id={id} ref={el => (inputs.current[i] = el)} type={f.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false}
                  value={values[i]} onChange={e => setValues(v => v.map((x, j) => (j === i ? e.target.value : x)))} />
              </React.Fragment>
            )
          })}
        </div>
        <div className={styles.dialogActions}>
          <button type="button" data-role="cancel" onClick={() => onDone(false)}>{prompt.cancel || '취소'}</button>
          <button type="button" ref={okRef} className={styles.primary} onClick={() => onDone(true, values)}>{prompt.ok || '확인'}</button>
        </div>
      </div>
    </div>
  )
}
