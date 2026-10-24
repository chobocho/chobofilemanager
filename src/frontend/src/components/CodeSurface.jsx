import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { EditorState, EditorSelection, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view'
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands'
import { syntaxHighlighting } from '@codemirror/language'
import { classHighlighter } from '@lezer/highlight'
import { loadLanguage, MAX_HIGHLIGHT_LENGTH } from './codeLanguages.js'

// CodeMirror 6 기반 텍스트 영역 (Todo #110).
// 화면에 보이는 줄만 DOM으로 그리고 문서를 트리 구조로 관리해, 큰 파일에서도 키 입력 비용이 파일 크기에 비례하지 않음.
// 부모는 매 키 입력마다 전체 문자열을 받지 않고, 필요할 때(저장/검색) ref API로 텍스트를 가져감.

// Tab: 선택 영역을 공백 2칸으로 교체 (기존 textarea 에디터와 동일 동작)
const insertTwoSpaces = (view) => {
  if (view.state.readOnly) return false
  view.dispatch(view.state.changeByRange(range => ({
    changes: { from: range.from, to: range.to, insert: '  ' },
    range: EditorSelection.cursor(range.from + 2),
  }), { userEvent: 'input' }))
  return true
}

function baseTheme(fontSize) {
  return EditorView.theme({
    '&': { height: '100%', fontSize: `${fontSize}px`, backgroundColor: 'transparent', color: 'var(--text-primary)' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55' },
    '.cm-content': { caretColor: 'var(--accent)' },
    '.cm-gutters': { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-dim)', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgba(128,128,128,0.08)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(128,128,128,0.12)' },
    '&.cm-focused': { outline: 'none' },
  })
}

const CodeSurface = forwardRef(function CodeSurface(
  { text, readOnly = false, fontSize = 13, wordWrap = false, language = null, onDocChange, onSelectionChange, className },
  ref,
) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const themeComp = useRef(new Compartment())
  const wrapComp = useRef(new Compartment())
  const langComp = useRef(new Compartment())
  const langExtRef = useRef([]) // 현재 적용된 언어 확장 (문서 교체 시 유지)
  const callbacks = useRef({ onDocChange, onSelectionChange })
  callbacks.current = { onDocChange, onSelectionChange }

  const makeState = (doc) => EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      history(),
      keymap.of([{ key: 'Tab', run: insertTwoSpaces }, ...historyKeymap, ...defaultKeymap]),
      // 읽기 전용이어도 편집 가능(포커스·커서·키보드 탐색·선택 복사) 상태는 유지, 내용 변경만 막음
      EditorState.readOnly.of(readOnly),
      themeComp.current.of(baseTheme(fontSize)),
      wrapComp.current.of(wordWrap ? EditorView.lineWrapping : []),
      // Todo #113: 구문 강조 — 토큰에 tok-* 클래스를 붙이고 색은 테마 CSS 변수로 지정
      langComp.current.of(langExtRef.current),
      syntaxHighlighting(classHighlighter),
      EditorView.updateListener.of(update => {
        if (update.docChanged) callbacks.current.onDocChange?.(update.state.doc)
        if (update.selectionSet || update.docChanged) callbacks.current.onSelectionChange?.(update.state)
      }),
    ],
  })

  // 생성 / 파기
  useEffect(() => {
    const view = new EditorView({ state: makeState(text), parent: hostRef.current })
    view.dom.setAttribute('data-text-surface', '')
    viewRef.current = view
    return () => { view.destroy(); viewRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 새 텍스트(다른 파일/인코딩으로 다시 읽음) → 문서와 실행 취소 기록을 교체
  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === text) return
    view.setState(makeState(text))
    view.dom.setAttribute('data-text-surface', '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeComp.current.reconfigure(baseTheme(fontSize)) })
  }, [fontSize])

  // 언어 확장을 필요할 때 불러와 적용. 너무 큰 문서는 구문 분석 생략
  useEffect(() => {
    let cancelled = false
    const apply = (ext) => {
      langExtRef.current = ext
      viewRef.current?.dispatch({ effects: langComp.current.reconfigure(ext) })
    }
    if (!language || text.length > MAX_HIGHLIGHT_LENGTH) {
      apply([])
      return
    }
    loadLanguage(language)
      .then(ext => { if (!cancelled) apply(ext || []) })
      .catch(() => { if (!cancelled) apply([]) })
    return () => { cancelled = true }
  }, [language, text])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: wrapComp.current.reconfigure(wordWrap ? EditorView.lineWrapping : []) })
  }, [wordWrap])

  useImperativeHandle(ref, () => ({
    view: () => viewRef.current,
    getText: () => viewRef.current?.state.doc.toString() ?? '',
    getDoc: () => viewRef.current?.state.doc,
    getSelection: () => {
      const r = viewRef.current?.state.selection.main
      return r ? [r.from, r.to] : [0, 0]
    },
    // 선택 + 해당 위치를 화면 1/3 지점으로 스크롤 (검색 결과 표시)
    select: (from, to = from) => {
      const view = viewRef.current
      if (!view) return
      view.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: 'start', yMargin: view.dom.clientHeight / 3 }) })
    },
    focus: () => viewRef.current?.focus(),
    get dom() { return viewRef.current?.dom ?? null },
  }), [])

  return <div ref={hostRef} className={className} style={{ height: '100%', overflow: 'hidden' }} />
})

export default CodeSurface
