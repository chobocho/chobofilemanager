import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../wailsjs/runtime', () => ({
  default: {
    FTPConnect: vi.fn(),
    FTPDisconnect: vi.fn().mockResolvedValue(undefined),
    FTPGetConnections: vi.fn(),
  }
}))

// ─── Todo #80: connect는 백엔드가 돌려준 id의 연결을 반환 ──────────────────────
describe('ftpStore.connect (Todo #80)', () => {
  let useFTPStore, api

  beforeEach(async () => {
    vi.resetModules()
    useFTPStore = (await import('./ftpStore.js')).useFTPStore
    api = (await import('../wailsjs/runtime')).default
  })

  it('FC-01: 목록의 마지막이 아니라 id가 일치하는 연결 반환', async () => {
    api.FTPConnect.mockResolvedValue('b_2')
    api.FTPGetConnections.mockResolvedValue([
      { id: 'b_2', host: 'b' },
      { id: 'a_1', host: 'a' },
    ])
    const conn = await useFTPStore.getState().connect({ host: 'b' })
    expect(conn.id).toBe('b_2')
    expect(conn.host).toBe('b')
  })

  it('FC-02: 연결 목록이 null이어도 오류 없이 처리', async () => {
    api.FTPConnect.mockResolvedValue('x')
    api.FTPGetConnections.mockResolvedValue(null)
    const conn = await useFTPStore.getState().connect({ host: 'x' })
    expect(conn).toBeNull()
    expect(useFTPStore.getState().connections).toEqual([])
  })
})
