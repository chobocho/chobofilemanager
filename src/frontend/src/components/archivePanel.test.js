import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import FilePanel from './FilePanel.jsx'
import { useFileStore, READ_ONLY_MSG } from '../stores/fileStore'
import { isArchiveName } from '../utils/fileTypes.js'
import api from '../wailsjs/runtime'

// Todo #133-5: 압축 파일을 폴더처럼 — Enter로 들어가기, 읽기 전용 표시, 쓰기 작업은 막기

vi.mock('../wailsjs/runtime', () => ({ default: {
  SaveSessionState: vi.fn(() => Promise.resolve()),
  ListDirectory: vi.fn(), CheckCopyConflicts: vi.fn(), CopyItems: vi.fn(), MoveItems: vi.fn(),
  CreateDirectory: vi.fn(), RenameItem: vi.fn(), CompressItems: vi.fn(), ExtractArchive: vi.fn(), OpenFile: vi.fn(),
} }))

const h = React.createElement
Element.prototype.scrollIntoView = vi.fn()
const initial = useFileStore.getState()

const f = (name, extra = {}) => ({
  name, path: `/d/${name}`, isDir: false, isHidden: false, size: 1, modified: '',
  extension: name.includes('.') ? '.' + name.split('.').pop() : '', ...extra,
})
function panels(left = {}, right = {}) {
  const base = { cursor: 0, cursorOnParent: false, selected: new Set(), showHidden: false, loading: false, error: null,
    dirSizes: {}, tabs: [{ id: 't', path: '/d' }], activeTabIdx: 0, readOnly: false, history: [], historyIndex: -1 }
  useFileStore.setState(s => ({
    activePanel: 'left', status: '',
    left: { ...s.left, ...base, path: '/d', files: [f('a.zip'), f('b.tar.gz'), f('c.txt')], ...left },
    right: { ...s.right, ...base, path: '/e', files: [], ...right },
  }))
}

describe('isArchiveName (AN)', () => {
  it('AN-01: Go internal/archive와 같은 확장자', () => {
    for (const n of ['a.zip', 'A.JAR', 'a.tar', 'a.tar.gz', 'a.tgz', 'a.tar.bz2', 'a.tbz2', 'a.tar.xz', 'a.txz', 'a.7z', 'a.rar']) {
      expect(isArchiveName(n)).toBe(true)
    }
    for (const n of ['a.gz', 'a.txt', 'zip', '.zip']) expect(isArchiveName(n)).toBe(false)
  })
})

describe('압축 파일 패널 (AP)', () => {
  beforeEach(() => {
    useFileStore.setState(initial, true)
    for (const fn of Object.values(api)) fn.mockReset?.()
    api.SaveSessionState.mockResolvedValue(undefined)
    api.ListDirectory.mockImplementation(async (p) => ({ path: p, files: [f('in.txt')], readOnly: p.includes('.zip') }))
    api.CheckCopyConflicts.mockResolvedValue([])
    panels()
  })
  afterEach(() => cleanup())
  const mount = () => render(h(FilePanel, { side: 'left', onView: vi.fn(), onEdit: vi.fn() })).container.firstChild

  it('AP-01: Enter / 더블클릭 → 압축 파일 안으로 (기본 앱으로 열지 않음)', async () => {
    const list = mount()
    fireEvent.keyDown(list, { key: 'Enter' })
    await vi.waitFor(() => expect(api.ListDirectory).toHaveBeenCalledWith('/d/a.zip'))
    expect(useFileStore.getState().left.readOnly).toBe(true)
    expect(api.OpenFile).not.toHaveBeenCalled()
  })

  it('AP-02: 더블클릭도 같음, 보통 폴더로 나오면 읽기 전용 해제', async () => {
    const list = mount()
    fireEvent.doubleClick(list.querySelector('[data-row="1"]'))
    await vi.waitFor(() => expect(api.ListDirectory).toHaveBeenCalledWith('/d/b.tar.gz'))
    await useFileStore.getState().navigate('left', '/d')
    expect(useFileStore.getState().left.readOnly).toBe(false)
  })

  it('AP-03: 읽기 전용 패널은 머리글에 표시', () => {
    panels({ readOnly: true, path: '/d/a.zip' })
    mount()
    expect(screen.getByText('읽기 전용')).toBeTruthy()
  })

  it('AP-04: 압축 안에서 F8/F6/F7/F2·압축은 막고 상태 표시, 백엔드 호출 없음', async () => {
    panels({ readOnly: true, path: '/d/a.zip', files: [f('in.txt', { path: '/d/a.zip/in.txt' })] })
    const st = useFileStore.getState()
    expect((await st.delete()).count).toBe(0)
    expect(useFileStore.getState().status).toBe(READ_ONLY_MSG)
    await st.move()
    expect(api.CheckCopyConflicts).not.toHaveBeenCalled()
    await expect(st.createDirectory('left', 'x')).rejects.toThrow(READ_ONLY_MSG)
    await st.rename('left', '/d/a.zip/in.txt', 'y.txt')
    expect(api.RenameItem).not.toHaveBeenCalled()
    useFileStore.setState(s => ({ left: { ...s.left, selected: new Set(['/d/a.zip/in.txt']) } }))
    await st.compress('left')
    expect(api.CompressItems).not.toHaveBeenCalled()
  })

  it('AP-05: 압축 안에서 밖으로 복사(F5)는 됨, 압축 안으로 복사·이동은 막음', async () => {
    panels({ readOnly: true, path: '/d/a.zip', files: [f('in.txt', { path: '/d/a.zip/in.txt' })] })
    await useFileStore.getState().copy()
    expect(api.CopyItems).toHaveBeenCalledWith(['/d/a.zip/in.txt'], '/e')

    api.CopyItems.mockClear()
    panels({}, { readOnly: true, path: '/e/x.zip' })
    await useFileStore.getState().copy()
    await useFileStore.getState().move()
    expect(api.CopyItems).not.toHaveBeenCalled()
    expect(api.MoveItems).not.toHaveBeenCalled()
    expect(useFileStore.getState().status).toBe(READ_ONLY_MSG)
  })
})
