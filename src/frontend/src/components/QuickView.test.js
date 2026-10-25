import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, cleanup, act } from '@testing-library/react'
import QuickView, { QUICK_TEXT_LIMIT } from './QuickView.jsx'
import api from '../wailsjs/runtime'

// Todo #133-9: 빠른 보기 (Ctrl+Q) — 반대 패널 자리에 커서 파일 미리 보기

vi.mock('../wailsjs/runtime', () => ({ default: {
  ReadTextFile: vi.fn(), ReadImageFile: vi.fn(),
} }))

const h = React.createElement
const f = (name, extra = {}) => ({
  name, path: `/d/${name}`, isDir: false, size: 10, modified: '2026-01-01T00:00:00Z',
  extension: name.includes('.') ? '.' + name.split('.').pop() : '', ...extra,
})

describe('빠른 보기 (QV)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    api.ReadTextFile.mockReset().mockImplementation(async (p) => `text of ${p}`)
    api.ReadImageFile.mockReset().mockResolvedValue('data:image/png;base64,AA')
  })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  const show = async (file, extra = {}) => {
    const r = render(h(QuickView, { file, ...extra }))
    await act(async () => { vi.advanceTimersByTime(200); await Promise.resolve(); await Promise.resolve() })
    return r
  }

  it('QV-01: 텍스트 파일 내용', async () => {
    await show(f('a.txt'))
    expect(api.ReadTextFile).toHaveBeenCalledWith('/d/a.txt')
    expect(screen.getByText('text of /d/a.txt')).toBeTruthy()
    expect(screen.getByRole('region', { name: '빠른 보기' })).toBeTruthy()
  })

  it('QV-02: 이미지는 그림으로', async () => {
    const { container } = await show(f('p.png'))
    expect(container.querySelector('img').getAttribute('src')).toBe('data:image/png;base64,AA')
  })

  it('QV-03: 마크다운은 렌더링', async () => {
    api.ReadTextFile.mockResolvedValue('# Title\n\nbody')
    const { container } = await show(f('r.md'))
    expect(container.querySelector('h1').textContent).toBe('Title')
  })

  it('QV-04: 폴더 · 미리 볼 수 없는 파일 · 너무 큰 파일 · 커서 없음은 정보만', async () => {
    const { rerender } = await show(f('sub', { isDir: true, extension: '' }), { dirSize: 2048 })
    expect(screen.getByText(/폴더/)).toBeTruthy()
    expect(screen.getByText(/2\.0 KB/)).toBeTruthy()
    rerender(h(QuickView, { file: f('x.exe') }))
    expect(screen.getByText(/미리 볼 수 없는/)).toBeTruthy()
    rerender(h(QuickView, { file: f('big.txt', { size: 40 * 1024 * 1024 }) }))
    expect(screen.getByText(/너무 커서/)).toBeTruthy()
    rerender(h(QuickView, { file: null }))
    expect(screen.getByText(/파일을 고르면/)).toBeTruthy()
    expect(api.ReadTextFile).not.toHaveBeenCalled()
  })

  it('QV-05: 커서를 빨리 옮기면 마지막 파일만 읽음', async () => {
    const { rerender } = render(h(QuickView, { file: f('a.txt') }))
    rerender(h(QuickView, { file: f('b.txt') }))
    rerender(h(QuickView, { file: f('c.txt') }))
    await act(async () => { vi.advanceTimersByTime(200); await Promise.resolve(); await Promise.resolve() })
    expect(api.ReadTextFile).toHaveBeenCalledTimes(1)
    expect(api.ReadTextFile).toHaveBeenCalledWith('/d/c.txt')
  })

  it('QV-06: 긴 텍스트는 앞부분만, 읽기 실패는 오류', async () => {
    api.ReadTextFile.mockResolvedValue('x'.repeat(QUICK_TEXT_LIMIT + 10))
    const { container, rerender } = await show(f('long.txt'))
    expect(container.querySelector('pre').textContent.length).toBe(QUICK_TEXT_LIMIT)
    expect(screen.getByText(/앞부분만/)).toBeTruthy()
    api.ReadTextFile.mockRejectedValue(new Error('denied'))
    rerender(h(QuickView, { file: f('other.txt') }))
    await act(async () => { vi.advanceTimersByTime(200); await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByText(/denied/)).toBeTruthy()
  })
})
