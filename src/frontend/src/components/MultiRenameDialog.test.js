import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import MultiRenameDialog from './MultiRenameDialog.jsx'
import { useFileStore } from '../stores/fileStore'
import api from '../wailsjs/runtime'

// Todo #133-4: 여러 이름 바꾸기 창 (Ctrl+M)

vi.mock('../wailsjs/runtime', () => ({ default: {
  RenameBatch: vi.fn(), ListDirectory: vi.fn(), SaveSessionState: vi.fn(() => Promise.resolve()),
} }))

const h = React.createElement
const f = (name) => ({ name, path: `/d/${name}`, isDir: false, modified: '2026-03-07T09:05:02' })

describe('여러 이름 바꾸기 창 (MD)', () => {
  afterEach(() => cleanup())
  const mount = (props = {}) => {
    const onConfirm = vi.fn().mockResolvedValue(undefined), onClose = vi.fn()
    render(h(MultiRenameDialog, { files: [f('a.txt'), f('b.txt')], existingNames: ['a.txt', 'b.txt', 'x.txt'], onConfirm, onClose, ...props }))
    return { onConfirm, onClose }
  }
  const preview = () => [...document.querySelectorAll('[data-new-name]')].map(el => el.textContent)

  it('MD-01: 처음엔 그대로 — 미리 보기 같고 바꾸기 단추 꺼짐', () => {
    mount()
    expect(screen.getByText(/여러 이름 바꾸기/)).toBeTruthy()
    expect(preview()).toEqual(['a.txt', 'b.txt'])
    expect(screen.getByRole('button', { name: '바꾸기' }).disabled).toBe(true)
  })

  it('MD-02: 마스크를 바꾸면 미리 보기, 단추로 [C] 넣기', () => {
    mount()
    const name = screen.getByLabelText('이름 마스크')
    fireEvent.change(name, { target: { value: 'pic_' } })
    fireEvent.click(screen.getByRole('button', { name: '[C]' }))
    expect(name.value).toBe('pic_[C]')
    expect(preview()).toEqual(['pic_1.txt', 'pic_2.txt'])
    expect(screen.getByRole('button', { name: '바꾸기' }).disabled).toBe(false)
  })

  it('MD-03: 찾아 바꾸기 · 대소문자 · 카운터 자릿수', () => {
    mount()
    fireEvent.change(screen.getByLabelText('이름 마스크'), { target: { value: '[N]_[C]' } })
    fireEvent.change(screen.getByLabelText('자릿수'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('찾기'), { target: { value: '_' } })
    fireEvent.change(screen.getByLabelText('바꾸기 글자'), { target: { value: '-' } })
    fireEvent.change(screen.getByLabelText('대소문자'), { target: { value: 'upper' } })
    expect(preview()).toEqual(['A-001.TXT', 'B-001.TXT'.replace('001', '002')])
  })

  it('MD-04: 충돌은 표시하고 바꾸기 꺼짐', () => {
    mount()
    fireEvent.change(screen.getByLabelText('이름 마스크'), { target: { value: 'x' } })
    expect(screen.getAllByText(/같은 이름이 여럿|이미 있는 이름/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '바꾸기' }).disabled).toBe(true)
  })

  it('MD-05: 바꾸기 → 바뀌는 쌍만 넘김, 실패하면 창에 오류', async () => {
    const { onConfirm } = mount()
    fireEvent.change(screen.getByLabelText('이름 마스크'), { target: { value: '[N]2' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '바꾸기' })) })
    expect(onConfirm).toHaveBeenCalledWith([{ old: '/d/a.txt', new: '/d/a2.txt' }, { old: '/d/b.txt', new: '/d/b2.txt' }])
    onConfirm.mockRejectedValueOnce(new Error('locked'))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '바꾸기' })) })
    expect(screen.getByText(/locked/)).toBeTruthy()
  })

  it('MD-06: 잘못된 정규식은 오류 표시', () => {
    mount()
    fireEvent.click(screen.getByLabelText('정규식'))
    fireEvent.change(screen.getByLabelText('찾기'), { target: { value: '(' } })
    expect(screen.getByText(/정규식 오류/)).toBeTruthy()
  })
})

describe('스토어 multiRename (MS)', () => {
  beforeEach(() => {
    useFileStore.setState(s => ({
      activePanel: 'left',
      left: { ...s.left, path: '/d', files: [f('a.txt')], cursor: 0, selected: new Set(['/d/a.txt']), showHidden: false, loading: false, error: null },
    }))
    api.RenameBatch.mockReset().mockResolvedValue(undefined)
    api.ListDirectory.mockReset().mockResolvedValue({ path: '/d', files: [f('b.txt'), f('z.txt')] })
  })

  it('MS-01: 백엔드 호출 → 새로 고침 → 첫 새 이름에 커서, 상태 표시', async () => {
    await useFileStore.getState().multiRename('left', [{ old: '/d/a.txt', new: '/d/z.txt' }])
    expect(api.RenameBatch).toHaveBeenCalledWith([{ old: '/d/a.txt', new: '/d/z.txt' }])
    expect(useFileStore.getState().left.cursor).toBe(1)
    expect(useFileStore.getState().status).toMatch(/1/)
  })

  it('MS-02: 실패는 예외로 (창이 오류 표시)', async () => {
    api.RenameBatch.mockRejectedValue(new Error('denied'))
    await expect(useFileStore.getState().multiRename('left', [{ old: '/d/a.txt', new: '/d/z.txt' }])).rejects.toThrow('denied')
  })
})
