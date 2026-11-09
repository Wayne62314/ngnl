import { defineStore } from 'pinia'
import { ref } from 'vue'
import { attrOf, type Attr } from '@/lib/types'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error' | 'level' | 'xp'
  color?: string
}

let seq = 0

export const useUi = defineStore('ui', () => {
  /** Stack of item ids open in the drawer; following a link pushes, "back" pops. */
  const drawer = ref<string[]>([])
  const paletteOpen = ref(false)
  const toasts = ref<Toast[]>([])

  const open = (id: string) => {
    if (drawer.value.at(-1) !== id) drawer.value.push(id)
  }
  const back = () => drawer.value.pop()
  const close = () => (drawer.value = [])

  function toast(text: string, kind: Toast['kind'] = 'info', color?: string) {
    const t = { id: ++seq, text, kind, color }
    toasts.value.push(t)
    setTimeout(() => (toasts.value = toasts.value.filter((x) => x.id !== t.id)), kind === 'error' ? 6000 : 2400)
  }
  const xp = (attr: Attr, n: number) => {
    const a = attrOf(attr)
    toast(`+${n} ${a.label}`, 'xp', a.color)
  }

  return { drawer, paletteOpen, toasts, open, back, close, toast, xp }
})
