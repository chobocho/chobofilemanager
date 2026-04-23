import { describe, it, expect } from 'vitest'
import { getQuickJumpTarget } from './FilePanel.jsx'

const makeFiles = (names) => names.map(n => ({ name: n }))

// ─── getQuickJumpTarget ────────────────────────────────────────────────────────

describe('getQuickJumpTarget', () => {
  it('QJ-01: 해당 글자로 시작하는 첫 번째 파일 인덱스를 반환한다', () => {
    const files = makeFiles(['alpha.txt', 'beta.txt', 'gamma.txt'])
    const result = getQuickJumpTarget(files, 'b', '', 0)
    expect(result).not.toBeNull()
    expect(result.fileIdx).toBe(1)
    expect(result.matchPos).toBe(0)
  })

  it('QJ-02: 같은 글자 반복 입력 시 다음 파일로 이동한다', () => {
    const files = makeFiles(['apple.txt', 'avocado.txt', 'banana.txt'])
    const result1 = getQuickJumpTarget(files, 'a', '', 0)
    expect(result1.fileIdx).toBe(0)
    const result2 = getQuickJumpTarget(files, 'a', 'a', result1.matchPos)
    expect(result2.fileIdx).toBe(1)
  })

  it('QJ-03: 마지막 항목에서 반복 입력 시 처음으로 돌아온다', () => {
    const files = makeFiles(['ant.txt', 'ape.txt', 'banana.txt'])
    const result1 = getQuickJumpTarget(files, 'a', 'a', 1)  // matchPos=1 is 'ape.txt'
    expect(result1.fileIdx).toBe(0)  // wraps to 'ant.txt'
  })

  it('QJ-04: 매칭 파일이 없으면 null을 반환한다', () => {
    const files = makeFiles(['alpha.txt', 'beta.txt'])
    const result = getQuickJumpTarget(files, 'z', '', 0)
    expect(result).toBeNull()
  })

  it('QJ-05: 대문자로 입력해도 대소문자 무관하게 동작한다', () => {
    const files = makeFiles(['Alpha.txt', 'Beta.txt'])
    const result = getQuickJumpTarget(files, 'A', '', 0)
    expect(result).not.toBeNull()
    expect(result.fileIdx).toBe(0)
  })

  it('QJ-06: 숫자 키로도 동작한다', () => {
    const files = makeFiles(['123abc.txt', 'alpha.txt', '456def.txt'])
    const result = getQuickJumpTarget(files, '1', '', 0)
    expect(result).not.toBeNull()
    expect(result.fileIdx).toBe(0)
  })

  it('QJ-07: 특수문자는 null을 반환한다', () => {
    const files = makeFiles(['alpha.txt'])
    const result = getQuickJumpTarget(files, '-', '', 0)
    expect(result).toBeNull()
  })
})
