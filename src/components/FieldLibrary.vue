<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Variable } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { kindLabel, usageOf } from '@/lib/fields'

/** Settings card: every custom field, its type and how many items use it. */
const data = useData()
const ui = useUi()
const rows = computed(() =>
  [...data.fieldDefs]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((d) => ({ d, n: usageOf(d.id, data.items) })),
)
async function add() {
  const f = await data.create('field', { kind: 'number' })
  if (f) ui.open(f.id)
}
</script>

<template>
  <section id="fields" class="card card-pad block">
    <h2 class="section-title"><Variable :size="16" />自定义字段 <span class="count">{{ rows.length || '' }}</span></h2>
    <p class="muted">给任何条目记录你想量化的东西，比如「购入价格」「使用年限」「每次省下」。建一次，房子、电脑、习惯、人物……都能用；推演画布里也能直接连线计算。</p>
    <div v-if="rows.length" class="table">
      <div class="tr th"><span>名称</span><span>类型</span><span class="r">用在</span></div>
      <div v-for="{ d, n } in rows" :key="d.id" class="tr" @click="ui.open(d.id)">
        <b class="ellipsis">{{ d.title || '未命名' }}</b>
        <span class="faint">{{ kindLabel(d.kind) }}{{ d.unit ? ` · ${d.unit}` : '' }}</span>
        <span class="r num">{{ n }} 个</span>
      </div>
    </div>
    <button class="btn sm" @click="add"><Plus />新建字段</button>
  </section>
</template>

<style scoped>
.block p {
  margin: 0 0 12px;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.table {
  display: grid;
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.tr {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px 60px;
  gap: 10px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  font-size: 14px;
}
.tr:last-child {
  border-bottom: none;
}
.tr:hover:not(.th) {
  background: var(--hover);
}
.th {
  font-size: 11px;
  color: var(--text-3);
  cursor: default;
}
.r {
  text-align: right;
}
</style>
