import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { settings, saveSettings } from '../core/settings'
import { keyOptions, macroLabel } from '../core/macros'
import { useTermStore } from '../store/termStore'
import styles from '../styles/Terminal.module.css'

// 매크로 창 (Ctrl+Shift+M, Todo #121, choboTerm macros.ts). 고친 내용은 바로 저장됩니다.
const TEXT_HINT = '줄바꿈 = Enter · \\t Tab · \\e Esc · \\x03 Ctrl+C · \\\\ 역슬래시'
const LUA_HINT = 'send("ls\\r") · expect("%$ ", 10) · sleep(500) · screen() · print(...) · Lua 5.1'

export default function MacrosDialog() {
  const [, repaint] = useState(0)
  // 다시 열면 마지막에 고른 매크로
  const [sel, setSel] = useState(() => Math.min(useTermStore.getState().macroSel, settings.macros.length - 1))
  const [focusName, setFocusName] = useState(false)
  const listRef = useRef(null)
  const nameRef = useRef(null)
  const macros = settings.macros
  const m = macros[sel]

  useEffect(() => { listRef.current?.focus() }, [])
  useEffect(() => { useTermStore.setState({ macroSel: Math.max(0, sel) }) }, [sel])
  useEffect(() => { if (focusName) { nameRef.current?.focus(); setFocusName(false) } }, [focusName])

  const save = () => { saveSettings(s => { s.macros = macros }); repaint(n => n + 1) }
  const select = (i) => setSel(Math.max(-1, Math.min(i, macros.length - 1)))
  const change = (k) => (e) => { if (!m) return; m[k] = e.target.value; save() }
  const close = () => useTermStore.getState().closeMacros()

  function add() {
    macros.push({ name: '', key: '', text: '', kind: '' })
    save()
    setSel(macros.length - 1)
    setFocusName(true)
  }

  function remove() {
    if (sel < 0 || !m) return
    macros.splice(sel, 1)
    save()
    select(Math.min(sel, macros.length - 1))
    listRef.current?.focus()
  }

  function send() {
    if (!m) return
    useTermStore.getState().closeMacros()
    useTermStore.getState().sendMacro(m)
  }

  function onListKey(e) {
    switch (e.key) {
      case 'ArrowDown': select(sel + 1); break
      case 'ArrowUp': select(sel - 1); break
      case 'Enter': send(); break
      case 'Delete': remove(); break
      case 'Insert': add(); break
      default: return
    }
    e.preventDefault()
  }

  function onKeyDown(e) {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); send() }
  }

  const lua = m?.kind === 'lua'
  const off = !m
  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.dialog} ${styles.macros}`} role="dialog" aria-label="매크로" onKeyDown={onKeyDown}>
        <div className={styles.dialogHeader}>
          <span>매크로</span>
          <button type="button" className={styles.iconBtn} title="닫기 (Esc)" onClick={close}><X size={13} /></button>
        </div>
        <div className={styles.smCols}>
          <div className={styles.smLeft}>
            <ul ref={listRef} className={styles.smList} role="listbox" aria-label="매크로 목록" tabIndex={0} onKeyDown={onListKey}>
              {macros.map((x, i) => (
                <li key={i} role="option" aria-selected={i === sel} className={i === sel ? styles.smSel : ''}
                  onMouseDown={e => { e.preventDefault(); select(i); listRef.current?.focus() }} onDoubleClick={send}>
                  {x.key && <span className={styles.macroKey}>{x.key}</span>}
                  <span>{macroLabel(x)}</span>
                </li>
              ))}
              {macros.length === 0 && <li className={styles.smEmpty}>+ 추가로 매크로를 만드세요</li>}
            </ul>
            <div className={styles.smListBtns}>
              <button type="button" title="Insert" onClick={add}>+ 추가</button>
              <button type="button" title="Delete" onClick={remove} disabled={off}>삭제</button>
            </div>
          </div>
          <div className={styles.fieldGrid}>
            <label htmlFor="mc-name">이름</label>
            <input id="mc-name" ref={nameRef} value={m?.name ?? ''} onChange={change('name')} disabled={off} spellCheck={false} autoComplete="off" />
            <label htmlFor="mc-key">단축키</label>
            <select id="mc-key" value={m?.key ?? ''} onChange={change('key')} disabled={off}>
              {keyOptions(macros, m).map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
            </select>
            <label htmlFor="mc-kind">종류</label>
            <select id="mc-kind" value={m?.kind ?? ''} onChange={change('kind')} disabled={off}>
              <option value="">텍스트 (입력한 것처럼 보내기)</option>
              <option value="lua">Lua 스크립트 (탭에서 실행)</option>
            </select>
            <label htmlFor="mc-text">내용</label>
            <textarea id="mc-text" className={styles.macroText} value={m?.text ?? ''} onChange={change('text')} disabled={off} spellCheck={false} />
            <span />
            <span className={styles.dim}>{lua ? LUA_HINT : TEXT_HINT}</span>
          </div>
        </div>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.primary} title="Enter (목록) / Ctrl+Enter" onClick={send} disabled={off}>{lua ? '실행' : '보내기'}</button>
          <button type="button" onClick={close}>닫기</button>
        </div>
      </div>
    </div>
  )
}
