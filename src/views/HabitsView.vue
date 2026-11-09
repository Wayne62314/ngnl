<script setup lang="ts">
import { computed } from 'vue'
import { Check, Flame, Plus, Repeat } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { addDays, today, weekday, weekdayLabel } from '@/lib/dates'
import { isScheduled, streak } from '@/lib/game'
import { titleOf } from '@/lib/itemView'
import { attrOf, type Habit } from '@/lib/types'
import Empty from '@/components/Empty.vue'

const data = useData()
const ui = useUi()
const t = today()

const active = computed(() => data.habits.filter((h) => !h.archived))
const paused = computed(() => data.habits.filter((h) => h.archived))

// 7-day strip ending today
const week = computed(() => Array.from({ length: 7 }, (_, i) => addDays(t, i - 6)))

// 12-week heatmap, columns are weeks starting Monday
const WEEKS = 18
const heatStart = computed(() => {
  const back = (weekday(t) + 6) % 7 // days since Monday
  return addDays(t, -back - (WEEKS - 1) * 7)
})
const heat = (h: Habit) => {
  const done = data.doneDates(h.id)
  return Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const k = addDays(heatStart.value, w * 7 + d)
      return { k, future: k > t, sched: isScheduled(h, k), done: done.has(k) }
    }),
  )
}
const rate = (h: Habit) => {
  const done = data.doneDates(h.id)
  let s = 0
  let n = 0
  for (let i = 0; i < 28; i++) {
    const k = addDays(t, -i)
    if (k < h.createdAt.slice(0, 10)) break
    if (!isScheduled(h, k)) continue
    if (i === 0 && !done.has(k)) continue // today isn't over yet
    s++
    if (done.has(k)) n++
  }
  return s ? Math.round((n / s) * 100) : null
}
const daysText = (h: Habit) => {
  const s = [...h.days].sort()
  if (s.length === 7) return '每天'
  if (s.join() === '1,2,3,4,5') return '工作日'
  if (s.join() === '0,6') return '周末'
  if (!s.length) return '未安排'
  return '每周' + [1, 2, 3, 4, 5, 6, 0].filter((d) => s.includes(d)).map(weekdayLabel).join('、')
}

async function add() {
  const h = await data.create('habit')
  if (h) ui.open(h.id)
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">习惯</h1>
        <div class="page-sub">每次打卡 +5 经验。断了也没关系，重新开始就好。</div>
      </div>
      <button class="btn primary" @click="add"><Plus />新习惯</button>
    </header>

    <div v-if="active.length" class="habits">
      <article v-for="h in active" :key="h.id" class="card habit" :style="{ '--c': attrOf(h.attr).color }">
        <div class="top" @click="ui.open(h.id)">
          <div class="grow">
            <div class="name ellipsis">{{ titleOf(h) }}</div>
            <div class="faint small">{{ daysText(h) }} · {{ attrOf(h.attr).label }}<template v-if="rate(h) !== null"> · 近四周完成 {{ rate(h) }}%</template></div>
          </div>
          <div class="streak" :class="{ hot: streak(h, data.doneDates(h.id), t) > 0 }">
            <Flame :size="16" />
            <b class="num">{{ streak(h, data.doneDates(h.id), t) }}</b>
          </div>
        </div>

        <div class="week">
          <button
            v-for="k in week"
            :key="k"
            class="day"
            :class="{ sched: isScheduled(h, k), today: k === t }"
            :title="k"
            @click="data.toggleCheckin(h.id, k)"
          >
            <span class="wd">{{ k === t ? '今' : weekdayLabel(weekday(k)) }}</span>
            <span class="check round" :class="{ on: data.doneDates(h.id).has(k) }"><Check /></span>
          </button>
        </div>

        <div class="heat" aria-label="近 18 周打卡">
          <div v-for="(col, i) in heat(h)" :key="i" class="hcol">
            <span v-for="c in col" :key="c.k" class="cell" :class="{ done: c.done, off: !c.sched, future: c.future }" :title="c.k" />
          </div>
        </div>
      </article>
    </div>
    <div v-else class="card">
      <Empty :icon="Repeat" title="还没有习惯" text="从一个很小的习惯开始，比如「睡前读 10 页书」或「每天走 6000 步」。选好每周哪几天做，今日页会提醒你打卡。">
        <button class="btn primary" @click="add"><Plus />添加习惯</button>
      </Empty>
    </div>

    <section v-if="paused.length" class="paused">
      <h2 class="section-title">已暂停 <span class="count">{{ paused.length }}</span></h2>
      <div class="card list">
        <div v-for="h in paused" :key="h.id" class="list-row" @click="ui.open(h.id)">
          <span class="dot" :style="{ '--c': attrOf(h.attr).color }" />
          <span class="grow">{{ titleOf(h) }}</span>
          <span class="faint small">累计 {{ data.doneDates(h.id).size }} 次</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.habits {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.habit {
  padding: 16px 18px;
  display: grid;
  gap: 14px;
  border-top: 3px solid var(--c);
}
.top {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}
.name {
  font-weight: 600;
  font-size: 15px;
}
.small {
  font-size: 12px;
}
.streak {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--sunken);
  color: var(--text-3);
}
.streak.hot {
  background: color-mix(in srgb, var(--attr-craft) 14%, transparent);
  color: var(--attr-craft);
}
.streak b {
  font-size: 15px;
}
.week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.day {
  display: grid;
  justify-items: center;
  gap: 4px;
  border: none;
  background: none;
  cursor: pointer;
  padding: 4px 0;
  border-radius: 8px;
}
.day:hover {
  background: var(--hover);
}
.day:not(.sched) .check:not(.on) {
  border-style: dashed;
  opacity: 0.5;
}
.wd {
  font-size: 11px;
  color: var(--text-3);
}
.day.today .wd {
  color: var(--c);
  font-weight: 700;
}
/* Fixed-size cells, newest week on the right; older weeks clip off on narrow cards. */
.heat {
  display: flex;
  justify-content: flex-end;
  gap: 3px;
  overflow: hidden;
}
.hcol {
  display: grid;
  gap: 3px;
  flex: none;
}
.cell {
  width: 11px;
  height: 11px;
  border-radius: 3px;
  background: var(--sunken);
}
.cell.off {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--border);
}
.cell.done {
  background: var(--c);
  box-shadow: none;
}
.cell.future {
  opacity: 0.25;
}
.paused {
  margin-top: 32px;
}
</style>
