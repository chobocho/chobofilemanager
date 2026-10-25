import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { onTermEvent, termApi } from '../terminal/core/termApi'
import styles from '../styles/Dialogs.module.css'

// 창 닫기 확인 (Todo #120, #124). 터미널 보기를 한 번도 열지 않아도(하단 도크만 연결) Go의 질문에 답하도록
// 앱에 항상 붙어 있음 — 지연 로딩되는 터미널 조각에 두면 듣는 쪽이 없어 창이 닫히지 않음.
//  app:close: 연결된 터미널이 있음 → 모두 끊고 종료?
//  app:closeWeb(n): 브라우저 n개가 웹 서버를 씀 → 모두 종료 / 창만 닫기(웹 서버 유지)
export default function CloseGuard() {
  const [ask, setAsk] = useState(null) // { kind: 'close' } | { kind: 'web', browsers }
  const [error, setError] = useState('')
  const okRef = useRef(null)

  useEffect(() => {
    const offs = [
      onTermEvent('app:close', () => { setError(''); setAsk({ kind: 'close' }) }),
      onTermEvent('app:closeWeb', (n) => { setError(''); setAsk({ kind: 'web', browsers: n }) }),
    ]
    return () => offs.forEach(off => off())
  }, [])
  useEffect(() => { if (ask) okRef.current?.focus() }, [ask])

  if (!ask) return null
  const quit = () => { setAsk(null); termApi.Quit().catch(() => undefined) }
  async function hideWindow() {
    try {
      await termApi.WebHideWindow()
      setAsk(null)
    } catch (e) {
      setError(String(e?.message ?? e))
    }
  }

  const web = ask.kind === 'web'
  const title = web ? 'Chobocho Commander 끝내기' : '종료'
  return (
    <div className={styles.overlay}>
      <div className={styles.modal} role="dialog" aria-label={title}
        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); setAsk(null) } }}>
        <div className={styles.header}><AlertTriangle size={14} /><span>{title}</span></div>
        <div className={styles.body}>
          {web
            ? <p className={styles.message} style={{ whiteSpace: 'pre-line' }}>{`브라우저 ${ask.browsers}개가 웹 서버에 연결되어 있습니다.\n\n모두 종료하면 브라우저의 탭도 끊어집니다.\n창만 닫으면 웹 서버는 계속 돌고, 다시 실행하면 창이 나타납니다. 터미널 설정 > 웹 서버에서 끌 수 있습니다.`}</p>
            : <p className={styles.message}>연결된 터미널이 있습니다. 모두 끊고 종료할까요?</p>}
          {error && <p role="alert" className={styles.errorMsg}>{error}</p>}
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.btnCancel} onClick={() => setAsk(null)}>취소</button>
          {web && <button type="button" className={styles.btnCancel} onClick={hideWindow}>창만 닫기 (웹 서버 유지)</button>}
          <button type="button" ref={okRef} className={styles.btnDanger} onClick={quit}>{web ? '모두 종료' : '모두 끊고 종료'}</button>
        </div>
      </div>
    </div>
  )
}
