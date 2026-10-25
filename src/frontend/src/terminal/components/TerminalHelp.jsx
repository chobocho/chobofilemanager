import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { HELP_TEXT } from '../core/helpText'
import { currentLang } from '../core/i18n'
import { browserOpenURL } from '../core/termApi'
import styles from '../styles/Terminal.module.css'

// 터미널 도움말 (F1, Todo #124, choboTerm help.ts). 한국어 ↔ English (Alt+L), 고른 언어 기억.
// 영어판이 따로 있으니 화면 번역(i18n)은 건너뜀 (data-no-i18n)
const LANG_KEY = 'chobocho.term.helpLang'

function loadLang() {
  try {
    const v = localStorage.getItem(LANG_KEY)
    if (v === 'ko' || v === 'en') return v
  } catch { /* 저장소를 못 쓰면 기본값 */ }
  return currentLang()
}

export default function TerminalHelp({ onClose }) {
  const [lang, setLang] = useState(loadLang)
  const ref = useRef(null)
  const t = HELP_TEXT[lang]
  useEffect(() => { ref.current?.focus() }, [])

  function toggle() {
    const next = lang === 'ko' ? 'en' : 'ko'
    setLang(next)
    try { localStorage.setItem(LANG_KEY, next) } catch { /* 기억 못 해도 됨 */ }
  }

  function onKeyDown(e) {
    e.stopPropagation()
    if (e.key === 'Escape' || e.key === 'F1') { e.preventDefault(); onClose() }
    else if (e.altKey && e.key.toLowerCase() === 'l') { e.preventDefault(); toggle() }
  }

  return (
    <div className={styles.modalOverlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`${styles.dialog} ${styles.help}`} role="dialog" aria-label={`${t.title} (F1)`} tabIndex={-1} ref={ref}
        onKeyDown={onKeyDown} data-no-i18n>
        <div className={styles.dialogHeader}>
          <span>{`${t.title} (F1)`}</span>
          <button type="button" onClick={toggle} title="Alt+L">{t.other}</button>
          <button type="button" className={styles.iconBtn} title="Esc" onClick={onClose}><X size={13} /></button>
        </div>
        <div className={styles.helpBody}>
          {t.sections.map(s => (
            <section key={s.title}>
              <h3>{s.title}</h3>
              <table>
                <tbody>
                  {s.rows.map(([k, d]) => <tr key={k}><td className={styles.helpKey}>{k}</td><td>{d}</td></tr>)}
                </tbody>
              </table>
            </section>
          ))}
          <ul>{t.notes.map(n => <li key={n}>{n}</li>)}</ul>
          <h3>{t.links.title}</h3>
          <table>
            <tbody>
              {t.links.rows.map(([label, url]) => (
                <tr key={url}>
                  <td className={styles.helpKey}>{label}</td>
                  <td><a href={url} onClick={e => { e.preventDefault(); browserOpenURL(url) }}>{url.replace('https://', '')}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.dialogActions}>
          <button type="button" onClick={onClose}>{t.close}</button>
        </div>
      </div>
    </div>
  )
}
