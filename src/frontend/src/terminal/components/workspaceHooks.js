import { useEffect, useRef, useState } from 'react'
import { sessionById, allSessions } from '../core/session'
import { acquireTerminalEvents } from '../store/termEvents'
import { loadSettings, settings } from '../core/settings'
import { loadRules } from '../core/highlight'
import { startI18n, resolveLang } from '../core/i18n'
import { termApi, onTermEvent } from '../core/termApi'
import { applySavedTranslucency } from '../core/look'
import { checkUpdate } from '../core/update'
import { terminalTitle } from '../core/title'
import { installDebug } from '../core/debug'
import { useTermStore } from '../store/termStore'

// TerminalWorkspace가 쓰는 훅들 (Todo #126: 한 컴포넌트에 모여 있던 것을 나눔)

/** 작업 공간 시작: Go 이벤트 구독, 디버그 기록, 설정 → 강조·언어·투명도·업데이트 확인, 첫 탭. 웹 서버 상태({clients} | null)를 돌려줌 */
export function useTerminalBootstrap() {
  const [webServer, setWebServer] = useState(null)
  useEffect(() => {
    const releaseEvents = acquireTerminalEvents() // 도크와 함께 씀: 마지막이 놓으면 끊김
    installDebug()
    loadSettings().then(async () => {
      loadRules()
      // 언어: 설정, 비면 Go가 정한 언어 (Todo #124)
      const go = await Promise.resolve(termApi.GetLanguage()).catch(() => '')
      startI18n(resolveLang(settings.language, go))
      applySavedTranslucency()
      if (settings.updateCheck) checkUpdate(false)
    })
    if (useTermStore.getState().tabs.length === 0) useTermStore.getState().newTab()
    const offWeb = onTermEvent('web:status', (running, clients) => setWebServer(running ? { clients } : null))
    return () => { releaseEvents(); offWeb() }
  }, [])
  return webServer
}

/** 창 제목: 보이는 동안(shown) 활성 탭의 연결, 숨기면·닫으면 원래 제목 (Todo #124) */
export function useWindowTitle(shown, active) {
  const activeId = active?.id
  const baseTitle = useRef(typeof document !== 'undefined' ? document.title : '')
  useEffect(() => {
    const set = (title) => { document.title = title; window.runtime?.WindowSetTitle?.(title) }
    if (!shown) { set(baseTitle.current); return }
    const s = sessionById(activeId)
    set(terminalTitle(baseTitle.current, active && s ? { state: active.state, proto: active.proto, encoding: s.encoding, req: s.req, docker: active.docker } : undefined))
  }, [shown, activeId, active?.state, active?.proto, active?.label])
  useEffect(() => () => { document.title = baseTitle.current }, [])
}

/** 고양이: 칸들의 아래쪽(floorRef)을 걸어 다님, 설정을 따름 (Todo #124). 처음 쓸 때 불러옴 */
export function useCat(enabled, floorRef) {
  useEffect(() => {
    if (!enabled) return
    let alive = true
    let handle
    import('../core/cat').then(({ mountCat }) => {
      if (!alive) return
      handle = mountCat({
        floor: () => floorRef.current,
        cursorTerm: (ae) => {
          const own = allSessions().find(s => ae && s.term.element?.contains(ae))
          return (own ?? sessionById(useTermStore.getState().activeId))?.term
        },
        focusActive: () => sessionById(useTermStore.getState().activeId)?.focus(),
      })
      loadSettings().then(() => { if (alive) handle.apply() })
    })
    return () => { alive = false; handle?.dispose() }
  }, [enabled])
}
