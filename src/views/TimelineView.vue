<script setup lang="ts">
import { computed } from 'vue'
import { GitBranch, History, Plus, Star } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { fromKey, today } from '@/lib/dates'
import { titleOf } from '@/lib/itemView'
import type { LifeEvent } from '@/lib/types'
import Empty from '@/components/Empty.vue'

const data = useData()
const ui = useUi()

const years = computed(() => {
  const m = new Map<string, LifeEvent[]>()
  const sorted = [...data.events].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  for (const e of sorted) {
    const y = e.date.slice(0, 4)
    ;(m.get(y) ?? m.set(y, []).get(y)!).push(e)
  }
  return [...m.entries()]
})
const md = (k: string) => `${fromKey(k).getMonth() + 1}月${fromKey(k).getDate()}日`
const firstLine = (s?: string) => s?.split('\n').find((l) => l.trim())?.trim()

async function add(kind: LifeEvent['kind'] = 'event') {
  const e = await data.create('event', { date: today(), kind })
  if (e) ui.open(e.id)
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">经历</h1>
        <div class="page-sub">重要的事、里程碑，以及那些改变方向的抉择。</div>
      </div>
      <div class="row">
        <button class="btn" @click="add('decision')"><GitBranch />记录抉择</button>
        <button class="btn primary" @click="add()"><Plus />记录经历</button>
      </div>
    </header>

    <div v-if="years.length" class="timeline">
      <section v-for="[y, list] in years" :key="y" class="year">
        <h2 class="y num">{{ y }}</h2>
        <div class="events">
          <article v-for="e in list" :key="e.id" class="ev" :class="[e.kind, e.feeling]" @click="ui.open(e.id)">
            <span class="pin">
              <Star v-if="e.kind === 'milestone'" :size="12" />
              <GitBranch v-else-if="e.kind === 'decision'" :size="12" />
            </span>
            <div class="card body">
              <div class="row">
                <span class="date faint num">{{ md(e.date) }}</span>
                <span v-if="e.kind === 'milestone'" class="chip gold">里程碑</span>
                <span v-if="e.kind === 'decision'" class="chip dec">抉择</span>
              </div>
              <div class="et">{{ titleOf(e) }}</div>
              <div v-if="e.kind === 'decision' && (e.options || e.choice)" class="decision">
                <div v-if="e.options" class="faint">在 {{ e.options.replace(/\n/g, ' / ') }} 之间</div>
                <div v-if="e.choice">选择了 <b>{{ e.choice }}</b></div>
              </div>
              <p v-else-if="firstLine(e.notes)" class="muted ex">{{ firstLine(e.notes) }}</p>
              <div v-if="data.linked(e.id).length" class="links">
                <span v-for="l in data.linked(e.id).slice(0, 4)" :key="l.id" class="chip">{{ titleOf(l) }}</span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
    <div v-else class="card">
      <Empty :icon="History" title="写下你的第一段经历" text="不必从出生写起。先写一件最近让你印象深刻的事，或者一次重要的选择：当时有哪些路，你选了哪条，为什么。">
        <button class="btn primary" @click="add()"><Plus />记录经历</button>
      </Empty>
    </div>
  </div>
</template>

<style scoped>
.timeline {
  display: grid;
  gap: 28px;
}
.y {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-3);
  margin-bottom: 12px;
}
.events {
  position: relative;
  display: grid;
  gap: 12px;
  padding-left: 28px;
}
.events::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: var(--border);
  border-radius: 1px;
}
.ev {
  position: relative;
  cursor: pointer;
}
.pin {
  position: absolute;
  left: -28px;
  top: 16px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--border-strong);
  display: grid;
  place-items: center;
}
.ev.good .pin {
  border-color: var(--ok);
}
.ev.bad .pin {
  border-color: var(--danger);
}
.ev.milestone .pin {
  background: var(--gold);
  border-color: var(--gold);
  color: #fff;
  width: 22px;
  height: 22px;
  left: -30px;
  top: 14px;
}
.ev.decision .pin {
  background: var(--attr-career);
  border-color: var(--attr-career);
  color: #fff;
  width: 22px;
  height: 22px;
  left: -30px;
  top: 14px;
}
.body {
  padding: 12px 16px;
  box-shadow: none;
  transition: border-color 0.15s;
}
.ev:hover .body {
  border-color: var(--border-strong);
}
.ev.milestone .body {
  border-color: color-mix(in srgb, var(--gold) 40%, transparent);
}
.date {
  font-size: 12px;
}
.chip.dec {
  background: color-mix(in srgb, var(--attr-career) 12%, transparent);
  color: var(--attr-career);
}
.et {
  font-weight: 600;
  font-size: 15px;
  margin-top: 2px;
}
.ex {
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.decision {
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-2);
  font-size: 13px;
}
.links {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 8px;
}
</style>
