import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import FilePanel, { gridMove } from './FilePanel.jsx'
import Toolbar from './Toolbar.jsx'
import { useFileStore } from '../stores/fileStore'
import api from '../wailsjs/runtime'

// Todo #133-11: 보기 방식 — 자세히(Ctrl+F2) · 간단히(Ctrl+F1) · 썸네일(Ctrl+Shift+F1)

vi.mock('../wailsjs/runtime', () => ({ default: { SaveSessionState: vi.fn(() => Promise.resolve()), ReadThumbnail: vi.fn() } }))

const h = React.createElement
Element.prototype.scrollIntoView = vi.fn()
const initial = useFileStore.getState()

const f = (name, extra = {}) => ({
  name, path: `/d/${name}`, isDir: false, isHidden: false, size: 1, modified: '2026-01-01T00:00:00Z',
  extension: name.includes('.') ? '.' + name.split('.').pop() : '', ...extra,
})

describe('gridMove (GM)', () => {
  it('GM-01: 자세히 — ↑↓ 한 줄, ←→ 없음', () => {
    expect(gridMove('full', 'ArrowDown', 3, 10, { rows: 4, cols: 3 })).toBe(4)
    expect(gridMove('full', 'ArrowLeft', 3, 10, { rows: 4, cols: 3 })).toBeNull()
  })
  it('GM-02: 간단히(세로로 채움) — ↑↓ 한 칸, ←→ 한 열(rows칸), 끝에서 멈춤', () => {
    const dims = { rows: 4, cols: 3 }
    expect(gridMove('brief', 'ArrowRight', 1, 10, dims)).toBe(5)
    expect(gridMove('brief', 'ArrowRight', 8, 10, dims)).toBe(9)
    expect(gridMove('brief', 'ArrowLeft', 5, 10, dims)).toBe(1)
    expect(gridMove('brief', 'ArrowLeft', 2, 10, dims)).toBe(0)
    expect(gridMove('brief', 'ArrowDown', 9, 10, dims)).toBe(9)
  })
  it('GM-03: 썸네일(가로로 채움) — ←→ 한 칸, ↑↓ 한 줄(cols칸), 맨 윗줄에서 ↑는 [..](-1)', () => {
    const dims = { rows: 4, cols: 3 }
    expect(gridMove('thumbs', 'ArrowDown', 1, 10, dims)).toBe(4)
    expect(gridMove('thumbs', 'ArrowDown', 8, 10, dims)).toBe(9)
    expect(gridMove('thumbs', 'ArrowRight', 2, 10, dims)).toBe(3)
    expect(gridMove('thumbs', 'ArrowUp', 4, 10, dims)).toBe(1)
    expect(gridMove('thumbs', 'ArrowUp', 1, 10, dims)).toBe(-1)
  })
})

describe('보기 방식 (VM)', () => {
  beforeEach(() => {
    useFileStore.setState(initial, true)
    api.ReadThumbnail.mockReset().mockImplementation(async (p) => `data:image/jpeg;base64,${p}`)
    useFileStore.setState(s => ({
      activePanel: 'left',
      left: { ...s.left, path: '/d', files: [f('sub', { isDir: true, extension: '' }), f('a.png'), f('b.txt'), f('c.jpg'), f('d.md'), f('e.go')],
        cursor: 0, cursorOnParent: false, selected: new Set(), showHidden: false, loading: false, error: null,
        tabs: [{ id: 't', path: '/d' }], activeTabIdx: 0, viewMode: 'full' },
    }))
  })
  afterEach(() => cleanup())
  const mount = () => render(h(FilePanel, { side: 'left', onView: vi.fn(), onEdit: vi.fn() })).container.firstChild
  const mode = () => useFileStore.getState().left.viewMode
  const cursor = () => useFileStore.getState().left.cursor

  it('VM-01: Ctrl+F1 간단히 / Ctrl+Shift+F1 썸네일 / Ctrl+F2 자세히', () => {
    const list = mount()
    act(() => { fireEvent.keyDown(list, { key: 'F1', ctrlKey: true }) })
    expect(mode()).toBe('brief')
    expect(list.querySelector('[data-view="brief"]')).toBeTruthy()
    expect(screen.queryByText('Size')).toBeNull() // 열 머리글 없음
    act(() => { fireEvent.keyDown(list, { key: 'F1', ctrlKey: true, shiftKey: true }) })
    expect(mode()).toBe('thumbs')
    expect(list.querySelector('[data-view="thumbs"]')).toBeTruthy()
    act(() => { fireEvent.keyDown(list, { key: 'F2', ctrlKey: true }) })
    expect(mode()).toBe('full')
    expect(screen.getByText('Size')).toBeTruthy()
  })

  it('VM-02: 썸네일 보기 — 그림 파일만 ReadThumbnail, 나머지는 아이콘', async () => {
    const list = mount()
    act(() => { fireEvent.keyDown(list, { key: 'F1', ctrlKey: true, shiftKey: true }) })
    await waitFor(() => expect(list.querySelectorAll('img[data-thumb]').length).toBe(2))
    // 그림 칸(1: a.png, 3: c.jpg)에만 썸네일, 그림 아닌 파일은 요청하지 않음 (앞 테스트에서 읽은 것은 기억해 둠)
    expect([...list.querySelectorAll('img[data-thumb]')].map(i => i.closest('[data-row]').getAttribute('data-row'))).toEqual(['1', '3'])
    expect(api.ReadThumbnail.mock.calls.every(c => /\.(png|jpg)$/.test(c[0]))).toBe(true)
    expect(list.querySelector('img[data-thumb]').getAttribute('src')).toMatch(/^data:image\/jpeg/)
  })

  it('VM-03: 썸네일에서 → / ↓ (jsdom 기본 4열)로 커서 이동, 클릭·선택은 같은 규칙', () => {
    const list = mount()
    act(() => { fireEvent.keyDown(list, { key: 'F1', ctrlKey: true, shiftKey: true }) })
    act(() => { fireEvent.keyDown(list, { key: 'ArrowRight' }) })
    expect(cursor()).toBe(1)
    act(() => { fireEvent.keyDown(list, { key: 'ArrowDown' }) })
    expect(cursor()).toBe(5)
    act(() => { fireEvent.keyDown(list, { key: ' ' }) })
    expect(useFileStore.getState().left.selected.has('/d/e.go')).toBe(true)
    fireEvent.click(list.querySelector('[data-row="2"]'), { ctrlKey: true })
    expect(useFileStore.getState().left.selected.has('/d/b.txt')).toBe(true)
  })

  it('VM-04: 간단히에서 → 는 한 열(jsdom 기본 10줄)이라 끝으로', () => {
    const list = mount()
    act(() => { fireEvent.keyDown(list, { key: 'F1', ctrlKey: true }) })
    act(() => { fireEvent.keyDown(list, { key: 'ArrowRight' }) })
    expect(cursor()).toBe(5)
  })

  it('VM-06: 같은 그림 파일이 바뀌면(시각 · 크기) 썸네일을 새로 읽음 (Todo #134-3)', async () => {
    const list = mount()
    act(() => { fireEvent.keyDown(list, { key: 'F1', ctrlKey: true, shiftKey: true }) })
    await waitFor(() => expect(list.querySelectorAll('img[data-thumb]').length).toBe(2))
    api.ReadThumbnail.mockClear()
    act(() => {
      useFileStore.setState(s => ({ left: { ...s.left, files: s.left.files.map(x => x.name === 'a.png' ? { ...x, modified: '2026-05-05T00:00:00Z', size: 99 } : x) } }))
    })
    await waitFor(() => expect(api.ReadThumbnail).toHaveBeenCalledWith('/d/a.png', 96))
    expect(api.ReadThumbnail).toHaveBeenCalledTimes(1)
  })

  it('VM-05: Toolbar — Ctrl+F1은 도움말 아님, Ctrl+F2는 이름 바꾸기 아님', () => {
    const hs = { onHelp: vi.fn(), onRename: vi.fn(), onCopy: vi.fn(), onMove: vi.fn(), onNewDir: vi.fn(), onDelete: vi.fn() }
    render(h(Toolbar, { view: 'files', onViewChange: () => {}, ...hs }))
    fireEvent.keyDown(window, { key: 'F1', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'F2', ctrlKey: true })
    expect(hs.onHelp).not.toHaveBeenCalled()
    expect(hs.onRename).not.toHaveBeenCalled()
  })
})
