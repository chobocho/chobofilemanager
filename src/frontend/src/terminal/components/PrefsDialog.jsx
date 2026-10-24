import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { termApi } from '../core/termApi'
import { settings } from '../core/settings'
import { prefsForm, readPrefs, writePrefs, previewLines } from '../core/prefs'
import { FONTS } from '../core/cjkwidth'
import { THEMES } from '../core/themes'
import { useTermStore } from '../store/termStore'
import styles from '../styles/Terminal.module.css'

// 터미널 설정 창 (Ctrl+Shift+O, 탭 막대 ⚙ — Todo #121, choboTerm prefs.ts).
// 확인을 눌러야 저장되고, 열린 탭에 바로 적용됩니다.
export default function PrefsDialog() {
  const [f, setF] = useState(() => prefsForm(settings))
  const [error, setError] = useState('')
  const refs = useRef({})
  const reg = (k) => (el) => { refs.current[k] = el }

  useEffect(() => {
    refs.current.fontSize?.focus()
    refs.current.fontSize?.select()
  }, [])

  const close = () => useTermStore.getState().closePrefs()
  const val = (k) => ({ id: `pf-${k}`, ref: reg(k), value: f[k], onChange: e => setF(o => ({ ...o, [k]: e.target.value })) })
  const chk = (k) => ({ type: 'checkbox', checked: f[k], onChange: e => setF(o => ({ ...o, [k]: e.target.checked })) })

  function apply() {
    const r = readPrefs(f)
    if ('error' in r) {
      setError(r.error)
      refs.current[r.field]?.focus()
      refs.current[r.field]?.select?.()
      return
    }
    writePrefs(r.values)
    useTermStore.getState().applySettings()
    close()
  }

  async function browse() {
    try {
      const dir = await termApi.ChooseLogDir(f.logDir.trim())
      if (dir) setF(o => ({ ...o, logDir: dir }))
    } catch (e) {
      setError(String(e?.message ?? e))
    }
    refs.current.logDir?.focus()
  }

  function onKeyDown(e) {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); apply() }
  }

  const pv = previewLines(f.theme)
  const hint = (t) => <span className={styles.dim}>{t}</span>
  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.dialog} ${styles.prefs}`} role="dialog" aria-label="설정" onKeyDown={onKeyDown}>
        <div className={styles.dialogHeader}>
          <span>설정</span>
          <button type="button" className={styles.iconBtn} title="닫기 (Esc)" onClick={close}><X size={13} /></button>
        </div>
        <div className={styles.prefsBody}>
          <fieldset>
            <legend>글꼴</legend>
            <div className={styles.fieldGrid}>
              <label htmlFor="pf-fontSize">글꼴 크기</label>
              <span><input {...val('fontSize')} inputMode="numeric" className={styles.num} /> {hint('8~40')}</span>
              <label htmlFor="pf-fontUtf8">글꼴 (UTF-8)</label>
              <select {...val('fontUtf8')}>{FONTS.map(x => <option key={x.name} value={x.name}>{x.label}</option>)}</select>
              <label htmlFor="pf-fontEucKr">글꼴 (EUC-KR)</label>
              <select {...val('fontEucKr')}>{FONTS.map(x => <option key={x.name} value={x.name}>{x.label}</option>)}</select>
            </div>
            <label className={styles.check}><input {...chk('pasteConfirm')} /> 여러 줄을 붙여넣기 전에 확인</label>
          </fieldset>
          <fieldset>
            <legend>화면</legend>
            <div className={styles.fieldGrid}>
              <label htmlFor="pf-theme">색 테마</label>
              <select {...val('theme')}>{THEMES.map(x => <option key={x.name} value={x.name}>{x.label}</option>)}</select>
            </div>
            <div className={styles.themePreview} data-testid="theme-preview" style={{ background: pv.background, color: pv.foreground }}>
              {pv.lines.map((line, i) => <div key={i}>{line.map((s, j) => <span key={j} style={s.color ? { color: s.color } : undefined}>{s.text}</span>)}</div>)}
              <div className={styles.swatches}>{pv.swatches.map((c, i) => <span key={i} data-swatch style={{ background: c }} />)}</div>
            </div>
            <div className={styles.fieldGrid}>
              <label htmlFor="pf-cursorStyle">커서</label>
              <select {...val('cursorStyle')}>
                <option value="block">블록 █</option>
                <option value="underline">밑줄 _</option>
                <option value="bar">세로 막대 |</option>
              </select>
              <span />
              <label className={styles.check}><input {...chk('cursorBlink')} /> 커서 깜박임</label>
              <label htmlFor="pf-scrollback">스크롤백</label>
              <span><input {...val('scrollback')} inputMode="numeric" className={styles.num} /> {hint('줄, 1000~100000')}</span>
            </div>
          </fieldset>
          <fieldset>
            <legend>연결</legend>
            <div className={styles.fieldGrid}>
              <label htmlFor="pf-keepAlive">연결 유지 간격</label>
              <span><input {...val('keepAlive')} inputMode="numeric" className={styles.num} /> {hint('초, 0 = 끄기 (새 연결부터 적용)')}</span>
            </div>
            <label className={styles.check}><input {...chk('autoReconnect')} /> 연결이 끊기면 자동으로 다시 연결</label>
          </fieldset>
          <fieldset>
            <legend>강조</legend>
            <label className={styles.check}><input {...chk('hlOn')} /> 출력에 나온 단어를 색으로 강조 {hint('(쉼표로 구분, 영어는 단어 단위·대소문자 무시)')}</label>
            {[['hlRed', '빨강', '#c0392b'], ['hlYellow', '노랑', '#e0b000'], ['hlGreen', '초록', '#1e8449']].map(([k, name, color]) => (
              <div key={k} className={styles.hlRow}>
                <span className={styles.swatch} style={{ background: color }} />
                <input {...val(k)} aria-label={`${name} 단어`} disabled={!f.hlOn} spellCheck={false} autoComplete="off" />
              </div>
            ))}
          </fieldset>
          <fieldset>
            <legend>세션 로그</legend>
            <label className={styles.check}><input {...chk('logAuto')} /> 접속할 때마다 자동으로 기록</label>
            <label className={styles.check}><input {...chk('logPlain')} /> 색상·제어 코드를 빼고 일반 텍스트로 저장</label>
            <label className={styles.check}><input {...chk('logTime')} /> 줄마다 받은 시각 기록 {hint('[2026-10-09 21:30:15.123]')}</label>
            <div className={styles.hlRow}>
              <input {...val('logDir')} aria-label="로그 폴더" placeholder="비우면 기본 위치" spellCheck={false} autoComplete="off" />
              <button type="button" onClick={browse}>찾아보기</button>
            </div>
          </fieldset>
        </div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        <div className={styles.dialogActions}>
          <button type="button" onClick={close}>취소</button>
          <button type="button" className={styles.primary} onClick={apply}>확인</button>
        </div>
      </div>
    </div>
  )
}
