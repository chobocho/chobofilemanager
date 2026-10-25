import { useRef, useState } from 'react'

// 비동기 작업이 끝날 때까지 다시 실행하지 않게 막음 (Todo #130-3 — 충돌 창 단추 연타로 복사/이동이 두 번 실행되던 문제).
// 같은 틱의 두 번째 클릭도 막도록 상태가 아니라 ref로 판단하고, busy는 단추 비활성 표시용.
export function useBusyGuard() {
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const guard = (fn) => async (...args) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      await fn(...args)
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  return [busy, guard]
}
