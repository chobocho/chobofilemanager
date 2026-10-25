import { create } from 'zustand'
import api from '../wailsjs/runtime'

// 사용자 단추 막대 (Todo #133-12): 목록은 Go가 ~/.chobocho-commander/buttonbar.json에 저장

const newId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const useButtonStore = create((set, get) => ({
  buttons: [],

  load: async () => {
    try {
      set({ buttons: (await api.GetUserButtons()) || [] })
    } catch {
      set({ buttons: [] })
    }
  },

  _save: async (buttons) => {
    set({ buttons })
    await api.SaveUserButtons(buttons)
  },

  // id가 있으면 고치고, 없으면 끝에 추가
  upsert: async (btn) => {
    const list = get().buttons
    if (btn.id && list.some(b => b.id === btn.id)) {
      return get()._save(list.map(b => (b.id === btn.id ? { ...b, ...btn } : b)))
    }
    return get()._save([...list, { ...btn, id: btn.id || newId() }])
  },

  remove: async (id) => get()._save(get().buttons.filter(b => b.id !== id)),

  // dir: -1 앞으로, +1 뒤로
  move: async (id, dir) => {
    const list = [...get().buttons]
    const i = list.findIndex(b => b.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    return get()._save(list)
  },
}))
