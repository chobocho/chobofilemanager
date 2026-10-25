import { create } from 'zustand'
import { termApi, onTermEvent } from '../core/termApi'
import { sessionById } from '../core/session'
import {
  emptyView, listed, select as selectRow, selectAll as selectAllRows, pickedEntries, joinPath, parentPath,
  folderKey, keepAfterDelete, isUp,
} from '../core/remoteFiles'
import { useFileStore, getCursorFile } from '../../stores/fileStore'
import { useEditorStore } from '../../stores/editorStore'
import { createRemoteSource } from '../core/remoteSource'
import { viewable } from '../core/remoteFiles'
import { isImageFile } from '../../utils/fileTypes.js'
import { errText } from '../core/errText'

const extOf = (name) => (name.includes('.') ? '.' + name.split('.').pop() : '')
// 보기를 닫은 뒤 포커스를 돌려줄 곳: 원격 파일 목록 (aria-label은 영어 화면에서 바뀌므로 전용 속성으로 찾음)
const focusRemoteList = () => requestAnimationFrame(() => document.querySelector('[data-remote-grid]')?.focus())

// 원격 파일 창 (Todo #123, choboTerm files.ts). 탭마다 창 하나 — 보이는 건 활성 탭의 창이고,
// 다른 탭의 창은 폴더·선택·진행 중인 전송을 그대로 둡니다.
// views[tabId] = { ...RemoteView, heading, busy, status, statusOk, marks }


// 활성 파일 패널의 폴더 / 선택 항목(없으면 커서 항목)
function panelFolder() {
  const s = useFileStore.getState()
  return { side: s.activePanel, path: s[s.activePanel]?.path }
}
function panelTargets() {
  const s = useFileStore.getState()
  const p = s[s.activePanel]
  if (!p) return []
  const sel = [...(p.selected ?? [])]
  if (sel.length) return sel
  const cur = getCursorFile(p)
  return cur ? [cur.path] : []
}

let xferStarted = 0

export const useFilesStore = create((set, get) => {
  const view = (id) => get().views[id]
  const patch = (id, p) => set(s => (s.views[id] ? { views: { ...s.views, [id]: { ...s.views[id], ...p } } } : {}))
  const setStatus = (id, status, ok = false) => patch(id, { status, statusOk: ok })

  // 원격 작업 하나를 바쁨 상태로 실행 — 오류는 상태 줄에
  async function run(id, op) {
    const v = view(id)
    if (!v || v.busy) return
    patch(id, { busy: true, status: '', statusOk: false })
    try {
      await op()
    } catch (e) {
      setStatus(id, errText(e))
    } finally {
      patch(id, { busy: false })
    }
  }

  return {
    views: {},
    xfer: null, // { tabId, name, done, total, upload, secs }

    // 탭의 파일 창 열기 (이미 있으면 그대로). 터미널의 현재 폴더(OSC 7)가 있으면 거기서 시작.
    // 파일 접근이 안 되는 연결이면 예외
    open: async (id, host) => {
      if (view(id)) return
      const res = await termApi.FileOpen(id)
      const startDir = sessionById(id)?.cwd
      const start = startDir ? await termApi.FileStartDir(id, startDir).catch(() => '') : ''
      const home = res.home || '/'
      set(s => ({ views: { ...s.views, [id]: {
        ...emptyView(home, ''), heading: `파일 전송 (${res.protocol}) - ${host}`,
        busy: false, status: '', statusOk: false, marks: [],
      } } }))
      await get().reloadMarks(id)
      await get().load(id, start || home)
      if (startDir && !start && !view(id)?.status) setStatus(id, `터미널의 현재 폴더(${startDir})를 열 수 없어 홈 폴더를 엽니다`)
    },

    // 창 닫기: 진행 중인 전송은 취소
    close: (id) => {
      const v = view(id)
      if (!v) return
      if (v.busy) termApi.FileCancel(id).catch(() => undefined)
      get().forget(id)
    },

    // 탭이 닫힘: 콜백 없이 정리
    forget: (id) => set(s => {
      if (!s.views[id]) return {}
      const views = { ...s.views }
      delete views[id]
      return { views, xfer: s.xfer?.tabId === id ? null : s.xfer }
    }),

    // dir 목록. names가 있으면 그 항목들을 선택
    load: async (id, dir, names) => {
      if (!view(id)) return
      patch(id, { busy: true, status: '', statusOk: false })
      try {
        const list = (await termApi.FileList(id, dir)) ?? []
        if (view(id)) patch(id, listed(view(id), dir, list, names))
      } catch (e) {
        setStatus(id, errText(e))
      } finally {
        patch(id, { busy: false })
      }
    },

    refresh: (id) => get().load(id, view(id)?.cwd ?? '/'),

    goUp: (id) => {
      const v = view(id)
      if (!v || v.busy || v.cwd === '/') return
      const from = v.cwd.replace(/\/+$/, '').split('/').pop()
      return get().load(id, parentPath(v.cwd), from ? [from] : undefined)
    },

    select: (id, i, mode) => { const v = view(id); if (v) patch(id, selectRow(v, i, mode)) },
    selectAll: (id) => { const v = view(id); if (v) patch(id, selectAllRows(v)) },

    // 행 열기: 폴더면 들어가고 파일이면 다운로드
    enter: async (id, i) => {
      const v = view(id)
      const e = v?.entries[i]
      if (!e || v.busy) return
      if (isUp(e)) return get().goUp(id)
      if (e.isDir) return get().load(id, joinPath(v.cwd, e.name))
      return get().download(id)
    },

    download: (id) => {
      const v = view(id)
      const list = v ? pickedEntries(v) : []
      if (!list.length) return
      return run(id, async () => {
        const e = list[0]
        if (list.length === 1 && !e.isDir) {
          const local = await termApi.FileDownload(id, joinPath(v.cwd, e.name), e.size)
          if (local) setStatus(id, `저장했습니다: ${local}`, true)
          return
        }
        // 여러 개나 폴더: 받을 폴더를 고름
        const res = await termApi.FileDownloadMany(id, v.cwd, list)
        if (res.dir) setStatus(id, `${res.count}개 파일을 저장했습니다: ${res.dir}`, true)
      })
    },

    // 활성 파일 패널의 폴더로 받기 (대화상자 없이), 받은 뒤 패널 새로 고침
    downloadToPanel: (id) => {
      const v = view(id)
      const list = v ? pickedEntries(v) : []
      const { side, path } = panelFolder()
      if (!list.length || !path) return
      return run(id, async () => {
        const res = await termApi.FileDownloadTo(id, v.cwd, list, path)
        setStatus(id, `${res.count}개 파일을 파일 패널 폴더에 받았습니다: ${res.dir}`, true)
        await useFileStore.getState().refresh(side)
      })
    },

    upload: (id) => run(id, async () => {
      const n = await termApi.FileUpload(id, view(id).cwd)
      await get().uploaded(id, n, [])
    }),

    // 경로 올리기 (끌어 놓기, 파일 패널의 선택 항목)
    uploadPaths: (id, paths) => {
      if (!paths.length) return
      if (view(id)?.busy) return setStatus(id, '전송이 끝난 뒤에 다시 하세요')
      const names = paths.map(p => p.split(/[\\/]/).pop() ?? p)
      return run(id, async () => get().uploaded(id, await termApi.FileUploadPaths(id, view(id).cwd, paths), names))
    },

    uploadFromPanel: (id) => {
      const paths = panelTargets()
      if (!paths.length) return setStatus(id, '파일 패널에서 올릴 항목을 고르세요')
      return get().uploadPaths(id, paths)
    },

    uploaded: async (id, n, names) => {
      if (!n) return
      patch(id, { busy: false })
      await get().load(id, view(id).cwd, names)
      setStatus(id, `${n}개 파일을 업로드했습니다`, true)
    },

    // 삭제 (확인은 화면이 받음)
    remove: (id, list) => {
      const v = view(id)
      if (!v || !list.length) return
      const keep = keepAfterDelete(v, list)
      return run(id, async () => {
        let n = 0
        try {
          n = await termApi.FileDelete(id, v.cwd, list)
        } finally {
          patch(id, { busy: false })
          await get().load(id, v.cwd, keep ? [keep] : undefined)
        }
        setStatus(id, `${n}개 항목을 삭제했습니다`, true)
      })
    },

    rename: (id, from, to) => run(id, async () => {
      await termApi.FileRename(id, view(id).cwd, from, to)
      patch(id, { busy: false })
      await get().load(id, view(id).cwd, [to])
    }),

    mkdir: (id, name) => run(id, async () => {
      await termApi.FileMkdir(id, view(id).cwd, name)
      patch(id, { busy: false })
      await get().load(id, view(id).cwd, [name])
    }),

    newFile: (id, name) => run(id, async () => {
      await termApi.FileCreate(id, view(id).cwd, name)
      patch(id, { busy: false })
      await get().load(id, view(id).cwd, [name])
    }),

    // F3 보기 / F4 편집 (App의 뷰어·에디터, 원격 소스). 이미지는 폴더의 다른 이미지와 함께
    view: (id, edit = false) => {
      const v = view(id)
      const e = v && viewable(v)
      if (!e || v.busy) return
      const dir = v.cwd
      const host = v.heading.replace(/^.* - /, '')
      const path = joinPath(dir, e.name)
      const images = v.entries.filter(x => !x.isDir && !isUp(x) && isImageFile(extOf(x.name)))
      const source = createRemoteSource(id, {
        host, path, size: e.size,
        sizes: Object.fromEntries(images.map(x => [joinPath(dir, x.name), x.size])),
        // 저장하면 목록의 크기·시각도 새로
        onSaved: () => { const now = view(id); if (now && !now.busy && now.cwd === dir) get().load(id, dir, [e.name]) },
      })
      const ed = useEditorStore.getState()
      if (edit) return ed.openEditor(path, { source, onClose: focusRemoteList })
      const isImg = isImageFile(extOf(e.name))
      ed.openViewer(path, { source, onClose: focusRemoteList, siblings: isImg ? images.map(x => joinPath(dir, x.name)) : undefined })
    },

    // ── 즐겨찾기 (같은 서버의 다른 탭과 공유) ──
    reloadMarks: async (id) => {
      try {
        patch(id, { marks: (await termApi.FileBookmarks(id)) ?? [] })
      } catch {
        // 있던 목록 유지
      }
    },

    toggleMark: async (id) => {
      await get().reloadMarks(id)
      const v = view(id)
      if (!v) return
      const dir = folderKey(v.cwd)
      const had = v.marks.includes(dir)
      const list = had ? v.marks.filter(d => d !== dir) : [...v.marks, dir]
      try {
        await termApi.SetFileBookmarks(id, list)
        patch(id, { marks: list })
        setStatus(id, had ? `즐겨찾기에서 뺐습니다: ${dir}` : `즐겨찾기에 추가했습니다: ${dir}`, true)
      } catch (e) {
        setStatus(id, errText(e))
      }
    },

    removeMark: async (id, dir) => {
      await get().reloadMarks(id)
      const list = (view(id)?.marks ?? []).filter(d => d !== dir)
      try {
        await termApi.SetFileBookmarks(id, list)
        patch(id, { marks: list })
        setStatus(id, `즐겨찾기에서 뺐습니다: ${dir}`, true)
      } catch (e) {
        setStatus(id, errText(e))
      }
    },

    goTo: (id, dir) => {
      const v = view(id)
      if (v && !v.busy && folderKey(dir) !== folderKey(v.cwd)) return get().load(id, dir)
    },

    goToMark: async (id, n) => {
      await get().reloadMarks(id)
      const dir = view(id)?.marks[n - 1]
      if (dir) return get().goTo(id, dir)
      setStatus(id, `${n}번 즐겨찾기가 없습니다`)
    },

    // ── 전송 진행 (xfer:progress / xfer:end) ──
    progress: (id, p) => {
      const x = get().xfer
      if (!x || p.done === 0 || x.tabId !== id) xferStarted = Date.now()
      set({ xfer: { tabId: id, ...p, secs: (Date.now() - xferStarted) / 1000 } })
    },
    ended: (id) => { if (get().xfer?.tabId === id) set({ xfer: null }) },
    cancelTransfer: () => { const x = get().xfer; if (x) termApi.FileCancel(x.tabId).catch(() => undefined) },

    resetForTest: () => set({ views: {}, xfer: null }),
  }
})

let xferOff = []
/** Subscribes the progress box to the Go transfer events (once). */
export function startTransferEvents() {
  if (xferOff.length) return
  xferOff = [
    onTermEvent('xfer:progress', (id, p) => useFilesStore.getState().progress(id, p)),
    onTermEvent('xfer:end', (id) => useFilesStore.getState().ended(id)),
  ]
}
export function stopTransferEvents() {
  xferOff.forEach(off => off())
  xferOff = []
}
