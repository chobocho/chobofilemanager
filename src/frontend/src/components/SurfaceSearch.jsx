import React, { useCallback, useRef, useState } from 'react'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react'
import { findForward, findBackward } from '../utils/textSearch'

// 뷰어(F3)·에디터(F4)의 Ctrl+F 찾기 (Todo #126): 두 곳에 같던 상태·찾기·키·막대를 하나로.
// getLower: 소문자로 바꿔 둔 문서 전체 (부르는 쪽이 보관 — 큰 파일에서 찾을 때마다 바꾸지 않도록)
export function useSurfaceSearch(surfaceRef, getLower) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [noMatch, setNoMatch] = useState(false)
  const searchInputRef = useRef(null)
  const lowerRef = useRef(getLower)
  lowerRef.current = getLower

  const showNoMatch = useCallback(() => {
    setNoMatch(true)
    setTimeout(() => setNoMatch(false), 600)
  }, [])

  const find = useCallback((backward) => {
    const surface = surfaceRef.current
    if (!surface || !searchQuery) return
    const lower = lowerRef.current()
    const [from, to] = surface.getSelection()
    const i = backward ? findBackward(lower, searchQuery, from) : findForward(lower, searchQuery, to)
    if (i === -1) { showNoMatch(); return }
    surface.select(i, i + searchQuery.length)
  }, [searchQuery, showNoMatch, surfaceRef])

  const findNext = useCallback(() => find(false), [find])
  const findPrev = useCallback(() => find(true), [find])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setNoMatch(false)
    surfaceRef.current?.focus()
  }, [surfaceRef])

  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeSearch()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (e.shiftKey) findPrev()
      else findNext()
    }
  }, [findNext, findPrev, closeSearch])

  return { searchOpen, setSearchOpen, searchQuery, setSearchQuery, noMatch, setNoMatch, searchInputRef,
    findNext, findPrev, closeSearch, handleSearchKeyDown }
}

// 찾기 막대. styles: 쓰는 쪽의 CSS 모듈 (FileViewer / TextEditor — 같은 클래스 이름)
export function SurfaceSearchBar({ search, styles }) {
  const { searchQuery, setSearchQuery, noMatch, setNoMatch, searchInputRef, handleSearchKeyDown, findPrev, findNext, closeSearch } = search
  return (
    <div className={styles.searchBar}>
      <Search size={12} className={styles.searchIcon} />
      <input
        ref={searchInputRef}
        type="text"
        className={`${styles.searchInput} ${noMatch ? styles.searchNoMatch : ''}`}
        value={searchQuery}
        onChange={e => { setSearchQuery(e.target.value); setNoMatch(false) }}
        onKeyDown={handleSearchKeyDown}
        placeholder="검색... (Enter: 다음  Shift+Enter: 이전)"
      />
      <button className={styles.searchBtn} onClick={findPrev} title="이전 (Shift+Enter)">
        <ChevronUp size={13} />
      </button>
      <button className={styles.searchBtn} onClick={findNext} title="다음 (Enter)">
        <ChevronDown size={13} />
      </button>
      <button className={styles.searchBtnClose} onClick={closeSearch} title="닫기 (Esc)">
        <X size={13} />
      </button>
    </div>
  )
}
