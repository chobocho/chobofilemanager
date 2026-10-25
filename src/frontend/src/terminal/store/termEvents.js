import { startEventRouter, stopEventRouter } from '../core/session'
import { startTransferEvents, stopTransferEvents } from './filesStore'
import { startScriptEvents, stopScriptEvents } from './scriptStore'

// Go 이벤트 구독의 수명 (Todo #126): Terminal 보기와 하단 도크가 함께 씀.
// 잡는 쪽마다 release를 받고, 마지막이 놓으면 모두 끊음 (구독 함수들은 이미 돌고 있으면 그대로)
let users = 0

export function acquireTerminalEvents() {
  users++
  startEventRouter()
  startTransferEvents()
  startScriptEvents()
  let released = false
  return () => {
    if (released) return
    released = true
    users = Math.max(0, users - 1)
    if (users === 0) {
      stopEventRouter()
      stopTransferEvents()
      stopScriptEvents()
    }
  }
}
