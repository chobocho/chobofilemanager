import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import FilePanel from './FilePanel.jsx'
import { useFileStore } from '../stores/fileStore'
import api from '../wailsjs/runtime'

// Todo #133-1: Space = 선택 + 폴더 크기 계산, Alt+Shift+Enter = 모든 폴더 크기 (Total Commander와 같게)

vi.mock('../wailsjs/runtime', () => ({ default: {
  SaveSessionState: vi.fn(() => Promise.resolve()),
  DirSize: vi.fn(),
  ListDirectory: vi.fn(),
} }))

const h = React.createElement
Element.prototype.scrollIntoView = vi.fn()
const initial = useFileStore.getState()

const f = (name, extra = {}) => ({
  name, path: `/d/${name}`, isDir: false, isHidden: false, size: 100,
  modified: '2026-01-01T00:00:00Z', extension: '', ...extra,
})
const dir = (name) => f(name, { isDir: true, size: 0 })

function setup(files = [dir('sub'), dir('two'), f('a.txt')], cursor = 0) {
  useFileStore.setState(s => ({
    activePanel: 'left',
    left: { ...s.left, path: '/d', files, cursor, cursorOnParent: false, selected: new Set(),
      showHidden: false, loading: false, error: null, dirSizes: {}, tabs: [{ id: 't1', path: '/d' }], activeTabIdx: 0 },
  }))
  const r = render(h(FilePanel, { side: 'left', onView: vi.fn(), onEdit: vi.fn() }))
  return r.container.firstChild
}
const left = () => useFileStore.getState().left
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

describe('폴더 크기 (DS)', () => {
  beforeEach(() => {
    useFileStore.setState(initial, true)
    api.DirSize.mockReset()
    api.DirSize.mockImplementation(async (p) => ({ size: p.endsWith('sub') ? 2048 : 10, files: 3, dirs: 1 }))
  })
  afterEach(() => cleanup())

  it('DS-01: 폴더에서 Space → 선택되고 크기를 계산해 <DIR> 대신 표시', async () => {
    const list = setup()
    fireEvent.keyDown(list, { key: ' ' })
    await flush()
    expect(left().selected.has('/d/sub')).toBe(true)
    expect(api.DirSize).toHaveBeenCalledWith('/d/sub')
    expect(left().dirSizes['/d/sub']).toBe(2048)
    const row = list.querySelector('[data-row="0"]')
    expect(row.textContent).not.toMatch(/<DIR>/)
    expect(row.textContent).toMatch(/2/)
  })

  it('DS-02: 파일에서 Space는 선택만 (크기 계산 안 함)', async () => {
    const list = setup(undefined, 2)
    fireEvent.keyDown(list, { key: ' ' })
    await flush()
    expect(left().selected.has('/d/a.txt')).toBe(true)
    expect(api.DirSize).not.toHaveBeenCalled()
  })

  it('DS-03: 선택 해제(두 번째 Space)는 다시 계산하지 않음', async () => {
    const list = setup()
    fireEvent.keyDown(list, { key: ' ' })
    await flush()
    fireEvent.keyDown(list, { key: ' ' })
    await flush()
    expect(left().selected.size).toBe(0)
    expect(api.DirSize).toHaveBeenCalledTimes(1)
  })

  it('DS-04: Alt+Shift+Enter → 보이는 모든 폴더 크기', async () => {
    const list = setup()
    fireEvent.keyDown(list, { key: 'Enter', altKey: true, shiftKey: true })
    await flush(); await flush()
    expect(api.DirSize.mock.calls.map(c => c[0])).toEqual(['/d/sub', '/d/two'])
    expect(left().dirSizes).toEqual({ '/d/sub': 2048, '/d/two': 10 })
  })

  it('DS-05: 선택 합계에 계산한 폴더 크기 포함, 상태 표시줄 안내', async () => {
    const list = setup()
    fireEvent.keyDown(list, { key: ' ' })
    await flush()
    expect(list.textContent).toMatch(/1 selected \(2\.0 KB\)/)
    expect(useFileStore.getState().status).toMatch(/sub/)
  })

  it('DS-06: 다른 폴더로 가면 계산한 크기는 지움, 같은 폴더 새로 고침은 유지', async () => {
    api.ListDirectory.mockImplementation(async (p) => ({ path: p, files: [] }))
    useFileStore.setState(s => ({ left: { ...s.left, path: '/d', dirSizes: { '/d/sub': 5 } } }))
    await useFileStore.getState().navigate('left', '/d')
    expect(left().dirSizes).toEqual({ '/d/sub': 5 })
    await useFileStore.getState().navigate('left', '/e')
    expect(left().dirSizes).toEqual({})
  })

  it('DS-07: 계산 실패는 상태 표시줄에', async () => {
    api.DirSize.mockRejectedValue(new Error('denied'))
    const list = setup()
    fireEvent.keyDown(list, { key: ' ' })
    await flush()
    expect(useFileStore.getState().status).toMatch(/denied/)
    expect(left().dirSizes['/d/sub']).toBeUndefined()
  })
})
