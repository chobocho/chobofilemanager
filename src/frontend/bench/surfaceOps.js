// 벤치마크용 텍스트 영역 조작 (Todo #109, #110).
// 테스트 드라이버(src/test/textSurface.js)와 같은 역할 — 텍스트 영역 구현을 바꾸면 이 파일도 함께 수정.
// 지원 구현: <textarea>, CodeMirror 6 (EditorView 루트)
import { EditorView } from '@codemirror/view'

export const SURFACE_SELECTOR = '[data-text-surface]'

function cmView(el) {
  return el && el.tagName !== 'TEXTAREA' ? EditorView.findFromDOM(el) : null
}

export function getSurface() {
  return document.querySelector(SURFACE_SELECTOR)
}

export function textLength(el) {
  const view = cmView(el)
  return view ? view.state.doc.length : el.value.length
}

// 커서 위치 pos에 한 글자 입력 (실제 사용자 입력과 같은 경로)
export function typeCharAt(el, pos, ch) {
  const view = cmView(el)
  if (view) {
    view.dispatch({ changes: { from: pos, insert: ch }, selection: { anchor: pos + 1 }, userEvent: 'input.type' })
    return
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  const v = el.value
  setter.call(el, v.slice(0, pos) + ch + v.slice(pos))
  el.setSelectionRange(pos + 1, pos + 1)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

export function scrollToRatio(el, ratio) {
  const view = cmView(el)
  const scroller = view ? view.scrollDOM : el
  scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) * ratio
  scroller.dispatchEvent(new Event('scroll'))
}
