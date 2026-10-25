import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { termApi } from '../core/termApi'
import { useTermStore } from '../store/termStore'
import { passesThroughInput } from '../core/workspaceKeys'
import styles from '../styles/Terminal.module.css'

// 칸 위에 뜨는 메모장 (Ctrl+Shift+B, Todo #121, choboTerm memo.ts).
// 모든 탭이 같은 내용을 쓰고, 입력하는 대로 브라우저 저장소에 저장됩니다.
export default function MemoPad({ id }) {
  const text = useTermStore(s => s.memoText)
  const [status, setStatus] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const close = () => useTermStore.getState().closeMemo(id)

  function onChange(e) {
    const err = useTermStore.getState().setMemoText(e.target.value)
    setStatus(err ? `메모 자동 저장 실패: ${err}` : '')
  }

  async function saveAs() {
    try {
      const path = await termApi.MemoSave(inputRef.current?.value ?? text)
      if (path) setStatus(`메모를 저장했습니다: ${path}`)
    } catch (e) {
      setStatus(`메모를 저장하지 못했습니다: ${e?.message ?? e}`)
    }
    inputRef.current?.focus()
  }

  return (
    <div className={styles.memoBox} role="region" aria-label="메모장" onMouseDown={e => e.stopPropagation()}
      onKeyDown={e => { if (passesThroughInput(e)) return; e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close() } }}>
      <div className={styles.memoTop}>
        <span>메모장</span>
        <button type="button" title="메모를 파일로 저장" onClick={saveAs}>다른 이름으로 저장</button>
        <button type="button" className={styles.iconBtn} title="닫기 (Esc)" onClick={close}><X size={12} /></button>
      </div>
      <textarea ref={inputRef} className={styles.memoInput} value={text} onChange={onChange} spellCheck={false}
        placeholder="여기에 메모를 입력하세요. 내용은 자동으로 저장됩니다." />
      {status && <div className={styles.memoStatus} role="status">{status}</div>}
    </div>
  )
}
