import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import PluginDialog from './PluginDialog.jsx'
import api from '../wailsjs/runtime'

// Todo #133-13: 플러그인 창 (Ctrl+Shift+X)

vi.mock('../wailsjs/runtime', () => ({ default: { ListPlugins: vi.fn(), RunPlugin: vi.fn(), OpenPluginsFolder: vi.fn() } }))

const h = React.createElement
const plugins = [
  { file: 'line_count.star', name: '줄 수 세기', description: '고른 파일의 줄 수' },
  { file: 'file_list.star', name: '파일 목록 만들기', description: '' },
]
const ctx = { panelPath: '/d', targetPath: '/e', cursor: '/d/a.txt', selected: [] }

describe('플러그인 창 (PG)', () => {
  beforeEach(() => {
    api.ListPlugins.mockReset().mockResolvedValue(plugins)
    api.RunPlugin.mockReset().mockResolvedValue({ output: 'a.txt: 3 줄\n', error: '', refresh: false })
    api.OpenPluginsFolder.mockReset().mockResolvedValue(undefined)
  })
  afterEach(() => cleanup())

  async function mount(props = {}) {
    const p = { getContext: () => ctx, onClose: vi.fn(), onRefresh: vi.fn(), onAddButton: vi.fn(), ...props }
    await act(async () => { render(h(PluginDialog, p)) })
    return p
  }

  it('PG-01: 목록과 설명, Enter로 고른 플러그인 실행 → 출력', async () => {
    await mount()
    expect(screen.getByText('줄 수 세기')).toBeTruthy()
    expect(screen.getByText('고른 파일의 줄 수')).toBeTruthy()
    await act(async () => { fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' }) })
    expect(api.RunPlugin).toHaveBeenCalledWith('line_count.star', ctx)
    expect(screen.getByText(/a\.txt: 3 줄/)).toBeTruthy()
  })

  it('PG-02: ↓ 로 다음, 더블클릭 실행, 파일을 바꿨으면 onRefresh, 오류는 붉게', async () => {
    const p = await mount()
    api.RunPlugin.mockResolvedValue({ output: '', error: 'boom', refresh: true })
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' })
    await act(async () => { fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' }) })
    expect(api.RunPlugin).toHaveBeenLastCalledWith('file_list.star', ctx)
    expect(screen.getByText('boom')).toBeTruthy()
    expect(p.onRefresh).toHaveBeenCalled()
    await act(async () => { fireEvent.doubleClick(screen.getByText('줄 수 세기')) })
    expect(api.RunPlugin).toHaveBeenLastCalledWith('line_count.star', ctx)
  })

  it('PG-03: autoRun이면 열자마자 그 플러그인 실행', async () => {
    await mount({ autoRun: 'file_list.star' })
    expect(api.RunPlugin).toHaveBeenCalledWith('file_list.star', ctx)
  })

  it('PG-04: 폴더 열기 → 다시 읽기, 단추로 만들기 → onAddButton', async () => {
    const p = await mount()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '폴더 열기' })) })
    expect(api.OpenPluginsFolder).toHaveBeenCalled()
    expect(api.ListPlugins).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: '단추로 만들기' }))
    expect(p.onAddButton).toHaveBeenCalledWith(plugins[0])
  })

  it('PG-05: 플러그인이 없으면 안내', async () => {
    api.ListPlugins.mockResolvedValue([])
    await mount()
    expect(screen.getByText(/플러그인이 없습니다/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '실행' }).disabled).toBe(true)
  })
})
