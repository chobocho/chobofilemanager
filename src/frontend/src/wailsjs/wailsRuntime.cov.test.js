import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as rt from '../../wailsjs/runtime/runtime.js'

// Wails JS 런타임 래퍼: 모든 함수가 window.runtime.<동일 이름>으로 위임되는지 검사
describe('Wails 런타임 래퍼 (wailsjs/runtime/runtime.js)', () => {
  let fake
  beforeEach(() => {
    fake = new Proxy({}, {
      get(target, prop) {
        if (!(prop in target)) target[prop] = vi.fn(() => `ret:${String(prop)}`)
        return target[prop]
      },
    })
    window.runtime = fake
  })
  afterEach(() => { delete window.runtime })

  const indirect = new Set(['EventsOn', 'EventsOnce'])

  it('WR-01: 모든 export가 같은 이름의 window.runtime 함수로 인자와 함께 위임', () => {
    const names = Object.keys(rt).filter(n => typeof rt[n] === 'function' && !indirect.has(n))
    expect(names.length).toBeGreaterThan(40)
    for (const name of names) {
      rt[name]('a1', 'a2', 'a3', 'a4')
      expect(fake[name], name).toHaveBeenCalled()
      const args = fake[name].mock.calls[0]
      // 인자를 받는 함수는 첫 인자를 그대로 전달
      if (rt[name].length > 0) expect(args[0], name).toBe('a1')
    }
  })

  it('WR-02: 반환값이 있는 함수는 window.runtime 결과를 그대로 반환', () => {
    expect(rt.WindowGetSize()).toBe('ret:WindowGetSize')
    expect(rt.ClipboardGetText()).toBe('ret:ClipboardGetText')
    expect(rt.ClipboardSetText('x')).toBe('ret:ClipboardSetText')
    expect(rt.Environment()).toBe('ret:Environment')
    expect(rt.ResolveFilePaths(['f'])).toBe('ret:ResolveFilePaths')
  })

  it('WR-03: EventsOn은 maxCallbacks=-1, EventsOnce는 1로 EventsOnMultiple 호출', () => {
    const cb = () => {}
    rt.EventsOn('ev', cb)
    expect(fake.EventsOnMultiple).toHaveBeenLastCalledWith('ev', cb, -1)
    rt.EventsOnce('ev2', cb)
    expect(fake.EventsOnMultiple).toHaveBeenLastCalledWith('ev2', cb, 1)
  })

  it('WR-04: EventsEmit은 모든 인자를 전달, EventsOff는 추가 이벤트명도 전달', () => {
    rt.EventsEmit('ev', 1, 2)
    expect(fake.EventsEmit).toHaveBeenCalledWith('ev', 1, 2)
    rt.EventsOff('a', 'b', 'c')
    expect(fake.EventsOff).toHaveBeenCalledWith('a', 'b', 'c')
  })

  it('WR-05: 좌표/크기 인자를 가진 함수는 모든 인자 전달', () => {
    rt.WindowSetSize(800, 600)
    expect(fake.WindowSetSize).toHaveBeenCalledWith(800, 600)
    rt.WindowSetPosition(1, 2)
    expect(fake.WindowSetPosition).toHaveBeenCalledWith(1, 2)
    rt.WindowSetBackgroundColour(1, 2, 3, 4)
    expect(fake.WindowSetBackgroundColour).toHaveBeenCalledWith(1, 2, 3, 4)
    rt.OnFileDrop('cb', true)
    expect(fake.OnFileDrop).toHaveBeenCalledWith('cb', true)
  })

  it('WR-06: window.runtime이 없으면 Quit은 예외 발생 (FKeyBar가 try/catch로 감쌈)', () => {
    delete window.runtime
    expect(() => rt.Quit()).toThrow()
  })
})
