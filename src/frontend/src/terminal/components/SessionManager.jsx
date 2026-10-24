import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { termApi } from '../core/termApi'
import { filterSessions, sessionRows, sessionMeta, groupsOf, importMessage, fieldsToSaved, blankSession } from '../core/sessions'
import { ENCODINGS } from '../core/connect'
import { useTermStore } from '../store/termStore'
import styles from '../styles/Terminal.module.css'

// 세션 관리자 (Ctrl+Shift+H, Todo #121, choboTerm sessions.ts).
// 고친 내용은 잠시 뒤(또는 다른 세션을 고르거나 닫을 때) 저장됩니다.

const EMPTY = { name: '', group: '', host: '', port: '', login: '', pass: '', savePass: false, encoding: 'UTF-8', jump: '' }
const SAVE_DELAY = 600

// 비동기 처리 중에도 최신 값을 읽도록 상태를 ref에도 둠
function useRefState(init) {
  const [v, setV] = useState(init)
  const ref = useRef(v)
  const set = (next) => {
    ref.current = typeof next === 'function' ? next(ref.current) : next
    setV(ref.current)
  }
  return [v, set, ref]
}

const shownOf = (all, filter, draft) => {
  const list = filterSessions(all, filter)
  return draft ? [...list, draft] : list
}

export default function SessionManager() {
  const [all, setAll, allRef] = useRefState([])
  const [filter, setFilter, filterRef] = useRefState('')
  const [draft, setDraft, draftRef] = useRefState(null) // 추가한, 아직 저장 안 한 세션 (id '')
  const [sel, setSel, selRef] = useRefState(undefined)
  const [form, setForm, formRef] = useRefState(EMPTY)
  const [msg, setMsg] = useState({ text: '', ok: false })
  const [confirm, setConfirm] = useState(null)
  const [more, setMore] = useState(false)
  const dirty = useRef(false)
  const timer = useRef(0)
  const listRef = useRef(null)
  const nameRef = useRef(null)
  const hostRef = useRef(null)

  const shown = shownOf(all, filter, draft)
  const current = shown.find(x => x.id === sel)
  const currentNow = () => shownOf(allRef.current, filterRef.current, draftRef.current).find(x => x.id === selRef.current)
  const say = (text, ok = false) => setMsg({ text, ok })

  useEffect(() => {
    reload().then(list => choose(list[0]))
    listRef.current?.focus()
    const hide = () => setMore(false)
    window.addEventListener('mousedown', hide)
    return () => { window.removeEventListener('mousedown', hide); clearTimeout(timer.current) }
  }, [])

  async function reload() {
    const list = (await Promise.resolve(termApi.GetSessions()).catch(() => [])) ?? []
    setAll(list)
    return list
  }

  function fill(x) {
    setForm(x ? {
      name: x.name ?? '', group: x.group ?? '', host: x.host ?? '', port: x.port > 0 ? String(x.port) : '', login: x.login ?? '',
      pass: x.pass ?? '', savePass: !!x.pass, encoding: x.encoding || 'UTF-8', jump: x.jump ?? '',
    } : EMPTY)
    say('')
  }

  function choose(x) {
    dirty.current = false
    setSel(x?.id)
    fill(x)
  }

  // 고친 내용을 저장. false: 저장 못 함(그대로 머묾), null: 고친 것 없음, 아니면 저장된 세션
  async function flush() {
    clearTimeout(timer.current)
    const x = currentNow()
    if (!dirty.current || !x) return null
    const f = formRef.current
    if (!f.host.trim()) { say('Host를 입력하세요'); return false }
    dirty.current = false
    try {
      const saved = await termApi.SaveSession(fieldsToSaved(f, x.id), f.savePass)
      say('')
      if (x.id === '') setDraft(null)
      await reload()
      if (selRef.current === x.id) setSel(saved.id)
      return saved
    } catch (e) {
      say(String(e?.message ?? e))
      return false
    }
  }

  function edit(patch) {
    setForm(f => ({ ...f, ...patch }))
    dirty.current = true
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY)
  }

  async function select(x) {
    if (x && x.id === selRef.current) return
    if ((await flush()) === false) return
    choose(x && (shownOf(allRef.current, filterRef.current, draftRef.current).find(o => o.id === x.id) ?? x))
  }

  function step(d) {
    const list = shownOf(allRef.current, filterRef.current, draftRef.current)
    if (!list.length) return
    const i = list.findIndex(x => x.id === selRef.current)
    select(list[Math.max(0, Math.min(list.length - 1, i + d))])
  }

  async function onFilter(v) {
    setFilter(v)
    const list = shownOf(allRef.current, v, draftRef.current)
    if (!list.some(x => x.id === selRef.current)) await select(list[0])
  }

  async function add() {
    if ((await flush()) === false) return
    const d = blankSession()
    setDraft(d)
    setFilter('')
    choose(d)
    setTimeout(() => hostRef.current?.focus())
  }

  async function duplicate() {
    if ((await flush()) === false) return
    const x = currentNow()
    if (!x?.id) return
    try {
      const copy = await termApi.SaveSession({ ...x, id: '', name: `${x.name} (복사)` }, !!x.pass)
      const list = await reload()
      choose(list.find(o => o.id === copy.id) ?? copy)
      setTimeout(() => { nameRef.current?.focus(); nameRef.current?.select() })
    } catch (e) {
      say(String(e?.message ?? e))
    }
  }

  function askRemove() {
    const x = currentNow()
    if (!x) return
    if (x.id) setConfirm(x)
    else remove(x)
  }

  async function remove(x) {
    setConfirm(null)
    clearTimeout(timer.current)
    dirty.current = false
    const i = shownOf(allRef.current, filterRef.current, draftRef.current).findIndex(o => o.id === x.id)
    try {
      if (x.id) await termApi.DeleteSession(x.id)
    } catch (e) {
      say(String(e?.message ?? e))
      return
    }
    if (x.id === '') setDraft(null)
    await reload()
    const list = shownOf(allRef.current, filterRef.current, draftRef.current)
    choose(list[Math.min(i, list.length - 1)])
    listRef.current?.focus()
  }

  async function close() {
    await flush()
    useTermStore.getState().closeSessionManager()
  }

  async function run(list) {
    await close()
    useTermStore.getState().openSessions(list)
  }

  async function openSelected() {
    if ((await flush()) === false) return
    const x = currentNow()
    if (x?.id) run([x])
  }

  async function openGroup() {
    if ((await flush()) === false) return
    const g = currentNow()?.group
    if (g) run(allRef.current.filter(x => x.group === g))
  }

  async function moreAction(act) {
    setMore(false)
    if ((await flush()) === false) return
    try {
      if (act === 'export') {
        const p = await termApi.ExportSessions()
        if (p) say(`${allRef.current.length}개를 내보냈습니다: ${p}`, true)
      } else {
        const r = await (act === 'putty' ? termApi.ImportPuTTY() : termApi.ImportSessions())
        const text = importMessage(r)
        if (!text) return
        const list = await reload()
        choose(list[0])
        say(text, true)
      }
    } catch (e) {
      say(String(e?.message ?? e))
    }
    listRef.current?.focus()
  }

  function onListKey(e) {
    const list = shownOf(allRef.current, filterRef.current, draftRef.current)
    switch (e.key) {
      case 'ArrowDown': step(1); break
      case 'ArrowUp': step(-1); break
      case 'Home': select(list[0]); break
      case 'End': select(list[list.length - 1]); break
      case 'Enter': openSelected(); break
      case 'Delete': askRemove(); break
      case 'Insert': add(); break
      case 'F2': nameRef.current?.focus(); nameRef.current?.select(); break
      default: return
    }
    e.preventDefault()
  }

  function onKeyDown(e) {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      if (confirm) setConfirm(null)
      else if (more) setMore(false)
      else close()
    } else if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      openSelected()
    }
  }

  const off = !current
  const group = current?.id ? current.group : ''
  const text = (k, extra = {}) => ({ value: form[k], disabled: off, onChange: e => edit({ [k]: e.target.value }), spellCheck: false, autoComplete: 'off', ...extra })

  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.dialog} ${styles.sessionManager}`} role="dialog" aria-label="세션 관리" onKeyDown={onKeyDown}>
        <div className={styles.dialogHeader}>
          <span>세션 관리</span>
          <button type="button" className={styles.iconBtn} title="닫기 (Esc)" onClick={close}><X size={13} /></button>
        </div>
        <div className={styles.smCols}>
          <div className={styles.smLeft}>
            <input value={filter} onChange={e => onFilter(e.target.value)} placeholder="찾기 (이름 · 주소 · 그룹)" spellCheck={false} autoComplete="off"
              onKeyDown={e => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); step(e.key === 'ArrowDown' ? 1 : -1) }
                else if (e.key === 'Enter') { e.preventDefault(); openSelected() }
              }} />
            <ul ref={listRef} className={styles.smList} role="listbox" aria-label="세션 목록" tabIndex={0} onKeyDown={onListKey}>
              {sessionRows(shown).map((r, i) => (r.head
                ? <li key={`h${i}`} role="presentation" className={styles.smHead}>{r.head}</li>
                : (
                  <li key={r.session.id || 'new'} role="option" aria-selected={r.session.id === sel}
                    className={r.session.id === sel ? styles.smSel : ''}
                    onMouseDown={e => { e.preventDefault(); select(r.session); listRef.current?.focus() }}
                    onDoubleClick={openSelected}>
                    {r.session.name || r.session.host || '(새 세션)'}
                    <span className={styles.dim}>{sessionMeta(r.session)}</span>
                  </li>
                )))}
              {shown.length === 0 && (
                <li className={styles.smEmpty}>
                  {all.length === 0
                    ? '저장된 세션이 없습니다. + 추가로 만들거나, 접속 창의 ☆ 저장(Alt+S)이나 탭 메뉴의 "세션으로 저장"으로 저장하세요.'
                    : '찾는 세션이 없습니다.'}
                </li>
              )}
            </ul>
            <div className={styles.smListBtns}>
              <button type="button" title="Insert" onClick={add}>+ 추가</button>
              <button type="button" onClick={duplicate} disabled={!current?.id}>복제</button>
              <button type="button" title="Delete" onClick={askRemove} disabled={off}>삭제</button>
            </div>
          </div>
          <div className={styles.fieldGrid}>
            <label htmlFor="sm-name">이름</label>
            <input id="sm-name" ref={nameRef} title="F2" {...text('name')} />
            <label htmlFor="sm-group">그룹</label>
            <input id="sm-group" list="sm-groups" placeholder="비우면 그룹 없음" {...text('group')} />
            <datalist id="sm-groups">{groupsOf(all).map(g => <option key={g} value={g} />)}</datalist>
            <label htmlFor="sm-host">Host</label>
            <input id="sm-host" ref={hostRef} placeholder="주소, ssh config 이름, cmd · wsl" {...text('host')} />
            <label htmlFor="sm-port">Port</label>
            <input id="sm-port" inputMode="numeric" {...text('port')} onChange={e => edit({ port: e.target.value.replace(/\D/g, '') })} />
            <label htmlFor="sm-login">Login</label>
            <input id="sm-login" {...text('login')} />
            <label htmlFor="sm-jump">Jump</label>
            <input id="sm-jump" placeholder="SSH 점프 호스트 (선택) 예: user@bastion" {...text('jump')} />
            <label htmlFor="sm-pass">Pass</label>
            {/* 비밀번호를 입력하면 저장하려는 것, 지우면 저장 안 함 */}
            <input id="sm-pass" type="password" {...text('pass')} onChange={e => edit({ pass: e.target.value, savePass: e.target.value !== '' })} />
            <span />
            <label className={styles.check}>
              <input type="checkbox" checked={form.savePass} disabled={off} onChange={e => edit({ savePass: e.target.checked })} />
              비밀번호 저장 (Windows 사용자 계정으로 암호화)
            </label>
            <label htmlFor="sm-code">Code</label>
            <select id="sm-code" value={form.encoding} disabled={off} onChange={e => edit({ encoding: e.target.value })}>
              {ENCODINGS.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </div>
        {msg.text && <div className={msg.ok ? styles.okMsg : styles.error} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div>}
        <div className={styles.dialogActions}>
          <button type="button" title="이 그룹의 세션을 모두 새 탭으로 엽니다" onClick={openGroup} disabled={!group}>
            {group ? `"${group}" 전체 열기` : '그룹 전체 열기'}
          </button>
          <span className={styles.smMoreBox}>
            <button type="button" title="가져오기 / 내보내기" onMouseDown={e => e.stopPropagation()} onClick={() => setMore(m => !m)}>가져오기 · 내보내기 ▾</button>
            {more && (
              <ul role="menu" className={`${styles.menu} ${styles.smMenu}`} onMouseDown={e => e.stopPropagation()}>
                <li role="menuitem" className={styles.menuItem} onClick={() => moreAction('putty')}>PuTTY 세션 가져오기</li>
                <li role="menuitem" className={styles.menuItem} onClick={() => moreAction('import')}>파일에서 가져오기...</li>
                <li role="menuitem" className={styles.menuItem} onClick={() => moreAction('export')}>파일로 내보내기... (비밀번호 제외)</li>
              </ul>
            )}
          </span>
          <button type="button" className={styles.primary} title="Enter (목록)" onClick={openSelected} disabled={!current?.id}>접속</button>
          <button type="button" onClick={close}>닫기</button>
        </div>
        {confirm && (
          <div className={styles.modalOverlay}>
            <div className={styles.dialog} role="alertdialog" aria-label="세션 삭제">
              <div className={styles.dialogHeader}><span>세션 삭제</span></div>
              <div className={styles.message}>{`'${confirm.name}' 세션을 지울까요?`}</div>
              <div className={styles.dialogActions}>
                <button type="button" onClick={() => setConfirm(null)}>취소</button>
                <button type="button" className={styles.primary} autoFocus onClick={() => remove(confirm)}>지우기</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
