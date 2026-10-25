// 뷰어·에디터의 찾기 (Todo #126): 대소문자 무시, 끝에서 처음으로(처음에서 끝으로) 돌아감.
// lower는 소문자로 바꿔 둔 문서 전체 (큰 파일에서 찾을 때마다 바꾸지 않도록 부르는 쪽이 보관),
// from은 CodeMirror 선택 위치. 찾은 시작 위치, 없으면 -1

/** 다음: from(선택 끝)부터, 없으면 처음부터 */
export function findForward(lower, query, from) {
  if (!query) return -1
  const q = query.toLowerCase()
  let i = lower.indexOf(q, from)
  if (i === -1 && from > 0) i = lower.indexOf(q, 0)
  return i
}

/** 이전: selStart(선택 시작) 앞에서. 맨 앞(0)이면 lastIndexOf(q, 0)이 같은 곳을 다시 찾으므로 바로 끝에서부터 (Todo #107) */
export function findBackward(lower, query, selStart) {
  if (!query) return -1
  const q = query.toLowerCase()
  let i = selStart > 0 ? lower.lastIndexOf(q, selStart - 1) : -1
  if (i === -1) i = lower.lastIndexOf(q)
  return i
}
