<script setup lang="ts">
import { computed } from 'vue'
import { addDays, fromKey, today, weekday } from '@/lib/dates'
import { ATTRS } from '@/lib/types'
import type { XpEntry } from '@/lib/game'

const props = defineProps<{ xp: XpEntry[] }>()
const t = today()
const WEEKS = 53

/** Columns are weeks (Monday first), newest on the right. */
const start = computed(() => addDays(t, -((weekday(t) + 6) % 7) - (WEEKS - 1) * 7))

const byDay = computed(() => {
  const m = new Map<string, number>()
  for (const e of props.xp) if (e.date >= start.value) m.set(e.date, (m.get(e.date) ?? 0) + e.xp)
  return m
})

/** Colour steps follow this user's own distribution, so light and heavy users both get a readable map. */
const steps = computed(() => {
  const v = [...byDay.value.values()].filter((x) => x > 0).sort((a, b) => a - b)
  if (!v.length) return [1, 2, 3]
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))]
  return [q(0.25), q(0.5), q(0.8)]
})
const levelOf = (x: number) => (!x ? 0 : x <= steps.value[0] ? 1 : x <= steps.value[1] ? 2 : x <= steps.value[2] ? 3 : 4)

const cols = computed(() =>
  Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const k = addDays(start.value, w * 7 + d)
      const x = byDay.value.get(k) ?? 0
      return { k, x, lv: levelOf(x), future: k > t }
    }),
  ),
)
const months = computed(() =>
  cols.value.map((col, i) => {
    const m = fromKey(col[0].k).getMonth()
    const prev = i ? fromKey(cols.value[i - 1][0].k).getMonth() : -1
    return m !== prev ? `${m + 1}月` : ''
  }),
)

const summary = computed(() => {
  const yearAgo = addDays(t, -364)
  const recent = props.xp.filter((e) => e.date >= yearAgo)
  const days = new Set(recent.map((e) => e.date)).size
  const total = recent.reduce((s, e) => s + e.xp, 0)
  const byMonth = new Map<string, number>()
  for (const e of recent) byMonth.set(e.date.slice(0, 7), (byMonth.get(e.date.slice(0, 7)) ?? 0) + e.xp)
  const best = [...byMonth].sort((a, b) => b[1] - a[1])[0]
  const byAttr = ATTRS.map((a) => ({ ...a, xp: recent.filter((e) => e.attr === a.key).reduce((s, e) => s + e.xp, 0) })).sort((a, b) => b.xp - a.xp)
  return { days, total, best: best && { label: `${Number(best[0].slice(5))}月`, xp: best[1] }, byAttr }
})
</script>

<template>
  <div class="year">
    <div class="sum">
      <span><b class="num">{{ summary.days }}</b> 天有进展</span>
      <span><b class="num">{{ summary.total.toLocaleString() }}</b> XP</span>
      <span v-if="summary.best">最活跃：<b>{{ summary.best.label }}</b> <span class="faint num">({{ summary.best.xp }})</span></span>
    </div>
    <div class="scroll">
      <div class="grid">
        <div class="months">
          <span v-for="(m, i) in months" :key="i">{{ m }}</span>
        </div>
        <div class="cells">
          <div v-for="(col, i) in cols" :key="i" class="col">
            <span v-for="c in col" :key="c.k" class="cell" :class="['l' + c.lv, { future: c.future }]" :title="c.future ? '' : `${c.k}：${c.x} XP`" />
          </div>
        </div>
      </div>
    </div>
    <div class="foot">
      <div class="split" aria-label="这一年的经验来源">
        <i v-for="a in summary.byAttr.filter((a) => a.xp)" :key="a.key" :style="{ flex: a.xp, background: a.color }" :title="`${a.label} ${a.xp} XP`" />
      </div>
      <div class="legend faint">
        少 <span class="cell l0" /><span class="cell l1" /><span class="cell l2" /><span class="cell l3" /><span class="cell l4" /> 多
      </div>
    </div>
    <div class="attrs faint">
      <span v-for="a in summary.byAttr.filter((a) => a.xp)" :key="a.key"><i :style="{ background: a.color }" />{{ a.label }} {{ Math.round((a.xp / Math.max(1, summary.total)) * 100) }}%</span>
    </div>
  </div>
</template>

<style scoped>
.sum {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 20px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text-2);
}
.sum b {
  color: var(--text);
  font-size: 15px;
}
/* Newest week on the right; older weeks scroll off on narrow screens. */
.scroll {
  overflow-x: auto;
  direction: rtl;
}
.grid {
  direction: ltr;
  display: inline-grid;
  gap: 4px;
}
.months,
.cells {
  display: grid;
  grid-template-columns: repeat(53, 11px);
  gap: 3px;
}
.months span {
  font-size: 10px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: visible;
  width: 11px;
}
.col {
  display: grid;
  grid-template-rows: repeat(7, 11px);
  gap: 3px;
}
.cell {
  width: 11px;
  height: 11px;
  border-radius: 3px;
  background: var(--sunken);
  display: inline-block;
}
.cell.l1 {
  background: color-mix(in srgb, var(--gold) 30%, var(--sunken));
}
.cell.l2 {
  background: color-mix(in srgb, var(--gold) 55%, var(--sunken));
}
.cell.l3 {
  background: color-mix(in srgb, var(--gold) 80%, var(--sunken));
}
.cell.l4 {
  background: var(--gold-2);
  box-shadow: 0 0 4px color-mix(in srgb, var(--gold-2) 60%, transparent);
}
.cell.future {
  opacity: 0.25;
}
.foot {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
}
.split {
  flex: 1;
  display: flex;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  gap: 2px;
}
.legend {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  flex: none;
}
.attrs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 8px;
  font-size: 12px;
}
.attrs span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.attrs i {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}
</style>
