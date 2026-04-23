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
    const result1 = getQuickJumpTarget(files, 'a', 'a', 1) // matchPos=1 → 'ape.txt'
    expect(result1.fileIdx).toBe(0) // 순환 → 'ant.txt'
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

  it('QJ-08: 빈 파일 목록에서 항상 null을 반환한다', () => {
    const result = getQuickJumpTarget([], 'a', '', 0)
    expect(result).toBeNull()
  })

  it('QJ-09: 단일 항목 목록에서 반복 입력 시 동일 항목을 반환한다', () => {
    const files = makeFiles(['alpha.txt'])
    const result1 = getQuickJumpTarget(files, 'a', '', 0)
    expect(result1).not.toBeNull()
    expect(result1.fileIdx).toBe(0)
    // 같은 글자 다시 입력 → 순환하여 동일 인덱스
    const result2 = getQuickJumpTarget(files, 'a', 'a', result1.matchPos)
    expect(result2.fileIdx).toBe(0)
  })

  it('QJ-10: 파일 이름 중간에만 글자가 있어도 시작 글자로만 매칭한다', () => {
    const files = makeFiles(['readme.txt', 'bold.md', 'changelog.txt'])
    // 'b'는 readme의 중간에 있지만 시작 글자가 아니므로 매칭 안 됨
    // 'b'로 시작하는 파일은 'bold.md'만
    const result = getQuickJumpTarget(files, 'b', '', 0)
    expect(result).not.toBeNull()
    expect(result.fileIdx).toBe(1) // bold.md
  })

  it('QJ-11: 혼합 대소문자 파일명에서 소문자 검색으로 매칭한다', () => {
    const files = makeFiles(['README.md', 'readme.txt', 'SETUP.sh'])
    const result = getQuickJumpTarget(files, 'r', '', 0)
    expect(result).not.toBeNull()
    expect(result.fileIdx).toBe(0) // README.md (첫 번째 r로 시작하는 파일)
  })

  it('QJ-12: matchPos가 목록 범위를 초과해도 안전하게 순환한다', () => {
    const files = makeFiles(['apple.txt', 'ant.txt'])
    // matchPos=99는 범위 초과이지만 % 연산으로 안전하게 처리되어야 함
    const result = getQuickJumpTarget(files, 'a', 'a', 99)
    expect(result).not.toBeNull()
    // (99 + 1) % 2 = 0
    expect(result.matchPos).toBe(0)
  })
})
