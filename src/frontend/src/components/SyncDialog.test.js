import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import SyncDialog, { defaultDirection } from './SyncDialog.jsx'
import { compareListings } from '../utils/compareDirs.js'
import { useFileStore } from '../stores/fileStore'
import api from '../wailsjs/runtime'

// Todo #133-6: Shift+F2 폴더 비교(다른 파일 선택), Alt+F2 동기화 창

vi.mock('../wailsjs/runtime', () => ({ default: {
  CompareDirs: vi.fn(), SyncDirs: vi.fn(), SaveSessionState: vi.fn(() => Promise.resolve()),
} }))

const h = React.createElement
const f = (dir, name, size, modified, extra = {}) => ({ name, path: `${dir}/${name}`, size, modified, isDir: false, isHidden: false, ...extra })
const OLD = '2026-01-01T10:00:00Z', NEW = '2026-02-01T10:00:00Z'

describe('compareListings (CL) — Shift+F2', () => {
  it('CL-01: 새 파일 · 한쪽에만 있는 파일을 그쪽에서 고름, 같은 파일은 안 고름, 폴더는 무시', () => {
    const L = [f('/l', 'same', 1, OLD), f('/l', 'newer', 1, NEW), f('/l', 'older', 1, OLD), f('/l', 'onlyL', 1, OLD), f('/l', 'dir', 0, OLD, { isDir: true })]
    const R = [f('/r', 'same', 1, OLD), f('/r', 'newer', 1, OLD), f('/r', 'older', 1, NEW), f('/r', 'onlyR', 1, OLD)]
    const { left, right } = compareListings(L, R)
    expect([...left].sort()).toEqual(['/l/newer', '/l/onlyL'])
    expect([...right].sort()).toEqual(['/r/older', '/r/onlyR'])
  })
  it('CL-02: 날짜는 같고 크기가 다르면 양쪽 모두, 이름은 대소문자 무시, 2초 차이는 같음', () => {
    const { left, right } = compareListings(
      [f('/l', 'A.txt', 5, OLD), f('/l', 'b', 1, '2026-01-01T10:00:01Z')],
      [f('/r', 'a.TXT', 3, OLD), f('/r', 'b', 1, OLD)])
    expect([...left]).toEqual(['/l/A.txt'])
    expect([...right]).toEqual(['/r/a.TXT'])
  })
})

const items = [
  { rel: 'a.txt', state: 'left-newer', left: { size: 10, modified: NEW }, right: { size: 9, modified: OLD } },
  { rel: 'b.txt', state: 'right-only', left: null, right: { size: 2, modified: OLD } },
  { rel: 'c.txt', state: 'equal', left: { size: 1, modified: OLD }, right: { size: 1, modified: OLD } },
  { rel: 'd.txt', state: 'different', left: { size: 4, modified: OLD }, right: { size: 2, modified: OLD } },
  { rel: 'sub/e', state: 'left-only', isDir: true, left: { size: 0, modified: OLD, isDir: true }, right: null },
]

describe('defaultDirection (DD)', () => {
  it('DD-01: 새것·한쪽만 → 그 반대쪽으로, 같음·다름 → 없음', () => {
    expect(items.map(defaultDirection)).toEqual(['right', 'left', null, null, 'right'])
  })
})

describe('동기화 창 (SY)', () => {
  beforeEach(() => {
    api.CompareDirs.mockReset().mockResolvedValue(items)
    api.SyncDirs.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => cleanup())

  async function mount(props = {}) {
    const onDone = vi.fn(), onClose = vi.fn(), onDiff = vi.fn()
    await act(async () => { render(h(SyncDialog, { left: '/l', right: '/r', onDone, onClose, onDiff, ...props })) })
    return { onDone, onClose, onDiff }
  }
  const rows = () => [...document.querySelectorAll('[data-sync-row]')].map(r => r.getAttribute('data-sync-row'))
  const arrow = (rel) => document.querySelector(`[data-sync-row="${rel}"] [data-dir]`)

  it('SY-01: 열면 바로 비교 (하위 폴더 포함), 같은 항목은 기본으로 숨김', async () => {
    await mount()
    expect(api.CompareDirs).toHaveBeenCalledWith('/l', '/r', { recursive: true, byContent: false, ignoreDate: false })
    expect(rows()).toEqual(['a.txt', 'b.txt', 'd.txt', 'sub/e'])
    expect(arrow('a.txt').textContent).toBe('→')
    expect(arrow('b.txt').textContent).toBe('←')
    expect(arrow('d.txt').textContent).toBe('≠')
  })

  it('SY-02: 보기 필터 — = 켜면 같은 항목도, → 끄면 왼쪽→오른쪽 항목 숨김', async () => {
    await mount()
    fireEvent.click(screen.getByLabelText('같음 보기'))
    expect(rows()).toContain('c.txt')
    fireEvent.click(screen.getByLabelText('→ 보기'))
    expect(rows()).not.toContain('a.txt')
    expect(rows()).not.toContain('sub/e')
  })

  it('SY-03: 방향 칸 클릭 → → ← 없음 순서로 바꿈', async () => {
    await mount()
    fireEvent.click(arrow('a.txt'))
    expect(arrow('a.txt').textContent).toBe('←')
    fireEvent.click(arrow('a.txt'))
    expect(arrow('a.txt').textContent).toBe('')
    fireEvent.click(arrow('a.txt'))
    expect(arrow('a.txt').textContent).toBe('→')
  })

  it('SY-04: 동기화 → 보이는 항목 중 방향 있는 것만, 끝나면 다시 비교하고 onDone', async () => {
    const { onDone } = await mount()
    fireEvent.click(screen.getByLabelText('← 보기')) // b.txt 숨김 → 동기화하지 않음
    expect(screen.getByRole('button', { name: /동기화 \(2\)/ })).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /동기화/ })) })
    expect(api.SyncDirs).toHaveBeenCalledWith('/l', '/r', [{ rel: 'a.txt', to: 'right' }, { rel: 'sub/e', to: 'right' }])
    expect(api.CompareDirs).toHaveBeenCalledTimes(2)
    expect(onDone).toHaveBeenCalled()
  })

  it('SY-05: 옵션을 바꾸고 다시 비교, 실패는 창에 표시', async () => {
    await mount()
    fireEvent.click(screen.getByLabelText('내용 비교'))
    api.CompareDirs.mockRejectedValueOnce(new Error('denied'))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '비교' })) })
    expect(api.CompareDirs).toHaveBeenLastCalledWith('/l', '/r', { recursive: true, byContent: true, ignoreDate: false })
    expect(screen.getByText(/denied/)).toBeTruthy()
  })

  it('SY-06: 양쪽에 있는 파일 줄을 더블클릭하면 내용 비교(onDiff)', async () => {
    const { onDiff } = await mount()
    fireEvent.doubleClick(document.querySelector('[data-sync-row="d.txt"]'))
    expect(onDiff).toHaveBeenCalledWith('/l/d.txt', '/r/d.txt')
    fireEvent.doubleClick(document.querySelector('[data-sync-row="b.txt"]'))
    expect(onDiff).toHaveBeenCalledTimes(1)
  })
})

describe('스토어 compareDirsSelect (CS)', () => {
  it('CS-01: 두 패널에 다른 파일 선택, 상태 표시', () => {
    useFileStore.setState(s => ({
      left: { ...s.left, path: '/l', files: [f('/l', 'x', 1, NEW)], selected: new Set(), showHidden: false },
      right: { ...s.right, path: '/r', files: [f('/r', 'x', 1, OLD), f('/r', 'y', 1, OLD)], selected: new Set(), showHidden: false },
    }))
    useFileStore.getState().compareDirsSelect()
    expect([...useFileStore.getState().left.selected]).toEqual(['/l/x'])
    expect([...useFileStore.getState().right.selected]).toEqual(['/r/y'])
    expect(useFileStore.getState().status).toMatch(/왼쪽 1.*오른쪽 1/)
  })
})
