import { describe, it, expect, vi, afterEach } from 'vitest'
import React, { Profiler } from 'react'
import { render, fireEvent, cleanup, act } from '@testing-library/react'

vi.mock('../wailsjs/runtime', () => ({ default: {} }))

import FilePanel from './FilePanel.jsx'
import { useFileStore } from '../stores/fileStore'

const h = React.createElement
Element.prototype.scrollIntoView = vi.fn()

const file = (i) => ({ name: `f${i}.txt`, path: `/d/f${i}.txt`, isDir: false, isHidden: false, size: i, modified: '2026-01-01T00:00:00Z', extension: '.txt' })

// ─── Todo #98: 무관한 상태 변경 시 패널 재렌더 방지 ────────────────────────────
describe('FilePanel 렌더링 (Todo #98)', () => {
  afterEach(() => cleanup())

  function setup() {
    useFileStore.setState(s => ({
      activePanel: 'left',
      status: '',
      left: { ...s.left, path: '/d', files: Array.from({ length: 50 }, (_, i) => file(i)), cursor: 0, cursorOnParent: false, selected: new Set() },
    }))
    const onRender = vi.fn()
    const utils = render(h(Profiler, { id: 'p', onRender },
      h(FilePanel, { side: 'left', onView: vi.fn(), onEdit: vi.fn(), onSwitchToPanel: vi.fn() })))
    return { onRender, ...utils }
  }

  it('PERF-01: 상태 표시줄 문구 변경으로는 패널이 다시 렌더링되지 않음', () => {
    const { onRender } = setup()
    const before = onRender.mock.calls.length
    act(() => { useFileStore.setState({ status: 'Copying...' }) })
    expect(onRender.mock.calls.length).toBe(before)
  })

  it('PERF-02: 반대쪽 패널 변경으로도 다시 렌더링되지 않음', () => {
    const { onRender } = setup()
    const before = onRender.mock.calls.length
    act(() => { useFileStore.setState(s => ({ right: { ...s.right, cursor: 3 } })) })
    expect(onRender.mock.calls.length).toBe(before)
  })

  it('PERF-03: 커서 이동은 정상 반영 (하이라이트 행 변경)', () => {
    const { container } = setup()
    const list = container.querySelector('[tabindex="0"]')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(useFileStore.getState().left.cursor).toBe(1)
    const rows = container.querySelectorAll('[data-row]')
    expect(rows[1].className).toMatch(/cursor/)
    expect(rows[0].className).not.toMatch(/cursor/)
  })
})
