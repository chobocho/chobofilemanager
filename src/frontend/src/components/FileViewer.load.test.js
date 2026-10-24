import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, cleanup, act } from '@testing-library/react'

vi.mock('../wailsjs/runtime', () => ({ default: {} }))

import FileViewer from './FileViewer.jsx'
import TextEditor from './TextEditor.jsx'
import { useFileStore } from '../stores/fileStore'
import { findSurfaceWithText, querySurfaceWithText } from '../test/textSurface.js'

const h = React.createElement
Element.prototype.scrollIntoView = vi.fn()

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// ─── Todo #97: 로드 상태 초기화 + 이전 로드 결과 무시 ──────────────────────────
describe('FileViewer/TextEditor 로드 (Todo #97)', () => {
  afterEach(() => cleanup())

  it('LD-01: 이미지 하나가 실패한 뒤 다음 이미지로 넘기면 오류가 사라짐', async () => {
    const readImage = vi.fn()
      .mockRejectedValueOnce(new Error('broken'))
      .mockResolvedValueOnce('data:image/png;base64,AAAA')
    useFileStore.setState({ readImage, readFile: vi.fn() })
    const { rerender } = render(h(FileViewer, { path: '/i/a.png', onClose: () => {} }))
    await screen.findByText(/broken/)
    rerender(h(FileViewer, { path: '/i/b.png', onClose: () => {} }))
    await act(async () => {})
    expect(screen.queryByText(/broken/)).toBeNull()
  })

  it('LD-02: 빠르게 넘길 때 늦게 끝난 이전 파일 내용이 표시되지 않음', async () => {
    const first = deferred()
    const readFile = vi.fn((p) => p === '/t/a.txt' ? first.promise : Promise.resolve('BBB'))
    useFileStore.setState({ readFile, readImage: vi.fn() })
    const { rerender } = render(h(FileViewer, { path: '/t/a.txt', onClose: () => {} }))
    rerender(h(FileViewer, { path: '/t/b.txt', onClose: () => {} }))
    await findSurfaceWithText('BBB')
    await act(async () => { first.resolve('AAA') })
    expect(querySurfaceWithText('AAA')).toBeNull()
    expect(querySurfaceWithText('BBB')).toBeTruthy()
  })

  it('LD-03: 에디터도 이전 로드 결과를 무시', async () => {
    const first = deferred()
    const readFile = vi.fn((p) => p === '/t/a.txt' ? first.promise : Promise.resolve('BBB'))
    useFileStore.setState({ readFile, writeFile: vi.fn() })
    const { rerender } = render(h(TextEditor, { path: '/t/a.txt', onClose: () => {} }))
    rerender(h(TextEditor, { path: '/t/b.txt', onClose: () => {} }))
    await findSurfaceWithText('BBB')
    await act(async () => { first.resolve('AAA') })
    expect(querySurfaceWithText('AAA')).toBeNull()
  })
})
