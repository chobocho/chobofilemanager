import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, cleanup, waitFor } from '@testing-library/react'
import WebStartNotice from './WebStartNotice.jsx'
import { setTermBackend } from '../terminal/core/termApi'
import { useFileStore } from '../stores/fileStore'

// ─── Todo #128: 터미널 웹 서버를 켜 두었는데 시작하지 못하면 알림 (전에는 디버그 기록에만) ──

let api
beforeEach(() => {
  api = { WebStatus: vi.fn() }
  setTermBackend(api, { EventsOn: () => () => {} })
  useFileStore.setState({ status: '' })
})
afterEach(() => { cleanup(); setTermBackend(null) })

describe('웹 서버 시작 실패 알림 (WN)', () => {
  it('WN-01: 켜 두었는데 못 띄웠으면 상태 줄에 이유', async () => {
    api.WebStatus.mockResolvedValue({ enabled: true, running: false, addr: '127.0.0.1:7681', error: 'listen tcp: address already in use' })
    render(<WebStartNotice />)
    await waitFor(() => expect(useFileStore.getState().status).toBe('터미널 웹 서버(127.0.0.1:7681)를 시작하지 못했습니다: listen tcp: address already in use'))
  })

  it('WN-02: 꺼져 있거나 잘 돌면 아무 말 없음, 바인딩이 없어도(브라우저 개발) 조용히', async () => {
    api.WebStatus.mockResolvedValue({ enabled: true, running: true, error: '' })
    const u = render(<WebStartNotice />)
    await waitFor(() => expect(api.WebStatus).toHaveBeenCalled())
    u.unmount()
    api.WebStatus.mockResolvedValue({ enabled: false, running: false, error: 'x' })
    render(<WebStartNotice />)
    await waitFor(() => expect(api.WebStatus).toHaveBeenCalledTimes(2))
    setTermBackend(null)
    render(<WebStartNotice />)
    await new Promise(r => setTimeout(r, 0))
    expect(useFileStore.getState().status).toBe('')
  })
})
