import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'
import Toolbar from './Toolbar.jsx'
import { setTermBackend } from '../terminal/core/termApi'
import { resetSettingsForTest, saveSettings } from '../terminal/core/settings'

// ─── 상단 FTP 버튼 숨기기/보이기 (설정 > 파일 관리자) ─────────────────────────

let api
beforeEach(() => {
  resetSettingsForTest()
  api = { GetSettings: vi.fn().mockResolvedValue({}), SaveSettings: vi.fn().mockResolvedValue(undefined) }
  setTermBackend(api, { EventsOn: () => () => {} })
})
afterEach(() => { cleanup(); setTermBackend(null) })

const noop = () => {}
const renderBar = (props = {}) => render(<Toolbar view="files" onViewChange={noop} onRename={noop} onCopy={noop}
  onMove={noop} onNewDir={noop} onDelete={noop} {...props} />)

describe('상단 FTP 버튼 (TF)', () => {
  it('TF-01: 기본은 보임, 설정을 바꾸면 바로 숨김/표시', async () => {
    renderBar()
    expect(screen.getByTitle('FTP Manager')).toBeTruthy()
    act(() => saveSettings(s => { s.hideFtpButton = true }))
    expect(screen.queryByTitle('FTP Manager')).toBeNull()
    act(() => saveSettings(s => { s.hideFtpButton = false }))
    expect(screen.getByTitle('FTP Manager')).toBeTruthy()
  })

  it('TF-02: 시작할 때 저장된 설정을 읽어 숨김', async () => {
    api.GetSettings.mockResolvedValue({ hideFtpButton: true })
    renderBar()
    await waitFor(() => expect(screen.queryByTitle('FTP Manager')).toBeNull())
  })

  it('TF-03: FTP 화면에서 숨기면 Files 화면으로', async () => {
    const onViewChange = vi.fn()
    renderBar({ view: 'ftp', onViewChange })
    act(() => saveSettings(s => { s.hideFtpButton = true }))
    expect(onViewChange).toHaveBeenCalledWith('files')
  })
})
