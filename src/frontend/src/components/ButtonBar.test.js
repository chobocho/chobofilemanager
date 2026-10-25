import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import ButtonBar from './ButtonBar.jsx'
import ButtonEditDialog from './ButtonEditDialog.jsx'
import { expandParams, INTERNAL_COMMANDS } from '../utils/buttonParams.js'
import { useButtonStore } from '../stores/buttonStore'
import api from '../wailsjs/runtime'

// Todo #133-12: 사용자 단추 막대

vi.mock('../wailsjs/runtime', () => ({ default: { GetUserButtons: vi.fn(), SaveUserButtons: vi.fn() } }))

const h = React.createElement

describe('expandParams (BP)', () => {
  const ctx = {
    activePath: 'C:\\work', targetPath: 'D:\\backup',
    cursor: { name: 'a b.txt', path: 'C:\\work\\a b.txt' },
    selected: ['C:\\work\\x.txt', 'C:\\work\\y z.txt'],
  }
  it('BP-01: %P %T %N %F, %% 는 %', () => {
    expect(expandParams('%P|%T|%N|%F|100%%', ctx)).toBe('C:\\work|D:\\backup|a b.txt|C:\\work\\a b.txt|100%')
  })
  it('BP-02: %S 는 고른 파일들을 따옴표로 (없으면 커서 파일)', () => {
    expect(expandParams('%S', ctx)).toBe('"C:\\work\\x.txt" "C:\\work\\y z.txt"')
    expect(expandParams('%S', { ...ctx, selected: [] })).toBe('"C:\\work\\a b.txt"')
  })
  it('BP-03: 커서가 [..]이면 %N %F 는 빈 칸, 모르는 표시는 그대로', () => {
    expect(expandParams('[%N][%F] %X', { ...ctx, cursor: null })).toBe('[][] %X')
  })
  it('BP-04: 앱 안 기능 목록', () => {
    expect(INTERNAL_COMMANDS.map(c => c.id)).toEqual(expect.arrayContaining(['@sync', '@diff', '@multirename', '@quickview', '@tree', '@terminal']))
  })
})

describe('단추 저장소 (BS)', () => {
  beforeEach(() => {
    api.GetUserButtons.mockReset().mockResolvedValue([{ id: '1', name: 'A', command: 'a.exe' }])
    api.SaveUserButtons.mockReset().mockResolvedValue(undefined)
    useButtonStore.setState({ buttons: [] })
  })
  it('BS-01: 불러오기 · 추가 · 고치기 · 지우기 · 순서 바꾸기는 저장까지', async () => {
    const st = useButtonStore.getState()
    await st.load()
    expect(useButtonStore.getState().buttons.map(b => b.name)).toEqual(['A'])
    await st.upsert({ name: 'B', command: 'b.exe' })
    const b = useButtonStore.getState().buttons[1]
    expect(b.id).toBeTruthy()
    await st.upsert({ ...b, name: 'B2' })
    expect(useButtonStore.getState().buttons.map(x => x.name)).toEqual(['A', 'B2'])
    await st.move(b.id, -1)
    expect(useButtonStore.getState().buttons.map(x => x.name)).toEqual(['B2', 'A'])
    await st.remove('1')
    expect(useButtonStore.getState().buttons.map(x => x.name)).toEqual(['B2'])
    expect(api.SaveUserButtons).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'B2' })])
  })
})

describe('단추 막대 (BB)', () => {
  beforeEach(() => {
    api.GetUserButtons.mockReset().mockResolvedValue([{ id: '1', name: '메모장', command: 'notepad.exe' }, { id: '2', name: '동기화', command: '@sync' }])
    useButtonStore.setState({ buttons: [] })
  })
  afterEach(() => cleanup())

  it('BB-01: 단추를 그리고, 클릭 → 실행, 우클릭 → 편집, + → 새 단추', async () => {
    const onRun = vi.fn(), onEdit = vi.fn()
    await act(async () => { render(h(ButtonBar, { onRun, onEdit })) })
    fireEvent.click(screen.getByRole('button', { name: '메모장' }))
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ command: 'notepad.exe' }))
    fireEvent.contextMenu(screen.getByRole('button', { name: '동기화' }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }))
    fireEvent.click(screen.getByTitle('단추 추가'))
    expect(onEdit).toHaveBeenLastCalledWith(null)
  })
})

describe('단추 편집 창 (BE)', () => {
  afterEach(() => cleanup())

  it('BE-01: 새 단추 — 이름·명령 없으면 저장 안 됨, 채우면 onSave', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(h(ButtonEditDialog, { button: null, onSave, onDelete: vi.fn(), onClose: vi.fn() }))
    expect(screen.getByRole('button', { name: '저장' }).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '편집' } })
    fireEvent.change(screen.getByLabelText('명령'), { target: { value: 'code' } })
    fireEvent.change(screen.getByLabelText('인자'), { target: { value: '%F' } })
    fireEvent.change(screen.getByLabelText('시작 폴더'), { target: { value: '%P' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '저장' })) })
    expect(onSave).toHaveBeenCalledWith({ name: '편집', command: 'code', params: '%F', startDir: '%P' })
    expect(screen.queryByRole('button', { name: '지우기' })).toBeNull() // 새 단추는 지우기 없음
  })

  it('BE-02: 고치기 — 기존 값, 지우기 · 앞으로/뒤로', async () => {
    const onDelete = vi.fn(), onMove = vi.fn()
    render(h(ButtonEditDialog, { button: { id: '7', name: 'X', command: 'x.exe' }, onSave: vi.fn(), onDelete, onMove, onClose: vi.fn() }))
    expect(screen.getByLabelText('이름').value).toBe('X')
    fireEvent.click(screen.getByRole('button', { name: '앞으로' }))
    expect(onMove).toHaveBeenCalledWith('7', -1)
    fireEvent.click(screen.getByRole('button', { name: '지우기' }))
    expect(onDelete).toHaveBeenCalledWith('7')
  })
})
