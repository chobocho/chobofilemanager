import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import DiffView from './DiffView.jsx'
import { pickDiffTargets } from '../utils/diffTargets.js'
import api from '../wailsjs/runtime'

// Todo #133-7: 파일 내용 비교 (Ctrl+Shift+D) — @codemirror/merge 좌우 diff

vi.mock('../wailsjs/runtime', () => ({ default: {
  CompareFileBytes: vi.fn(), ReadTextFile: vi.fn(), WriteTextFileWithEncoding: vi.fn(),
} }))

const h = React.createElement
const f = (dir, name, extra = {}) => ({ name, path: `${dir}/${name}`, isDir: false, isHidden: false, ...extra })
const panel = (path, files, extra = {}) => ({ path, files, cursor: 0, cursorOnParent: false, selected: new Set(), showHidden: false, loading: false, error: null, ...extra })

describe('pickDiffTargets (PT)', () => {
  it('PT-01: 활성 패널에서 파일 두 개를 골랐으면 그 둘', () => {
    const s = { activePanel: 'left', left: panel('/l', [f('/l', 'a'), f('/l', 'b'), f('/l', 'c')], { selected: new Set(['/l/a', '/l/c']) }), right: panel('/r', [f('/r', 'x')]) }
    expect(pickDiffTargets(s)).toEqual(['/l/a', '/l/c'])
  })
  it('PT-02: 아니면 커서 파일 + 반대 패널의 같은 이름 파일 (없으면 반대 패널 커서 파일)', () => {
    const s = { activePanel: 'left', left: panel('/l', [f('/l', 'a.txt')]), right: panel('/r', [f('/r', 'z'), f('/r', 'A.TXT')]) }
    expect(pickDiffTargets(s)).toEqual(['/l/a.txt', '/r/A.TXT'])
    s.right = panel('/r', [f('/r', 'z'), f('/r', 'q')], { cursor: 1 })
    expect(pickDiffTargets(s)).toEqual(['/l/a.txt', '/r/q'])
  })
  it('PT-03: 오른쪽이 활성이어도 왼쪽 파일이 왼쪽에', () => {
    const s = { activePanel: 'right', left: panel('/l', [f('/l', 'a')]), right: panel('/r', [f('/r', 'b')]) }
    expect(pickDiffTargets(s)).toEqual(['/l/a', '/r/b'])
  })
  it('PT-04: 폴더·[..]·빈 패널이면 null', () => {
    expect(pickDiffTargets({ activePanel: 'left', left: panel('/l', [f('/l', 'd', { isDir: true })]), right: panel('/r', [f('/r', 'b')]) })).toBeNull()
    expect(pickDiffTargets({ activePanel: 'left', left: panel('/l', [f('/l', 'a')], { cursorOnParent: true }), right: panel('/r', [f('/r', 'b')]) })).toBeNull()
    expect(pickDiffTargets({ activePanel: 'left', left: panel('/l', [f('/l', 'a')]), right: panel('/r', []) })).toBeNull()
  })
})

describe('DiffView (DV)', () => {
  beforeEach(() => {
    api.CompareFileBytes.mockReset().mockResolvedValue({ equal: false, binary: false, firstDiff: 6, sizeA: 12, sizeB: 12 })
    api.ReadTextFile.mockReset().mockImplementation(async (p) => p.endsWith('a.txt') ? 'hello\nworld\nsame\n' : 'hello\nWORLD\nsame\n')
    api.WriteTextFileWithEncoding.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => cleanup())

  async function mount() {
    const onClose = vi.fn()
    await act(async () => { render(h(DiffView, { leftPath: '/l/a.txt', rightPath: '/r/b.txt', onClose })) })
    await waitFor(() => expect(document.querySelectorAll('.cm-editor').length).toBe(2))
    return { onClose }
  }

  it('DV-01: 두 파일을 읽어 좌우로, 경로와 차이 수 표시', async () => {
    await mount()
    expect(api.ReadTextFile).toHaveBeenCalledWith('/l/a.txt')
    expect(api.ReadTextFile).toHaveBeenCalledWith('/r/b.txt')
    expect(screen.getByText('/l/a.txt')).toBeTruthy()
    expect(screen.getByText('/r/b.txt')).toBeTruthy()
    expect(screen.getByText(/차이 1곳/)).toBeTruthy()
    const text = [...document.querySelectorAll('.cm-content')].map(c => c.textContent)
    expect(text[0]).toMatch(/world/)
    expect(text[1]).toMatch(/WORLD/)
  })

  it('DV-02: 같으면 "같은 파일" 안내', async () => {
    api.CompareFileBytes.mockResolvedValue({ equal: true, binary: false, firstDiff: -1, sizeA: 3, sizeB: 3 })
    api.ReadTextFile.mockResolvedValue('same')
    await mount()
    expect(screen.getByText(/두 파일이 같습니다/)).toBeTruthy()
  })

  it('DV-03: 바이너리는 diff 없이 첫 차이 위치', async () => {
    api.CompareFileBytes.mockResolvedValue({ equal: false, binary: true, firstDiff: 4096, sizeA: 10000, sizeB: 9000 })
    const onClose = vi.fn()
    await act(async () => { render(h(DiffView, { leftPath: '/l/x.bin', rightPath: '/r/y.bin', onClose })) })
    expect(screen.getByText(/바이너리/)).toBeTruthy()
    expect(screen.getByText(/4096 \(0x1000\)/)).toBeTruthy()
    expect(api.ReadTextFile).not.toHaveBeenCalled()
  })

  it('DV-04: 고친 쪽만 Ctrl+S로 저장', async () => {
    await mount()
    const views = [...document.querySelectorAll('.cm-editor')]
    const { EditorView } = await import('@codemirror/view')
    const right = EditorView.findFromDOM(views[1])
    act(() => { right.dispatch({ changes: { from: 0, insert: 'X' } }) })
    expect(screen.getByText(/저장 안 함/)).toBeTruthy()
    await act(async () => { fireEvent.keyDown(window, { key: 's', ctrlKey: true }) })
    expect(api.WriteTextFileWithEncoding).toHaveBeenCalledTimes(1)
    expect(api.WriteTextFileWithEncoding).toHaveBeenCalledWith('/r/b.txt', 'Xhello\nWORLD\nsame\n', 'auto')
  })

  it('DV-05: Esc 닫기, 고친 게 있으면 한 번 더 눌러야 닫힘', async () => {
    const { onClose } = await mount()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    cleanup()
    const r = await mount()
    const right = (await import('@codemirror/view')).EditorView.findFromDOM(document.querySelectorAll('.cm-editor')[1])
    act(() => { right.dispatch({ changes: { from: 0, insert: 'X' } }) })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(r.onClose).not.toHaveBeenCalled()
    expect(screen.getByText(/한 번 더/)).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(r.onClose).toHaveBeenCalledTimes(1)
  })

  it('DV-06: 읽기 실패는 화면에 오류', async () => {
    api.ReadTextFile.mockRejectedValue(new Error('denied'))
    await act(async () => { render(h(DiffView, { leftPath: '/l/a.txt', rightPath: '/r/b.txt', onClose: vi.fn() })) })
    expect(screen.getByText(/denied/)).toBeTruthy()
  })
})
