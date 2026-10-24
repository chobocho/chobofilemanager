import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

const api = vi.hoisted(() => ({
  GetFileBookmarks: vi.fn(),
  AddFileBookmark: vi.fn(),
  DeleteFileBookmark: vi.fn(),
}))
vi.mock('../wailsjs/runtime', () => ({ default: api }))

import BookmarkDialog from './BookmarkDialog.jsx'
import { useFileStore } from '../stores/fileStore'

const h = React.createElement

const BMS = [
  { id: '1', name: 'Zeta', path: 'C:\\a\\zeta', isFile: false },
  { id: '2', name: 'alpha', path: 'D:\\z\\alpha.txt', isFile: true },
]

let navigateToBookmark
beforeEach(() => {
  navigateToBookmark = vi.fn()
  api.GetFileBookmarks.mockResolvedValue(BMS)
  api.AddFileBookmark.mockResolvedValue(null)
  api.DeleteFileBookmark.mockResolvedValue(null)
  useFileStore.setState(s => ({
    activePanel: 'left',
    navigateToBookmark,
    left: {
      ...s.left, path: 'C:\\work\\proj', cursor: 0, cursorOnParent: false, showHidden: true,
      files: [{ name: 'main.go', path: 'C:\\work\\proj\\main.go', isDir: false, isHidden: false, extension: '.go' }],
    },
  }))
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

async function renderDialog(props = {}) {
  const onClose = props.onClose || vi.fn()
  await act(async () => { render(h(BookmarkDialog, { onClose })) })
  return onClose
}

describe('BookmarkDialog 커버리지', () => {
  it('BD-01: 로드된 북마크를 이름 오름차순으로 표시', async () => {
    await renderDialog()
    expect(api.GetFileBookmarks).toHaveBeenCalled()
    const names = [...document.querySelectorAll('[class*="name"]')].map(e => e.textContent).filter(t => t === 'Zeta' || t === 'alpha')
    expect(names).toEqual(['alpha', 'Zeta'])
  })

  it('BD-02: 북마크가 없으면 빈 메시지 (null 응답도 처리)', async () => {
    api.GetFileBookmarks.mockResolvedValue(null)
    await renderDialog()
    expect(screen.getByText('바로가기가 없습니다.')).toBeTruthy()
  })

  it('BD-03: 정렬 버튼 클릭 시 모드 순환 (이름↑ → 이름↓ → 경로↑ → 경로↓ → 이름↑)', async () => {
    await renderDialog()
    const btn = screen.getByTitle(/정렬:/)
    const labels = []
    for (let i = 0; i < 4; i++) {
      fireEvent.click(btn)
      labels.push(btn.textContent)
    }
    expect(labels).toEqual(['이름 ↓', '경로 ↑', '경로 ↓', '이름 ↑'])
  })

  it('BD-04: 행 클릭 → navigateToBookmark(panel, bm) 후 닫기', async () => {
    const onClose = await renderDialog()
    fireEvent.click(screen.getByTitle('C:\\a\\zeta'))
    expect(navigateToBookmark).toHaveBeenCalledWith('left', BMS[0])
    expect(onClose).toHaveBeenCalled()
  })

  it('BD-05: 현재 폴더 추가 — 기본 이름은 마지막 경로 요소, 저장 시 AddFileBookmark 후 재로드', async () => {
    await renderDialog()
    fireEvent.click(screen.getByText('현재 폴더 추가'))
    const input = screen.getByPlaceholderText('바로가기 이름')
    expect(input.value).toBe('proj')
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: ' 프로젝트 ' } })
    await act(async () => { fireEvent.click(screen.getByText('추가')) })
    expect(api.AddFileBookmark).toHaveBeenCalledWith('프로젝트', 'C:\\work\\proj')
    expect(api.GetFileBookmarks).toHaveBeenCalledTimes(2)
    expect(screen.queryByPlaceholderText('바로가기 이름')).toBeNull()
  })

  it('BD-06: 커서가 파일이면 현재 파일 추가 버튼 표시, 파일 경로로 추가', async () => {
    await renderDialog()
    fireEvent.click(screen.getByText('현재 파일 추가'))
    const input = screen.getByPlaceholderText('바로가기 이름')
    expect(input.value).toBe('main.go')
    await act(async () => { fireEvent.submit(input.closest('form')) })
    expect(api.AddFileBookmark).toHaveBeenCalledWith('main.go', 'C:\\work\\proj\\main.go')
  })

  it('BD-07: 커서가 폴더면 현재 파일 추가 버튼 없음', async () => {
    useFileStore.setState(s => ({ left: { ...s.left, files: [{ name: 'sub', path: 'C:\\work\\proj\\sub', isDir: true, isHidden: false }] } }))
    await renderDialog()
    expect(screen.queryByText('현재 파일 추가')).toBeNull()
  })

  it('BD-08: 추가 실패 시 오류 표시, 입력 수정 시 해제, 취소로 폼 닫기', async () => {
    api.AddFileBookmark.mockRejectedValue('중복된 이름')
    await renderDialog()
    fireEvent.click(screen.getByText('현재 폴더 추가'))
    const input = screen.getByPlaceholderText('바로가기 이름')
    await act(async () => { fireEvent.submit(input.closest('form')) })
    expect(screen.getByText('중복된 이름')).toBeTruthy()
    fireEvent.change(input, { target: { value: 'x' } })
    expect(screen.queryByText('중복된 이름')).toBeNull()
    const cancel = input.closest('form').querySelector('button[type="button"]')
    fireEvent.click(cancel)
    expect(screen.queryByPlaceholderText('바로가기 이름')).toBeNull()
  })

  it('BD-09: 빈 이름은 추가하지 않음 (버튼 비활성)', async () => {
    await renderDialog()
    fireEvent.click(screen.getByText('현재 폴더 추가'))
    const input = screen.getByPlaceholderText('바로가기 이름')
    fireEvent.change(input, { target: { value: '  ' } })
    expect(screen.getByText('추가').disabled).toBe(true)
    await act(async () => { fireEvent.submit(input.closest('form')) })
    expect(api.AddFileBookmark).not.toHaveBeenCalled()
  })

  it('BD-10: 삭제 버튼 → DeleteFileBookmark(id), 행 이동은 일어나지 않음', async () => {
    const onClose = await renderDialog()
    api.GetFileBookmarks.mockResolvedValue([BMS[0]])
    const delBtns = screen.getAllByTitle('삭제')
    // 정렬상 첫 행은 alpha(id 2)
    await act(async () => { fireEvent.click(delBtns[0]) })
    expect(api.DeleteFileBookmark).toHaveBeenCalledWith('2')
    expect(navigateToBookmark).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByText('alpha')).toBeNull()
  })

  it('BD-11: Esc/X/오버레이 클릭으로 닫기, 모달 내부 클릭은 무시', async () => {
    const onClose = await renderDialog()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('바로가기'))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(document.querySelector('[class*="overlay"]'))
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(document.querySelector('[class*="closeBtn"]'))
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
