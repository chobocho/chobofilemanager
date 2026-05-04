import { describe, it, expect } from 'vitest'
import { sortBookmarks, nextSortMode, SORT_MODES, SORT_MODE_LABELS } from './BookmarkDialog.jsx'

const makeBookmarks = (entries) => entries.map(([name, path], i) => ({
  id: i + 1, name, path, isFile: false,
}))

// ─── sortBookmarks ────────────────────────────────────────────────────────────

describe('sortBookmarks', () => {
  it('BMS-01: name-asc 는 이름 오름차순', () => {
    const bms = makeBookmarks([['gamma', '/c'], ['alpha', '/a'], ['beta', '/b']])
    const sorted = sortBookmarks(bms, 'name-asc')
    expect(sorted.map(b => b.name)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('BMS-02: name-desc 는 이름 내림차순', () => {
    const bms = makeBookmarks([['alpha', '/a'], ['beta', '/b'], ['gamma', '/c']])
    const sorted = sortBookmarks(bms, 'name-desc')
    expect(sorted.map(b => b.name)).toEqual(['gamma', 'beta', 'alpha'])
  })

  it('BMS-03: path-asc 는 경로 오름차순', () => {
    const bms = makeBookmarks([['x', '/c/x'], ['x', '/a/x'], ['x', '/b/x']])
    const sorted = sortBookmarks(bms, 'path-asc')
    expect(sorted.map(b => b.path)).toEqual(['/a/x', '/b/x', '/c/x'])
  })

  it('BMS-04: path-desc 는 경로 내림차순', () => {
    const bms = makeBookmarks([['x', '/a/x'], ['x', '/c/x'], ['x', '/b/x']])
    const sorted = sortBookmarks(bms, 'path-desc')
    expect(sorted.map(b => b.path)).toEqual(['/c/x', '/b/x', '/a/x'])
  })

  it('BMS-05: 알 수 없는 모드는 입력 그대로 반환 (안전 폴백)', () => {
    const bms = makeBookmarks([['c', '/c'], ['a', '/a'], ['b', '/b']])
    const sorted = sortBookmarks(bms, 'klingon')
    expect(sorted.map(b => b.name)).toEqual(['c', 'a', 'b'])
  })

  it('BMS-06: 빈 배열도 안전하게 처리', () => {
    expect(sortBookmarks([], 'name-asc')).toEqual([])
  })

  it('BMS-07: 원본 배열을 변경하지 않음 (immutable)', () => {
    const bms = makeBookmarks([['c', '/c'], ['a', '/a']])
    const original = [...bms]
    sortBookmarks(bms, 'name-asc')
    expect(bms).toEqual(original)
  })

  it('BMS-08: 대소문자는 무시 (case-insensitive)', () => {
    const bms = makeBookmarks([['Beta', '/b'], ['alpha', '/a'], ['CHARLIE', '/c']])
    const sorted = sortBookmarks(bms, 'name-asc')
    expect(sorted.map(b => b.name)).toEqual(['alpha', 'Beta', 'CHARLIE'])
  })
})

// ─── nextSortMode ─────────────────────────────────────────────────────────────

describe('nextSortMode', () => {
  it('BMNX-01: SORT_MODES 첫 항목은 name-asc (기본)', () => {
    expect(SORT_MODES[0]).toBe('name-asc')
  })

  it('BMNX-02: SORT_MODES는 4개 항목', () => {
    expect(SORT_MODES).toHaveLength(4)
  })

  it('BMNX-03: SORT_MODE_LABELS는 모든 모드의 한국어 라벨을 가진다', () => {
    for (const m of SORT_MODES) {
      expect(SORT_MODE_LABELS[m]).toBeTruthy()
    }
  })

  it('BMNX-04: 마지막 → 첫 번째로 순환', () => {
    const last = SORT_MODES[SORT_MODES.length - 1]
    expect(nextSortMode(last)).toBe(SORT_MODES[0])
  })

  it('BMNX-05: 알 수 없는 모드는 첫 항목(name-asc)으로 폴백', () => {
    expect(nextSortMode('klingon')).toBe('name-asc')
  })

  it('BMNX-06: name-asc → name-desc', () => {
    expect(nextSortMode('name-asc')).toBe('name-desc')
  })
})
