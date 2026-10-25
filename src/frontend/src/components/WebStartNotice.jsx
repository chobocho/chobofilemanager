import { useEffect } from 'react'
import { termApi } from '../terminal/core/termApi'
import { useFileStore } from '../stores/fileStore'

// 터미널 웹 서버(터미널 설정 > 웹 서버)를 켜 두었는데 시작하지 못했으면(포트를 다른 프로그램이 씀 등) 상태 줄에 알림 (Todo #128).
// 시작은 창이 뜨기 전에 Go에서 하므로 이벤트가 아니라 처음 한 번 상태를 물어봄. 화면은 그리지 않음
export default function WebStartNotice() {
  useEffect(() => {
    let alive = true
    Promise.resolve(termApi.WebStatus()).then(info => {
      if (alive && info?.enabled && !info.running && info.error) {
        useFileStore.getState().setStatus(`터미널 웹 서버(${info.addr})를 시작하지 못했습니다: ${info.error}`)
      }
    }).catch(() => undefined)
    return () => { alive = false }
  }, [])
  return null
}
