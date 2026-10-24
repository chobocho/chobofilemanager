import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, ClipboardPaste } from 'lucide-react'
import { onTermEvent, termApi } from '../core/termApi'
import { saveSettings } from '../core/settings'
import styles from '../styles/Terminal.module.css'

// 창을 닫을 때 연결된 터미널이 있으면 Go가 app:close로 묻습니다 (Todo #120).
export function CloseConfirm() {
  const [open, setOpen] = useState(false)
  useEffect(() => onTermEvent('app:close', () => setOpen(true)), [])
  if (!open) return null
  return createPortal(
    <ConfirmBox icon={<AlertTriangle size={14} />} title="종료" okLabel="모두 끊고 종료"
      message="연결된 터미널이 있습니다. 모두 끊고 종료할까요?"
      onCancel={() => setOpen(false)}
      onOk={() => { setOpen(false); termApi.Quit().catch(() => undefined) }} />,
    document.body,
  )
}

const MAX_PREVIEW = 2000

/** 여러 줄 붙여넣기 확인 (choboTerm paste.ts): 줄마다 Enter가 들어가 명령이 실행될 수 있음. */
export function PasteConfirm({ request, onAnswer }) {
  const [noAsk, setNoAsk] = useState(false)
  if (!request) return null
  const lines = request.text.replace(/\r\n/g, '\n').split(/[\r\n]/)
  if (lines[lines.length - 1] === '') lines.pop()
  const preview = request.text.length > MAX_PREVIEW ? request.text.slice(0, MAX_PREVIEW) + '\n…' : request.text
  const answer = (ok) => {
    if (ok && noAsk) saveSettings(s => { s.pasteNoConfirm = true })
    setNoAsk(false)
    onAnswer(ok)
  }
  return createPortal(
    <ConfirmBox icon={<ClipboardPaste size={14} />} title="붙여넣기" okLabel="붙여넣기"
      message={`${lines.length}줄을 붙여넣습니다. 줄마다 Enter가 입력되어 명령이 실행될 수 있습니다.`}
      onCancel={() => answer(false)} onOk={() => answer(true)}>
      <pre className={styles.preview}>{preview}</pre>
      <label className={styles.check}>
        <input type="checkbox" checked={noAsk} onChange={e => setNoAsk(e.target.checked)} /> 다시 묻지 않기
      </label>
    </ConfirmBox>,
    document.body,
  )
}

function ConfirmBox({ icon, title, message, okLabel, onOk, onCancel, children }) {
  const okRef = useRef(null)
  useEffect(() => { okRef.current?.focus() }, [])
  function onKeyDown(e) {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }
  return (
    <div className={styles.modalOverlay}>
      <div className={styles.dialog} role="dialog" aria-label={title} onKeyDown={onKeyDown}>
        <div className={styles.dialogHeader}>{icon}<span>{title}</span></div>
        <div className={styles.message}>{message}</div>
        {children}
        <div className={styles.dialogActions}>
          <button type="button" onClick={onCancel}>취소</button>
          <button type="button" ref={okRef} className={styles.primary} onClick={onOk}>{okLabel}</button>
        </div>
      </div>
    </div>
  )
}
