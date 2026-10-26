import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import PermissionsDialog, { permChanges, parseOctal, toOctal } from './PermissionsDialog.jsx'
import FilePanel, { columnsFor } from './FilePanel.jsx'
import { formatMode } from '../utils/fileTypes.js'
import { isPermsShortcut } from '../App.jsx'
import { useFileStore } from '../stores/fileStore'
import api from '../wailsjs/runtime'

// Todo #137-2: 권한 · 소유자 열과 Alt+A 창 (mc의 chmod · chown)

vi.mock('../wailsjs/runtime', () => ({ default: {
  ChangeMode: vi.fn(), ChangeOwner: vi.fn(), GetOwnerChoices: vi.fn(), ListDirectory: vi.fn(),
  SaveSessionState: vi.fn(() => Promise.resolve()), ReadThumbnail: vi.fn(),
} }))

const h = React.createElement
Element.prototype.scrollIntoView = vi.fn()
const initial = useFileStore.getState()
const f = (name, extra = {}) => ({
  name, path: `/d/${name}`, isDir: false, isHidden: false, size: 1, modified: '2026-01-01T00:00:00Z',
  extension: '', mode: 0o644, owner: 'me', group: 'staff', ...extra,
})

describe('권한 표시 (PM)', () => {
  it('PM-01: formatMode — ls -l 모양, 종류 · s/S · t/T', () => {
    expect(formatMode(0o755, { isDir: true })).toBe('drwxr-xr-x')
    expect(formatMode(0o644)).toBe('-rw-r--r--')
    expect(formatMode(0o777, { isSymlink: true, isDir: true })).toBe('lrwxrwxrwx')
    expect(formatMode(0o4755)).toBe('-rwsr-xr-x')
    expect(formatMode(0o2644)).toBe('-rw-r-Sr--')
    expect(formatMode(0o1777, { isDir: true })).toBe('drwxrwxrwt')
    expect(formatMode(0o1776, { isDir: true })).toBe('drwxrwxrwT')
    expect(formatMode(undefined)).toBe('----------')
  })

  it('PM-02: 리눅스 경로만 권한 · 소유자 열 (Windows · FTP는 그대로)', () => {
    const keys = (p) => columnsFor(p).map(c => c.key)
    expect(keys('/home/me')).toEqual(['name', 'size', 'modified', 'extension', 'mode', 'owner'])
    expect(keys('C:\\Users')).toEqual(['name', 'size', 'modified', 'extension'])
    expect(keys('ftp://x_1/')).toEqual(['name', 'size', 'modified', 'extension'])
    expect(keys('')).toEqual(['name', 'size', 'modified', 'extension'])
  })

  it('PM-03: Alt+A만 (Ctrl · Shift 섞이면 아님)', () => {
    expect(isPermsShortcut({ altKey: true, key: 'a' })).toBe(true)
    expect(isPermsShortcut({ altKey: true, key: 'A' })).toBe(true)
    expect(isPermsShortcut({ altKey: true, ctrlKey: true, key: 'a' })).toBe(false)
    expect(isPermsShortcut({ altKey: true, shiftKey: true, key: 'a' })).toBe(false)
    expect(isPermsShortcut({ key: 'a' })).toBe(false)
  })
})

describe('패널의 권한 열 (PC)', () => {
  beforeEach(() => {
    useFileStore.setState(initial, true)
  })
  afterEach(() => cleanup())
  const mount = (path, files) => {
    useFileStore.setState(s => ({
      activePanel: 'left',
      left: { ...s.left, path, files, cursor: 0, cursorOnParent: false, selected: new Set(), showHidden: false,
        loading: false, error: null, tabs: [{ id: 't', path }], activeTabIdx: 0, viewMode: 'full' },
    }))
    return render(h(FilePanel, { side: 'left', onView: vi.fn(), onEdit: vi.fn() })).container
  }

  it('PC-01: 리눅스 폴더 — Mode · Owner 머리글과 칸', () => {
    const c = mount('/d', [f('run.sh', { mode: 0o4755 }), f('sub', { isDir: true, mode: 0o750, group: 'wheel' })])
    expect(screen.getByText('Mode')).toBeTruthy()
    expect(screen.getByText('Owner')).toBeTruthy()
    const modes = [...c.querySelectorAll('[data-col="mode"]')].map(e => e.textContent)
    expect(modes).toEqual(['-rwsr-xr-x', 'drwxr-x---'])
    const owners = [...c.querySelectorAll('[data-col="owner"]')].map(e => e.textContent)
    expect(owners).toEqual(['me:staff', 'me:wheel'])
  })

  it('PC-02: 소유자 정보가 없는 항목(압축 파일 안)은 빈 칸', () => {
    const c = mount('/d/a.zip', [f('x.txt', { owner: undefined, group: undefined, mode: 0 })])
    expect(c.querySelector('[data-col="mode"]').textContent).toBe('')
    expect(c.querySelector('[data-col="owner"]').textContent).toBe('')
  })

  it('PC-03: Windows 폴더 — 열 없음', () => {
    const c = mount('C:\\d', [f('a.txt', { path: 'C:\\d\\a.txt', owner: undefined })])
    expect(screen.queryByText('Mode')).toBeNull()
    expect(c.querySelector('[data-col="mode"]')).toBeNull()
  })

  it('PC-04: Mode · Owner 머리글을 누르면 그 기준으로 정렬', () => {
    mount('/d', [f('a', { mode: 0o755, owner: 'zed' }), f('b', { mode: 0o600, owner: 'ann' })])
    fireEvent.click(screen.getByText('Mode'))
    expect(useFileStore.getState().left.files.map(x => x.name)).toEqual(['b', 'a'])
    fireEvent.click(screen.getByText('Owner'))
    expect(useFileStore.getState().left.files.map(x => x.name)).toEqual(['b', 'a'])
    fireEvent.click(screen.getByText('Owner'))
    expect(useFileStore.getState().left.files.map(x => x.name)).toEqual(['a', 'b'])
  })
})

describe('권한 창 (PD)', () => {
  beforeEach(() => {
    api.GetOwnerChoices.mockReset().mockResolvedValue({ users: ['me', 'root'], groups: ['staff', 'wheel'] })
  })
  afterEach(() => cleanup())
  const mount = (files) => {
    const onConfirm = vi.fn(), onClose = vi.fn()
    render(h(PermissionsDialog, { files, onConfirm, onClose }))
    return { onConfirm, onClose }
  }
  const ok = () => screen.getByRole('button', { name: '바꾸기' })

  it('PD-01: 숫자 변환 헬퍼', () => {
    expect(toOctal(0o755)).toBe('0755')
    expect(toOctal(0o4755)).toBe('4755')
    expect(parseOctal('644')).toBe(0o644)
    expect(parseOctal(' 0755 ')).toBe(0o755)
    expect(parseOctal('8')).toBeNull()
    expect(parseOctal('77777')).toBeNull()
    expect(parseOctal('')).toBeNull()
    expect(permChanges(0o644, 0o755)).toEqual({ set: 0o111, clear: 0 })
    expect(permChanges(0o755, 0o700)).toEqual({ set: 0, clear: 0o055 })
  })

  it('PD-02: 처음 값이 표시되고, 바꾼 게 없으면 단추 꺼짐', async () => {
    mount([f('a.txt')])
    await act(async () => {})
    expect(screen.getByLabelText('숫자 권한').value).toBe('0644')
    expect(screen.getByLabelText('소유자 읽기').checked).toBe(true)
    expect(screen.getByLabelText('소유자 실행').checked).toBe(false)
    expect(screen.getByLabelText('소유자').value).toBe('me')
    expect(ok().disabled).toBe(true)
    expect(screen.queryByLabelText('하위 폴더까지')).toBeNull()
  })

  it('PD-03: 체크박스와 숫자 칸이 서로 맞춰짐, 바꾼 비트만 보냄', () => {
    const { onConfirm } = mount([f('a.txt')])
    fireEvent.click(screen.getByLabelText('소유자 실행'))
    expect(screen.getByLabelText('숫자 권한').value).toBe('0744')
    fireEvent.change(screen.getByLabelText('숫자 권한'), { target: { value: '4740' } })
    expect(screen.getByLabelText('setuid').checked).toBe(true)
    expect(screen.getByLabelText('기타 읽기').checked).toBe(false)
    fireEvent.click(ok())
    expect(onConfirm).toHaveBeenCalledWith({ set: 0o4100, clear: 0o004, owner: '', group: '', recursive: false })
  })

  it('PD-04: 잘못된 숫자는 단추 꺼짐', () => {
    mount([f('a.txt')])
    fireEvent.change(screen.getByLabelText('숫자 권한'), { target: { value: '0789' } })
    expect(ok().disabled).toBe(true)
  })

  it('PD-05: 여러 개 — 소유자가 다르면 빈 칸(그대로), 적으면 보냄', async () => {
    const { onConfirm } = mount([f('a', { owner: 'me' }), f('b', { owner: 'you', mode: 0o600 })])
    await act(async () => {})
    expect(screen.getByText(/2개 항목/)).toBeTruthy()
    expect(screen.getByLabelText('소유자').value).toBe('')
    expect(screen.getByLabelText('그룹').value).toBe('staff')
    fireEvent.change(screen.getByLabelText('소유자'), { target: { value: 'root' } })
    fireEvent.click(ok())
    expect(onConfirm).toHaveBeenCalledWith({ set: 0, clear: 0, owner: 'root', group: '', recursive: false })
  })

  it('PD-06: 소유자 · 그룹 후보를 datalist로', async () => {
    mount([f('a')])
    await act(async () => {})
    const opts = (id) => [...document.querySelectorAll(`#${id} option`)].map(o => o.value)
    expect(opts('perm-users')).toEqual(['me', 'root'])
    expect(opts('perm-groups')).toEqual(['staff', 'wheel'])
  })

  it('PD-07: 폴더면 하위까지 — 권한은 바꾼 비트만, 소유자 · 그룹은 적힌 값을 안까지', () => {
    const { onConfirm } = mount([f('sub', { isDir: true, mode: 0o755 })])
    fireEvent.click(screen.getByLabelText('하위 폴더까지'))
    expect(ok().disabled).toBe(false) // 같은 소유자라도 안의 항목에 맞춤
    fireEvent.click(screen.getByLabelText('기타 읽기'))
    fireEvent.click(ok())
    expect(onConfirm).toHaveBeenCalledWith({ set: 0, clear: 0o004, owner: 'me', group: 'staff', recursive: true })
  })

  it('PD-08: 폴더를 가리키는 링크는 하위까지 없음', () => {
    mount([f('lnk', { isDir: true, isSymlink: true, mode: 0o777 })])
    expect(screen.queryByLabelText('하위 폴더까지')).toBeNull()
  })
})

describe('changePerms (PS)', () => {
  beforeEach(() => {
    useFileStore.setState(initial, true)
    api.ChangeMode.mockReset().mockResolvedValue(undefined)
    api.ChangeOwner.mockReset().mockResolvedValue(undefined)
    api.ListDirectory.mockReset().mockResolvedValue({ path: '/d', files: [] })
    useFileStore.setState(s => ({ left: { ...s.left, path: '/d' } }))
  })

  it('PS-01: 바꾼 것만 호출하고 새로 고침', async () => {
    await useFileStore.getState().changePerms('left', ['/d/a'], { set: 0o100, clear: 0, owner: '', group: '', recursive: false })
    expect(api.ChangeMode).toHaveBeenCalledWith(['/d/a'], 0o100, 0, false)
    expect(api.ChangeOwner).not.toHaveBeenCalled()
    expect(api.ListDirectory).toHaveBeenCalledWith('/d')
    expect(useFileStore.getState().status).toMatch(/바꿈/)
  })

  it('PS-02: 소유자만이면 ChangeOwner만', async () => {
    await useFileStore.getState().changePerms('left', ['/d/a', '/d/b'], { set: 0, clear: 0, owner: 'root', group: 'wheel', recursive: true })
    expect(api.ChangeMode).not.toHaveBeenCalled()
    expect(api.ChangeOwner).toHaveBeenCalledWith(['/d/a', '/d/b'], 'root', 'wheel', true)
  })

  it('PS-03: 실패는 상태 줄에, 그래도 새로 고침 (일부는 바뀌었을 수 있음)', async () => {
    api.ChangeMode.mockRejectedValue(new Error('operation not permitted'))
    await useFileStore.getState().changePerms('left', ['/d/a'], { set: 0, clear: 0o222 })
    expect(useFileStore.getState().status).toMatch(/실패: operation not permitted/)
    expect(api.ListDirectory).toHaveBeenCalled()
  })
})
