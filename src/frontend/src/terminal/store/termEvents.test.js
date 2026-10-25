import { describe, it, expect, afterEach } from 'vitest'
import { acquireTerminalEvents } from './termEvents'
import { setTermBackend } from '../core/termApi'

// ─── Todo #126: Go 이벤트 구독 수명 — 작업 공간·도크가 함께 쓰고, 마지막이 놓으면 끊음 ──

let handlers
function backend() {
  handlers = new Map()
  setTermBackend({}, {
    EventsOn: (name, fn) => { handlers.set(name, fn); return () => handlers.delete(name) },
  })
}
afterEach(() => setTermBackend(null))

describe('터미널 이벤트 구독 (TEV)', () => {
  it('TEV-01: 처음 잡으면 출력·전송·스크립트 이벤트를 모두 구독', () => {
    backend()
    const release = acquireTerminalEvents()
    for (const n of ['term:data', 'term:open', 'term:closed', 'log:changed', 'xfer:progress', 'xfer:end', 'script:start', 'script:end']) {
      expect(handlers.has(n), n).toBe(true)
    }
    release()
    expect(handlers.size).toBe(0)
  })

  it('TEV-02: 둘이 잡으면(작업 공간 + 도크) 하나가 놓아도 계속, 마지막이 놓으면 끊음', () => {
    backend()
    const ws = acquireTerminalEvents()
    const dock = acquireTerminalEvents()
    ws()
    expect(handlers.has('term:data')).toBe(true)
    dock()
    expect(handlers.has('term:data')).toBe(false)
  })

  it('TEV-03: 같은 release를 두 번 불러도 다른 쪽 구독을 끊지 않음', () => {
    backend()
    const a = acquireTerminalEvents()
    const b = acquireTerminalEvents()
    a()
    a()
    expect(handlers.has('term:data')).toBe(true)
    b()
    expect(handlers.size).toBe(0)
  })
})
