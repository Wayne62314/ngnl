<script setup lang="ts">
import { computed } from 'vue'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { titleOf } from '@/lib/itemView'
import { tintOf } from '@/lib/itemTint'
import { typeLabel, type ItemType } from '@/lib/types'

/**
 * The items linked to `id`, shown right in a list row: people as a tiny avatar
 * + name, everything else as "type · title". Click one to open it.
 */
const props = withDefaults(defineProps<{ id: string; max?: number; hide?: ItemType[] }>(), { max: 3 })
const data = useData()
const ui = useUi()

const ORDER: ItemType[] = ['person', 'goal', 'segment', 'asset', 'task', 'habit', 'event', 'note', 'ledger', 'sim', 'field']
const all = computed(() =>
  data
    .linked(props.id)
    .filter((x) => !props.hide?.includes(x.type))
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type)),
)
const shown = computed(() => all.value.slice(0, props.max))
const extra = computed(() => all.value.length - shown.value.length)
</script>

<template>
  <span v-if="all.length" class="links" @click.stop>
    <button
      v-for="x in shown"
      :key="x.id"
      class="lchip"
      :class="{ person: x.type === 'person', done: x.type === 'task' && x.status === 'done' }"
      :style="{ '--t': tintOf(x) }"
      :title="`${typeLabel(x)}：${titleOf(x)}`"
      @click="ui.open(x.id)"
    >
      <i v-if="x.type === 'person'" class="av">{{ titleOf(x).slice(0, 1) }}</i>
      <span v-else class="kind">{{ typeLabel(x) }}</span>
      <span class="t">{{ titleOf(x) }}</span>
    </button>
    <button v-if="extra > 0" class="lchip more" :title="`还有 ${extra} 个关联`" @click="ui.open(id)">+{{ extra }}</button>
  </span>
</template>

<style scoped>
.links {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
}
.lchip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 180px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: none;
  font: inherit;
  font-size: 11.5px;
  line-height: 1;
  cursor: pointer;
  color: color-mix(in srgb, var(--t) 75%, var(--text));
  background: color-mix(in srgb, var(--t) 13%, var(--surface));
}
.lchip:hover {
  background: color-mix(in srgb, var(--t) 22%, var(--surface));
}
.lchip.person {
  padding-left: 2px;
}
.av {
  width: 18px;
  height: 18px;
  flex: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-style: normal;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: var(--t);
}
.kind {
  opacity: 0.75;
  flex: none;
}
.kind::after {
  content: '·';
  margin-left: 4px;
}
.t {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.done .t {
  text-decoration: line-through;
}
.more {
  --t: var(--text-3);
}
</style>
