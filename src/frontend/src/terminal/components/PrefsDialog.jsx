import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { termApi } from '../core/termApi'
import { settings } from '../core/settings'
import { prefsForm, readPrefs, writePrefs, previewLines } from '../core/prefs'
import { FONTS } from '../core/cjkwidth'
import { THEMES } from '../core/themes'
import { useTermStore } from '../store/termStore'
import { termApi as goApi } from '../core/termApi'
import { startI18n, resolveLang, currentLang } from '../core/i18n'
import { applyTranslucency } from '../core/look'
import { checkUpdate } from '../core/update'
import { clipboardSetText } from '../core/termApi'

// 웹 서버 상태 문구 (choboTerm prefs.ts paintWeb)
function webState(info) {
  if (!info) return ''
  if (!info.running) return info.error ? `시작하지 못했습니다: ${info.error}` : '꺼져 있음'
  let s = `켜짐 (${info.remote ? '다른 PC에서도 접속 가능' : '이 PC에서만'}) · 열린 브라우저 ${info.clients}개`
  if (info.tls) s += `\nTLS 인증서 SHA-256: ${info.fingerprint}`
  return s
}

const webPage = typeof window !== 'undefined' && !!window.__cbt // 브라우저 화면이면 웹 서버 설정 없음
import styles from '../styles/Terminal.module.css'

// 터미널 설정 창 (Ctrl+Shift+O, 탭 막대 ⚙ — Todo #121, choboTerm prefs.ts).
// 확인을 눌러야 저장되고, 열린 탭에 바로 적용됩니다.
export default function PrefsDialog() {
  const [f, setF] = useState(() => prefsForm(settings))
  const [error, setError] = useState('')
  const [updateMsg, setUpdateMsg] = useState('')
  const [web, setWeb] = useState(null)
  const [webAddr, setWebAddr] = useState('')
  const [webBusy, setWebBusy] = useState(false)
  const refs = useRef({})
  const reg = (k) => (el) => { refs.current[k] = el }

  useEffect(() => {
    refs.current.fontSize?.focus()
    refs.current.fontSize?.select()
    if (!webPage) Promise.resolve(termApi.WebStatus()).then(paintWeb).catch(() => undefined)
  }, [])

  // 고르는 동안 투명도 미리 보기
  useEffect(() => { applyTranslucency(f.translucency, Number(f.opacity), f.glassGpu) }, [f.translucency, f.opacity, f.glassGpu])

  function paintWeb(info) {
    setWeb(info)
    if (info?.addr) setWebAddr(info.addr)
  }

  // 웹 서버 동작 (창에서만, 확인과 상관없이 바로 적용)
  async function webDo(action) {
    setWebBusy(true)
    try {
      const info = await action()
      paintWeb(info ?? await termApi.WebStatus())
    } catch (e) {
      const info = await Promise.resolve(termApi.WebStatus()).catch(() => null)
      paintWeb({ ...(info ?? {}), running: info?.running ?? false, error: String(e?.message ?? e) })
    } finally {
      setWebBusy(false)
    }
  }

  async function checkNow() {
    setUpdateMsg('확인하는 중...')
    try {
      setUpdateMsg(await checkUpdate(true))
    } catch (e) {
      setUpdateMsg(String(e?.message ?? e))
    }
  }

  // 취소하면 저장된 투명도로
  const close = () => {
    applyTranslucency(settings.translucency || 'off', settings.opacity || 85, settings.glassGpu)
    useTermStore.getState().closePrefs()
  }
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
    const updateOn = r.values.updateCheck && !settings.updateCheck
    writePrefs(r.values)
    useTermStore.getState().applySettings()
    close()
    // 방금 켰으면 다음 시작이 아니라 지금 확인
    if (updateOn) setTimeout(() => void checkUpdate(false), 500)
    // 영어로 바꾸면 바로 적용 (한국어로 되돌리는 것은 다시 시작한 뒤 모두 적용)
    Promise.resolve(goApi.GetLanguage()).catch(() => '').then(go => {
      const l = resolveLang(r.values.language, go)
      if (l !== currentLang()) startI18n(l)
    })
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
            <legend>창 투명도</legend>
            <div className={styles.fieldGrid}>
              <label htmlFor="pf-translucency">창 투명도</label>
              <select {...val('translucency')}>
                <option value="off">끄기</option>
                <option value="window">창 전체 (글자도 비침)</option>
                <option value="background">배경만 (글자는 선명)</option>
              </select>
              <label htmlFor="pf-opacity">불투명도</label>
              <span className={styles.hlRow}>
                <input {...val('opacity')} type="range" min="30" max="100" step="5" disabled={f.translucency === 'off'} />
                <span>{`${f.opacity}%`}</span>
              </span>
            </div>
            <label className={styles.check}><input {...chk('glassGpu')} disabled={f.translucency !== 'background'} /> GPU로 그리기 (배경만)</label>
            <span className={styles.dim}>
              {f.translucency === 'window' ? '터미널이 글자까지 비칩니다. 설정·질문 창은 불투명합니다.'
                : f.translucency === 'background' ? '터미널 배경만 비치고 글자는 선명합니다.' : ''}
            </span>
          </fieldset>
          {!webPage && (
            <fieldset>
              <legend>웹 서버</legend>
              <div className={styles.hlRow}>
                <input aria-label="웹 서버 주소" value={webAddr} onChange={e => setWebAddr(e.target.value)} spellCheck={false} />
                <button type="button" disabled={webBusy} onClick={() => webDo(() => termApi.WebStart(webAddr.trim()))}>{web?.running ? '다시 시작' : '켜기'}</button>
                <button type="button" disabled={webBusy || !web?.running} onClick={() => webDo(() => termApi.WebStop())}>끄기</button>
              </div>
              <span className={styles.dim} style={{ whiteSpace: 'pre-line' }}>{webState(web)}</span>
              {web?.running && (
                <div className={styles.hlRow}>
                  <input aria-label="접속 주소" value={web.url ?? ''} readOnly />
                  <button type="button" onClick={() => clipboardSetText(web.url ?? '').catch(() => undefined)}>복사</button>
                  <button type="button" disabled={webBusy} onClick={() => webDo(() => termApi.WebNewToken())}>새 토큰</button>
                  <button type="button" disabled={webBusy} onClick={() => webDo(() => termApi.WebOpen())}>브라우저로 열기</button>
                </div>
              )}
              <span className={styles.dim}>다른 PC의 브라우저에서 이 PC의 터미널을 씁니다 (켜고 끄는 것은 바로 적용).</span>
            </fieldset>
          )}
          <fieldset>
            <legend>고양이</legend>
            <label className={styles.check}><input {...chk('cat')} /> 고양이 보이기 (Terminal 보기 아래쪽을 걸어 다님, 클릭하면 Lua 실행)</label>
          </fieldset>
          <fieldset>
            <legend>업데이트</legend>
            <label className={styles.check}><input {...chk('updateCheck')} /> 시작할 때 새 버전 확인</label>
            <div className={styles.hlRow}>
              <button type="button" onClick={checkNow}>지금 확인</button>
              <span className={styles.dim}>{updateMsg}</span>
            </div>
          </fieldset>
          <fieldset>
            <legend>언어</legend>
            <div className={styles.fieldGrid}>
              <label htmlFor="pf-language">언어</label>
              <select {...val('language')}>
                <option value="">시스템 따라</option>
                <option value="ko">한국어</option>
                <option value="en">English</option>
              </select>
            </div>
            <span className={styles.dim}>터미널 화면과 터미널이 보여 주는 메시지의 언어 (파일 관리자는 한국어). 한국어로 되돌리면 다시 시작한 뒤 모두 적용됩니다.</span>
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
