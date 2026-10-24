import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

vi.mock('../wailsjs/runtime', () => ({ default: {} }))

import TextEditor from './TextEditor.jsx'
import { useFileStore } from '../stores/fileStore'
import { findSurfaceWithText, querySurfaceWithText, typeText } from '../test/textSurface.js'

const h = React.createElement

// ─── Todo #75: X 버튼 / F3 / 뷰어 버튼도 미저장 확인을 거침 ───────────────────

describe('TextEditor 미저장 확인 (Todo #75)', () => {
  let onClose, onSwitchToViewer, writeFile

  beforeEach(() => {
    onClose = vi.fn()
    onSwitchToViewer = vi.fn()
    writeFile = vi.fn().mockResolvedValue(undefined)
    useFileStore.setState({ readFile: vi.fn().mockResolvedValue('abc'), writeFile })
  })
  afterEach(() => cleanup())

  async function renderDirty() {
    render(h(TextEditor, { path: '/x/a.txt', onClose, onSwitchToViewer }))
    const ta = await findSurfaceWithText('abc')
    typeText(ta, 'abcd')
    return ta
  }

  it('TED-01: 변경 없으면 X 버튼으로 바로 닫힘', async () => {
    render(h(TextEditor, { path: '/x/a.txt', onClose, onSwitchToViewer }))
    await findSurfaceWithText('abc')
    fireEvent.click(screen.getByTitle('Close (Esc)'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('TED-02: 변경 후 X 버튼 → 확인창, 바로 닫히지 않음', async () => {
    await renderDirty()
    fireEvent.click(screen.getByTitle('Close (Esc)'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('저장하지 않은 변경사항')).toBeTruthy()
  })

  it('TED-03: 확인창에서 "저장 안 함" → 닫힘', async () => {
    await renderDirty()
    fireEvent.click(screen.getByTitle('Close (Esc)'))
    fireEvent.click(screen.getByText('저장 안 함'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('TED-04: 변경 후 F3 → 확인창, 뷰어 전환 보류', async () => {
    await renderDirty()
    fireEvent.keyDown(window, { key: 'F3' })
    expect(onSwitchToViewer).not.toHaveBeenCalled()
    expect(screen.getByText('저장하지 않은 변경사항')).toBeTruthy()
  })

  it('TED-05: F3 확인창에서 "저장" → 저장 후 뷰어로 전환 (닫기 아님)', async () => {
    await renderDirty()
    fireEvent.keyDown(window, { key: 'F3' })
    fireEvent.click(screen.getByText('저장'))
    await waitFor(() => expect(onSwitchToViewer).toHaveBeenCalledTimes(1))
    expect(writeFile).toHaveBeenCalledWith('/x/a.txt', 'abcd', 'auto')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('TED-06: 변경 후 뷰어(눈) 버튼 → 확인창', async () => {
    await renderDirty()
    fireEvent.click(screen.getByTitle('뷰어로 열기 (F3)'))
    expect(onSwitchToViewer).not.toHaveBeenCalled()
    expect(screen.getByText('저장하지 않은 변경사항')).toBeTruthy()
  })

  it('TED-07: 변경 없으면 F3로 바로 뷰어 전환', async () => {
    render(h(TextEditor, { path: '/x/a.txt', onClose, onSwitchToViewer }))
    await findSurfaceWithText('abc')
    fireEvent.keyDown(window, { key: 'F3' })
    expect(onSwitchToViewer).toHaveBeenCalledTimes(1)
  })

  it('TED-08: 확인창이 열린 상태에서 Esc → 확인창 취소', async () => {
    await renderDirty()
    fireEvent.click(screen.getByTitle('Close (Esc)'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('저장하지 않은 변경사항')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })
})

// ─── Todo #76: 로딩/오류 상태 저장 방지, 저장 실패 시 닫지 않음 ────────────────

describe('TextEditor 저장 가드 (Todo #76)', () => {
  let onClose, writeFile

  beforeEach(() => {
    onClose = vi.fn()
    writeFile = vi.fn().mockResolvedValue(undefined)
  })
  afterEach(() => cleanup())

  it('TES-01: 로딩 중 Ctrl+S → 빈 내용으로 덮어쓰지 않음', async () => {
    useFileStore.setState({ readFile: () => new Promise(() => {}), writeFile })
    render(h(TextEditor, { path: '/x/a.txt', onClose }))
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    await new Promise(r => setTimeout(r, 10))
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('TES-02: 읽기 실패 후 Ctrl+S → 저장하지 않음', async () => {
    useFileStore.setState({ readFile: vi.fn().mockRejectedValue(new Error('denied')), writeFile })
    render(h(TextEditor, { path: '/x/a.txt', onClose }))
    await screen.findByText(/denied/)
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    await new Promise(r => setTimeout(r, 10))
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('TES-03: 확인창 "저장"이 실패하면 닫지 않고 편집 내용 유지 + 오류 표시', async () => {
    writeFile = vi.fn().mockRejectedValue(new Error('read-only'))
    useFileStore.setState({ readFile: vi.fn().mockResolvedValue('abc'), writeFile })
    render(h(TextEditor, { path: '/x/a.txt', onClose }))
    const ta = await findSurfaceWithText('abc')
    typeText(ta, 'abcd')
    fireEvent.click(screen.getByTitle('Close (Esc)'))
    fireEvent.click(screen.getByText('저장'))
    await screen.findByText(/저장 실패.*read-only/)
    expect(onClose).not.toHaveBeenCalled()
    expect(querySurfaceWithText('abcd')).toBeTruthy()
  })
})
