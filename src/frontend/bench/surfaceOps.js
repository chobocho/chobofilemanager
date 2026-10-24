// 벤치마크용 텍스트 영역 조작 (Todo #109).
// 테스트 드라이버(src/test/textSurface.js)와 같은 역할 — 텍스트 영역 구현을 바꾸면 이 파일도 함께 수정.
// 현재 구현: [data-text-surface] <textarea>

export const SURFACE_SELECTOR = '[data-text-surface]'

export function getSurface() {
  return document.querySelector(SURFACE_SELECTOR)
}

export function textLength(el) {
  return el.value.length
}

// 커서 위치 pos에 한 글자 입력 (실제 사용자 입력과 같은 이벤트 경로: input 이벤트 → React onChange)
export function typeCharAt(el, pos, ch) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  const v = el.value
  setter.call(el, v.slice(0, pos) + ch + v.slice(pos))
  el.setSelectionRange(pos + 1, pos + 1)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

export function scrollToRatio(el, ratio) {
  el.scrollTop = (el.scrollHeight - el.clientHeight) * ratio
  el.dispatchEvent(new Event('scroll'))
}
