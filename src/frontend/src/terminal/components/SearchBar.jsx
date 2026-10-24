import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { sessionById } from '../core/session'
import styles from '../styles/Terminal.module.css'

// 터미널 검색 (Todo #120, choboTerm search.ts): Enter 다음 · Shift+Enter 이전 · Esc 닫기
export default function SearchBar({ tabId, onClose }) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const [noMatch, setNoMatch] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function find(backwards) {
    const s = sessionById(tabId)
    if (!s || !query) return
    setNoMatch(!s.find(query, backwards, { caseSensitive, regex }))
  }

  function close() {
    const s = sessionById(tabId)
    s?.clearSearch()
    onClose()
    s?.focus()
  }

  function onKeyDown(e) {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'Enter') { e.preventDefault(); find(e.shiftKey) }
  }

  return (
    <div className={styles.searchBar} onKeyDown={onKeyDown}>
      <input ref={inputRef} value={query} placeholder="터미널 검색" spellCheck={false}
        onChange={e => { setQuery(e.target.value); setNoMatch(false) }} />
      <label title="대소문자 구분"><input type="checkbox" checked={caseSensitive} onChange={e => setCaseSensitive(e.target.checked)} />Aa</label>
      <label title="정규식"><input type="checkbox" checked={regex} onChange={e => setRegex(e.target.checked)} />.*</label>
      {noMatch && <span className={styles.noMatch}>없음</span>}
      <button type="button" className={styles.iconBtn} title="이전 (Shift+Enter)" onClick={() => find(true)}><ChevronUp size={13} /></button>
      <button type="button" className={styles.iconBtn} title="다음 (Enter)" onClick={() => find(false)}><ChevronDown size={13} /></button>
      <button type="button" className={styles.iconBtn} title="닫기 (Esc)" onClick={close}><X size={13} /></button>
    </div>
  )
}
