import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('../wailsjs/runtime', () => ({ default: {} }))

import { ConnectModal } from './FTPManager.jsx'

const h = React.createElement

// ─── Todo #81: 접속 창에서 TLS 사용 선택 ──────────────────────────────────────
describe('ConnectModal TLS (Todo #81)', () => {
  afterEach(() => cleanup())

  it('FT-01: 기본값은 useTls=false', () => {
    const onConnect = vi.fn()
    render(h(ConnectModal, { onConnect, onClose: () => {} }))
    fireEvent.change(screen.getByPlaceholderText('ftp.example.com'), { target: { value: 'h' } })
    fireEvent.click(screen.getByText('Connect', { selector: 'button' }))
    expect(onConnect.mock.calls[0][0].useTls).toBe(false)
  })

  it('FT-02: TLS 체크 시 useTls=true로 전달', () => {
    const onConnect = vi.fn()
    render(h(ConnectModal, { onConnect, onClose: () => {} }))
    fireEvent.change(screen.getByPlaceholderText('ftp.example.com'), { target: { value: 'h' } })
    fireEvent.click(screen.getByLabelText('Use TLS (FTPS)'))
    fireEvent.click(screen.getByText('Connect', { selector: 'button' }))
    expect(onConnect.mock.calls[0][0].useTls).toBe(true)
  })
})

// ─── Todo #85: 원격 삭제 대상/확인 메시지 ─────────────────────────────────────
import { ftpDeleteTargets, ftpDeleteMessage } from './FTPManager.jsx'

describe('FTP 삭제 대상 (Todo #85)', () => {
  const files = [
    { path: '/a.txt', name: 'a.txt', isDir: false },
    { path: '/docs', name: 'docs', isDir: true },
  ]

  it('FD-01: 목록에서 폴더 여부를 찾아 전달', () => {
    const t = ftpDeleteTargets(new Set(['/a.txt', '/docs']), files)
    expect(t).toEqual([
      { path: '/a.txt', name: 'a.txt', isDir: false },
      { path: '/docs', name: 'docs', isDir: true },
    ])
  })

  it('FD-02: 목록에 없는 경로는 파일로 간주', () => {
    expect(ftpDeleteTargets(['/x/y.bin'], files)).toEqual([{ path: '/x/y.bin', name: 'y.bin', isDir: false }])
  })

  it('FD-03: 확인 메시지에 개수, 폴더 경고, 이름 포함', () => {
    const msg = ftpDeleteMessage(ftpDeleteTargets(['/a.txt', '/docs'], files))
    expect(msg).toContain('2개 항목')
    expect(msg).toContain('폴더 1개')
    expect(msg).toContain('a.txt, docs')
  })
})
