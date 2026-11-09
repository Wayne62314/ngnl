<script setup lang="ts">
import { computed, ref } from 'vue'
import { Link2, X } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { suggestionsFor, type Suggestion } from '@/lib/suggest'
import { itemIcon, titleOf } from '@/lib/itemView'
import { typeLabel } from '@/lib/types'

/** Suggested links: for one item (`id`) or, without it, across everything. */
const props = withDefaults(defineProps<{ id?: string; limit?: number; title?: string }>(), { limit: 5, title: '可能相关' })
const data = useData()
const ui = useUi()
const all = computed(() => (props.id ? suggestionsFor(data.suggestions, props.id) : data.suggestions))
const showAll = ref(false)
const shown = computed(() => (showAll.value ? all.value : all.value.slice(0, props.limit)))
/** In an item's drawer, show the *other* item. */
const other = (s: Suggestion) => (props.id && s.to.id === props.id ? s.from : s.to)

async function accept(s: Suggestion) {
  await data.link(s.from.id, s.to.id)
  ui.toast(`已关联：${titleOf(s.from)} ↔ ${titleOf(s.to)}`)
}
async function acceptAll() {
  const list = all.value
  const ok = await ui.confirm({
    title: `把 ${list.length} 条建议全部连上？`,
    message: '每一条都是因为一个条目的文字里提到了另一个。连上之后可以随时在详情里取消。',
    details: list.slice(0, 6).map((s) => `${titleOf(s.from)} ↔ ${titleOf(s.to)}`).concat(list.length > 6 ? [`……还有 ${list.length - 6} 条`] : []),
    confirmText: '全部连上',
  })
  if (!ok) return
  for (const s of list) await data.link(s.from.id, s.to.id)
  ui.toast(`已关联 ${list.length} 对`)
}
</script>

<template>
  <section v-if="all.length" class="sugg">
    <h3 class="section-title">
      <Link2 :size="14" /> {{ title }} <span class="count">{{ all.length }}</span>
      <button v-if="!id && all.length > 1" class="all" @click="acceptAll">全部连上</button>
    </h3>
    <div v-for="s in shown" :key="s.from.id + s.to.id" class="row">
      <div class="main">
        <button class="who" @click="ui.open(other(s).id)">
          <component :is="itemIcon(other(s))" :size="13" />
          <b>{{ id ? titleOf(other(s)) : `${titleOf(s.from)} ↔ ${titleOf(s.to)}` }}</b>
          <small v-if="id && s.where === '标题' && s.to.id === id" class="in-title">标题提到了它</small>
          <small v-if="id">{{ typeLabel(other(s)) }}</small>
        </button>
        <div v-if="!(s.where === '标题' && (!id || s.to.id === id))" class="why">
          <template v-if="!id || s.from.id === id">{{ s.where }}里提到：</template>
          <template v-else>「{{ titleOf(s.from) }}」的{{ s.where }}提到了它：</template>
          <span class="quote">{{ s.before }}<mark>{{ s.match }}</mark>{{ s.after }}</span>
        </div>
      </div>
      <button class="btn sm" @click="accept(s)">连上</button>
      <button class="btn ghost sm icon" title="不相关，别再提示" @click="data.dismissSuggestion(s.from.id, s.to.id)"><X :size="14" /></button>
    </div>
    <button v-if="all.length > limit" class="more" @click="showAll = !showAll">{{ showAll ? '收起' : `还有 ${all.length - limit} 条` }}</button>
  </section>
</template>

<style scoped>
.sugg {
  display: grid;
  gap: 6px;
}
.section-title {
  margin-bottom: 2px;
}
.all {
  margin-left: auto;
  border: none;
  background: none;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--gold);
  cursor: pointer;
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px 8px 10px;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
}
.main {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
}
.who {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 13px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  min-width: 0;
}
.who b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.who small {
  color: var(--text-3);
  font-size: 11px;
  flex: none;
}
.who svg {
  color: var(--text-3);
  flex: none;
}
.why {
  font-size: 12px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.quote {
  color: var(--text-2);
}
mark {
  background: var(--gold-soft);
  color: var(--text);
  border-radius: 3px;
  padding: 0 2px;
}
.more {
  justify-self: start;
  border: none;
  background: none;
  font: inherit;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
}
</style>
