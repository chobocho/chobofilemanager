import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import FilePanel, { findQuickSearch } from './FilePanel.jsx'
import { useFileStore } from '../stores/fileStore'

// Todo #133-3: Alt+글자 빠른 검색 (Total Commander와 같게)

vi.mock('../wailsjs/runtime', () => ({ default: { SaveSessionState: vi.fn(() => Promise.resolve()) } }))

const h = React.createElement
Element.prototype.scrollIntoView = vi.fn()
const initial = useFileStore.getState()

const f = (name, extra = {}) => ({
  name, path: `/d/${name}`, isDir: false, isHidden: false, size: 1, modified: '',
  extension: name.includes('.') ? '.' + name.split('.').pop() : '', ...extra,
})
const names = ['alpha', 'Beta.txt', 'bravo.md', 'charlie', 'my_beta.log']

describe('findQuickSearch (QS)', () => {
  const files = names.map(n => f(n))
  it('QS-01: 앞부분 일치, 대소문자 무시, from부터 찾고 끝에서 처음으로', () => {
    expect(findQuickSearch(files, 'b', 0, 1)).toBe(1)
    expect(findQuickSearch(files, 'b', 2, 1)).toBe(2)
    expect(findQuickSearch(files, 'b', 3, 1)).toBe(1)
    expect(findQuickSearch(files, 'br', 0, 1)).toBe(2)
  })
  it('QS-02: 뒤로 찾기', () => {
    expect(findQuickSearch(files, 'b', 1, -1)).toBe(1)
    expect(findQuickSearch(files, 'b', 0, -1)).toBe(2)
  })
  it('QS-03: * 나 ? 가 있으면 어디든 (끝에 * 생략)', () => {
    expect(findQuickSearch(files, '*beta', 0, 1)).toBe(1)
    expect(findQuickSearch(files, '*beta', 2, 1)).toBe(4)
    expect(findQuickSearch(files, 'b?a', 0, 1)).toBe(2) // bra(vo)
    expect(findQuickSearch(files, 'b??a', 0, 1)).toBe(1)
  })
  it('QS-04: 없으면 -1', () => {
    expect(findQuickSearch(files, 'zz', 0, 1)).toBe(-1)
    expect(findQuickSearch([], 'a', 0, 1)).toBe(-1)
  })
})

describe('패널 빠른 검색 (QP)', () => {
  let onView
  beforeEach(() => {
    useFileStore.setState(initial, true)
    useFileStore.setState(s => ({
      activePanel: 'left',
      left: { ...s.left, path: '/d', files: names.map(n => f(n)), cursor: 0, cursorOnParent: false, selected: new Set(),
        showHidden: false, loading: false, error: null, dirSizes: {}, tabs: [{ id: 't', path: '/d' }], activeTabIdx: 0 },
    }))
  })
  afterEach(() => cleanup())
  const mount = () => {
    onView = vi.fn()
    return render(h(FilePanel, { side: 'left', onView, onEdit: vi.fn() })).container.firstChild
  }
  const cursor = () => useFileStore.getState().left.cursor
  const box = () => screen.queryByLabelText('빠른 검색')

  it('QP-01: Alt+글자 → 검색 칸이 열리고 그 글자로 시작하는 파일로', () => {
    const list = mount()
    fireEvent.keyDown(list, { key: 'c', altKey: true })
    expect(box().value).toBe('c')
    expect(cursor()).toBe(3)
  })

  it('QP-02: 이어서 입력하면 좁혀 감, 맞는 게 없는 글자는 받지 않음', () => {
    const list = mount()
    fireEvent.keyDown(list, { key: 'b', altKey: true })
    expect(cursor()).toBe(1)
    fireEvent.change(box(), { target: { value: 'br' } })
    expect(cursor()).toBe(2)
    fireEvent.change(box(), { target: { value: 'brz' } })
    expect(box().value).toBe('br')
    expect(cursor()).toBe(2)
  })

  it('QP-03: ↓ / ↑ 다음 / 이전 일치', () => {
    const list = mount()
    fireEvent.keyDown(list, { key: 'b', altKey: true })
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    expect(cursor()).toBe(2)
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    expect(cursor()).toBe(1)
    fireEvent.keyDown(box(), { key: 'ArrowUp' })
    expect(cursor()).toBe(2)
  })

  it('QP-04: Esc → 닫기 (커서는 그대로)', () => {
    const list = mount()
    fireEvent.keyDown(list, { key: 'c', altKey: true })
    fireEvent.keyDown(box(), { key: 'Escape' })
    expect(box()).toBeNull()
    expect(cursor()).toBe(3)
  })

  it('QP-05: Enter → 닫고 커서 파일 열기', () => {
    const list = mount()
    fireEvent.keyDown(list, { key: 'b', altKey: true })
    fireEvent.change(box(), { target: { value: 'be' } })
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(box()).toBeNull()
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ name: 'Beta.txt' }))
  })

  it('QP-06: Ctrl+Alt 나 Alt+Shift 조합은 검색 아님, 맞는 파일 없으면 열지 않음', () => {
    const list = mount()
    fireEvent.keyDown(list, { key: 'b', altKey: true, ctrlKey: true })
    fireEvent.keyDown(list, { key: 'B', altKey: true, shiftKey: true })
    expect(box()).toBeNull()
    fireEvent.keyDown(list, { key: 'z', altKey: true })
    expect(box()).toBeNull()
  })
})
