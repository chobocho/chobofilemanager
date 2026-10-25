import { describe, it, expect } from 'vitest'
import { findForward, findBackward } from './textSearch'

// ─── Todo #126: 뷰어·에디터가 함께 쓰는 찾기 (대소문자 무시, 끝에서 처음으로 돌아감) ──

describe('textSearch (TS)', () => {
  const lower = 'abc ABC abc'.toLowerCase() // 부르는 쪽이 소문자로 보관한 문서

  it('TS-01: 다음 — 선택 끝부터, 없으면 처음부터, 찾는 말은 대소문자 무시', () => {
    expect(findForward(lower, 'abc', 0)).toBe(0)
    expect(findForward(lower, 'abc', 3)).toBe(4)
    expect(findForward(lower, 'ABC', 9)).toBe(0) // 돌아감
    expect(findForward(lower, 'zz', 0)).toBe(-1)
    expect(findForward(lower, '', 0)).toBe(-1)
  })

  it('TS-02: 이전 — 선택 앞에서, 맨 앞이면 끝에서부터 (Todo #107)', () => {
    expect(findBackward(lower, 'abc', 8)).toBe(4)
    expect(findBackward(lower, 'Abc', 4)).toBe(0)
    expect(findBackward(lower, 'abc', 0)).toBe(8)
    expect(findBackward(lower, 'zz', 5)).toBe(-1)
  })
})
