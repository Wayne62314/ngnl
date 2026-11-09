<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CornerDownLeft, Plus } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { today } from '@/lib/dates'
import { itemIcon, search, titleOf } from '@/lib/itemView'
import { typeLabel, type Item, type ItemType } from '@/lib/types'

const data = useData()
const ui = useUi()
const q = ref('')
const active = ref(0)
const input = ref<HTMLInputElement>()

type Row =
  | { kind: 'item'; item: Item }
  | { kind: 'create'; type: ItemType; extra?: Record<string, unknown>; label: string }

const CREATES: { type: ItemType; label: string; extra?: Record<string, unknown> }[] = [
  { type: 'task', label: '任务' },
  { type: 'note', label: '灵感', extra: { kind: 'idea', status: 'seed' } },
  { type: 'note', label: '情报', extra: { kind: 'intel' } },
  { type: 'habit', label: '习惯' },
  { type: 'goal', label: '目标' },
  { type: 'person', label: '人物' },
  { type: 'event', label: '经历' },
]

const rows = computed<Row[]>(() => {
  const items = search(data.items, q.value, 12).map((item) => ({ kind: 'item' as const, item }))
  const creates = q.value.trim()
    ? CREATES.map((c) => ({ kind: 'create' as const, type: c.type, extra: c.extra, label: `新建${c.label}「${q.value.trim()}」` }))
    : []
  return [...items, ...creates]
})

watch(
  () => ui.paletteOpen,
  async (o) => {
    if (!o) return
    q.value = ''
    active.value = 0
    await nextTick()
    input.value?.focus()
  },
)
watch(q, () => (active.value = 0))

async function choose(r: Row | undefined) {
  if (!r) return
  ui.paletteOpen = false
  if (r.kind === 'item') return ui.open(r.item.id)
  const extra: Record<string, unknown> = { ...r.extra, title: q.value.trim() }
  if (r.type === 'event') extra.date = today()
  const it = await data.create(r.type, extra)
  if (it) ui.open(it.id)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = Math.min(rows.value.length - 1, active.value + 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = Math.max(0, active.value - 1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    choose(rows.value[active.value])
  } else if (e.key === 'Escape') ui.paletteOpen = false
}
</script>

<template>
  <Transition name="fade">
    <div v-if="ui.paletteOpen" class="scrim" @mousedown.self="ui.paletteOpen = false">
      <div class="palette" role="dialog" aria-label="搜索或新建">
        <input ref="input" v-model="q" class="q" placeholder="搜索任何东西，或输入标题新建…" @keydown="onKey" />
        <div class="results">
          <div v-if="!rows.length" class="empty faint">还没有内容，输入文字即可新建</div>
          <div v-if="!q.trim() && rows.length" class="hint faint">最近更新</div>
          <button
            v-for="(r, i) in rows"
            :key="r.kind === 'item' ? r.item.id : r.label"
            class="res"
            :class="{ on: i === active }"
            @mousemove="active = i"
            @click="choose(r)"
          >
            <template v-if="r.kind === 'item'">
              <component :is="itemIcon(r.item)" :size="16" class="ic" />
              <span class="grow ellipsis">{{ titleOf(r.item) }}</span>
              <span class="chip">{{ typeLabel(r.item) }}</span>
            </template>
            <template v-else>
              <Plus :size="16" class="ic" />
              <span class="grow ellipsis">{{ r.label }}</span>
            </template>
            <CornerDownLeft v-if="i === active" :size="14" class="faint" />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(10, 9, 14, 0.36);
  display: grid;
  justify-items: center;
  align-items: start;
  padding: 12vh 16px 16px;
}
.palette {
  width: min(600px, 100%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.q {
  width: 100%;
  border: none;
  border-bottom: 1px solid var(--border);
  background: transparent;
  padding: 16px 18px;
  font-size: 16px;
  outline: none;
}
.results {
  max-height: 55vh;
  overflow-y: auto;
  padding: 6px;
}
.hint {
  font-size: 12px;
  padding: 6px 10px 4px;
}
.empty {
  padding: 18px;
  text-align: center;
}
.res {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: none;
  background: transparent;
  border-radius: 9px;
  cursor: pointer;
  text-align: left;
}
.res.on {
  background: var(--hover);
}
.ic {
  color: var(--text-3);
  flex: none;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.12s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
