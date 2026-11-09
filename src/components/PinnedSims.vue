<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Workflow } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { today } from '@/lib/dates'
import { evaluate, headline } from '@/lib/simulate'
import { titleOf } from '@/lib/itemView'

/** Results of the canvases the user pinned, recomputed live from today's data. */
const data = useData()
const hidden = (() => {
  try {
    return localStorage.getItem('ngnl-privacy') !== '0'
  } catch {
    return true
  }
})()
const pinned = computed(() => {
  const ctx = { byId: data.byId, defs: data.fieldDefs, done: data.doneDates, today: today() }
  return data.sims.filter((s) => s.pinned).map((s) => ({ sim: s, head: headline(s, evaluate(s, ctx), hidden) }))
})
</script>

<template>
  <section v-if="pinned.length" class="pinned">
    <h2 class="section-title"><Workflow :size="14" /> 推演结果 <span class="count">每次打开都按最新数据重新算</span></h2>
    <div class="row">
      <RouterLink v-for="{ sim, head } in pinned" :key="sim.id" :to="`/simulate/${sim.id}`" class="card ps">
        <span class="t">{{ titleOf(sim) }}</span>
        <span v-if="head" class="v" :class="head.ok === true ? 'yes' : head.ok === false ? 'no' : ''">{{ head.text }}</span>
        <span v-else class="sub">还没有结果节点</span>
        <span v-if="head?.sub" class="sub">{{ head.sub }}</span>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.pinned {
  margin-bottom: 20px;
}
.row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.ps {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  color: var(--text);
  text-decoration: none;
  border-left: 3px solid var(--attr-career);
  transition: box-shadow 0.15s;
}
.ps:hover {
  box-shadow: var(--shadow-lg);
}
.t {
  font-size: 13px;
  color: var(--text-2);
}
.v {
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 900;
  color: var(--attr-career);
}
.v.yes {
  color: var(--ok);
}
.v.no {
  color: var(--danger);
}
.sub {
  font-size: 12px;
  color: var(--text-3);
}
</style>
