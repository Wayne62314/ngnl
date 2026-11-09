import { defineStore } from 'pinia'
import { ref } from 'vue'
import { attrOf, type Attr } from '@/lib/types'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error' | 'level' | 'xp'
  color?: string
  attr?: Attr
}

/** A "+25" that floats up from where the user just clicked. */
export interface Floater {
  id: number
  x: number
  y: number
  text: string
  color: string
  attr: Attr
}

/** Last pointer press, so XP can float up from the button that earned it. */
let lastPointer = { x: 0, y: 0, at: 0 }
if (typeof window !== 'undefined')
  window.addEventListener('pointerdown', (e) => (lastPointer = { x: e.clientX, y: e.clientY, at: Date.now() }), { capture: true, passive: true })

let seq = 0

export const useUi = defineStore('ui', () => {
  /** Stack of item ids open in the drawer; following a link pushes, "back" pops. */
  const drawer = ref<string[]>([])
  const paletteOpen = ref(false)
  const toasts = ref<Toast[]>([])
  const floaters = ref<Floater[]>([])
  /** Set to show the full-screen level-up celebration. */
  const levelUp = ref<{ level: number; rank?: string } | null>(null)

  const open = (id: string) => {
    if (drawer.value.at(-1) !== id) drawer.value.push(id)
  }
  const back = () => drawer.value.pop()
  const close = () => (drawer.value = [])

  function toast(text: string, kind: Toast['kind'] = 'info', color?: string, attr?: Attr) {
    const t = { id: ++seq, text, kind, color, attr }
    toasts.value.push(t)
    setTimeout(() => (toasts.value = toasts.value.filter((x) => x.id !== t.id)), kind === 'error' ? 6000 : 2400)
  }
  /** XP gained: floats up from the click if there was one just now, otherwise a toast. */
  const xp = (attr: Attr, n: number, index = 0) => {
    const a = attrOf(attr)
    const text = `+${n} ${a.label}`
    if (Date.now() - lastPointer.at < 1500) {
      const f = { id: ++seq, x: lastPointer.x, y: lastPointer.y - index * 26, text, color: a.color, attr }
      floaters.value.push(f)
      setTimeout(() => (floaters.value = floaters.value.filter((x) => x.id !== f.id)), 1300)
    } else toast(text, 'xp', a.color, attr)
  }

  return { drawer, paletteOpen, toasts, floaters, levelUp, open, back, close, toast, xp }
})
