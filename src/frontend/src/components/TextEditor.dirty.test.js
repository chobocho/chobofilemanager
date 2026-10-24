import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

vi.mock('../wailsjs/runtime', () => ({ default: {} }))

import TextEditor from './TextEditor.jsx'
import { useFileStore } from '../stores/fileStore'

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
    const ta = await screen.findByDisplayValue('abc')
    fireEvent.change(ta, { target: { value: 'abcd' } })
    return ta
  }

  it('TED-01: 변경 없으면 X 버튼으로 바로 닫힘', async () => {
    render(h(TextEditor, { path: '/x/a.txt', onClose, onSwitchToViewer }))
    await screen.findByDisplayValue('abc')
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
    await screen.findByDisplayValue('abc')
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
