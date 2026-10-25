import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import FilePanel from './FilePanel.jsx'
import { useFileStore, isRootPath, parentDir } from '../stores/fileStore'
import { useFTPStore } from '../stores/ftpStore'
import { isFtpPath, ftpLabel } from '../utils/ftpPath.js'
import api from '../wailsjs/runtime'

// Todo #133-8: FTP를 파일 패널에서 — 드라이브 목록의 FTP 연결, ftp:// 경로, 연결 끊기

vi.mock('../wailsjs/runtime', () => ({ default: {
  SaveSessionState: vi.fn(() => Promise.resolve()), ListDirectory: vi.fn(), GetHomeDirectory: vi.fn(),
  FTPDisconnect: vi.fn(), FTPGetConnections: vi.fn(),
} }))

const h = React.createElement
Element.prototype.scrollIntoView = vi.fn()
const initial = useFileStore.getState()
const ID = 'ftp.example.com_21_99_1'
const conn = { id: ID, host: 'ftp.example.com', port: 21, username: 'bob', connected: true }

describe('FTP 경로 (FP)', () => {
  it('FP-01: ftp:// 루트는 [..] 없음, 부모 폴더는 ftp 경로 그대로', () => {
    expect(isRootPath(`ftp://${ID}/`)).toBe(true)
    expect(isRootPath(`ftp://${ID}/pub`)).toBe(false)
    expect(parentDir(`ftp://${ID}/pub`)).toBe(`ftp://${ID}/`)
    expect(parentDir(`ftp://${ID}/pub/x.txt`)).toBe(`ftp://${ID}/pub`)
    expect(isFtpPath(`ftp://${ID}/`)).toBe(true)
    expect(isFtpPath('C:\\ftp')).toBe(false)
  })
  it('FP-02: 이름표 — 연결 정보가 있으면 user@host, 없으면 ID 앞부분', () => {
    expect(ftpLabel(`ftp://${ID}/pub`, [conn])).toBe('bob@ftp.example.com')
    expect(ftpLabel(`ftp://${ID}/pub`, [])).toBe('ftp.example.com')
  })
})

describe('FTP 패널 (FT)', () => {
  beforeEach(() => {
    useFileStore.setState(initial, true)
    api.ListDirectory.mockReset().mockImplementation(async (p) => ({ path: p, files: [] }))
    api.GetHomeDirectory.mockReset().mockResolvedValue('/home')
    api.FTPDisconnect.mockReset().mockResolvedValue(undefined)
    api.FTPGetConnections.mockReset().mockResolvedValue([])
    useFTPStore.setState({ connections: [conn] })
  })
  afterEach(() => cleanup())

  function mount(path = '/d', props = {}) {
    useFileStore.setState(s => ({
      activePanel: 'left',
      drives: [{ name: 'C:', path: 'C:\\', driveType: 'NTFS' }],
      left: { ...s.left, path, files: [], cursor: 0, cursorOnParent: false, selected: new Set(), showHidden: false,
        loading: false, error: null, tabs: [{ id: 't', path }], activeTabIdx: 0 },
    }))
    const onFtpConnect = vi.fn()
    render(h(FilePanel, { side: 'left', onView: vi.fn(), onEdit: vi.fn(), onFtpConnect, ...props }))
    return { onFtpConnect }
  }
  const driveSelect = () => document.querySelector('select')
  const crumbs = () => [...document.querySelectorAll('[class*="breadcrumbPart"]')].map(e => e.textContent)

  it('FT-01: 드라이브 목록에 FTP 연결과 "FTP 연결..."', () => {
    mount()
    const labels = [...driveSelect().options].map(o => o.textContent)
    expect(labels).toContain('FTP: bob@ftp.example.com')
    expect(labels).toContain('FTP 연결...')
  })

  it('FT-02: FTP 연결을 고르면 그 루트로, "FTP 연결..."은 연결 창', async () => {
    const { onFtpConnect } = mount()
    await act(async () => { fireEvent.change(driveSelect(), { target: { value: `ftp://${ID}/` } }) })
    expect(api.ListDirectory).toHaveBeenCalledWith(`ftp://${ID}/`)
    fireEvent.change(driveSelect(), { target: { value: '__ftp_connect__' } })
    expect(onFtpConnect).toHaveBeenCalled()
  })

  it('FT-03: FTP 폴더에서는 경로에 user@host, [..] 없음(루트), 연결 끊기 단추 → 끊고 홈으로', async () => {
    mount(`ftp://${ID}/`)
    expect(crumbs()).toEqual(['bob@ftp.example.com'])
    expect(screen.queryByText('[..]')).toBeNull()
    await act(async () => { fireEvent.click(screen.getByTitle('FTP 연결 끊기')) })
    expect(api.FTPDisconnect).toHaveBeenCalledWith(ID)
    await waitFor(() => expect(api.ListDirectory).toHaveBeenCalledWith('/home'))
  })

  it('FT-04: 하위 폴더 경로 표시', () => {
    mount(`ftp://${ID}/pub/docs`)
    expect(crumbs()).toEqual(['bob@ftp.example.com', 'pub', 'docs'])
    expect(screen.getByText('[..]')).toBeTruthy()
  })

  it('FT-05: 다시 시작할 때 저장된 FTP 탭은 홈으로 (연결이 없어짐)', async () => {
    api.GetDrives = vi.fn().mockResolvedValue([])
    api.LoadPanelPaths = vi.fn().mockResolvedValue({
      leftTabs: { paths: [`ftp://${ID}/pub`, '/l'], activeIdx: 0 }, rightTabs: { paths: ['/r'], activeIdx: 0 },
    })
    await useFileStore.getState().init()
    expect(useFileStore.getState().left.path).toBe('/home')
    expect(useFileStore.getState().left.tabs.map(t => t.path)).toEqual(['/home', '/l'])
  })
})
