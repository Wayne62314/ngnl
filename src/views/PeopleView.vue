<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Users } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { friendly, today } from '@/lib/dates'
import { contactOverdue, lastContact } from '@/lib/game'
import { titleOf } from '@/lib/itemView'
import type { Person } from '@/lib/types'
import Avatar from '@/components/Avatar.vue'
import Empty from '@/components/Empty.vue'

const data = useData()
const ui = useUi()
const t = today()

const SIZE = 520
const C = SIZE / 2
const RADII = [0, 238, 196, 152, 108, 66] // by closeness 1..5

const placed = computed(() => {
  const out: { p: Person; x: number; y: number }[] = []
  for (let c = 5; c >= 1; c--) {
    const ring = data.people.filter((p) => (p.closeness || 3) === c).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    ring.forEach((p, i) => {
      const a = (Math.PI * 2 * i) / ring.length - Math.PI / 2 + c * 0.55
      out.push({ p, x: C + RADII[c] * Math.cos(a), y: C + RADII[c] * Math.sin(a) })
    })
  }
  return out
})

const sorted = computed(() =>
  [...data.people].sort((a, b) => {
    const oa = contactOverdue(a, t) ?? -1
    const ob = contactOverdue(b, t) ?? -1
    return (ob >= 0 ? 1 : 0) - (oa >= 0 ? 1 : 0) || b.closeness - a.closeness || titleOf(a).localeCompare(titleOf(b), 'zh')
  }),
)

async function add() {
  const p = await data.create('person')
  if (p) ui.open(p.id)
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">人物</h1>
        <div class="page-sub">离中心越近，关系越亲密。太久没联系的人会出现在今日页。</div>
      </div>
      <button class="btn primary" @click="add"><Plus />添加人物</button>
    </header>

    <div v-if="data.people.length" class="layout">
      <div class="card graph-card">
        <div class="graph" :style="{ width: `${SIZE}px`, height: `${SIZE}px` }">
          <svg :width="SIZE" :height="SIZE" class="rings">
            <circle v-for="c in [1, 2, 3, 4, 5]" :key="c" :cx="C" :cy="C" :r="RADII[c]" :class="'r' + c" />
            <line v-for="x in placed" :key="x.p.id" :x1="C" :y1="C" :x2="x.x" :y2="x.y" :style="{ opacity: 0.1 + x.p.closeness * 0.08 }" />
          </svg>
          <div class="me" :style="{ left: `${C}px`, top: `${C}px` }">
            <Avatar :name="data.profile.name" :size="48" />
            <span>我</span>
          </div>
          <button
            v-for="x in placed"
            :key="x.p.id"
            class="pnode"
            :class="{ due: contactOverdue(x.p, t) !== null }"
            :style="{ left: `${x.x}px`, top: `${x.y}px` }"
            @click="ui.open(x.p.id)"
          >
            <span class="bubble">{{ titleOf(x.p).slice(0, 1) }}</span>
            <span class="pname">{{ titleOf(x.p) }}</span>
          </button>
        </div>
      </div>

      <div class="card list side">
        <div v-for="p in sorted" :key="p.id" class="list-row" @click="ui.open(p.id)">
          <span class="bubble sm">{{ titleOf(p).slice(0, 1) }}</span>
          <div class="grow">
            <div class="ellipsis"><b>{{ titleOf(p) }}</b> <span class="faint">{{ p.relation }}</span></div>
            <div class="faint small ellipsis">{{ p.traits || '—' }}</div>
          </div>
          <div class="right">
            <span class="hearts">{{ '♥'.repeat(p.closeness) }}</span>
            <span v-if="contactOverdue(p, t) !== null" class="chip warn">该联系了</span>
            <span v-else-if="lastContact(p)" class="faint small">{{ friendly(lastContact(p)!) }}</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="card">
      <Empty :icon="Users" title="记下对你重要的人" text="家人、朋友、导师、合作者……记下他们的特点和你们的关系。设置亲密度后，太久没联系会提醒你。">
        <button class="btn primary" @click="add"><Plus />添加第一个人</button>
      </Empty>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.graph-card {
  padding: 16px;
  overflow: auto;
}
.graph {
  position: relative;
}
.rings {
  position: absolute;
  inset: 0;
}
.rings circle {
  fill: none;
  stroke: var(--border);
  stroke-dasharray: 3 5;
}
.rings circle.r5 {
  fill: color-mix(in srgb, var(--attr-social) 6%, transparent);
  stroke: color-mix(in srgb, var(--attr-social) 30%, transparent);
  stroke-dasharray: none;
}
.rings line {
  stroke: var(--attr-social);
}
.me {
  position: absolute;
  transform: translate(-50%, -50%);
  display: grid;
  justify-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: 700;
}
.pnode {
  position: absolute;
  transform: translate(-50%, -50%);
  display: grid;
  justify-items: center;
  gap: 2px;
  border: none;
  background: none;
  cursor: pointer;
  padding: 0;
}
.bubble {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 700;
  background: var(--surface);
  border: 2px solid color-mix(in srgb, var(--attr-social) 55%, transparent);
  color: var(--attr-social);
  box-shadow: var(--shadow);
  transition: transform 0.15s;
}
.bubble.sm {
  width: 32px;
  height: 32px;
  font-size: 13px;
  box-shadow: none;
  flex: none;
}
.pnode:hover .bubble {
  transform: scale(1.12);
}
.pnode.due .bubble {
  border-color: var(--danger);
  border-style: dashed;
}
.pname {
  font-size: 12px;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: color-mix(in srgb, var(--surface) 85%, transparent);
  padding: 0 4px;
  border-radius: 4px;
}
.side {
  max-height: 560px;
  overflow-y: auto;
}
.right {
  display: grid;
  justify-items: end;
  gap: 2px;
}
.hearts {
  color: var(--attr-social);
  font-size: 11px;
  letter-spacing: 1px;
}
.small {
  font-size: 12px;
}
@media (max-width: 1100px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .graph {
    margin: 0 auto;
  }
}
</style>
