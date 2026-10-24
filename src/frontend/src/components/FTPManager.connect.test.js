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
