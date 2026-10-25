import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import TextEditor from './TextEditor.jsx'
import FileViewer from './FileViewer.jsx'
import { findSurfaceWithText } from '../test/textSurface.js'

// ─── Todo #123: 에디터·뷰어의 파일 소스 — 원격 파일도 같은 화면으로 ───────────────

Element.prototype.scrollIntoView = vi.fn()
afterEach(() => cleanup())

function fakeSource(text = 'remote text\r\nline2') {
  return {
    remote: true,
    read: vi.fn().mockResolvedValue(text),
    write: vi.fn().mockResolvedValue(undefined),
    readImage: vi.fn().mockResolvedValue('data:image/png;base64,AA'),
    label: (p) => `srv:${p}`,
    note: () => '',
  }
}

describe('파일 소스 (RE)', () => {
  it('RE-01: 뷰어 — 소스에서 읽고 경로 대신 소스 이름표', async () => {
    const src = fakeSource()
    render(<FileViewer path="/w/a.txt" source={src} onClose={() => {}} />)
    await waitFor(() => expect(findSurfaceWithText('remote text')).toBeTruthy())
    expect(src.read).toHaveBeenCalledWith('/w/a.txt', 'auto')
    expect(screen.getByText('srv:/w/a.txt')).toBeTruthy()
  })

  it('RE-02: 에디터 — 소스로 저장 (원래 CRLF 유지)', async () => {
    const src = fakeSource()
    render(<TextEditor path="/w/a.txt" source={src} onClose={() => {}} />)
    await waitFor(() => expect(findSurfaceWithText('remote text')).toBeTruthy())
    // 로딩이 끝난 뒤의 저장 핸들러가 붙을 때까지 다시 누름 (부하가 큰 전체 실행 대비)
    await waitFor(() => {
      fireEvent.keyDown(window, { key: 's', ctrlKey: true })
      expect(src.write).toHaveBeenCalledWith('/w/a.txt', 'remote text\r\nline2', 'auto')
    })
  })

  it('RE-03: 저장 실패(소스 예외) → 상태 줄에 이유, 편집 내용 유지', async () => {
    const src = fakeSource()
    src.write.mockRejectedValue(new Error('저장하지 않았습니다'))
    render(<TextEditor path="/w/a.txt" source={src} onClose={() => {}} />)
    await waitFor(() => expect(findSurfaceWithText('remote text')).toBeTruthy())
    await waitFor(() => {
      fireEvent.keyDown(window, { key: 's', ctrlKey: true })
      expect(screen.getByText(/저장하지 않았습니다/)).toBeTruthy()
    })
    expect(findSurfaceWithText('remote text')).toBeTruthy()
  })

  it('RE-04: 앞부분만 읽은 파일은 안내 표시', async () => {
    const src = { ...fakeSource(), note: () => '파일이 커서 앞부분만 열었습니다' }
    render(<FileViewer path="/w/big.log" source={src} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('파일이 커서 앞부분만 열었습니다')).toBeTruthy())
  })

  it('RE-05: 원격 이미지 — 소스의 readImage', async () => {
    const src = fakeSource()
    render(<FileViewer path="/w/p.png" source={src} onClose={() => {}} />)
    await waitFor(() => expect(src.readImage).toHaveBeenCalledWith('/w/p.png'))
    expect(document.querySelector('img[src="data:image/png;base64,AA"]')).toBeTruthy()
  })

  it('RE-06: 원격 .star 파일은 실행 버튼 없음 (로컬 Starlark만)', async () => {
    const src = fakeSource('print(1)')
    render(<TextEditor path="/w/a.star" source={src} onClose={() => {}} />)
    await waitFor(() => expect(findSurfaceWithText('print(1)')).toBeTruthy())
    expect(screen.queryByTitle(/실행/)).toBeNull()
  })
})
