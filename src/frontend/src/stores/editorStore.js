import { create } from 'zustand'

// 내장 뷰어(F3)·에디터(F4)의 열림 상태 (Todo #123). 파일 패널과 터미널의 원격 파일 창이 함께 씀.
// source: 파일을 읽고 쓰는 곳 (없으면 이 PC의 파일), onClose: 닫은 뒤 포커스를 돌려줄 곳 (없으면 파일 패널)
export const useEditorStore = create((set, get) => ({
  viewer: null, // { path, source, siblings, onClose }
  editor: null, // { path, source, onClose }

  openViewer: (path, { source, siblings, onClose } = {}) => set({ viewer: { path, source, siblings, onClose }, editor: null }),
  openEditor: (path, { source, onClose } = {}) => set({ editor: { path, source, onClose }, viewer: null }),

  // 닫고, 포커스를 돌려줄 onClose를 돌려줌
  closeViewer: () => { const v = get().viewer; set({ viewer: null }); return v?.onClose },
  closeEditor: () => { const e = get().editor; set({ editor: null }); return e?.onClose },

  viewerToEditor: () => {
    const v = get().viewer
    if (v) set({ viewer: null, editor: { path: v.path, source: v.source, onClose: v.onClose } })
  },
  editorToViewer: () => {
    const e = get().editor
    if (e) set({ editor: null, viewer: { path: e.path, source: e.source, siblings: undefined, onClose: e.onClose } })
  },
  changeViewerPath: (path) => set(s => (s.viewer ? { viewer: { ...s.viewer, path } } : {})),

  reset: () => set({ viewer: null, editor: null }),
}))
