// 뷰어/에디터의 텍스트 영역을 조작하는 테스트 드라이버 (Todo #108).
//
// 테스트가 <textarea> 구현에 직접 의존하지 않도록 이 모듈을 통해서만 텍스트/선택/입력을 다룹니다.
// 텍스트 영역 구현을 바꿀 때(CodeMirror 6 등)는 이 파일만 새 구현에 맞게 고치면
// 뷰어/에디터 동작 테스트는 그대로 유지됩니다.
//
// 현재 구현: [data-text-surface] 속성이 붙은 <textarea>
import { fireEvent, waitFor } from '@testing-library/react'

export const SURFACE_SELECTOR = '[data-text-surface]'

// 텍스트 영역 요소 (없으면 null)
export function getSurface(root = document) {
  return root.querySelector(SURFACE_SELECTOR)
}

// 내용이 text인 텍스트 영역이 나타날 때까지 대기
export async function findSurfaceWithText(text, root = document) {
  let found = null
  await waitFor(() => {
    const el = getSurface(root)
    if (!el || textOf(el) !== text) throw new Error(`text surface with ${JSON.stringify(text)} not found`)
    found = el
  })
  return found
}

// 내용이 text인 텍스트 영역이 있으면 반환, 없으면 null
export function querySurfaceWithText(text, root = document) {
  const el = getSurface(root)
  return el && textOf(el) === text ? el : null
}

export function textOf(el) {
  return el.value
}

export function isReadOnly(el) {
  return el.readOnly === true
}

// [from, to]
export function selectionOf(el) {
  return [el.selectionStart, el.selectionEnd]
}

// 선택 영역 변경 + 사용자가 커서를 옮긴 것처럼 알림 (상태 표시줄 Ln/Col 갱신 등)
export function select(el, from, to = from) {
  el.setSelectionRange(from, to)
  fireEvent.keyUp(el, { key: 'ArrowRight' })
}

// 알림 없이 선택만 변경 (검색 시작 위치 지정 등)
export function setSelectionQuiet(el, from, to = from) {
  el.setSelectionRange(from, to)
}

// 사용자가 전체 내용을 value로 편집한 것과 같은 효과
export function typeText(el, value) {
  fireEvent.change(el, { target: { value } })
}

// 텍스트 영역 안에서 키 입력 (Tab 들여쓰기 등)
export function keyIn(el, init) {
  fireEvent.keyDown(el, init)
}

// 커서 이동 키를 뗀 것처럼 알림 (선택 변경 후 상태 표시줄 갱신)
export function notifyCursor(el, init = { key: 'ArrowRight' }) {
  fireEvent.keyUp(el, init)
}

// 텍스트 영역 클릭 (커서 위치 알림)
export function clickIn(el) {
  fireEvent.click(el)
}
