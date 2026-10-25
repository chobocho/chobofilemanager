import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClipboardPaste } from 'lucide-react'
import { saveSettings } from '../core/settings'
import styles from '../styles/Terminal.module.css'
import Modal from './Modal.jsx'

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

// 확인 창 하나 (Todo #126): 붙여넣기 확인, 원격 파일 삭제·이름 입력, 세션 삭제가 함께 씀.
// input: 이름을 받는 창 (onOk(이름), 비면 취소). Enter = 확인 (버튼 위에서는 그 버튼)
export function ConfirmBox({ icon, title, message, okLabel = '확인', onOk, onCancel, input = false, value = '', role = 'dialog', children }) {
  const [text, setText] = useState(value)
  const focusRef = useRef(null)
  useEffect(() => {
    focusRef.current?.focus()
    if (input) focusRef.current?.select?.()
  }, [])
  function ok() {
    if (!input) return onOk()
    const t = text.trim()
    if (t) onOk(t)
    else onCancel()
  }
  function onKeyDown(e) {
    if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); ok() }
  }
  return (
    <Modal label={title} title={<>{icon}{title}</>} role={role} onClose={onCancel} onKeyDown={onKeyDown}>
      <div className={styles.message}>{message}</div>
      {input && <input ref={focusRef} value={text} onChange={e => setText(e.target.value)} spellCheck={false} autoComplete="off" />}
      {children}
      <div className={styles.dialogActions}>
        <button type="button" onClick={onCancel}>취소</button>
        <button type="button" ref={input ? undefined : focusRef} className={styles.primary} onClick={ok}>{okLabel}</button>
      </div>
    </Modal>
  )
}
