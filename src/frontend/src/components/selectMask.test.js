import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { matchMask } from '../utils/mask.js'
import FilePanel from './FilePanel.jsx'
import SelectMaskDialog from './SelectMaskDialog.jsx'
import { useFileStore } from '../stores/fileStore'

// Todo #133-2: 와일드카드 선택 — Num+ 선택 · Num- 해제 · Num* 반전 (Total Commander와 같게)

vi.mock('../wailsjs/runtime', () => ({ default: { SaveSessionState: vi.fn(() => Promise.resolve()) } }))

const h = React.createElement
Element.prototype.scrollIntoView = vi.fn()
const initial = useFileStore.getState()

describe('matchMask (MK)', () => {
  it('MK-01: * ? 와 대소문자 무시', () => {
    expect(matchMask('Read.TXT', '*.txt')).toBe(true)
    expect(matchMask('a.md', '*.txt')).toBe(false)
    expect(matchMask('ab.c', '??.c')).toBe(true)
    expect(matchMask('abc.c', '??.c')).toBe(false)
  })
  it('MK-02: 여러 마스크는 ; 또는 공백, *.* 는 모두 (확장자 없는 파일 포함)', () => {
    expect(matchMask('a.md', '*.txt;*.md')).toBe(true)
    expect(matchMask('a.md', '*.txt *.md')).toBe(true)
    expect(matchMask('Makefile', '*.*')).toBe(true)
    expect(matchMask('Makefile', '*')).toBe(true)
  })
  it('MK-03: | 뒤는 제외', () => {
    expect(matchMask('a.txt', '*.*|a*')).toBe(false)
    expect(matchMask('b.txt', '*.*|a*')).toBe(true)
    expect(matchMask('b.txt', '|*.log')).toBe(true) // 포함 없으면 모두
  })
  it('MK-04: 정규식 특수 문자는 글자 그대로', () => {
    expect(matchMask('a+b(1).txt', 'a+b(1).txt')).toBe(true)
    expect(matchMask('aab1.txt', 'a+b(1).txt')).toBe(false)
  })
  it('MK-05: 빈 마스크는 아무것도', () => {
    expect(matchMask('a', '')).toBe(false)
    expect(matchMask('a', '  ')).toBe(false)
  })
})

const f = (name, extra = {}) => ({
  name, path: `/d/${name}`, isDir: false, isHidden: false, size: 1, modified: '', extension: '', ...extra,
})
const files = () => [f('src', { isDir: true }), f('a.txt'), f('b.txt'), f('c.md'), f('.h.txt', { isHidden: true })]
function setPanel(extra = {}) {
  useFileStore.setState(s => ({
    activePanel: 'left',
    left: { ...s.left, path: '/d', files: files(), cursor: 0, cursorOnParent: false, selected: new Set(),
      showHidden: false, loading: false, error: null, dirSizes: {}, tabs: [{ id: 't', path: '/d' }], activeTabIdx: 0, ...extra },
  }))
}
const sel = () => [...useFileStore.getState().left.selected].sort()

describe('스토어 마스크 선택 (SM)', () => {
  beforeEach(() => { useFileStore.setState(initial, true); setPanel() })

  it('SM-01: 선택 — 보이는 파일만, 폴더는 기본 제외', () => {
    useFileStore.getState().selectByMask('left', '*.*', { select: true })
    expect(sel()).toEqual(['/d/a.txt', '/d/b.txt', '/d/c.md'])
  })
  it('SM-02: 폴더도 포함', () => {
    useFileStore.getState().selectByMask('left', '*', { select: true, includeDirs: true })
    expect(sel()).toEqual(['/d/a.txt', '/d/b.txt', '/d/c.md', '/d/src'])
  })
  it('SM-03: 기존 선택에 더하기 / 해제는 맞는 것만 빼기', () => {
    setPanel({ selected: new Set(['/d/c.md']) })
    useFileStore.getState().selectByMask('left', 'a*', { select: true })
    expect(sel()).toEqual(['/d/a.txt', '/d/c.md'])
    useFileStore.getState().selectByMask('left', '*.txt', { select: false })
    expect(sel()).toEqual(['/d/c.md'])
  })
  it('SM-04: 반전 — 파일만 뒤집고 폴더 선택은 그대로', () => {
    setPanel({ selected: new Set(['/d/a.txt', '/d/src']) })
    useFileStore.getState().invertSelection('left')
    expect(sel()).toEqual(['/d/b.txt', '/d/c.md', '/d/src'])
  })
  it('SM-05: 몇 개 골랐는지 상태 표시줄에, 마지막 마스크 기억', () => {
    useFileStore.getState().selectByMask('left', '*.txt', { select: true })
    expect(useFileStore.getState().status).toMatch(/2/)
    expect(useFileStore.getState().lastMask).toBe('*.txt')
  })
})

describe('패널 키 (SK)', () => {
  beforeEach(() => { useFileStore.setState(initial, true); setPanel() })
  afterEach(() => cleanup())

  function mount() {
    const onMaskSelect = vi.fn()
    const r = render(h(FilePanel, { side: 'left', onView: vi.fn(), onEdit: vi.fn(), onMaskSelect }))
    return { list: r.container.firstChild, onMaskSelect }
  }

  it('SK-01: Num+ → 선택 창, Num- → 해제 창 (주 키보드 - 는 그대로 뒤로)', () => {
    const navigateBack = vi.fn()
    useFileStore.setState({ navigateBack })
    const { list, onMaskSelect } = mount()
    fireEvent.keyDown(list, { key: '+', code: 'NumpadAdd' })
    fireEvent.keyDown(list, { key: '-', code: 'NumpadSubtract' })
    expect(onMaskSelect.mock.calls).toEqual([['select'], ['deselect']])
    fireEvent.keyDown(list, { key: '-', code: 'Minus' })
    expect(navigateBack).toHaveBeenCalledTimes(1)
    expect(onMaskSelect).toHaveBeenCalledTimes(2)
  })
  it('SK-02: Num* → 반전, Ctrl+Num+ → 모두, Ctrl+Num- → 모두 해제', () => {
    const { list } = mount()
    act(() => { fireEvent.keyDown(list, { key: '*', code: 'NumpadMultiply' }) })
    expect(sel()).toEqual(['/d/a.txt', '/d/b.txt', '/d/c.md'])
    act(() => { fireEvent.keyDown(list, { key: '-', code: 'NumpadSubtract', ctrlKey: true }) })
    expect(sel()).toEqual([])
    act(() => { fireEvent.keyDown(list, { key: '+', code: 'NumpadAdd', ctrlKey: true }) })
    expect(sel()).toEqual(['/d/a.txt', '/d/b.txt', '/d/c.md', '/d/src'])
  })
})

describe('선택 창 (SD)', () => {
  afterEach(() => cleanup())

  it('SD-01: 마지막 마스크로 시작, Enter로 적용', () => {
    const onConfirm = vi.fn()
    render(h(SelectMaskDialog, { mode: 'select', initialMask: '*.md', onConfirm, onClose: vi.fn() }))
    const input = screen.getByLabelText('마스크')
    expect(input.value).toBe('*.md')
    fireEvent.change(input, { target: { value: '*.txt' } })
    fireEvent.click(screen.getByLabelText('폴더도'))
    fireEvent.submit(input.closest('form'))
    expect(onConfirm).toHaveBeenCalledWith('*.txt', { includeDirs: true })
  })
  it('SD-02: 해제 창 제목, 빈 마스크는 적용 안 함, Esc로 닫기', () => {
    const onConfirm = vi.fn(), onClose = vi.fn()
    render(h(SelectMaskDialog, { mode: 'deselect', initialMask: '', onConfirm, onClose }))
    expect(screen.getAllByText('선택 해제').length).toBe(2) // 제목과 단추
    const input = screen.getByLabelText('마스크')
    expect(input.value).toBe('*.*') // 기억한 마스크가 없으면 *.*
    fireEvent.change(input, { target: { value: '  ' } })
    fireEvent.submit(input.closest('form'))
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
