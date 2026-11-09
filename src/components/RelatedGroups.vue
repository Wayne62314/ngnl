<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import { useData, type RelationKind } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { itemIcon, titleOf } from '@/lib/itemView'
import { tintOf } from '@/lib/itemTint'
import type { Item, ItemType } from '@/lib/types'

/**
 * Everything connected to an item, grouped by type ("人物 3 · 任务 2 …").
 * `kinds` limits which relations are shown (e.g. only explicit links where the
 * structure already has its own section); `editable` offers unlink on links.
 */
const props = withDefaults(defineProps<{ id: string; kinds?: RelationKind[]; hide?: ItemType[]; editable?: boolean }>(), { editable: false })
const data = useData()
const ui = useUi()

const GROUPS: { type: ItemType; label: string }[] = [
  { type: 'person', label: '人物' },
  { type: 'goal', label: '目标' },
  { type: 'task', label: '任务' },
  { type: 'habit', label: '习惯' },
  { type: 'event', label: '经历' },
  { type: 'note', label: '灵感与情报' },
]
const HOW: Partial<Record<RelationKind, string>> = {
  goal: '所属目标',
  task: '挂在这里',
  parent: '上一级',
  child: '下一步',
  prereq: '前置',
  unlocks: '完成后解锁',
}

const groups = computed(() => {
  const rel = data.related(props.id).filter((r) => (!props.kinds || props.kinds.includes(r.how)) && !props.hide?.includes(r.item.type))
  return GROUPS.map((g) => ({ ...g, rows: rel.filter((r) => r.item.type === g.type) })).filter((g) => g.rows.length)
})
const total = computed(() => groups.value.reduce((s, g) => s + g.rows.length, 0))
const isDone = (x: Item) => (x.type === 'task' && (x.status === 'done' || x.status === 'dropped')) || (x.type === 'goal' && x.status === 'done')

defineExpose({ total })
</script>

<template>
  <div v-if="groups.length" class="groups">
    <section v-for="g in groups" :key="g.type" class="group">
      <div class="gh">{{ g.label }} <span>{{ g.rows.length }}</span></div>
      <div class="rows">
        <div v-for="r in g.rows" :key="r.item.id" class="rrow" :style="{ '--t': tintOf(r.item) }" @click="ui.open(r.item.id)">
          <i v-if="r.item.type === 'person'" class="av">{{ titleOf(r.item).slice(0, 1) }}</i>
          <component :is="itemIcon(r.item)" v-else :size="14" class="ic" />
          <span class="grow ellipsis" :class="{ done: isDone(r.item) }">{{ titleOf(r.item) }}</span>
          <span v-if="HOW[r.how]" class="how">{{ HOW[r.how] }}</span>
          <button v-if="editable && r.how === 'link'" class="btn ghost sm icon unlink" title="取消关联" @click.stop="data.unlink(id, r.item.id)"><X /></button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.groups {
  display: grid;
  gap: 10px;
}
.gh {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--text-3);
  margin-bottom: 2px;
}
.gh span {
  margin-left: 2px;
}
.rows {
  display: grid;
  gap: 1px;
}
.rrow {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 4px 8px;
  border-radius: 9px;
  cursor: pointer;
}
.rrow:hover {
  background: var(--hover);
}
.av {
  width: 22px;
  height: 22px;
  flex: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-style: normal;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: var(--t);
}
.ic {
  flex: none;
  color: var(--t);
}
.done {
  color: var(--text-3);
  text-decoration: line-through;
}
.how {
  flex: none;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  color: var(--text-2);
  background: var(--sunken);
}
.unlink {
  opacity: 0.4;
}
.rrow:hover .unlink {
  opacity: 1;
}
</style>
