<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Cake, MessageCircle, Plus, Search, UserRoundCheck, Users } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { friendly, today } from '@/lib/dates'
import { contactOverdue, lastContact } from '@/lib/game'
import { contactsLast30, daysToBirthday, GROUPS, groupMeta, groupOf, type Group } from '@/lib/people'
import { titleOf } from '@/lib/itemView'
import type { Person } from '@/lib/types'
import Avatar from '@/components/Avatar.vue'
import Empty from '@/components/Empty.vue'
import PersonPanel from '@/components/PersonPanel.vue'

const data = useData()
const ui = useUi()
const t = today()

// ---- who needs attention, most urgent first ----
const attention = (p: Person) => {
  const b = daysToBirthday(p, t)
  const o = contactOverdue(p, t)
  if (b !== null && b <= 7) return 1000 - b
  if (o !== null) return 500 + Math.min(o, 400) + p.closeness
  return p.closeness
}
const ranked = computed(() => [...data.people].sort((a, b) => attention(b) - attention(a) || titleOf(a).localeCompare(titleOf(b), 'zh')))

const selectedId = ref<string>()
const selected = computed(() => data.people.find((p) => p.id === selectedId.value) ?? ranked.value[0])
const panel = ref<HTMLElement>()
function select(id: string, scroll = false) {
  selectedId.value = id
  if (scroll && window.matchMedia('(max-width: 1100px)').matches) nextTick(() => panel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

// ---- stats ----
const stats = computed(() => ({
  total: data.people.length,
  contacts: data.people.reduce((s, p) => s + contactsLast30(p, t), 0),
  due: data.people.filter((p) => contactOverdue(p, t) !== null).length,
  birthdays: data.people.filter((p) => (daysToBirthday(p, t) ?? 99) <= 30).length,
}))

// ---- filter ----
const filter = ref<Group | 'all'>('all')
const groupCounts = computed(() => {
  const m: Record<string, number> = {}
  for (const p of data.people) m[groupOf(p)] = (m[groupOf(p)] ?? 0) + 1
  return m
})
const visible = (p: Person) => filter.value === 'all' || groupOf(p) === filter.value

// ---- map layout (SVG user units; scales with the card) ----
const S = 600
const C = S / 2
const RADII = [0, 272, 232, 188, 142, 98] // by closeness 1..5

const nodes = computed(() => {
  const out = new Map<string, { p: Person; x: number; y: number; r: number; color: string }>()
  for (let c = 5; c >= 1; c--) {
    const ring = data.people.filter((p) => (p.closeness || 3) === c).sort((a, b) => groupOf(a).localeCompare(groupOf(b)) || a.createdAt.localeCompare(b.createdAt))
    ring.forEach((p, i) => {
      const a = (Math.PI * 2 * i) / ring.length - Math.PI / 2 + c * 0.6
      out.set(p.id, { p, x: C + RADII[c] * Math.cos(a), y: C + RADII[c] * Math.sin(a), r: 15 + c * 1.6, color: groupMeta(groupOf(p)).color })
    })
  }
  return out
})

/** Person-to-person links ("认识"), drawn as arcs bowed toward the centre. */
const ties = computed(() =>
  data.links
    .map(([a, b]) => [nodes.value.get(a), nodes.value.get(b)] as const)
    .filter((x): x is [NonNullable<(typeof x)[0]>, NonNullable<(typeof x)[1]>] => !!x[0] && !!x[1])
    .map(([a, b]) => {
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      const cx = mx + (C - mx) * 0.35
      const cy = my + (C - my) * 0.35
      return { key: a.p.id + b.p.id, a: a.p.id, b: b.p.id, d: `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}` }
    }),
)

const focusId = computed(() => selected.value?.id)
const neighbours = computed(() => {
  const s = new Set<string>()
  for (const tie of ties.value) {
    if (tie.a === focusId.value) s.add(tie.b)
    if (tie.b === focusId.value) s.add(tie.a)
  }
  return s
})
const dim = (id: string) => {
  const p = nodes.value.get(id)!.p
  if (!visible(p)) return 'out'
  if (id === focusId.value || neighbours.value.has(id) || !neighbours.value.size) return ''
  return 'soft'
}

// ---- list ----
const q = ref('')
const listed = computed(() => {
  const s = q.value.trim().toLowerCase()
  return ranked.value.filter(
    (p) => visible(p) && (!s || [p.title, p.relation, p.traits, p.met].some((x) => x?.toLowerCase().includes(s))),
  )
})
function statusOf(p: Person): { text: string; cls: string } {
  const b = daysToBirthday(p, t)
  if (b === 0) return { text: '今天生日', cls: 'gold' }
  if (b !== null && b <= 7) return { text: `${b} 天后生日`, cls: 'gold' }
  const o = contactOverdue(p, t)
  if (o !== null) return { text: '该联系了', cls: 'warn' }
  const l = lastContact(p)
  return { text: l ? `上次联系 ${friendly(l)}` : '还没联系过', cls: '' }
}

async function add() {
  const p = await data.create('person')
  if (p) {
    selectedId.value = p.id
    ui.open(p.id)
  }
}
</script>

<template>
  <div class="page wide">
    <header class="page-head">
      <div>
        <h1 class="page-title">人物</h1>
        <div class="page-sub">离中心越近越亲密，连线表示他们互相认识。记下每次联系，就是你们的交往史。</div>
      </div>
      <button class="btn primary" @click="add"><Plus />添加人物</button>
    </header>

    <template v-if="data.people.length">
      <div class="stats">
        <div class="card stat">
          <Users :size="18" />
          <div><b class="num">{{ stats.total }}</b><span>位重要的人</span></div>
        </div>
        <div class="card stat">
          <MessageCircle :size="18" />
          <div><b class="num">{{ stats.contacts }}</b><span>次联系 · 近 30 天</span></div>
        </div>
        <div class="card stat" :class="{ warn: stats.due }">
          <UserRoundCheck :size="18" />
          <div><b class="num">{{ stats.due }}</b><span>人该联系了</span></div>
        </div>
        <div class="card stat" :class="{ gold: stats.birthdays }">
          <Cake :size="18" />
          <div><b class="num">{{ stats.birthdays }}</b><span>个生日 · 30 天内</span></div>
        </div>
      </div>

      <div class="layout">
        <div class="card map-card">
          <div class="filters">
            <button class="fchip" :class="{ on: filter === 'all' }" @click="filter = 'all'">全部 <span class="num">{{ data.people.length }}</span></button>
            <button
              v-for="g in GROUPS.filter((g) => groupCounts[g.key])"
              :key="g.key"
              class="fchip"
              :class="{ on: filter === g.key }"
              :style="{ '--g': g.color }"
              @click="filter = filter === g.key ? 'all' : g.key"
            >
              <span class="sw" />{{ g.label }} <span class="num">{{ groupCounts[g.key] }}</span>
            </button>
          </div>

          <div class="map">
            <svg :viewBox="`0 0 ${S} ${S}`" role="img" aria-label="人物关系图">
              <circle v-for="c in [1, 2, 3, 4, 5]" :key="c" :cx="C" :cy="C" :r="RADII[c]" class="ring" :class="'r' + c" />
              <g class="spokes">
                <line v-for="n in nodes.values()" :key="n.p.id" :x1="C" :y1="C" :x2="n.x" :y2="n.y" :class="dim(n.p.id)" :style="{ stroke: n.color, opacity: dim(n.p.id) ? 0.04 : 0.06 + n.p.closeness * 0.03 }" />
              </g>
              <g class="ties">
                <path
                  v-for="tie in ties"
                  :key="tie.key"
                  :d="tie.d"
                  :class="{ hot: tie.a === focusId || tie.b === focusId, out: dim(tie.a) === 'out' || dim(tie.b) === 'out' }"
                />
              </g>
            </svg>
            <div class="me">
              <Avatar :name="data.profile.name" :size="54" />
              <span>我</span>
            </div>
            <button
              v-for="n in nodes.values()"
              :key="n.p.id"
              class="pnode"
              :class="[dim(n.p.id), { sel: n.p.id === focusId, due: contactOverdue(n.p, t) !== null }]"
              :style="{ left: `${(n.x / S) * 100}%`, top: `${(n.y / S) * 100}%`, '--g': n.color, '--d': `${n.r * 2}px` }"
              :title="titleOf(n.p)"
              @click="select(n.p.id, true)"
              @dblclick="ui.open(n.p.id)"
            >
              <span class="bubble">
                {{ titleOf(n.p).slice(0, 1) }}
                <Cake v-if="(daysToBirthday(n.p, t) ?? 99) <= 7" :size="13" class="cake" />
              </span>
              <span class="pname">{{ titleOf(n.p) }}</span>
            </button>
          </div>

          <div class="legend faint">
            <span><i class="lg-ring" />内圈 = 亲密度高</span>
            <span><i class="lg-tie" />互相认识</span>
            <span><i class="lg-due" />该联系了</span>
          </div>
        </div>

        <div ref="panel" class="card card-pad side">
          <PersonPanel v-if="selected" :person="selected" @select="(id) => select(id)" />
        </div>
      </div>

      <section class="all">
        <div class="all-head">
          <h2 class="section-title">所有人 <span class="count">{{ listed.length }}</span></h2>
          <label class="search">
            <Search :size="15" class="faint" />
            <input v-model="q" placeholder="按名字、关系、印象搜索" />
          </label>
        </div>
        <div class="cards">
          <button
            v-for="p in listed"
            :key="p.id"
            class="card pcard"
            :class="{ sel: p.id === focusId }"
            :style="{ '--g': groupMeta(groupOf(p)).color }"
            @click="select(p.id, true)"
          >
            <span class="bubble sm">{{ titleOf(p).slice(0, 1) }}</span>
            <span class="grow info">
              <span class="ellipsis"><b>{{ titleOf(p) }}</b> <span class="faint">{{ p.relation }}</span></span>
              <span class="small ellipsis" :class="statusOf(p).cls">{{ statusOf(p).text }}</span>
            </span>
            <span class="hearts">{{ '♥'.repeat(p.closeness) }}</span>
          </button>
          <div v-if="!listed.length" class="faint none">没有符合条件的人。</div>
        </div>
      </section>
    </template>

    <div v-else class="card">
      <Empty :icon="Users" title="记下对你重要的人" text="家人、朋友、导师、合作者……记下生日、怎么认识的、每次联系聊了什么。设置亲密度后，太久没联系会提醒你。">
        <button class="btn primary" @click="add"><Plus />添加第一个人</button>
      </Empty>
    </div>
  </div>
</template>

<style scoped>
.wide {
  max-width: 1280px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.stat {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  color: var(--text-3);
}
.stat b {
  display: block;
  font-size: 22px;
  line-height: 1.1;
  color: var(--text);
}
.stat span {
  font-size: 12px;
}
.stat.warn {
  color: var(--danger);
}
.stat.gold {
  color: var(--gold);
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 400px);
  gap: 16px;
  align-items: start;
}
.map-card {
  padding: 14px 16px 12px;
  background:
    radial-gradient(circle at 50% 54%, color-mix(in srgb, var(--attr-social) 7%, transparent), transparent 60%),
    var(--surface);
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.fchip {
  --g: var(--text-2);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.fchip .num {
  color: var(--text-3);
  font-size: 12px;
}
.fchip.on {
  border-color: var(--g);
  color: var(--text);
  background: color-mix(in srgb, var(--g) 10%, var(--surface));
}
.sw {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--g);
}
.map {
  position: relative;
  width: 100%;
  max-width: 620px;
  aspect-ratio: 1;
  margin: 4px auto 0;
}
.map > svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.ring {
  fill: none;
  stroke: var(--border);
  stroke-dasharray: 2 6;
}
.ring.r5 {
  fill: color-mix(in srgb, var(--attr-social) 5%, transparent);
  stroke: color-mix(in srgb, var(--attr-social) 25%, transparent);
  stroke-dasharray: none;
}
.spokes line {
  stroke-width: 1.5;
}
.ties path {
  fill: none;
  stroke: var(--text-3);
  stroke-width: 1.5;
  opacity: 0.45;
  transition: opacity 0.2s, stroke 0.2s;
}
.ties path.hot {
  stroke: var(--gold);
  stroke-width: 2.5;
  opacity: 1;
}
.ties path.out {
  opacity: 0.06;
}
.me {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: grid;
  justify-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: 700;
  pointer-events: none;
}
.pnode {
  position: absolute;
  transform: translate(-50%, -50%);
  display: grid;
  justify-items: center;
  gap: 3px;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: var(--text);
  transition: opacity 0.2s;
  z-index: 1;
}
.pnode.soft {
  opacity: 0.45;
}
.pnode.out {
  opacity: 0.12;
}
.pnode .bubble {
  width: var(--d);
  height: var(--d);
  font-size: calc(var(--d) * 0.4);
  position: relative;
}
.bubble {
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 700;
  color: var(--g);
  background: color-mix(in srgb, var(--g) 10%, var(--surface));
  border: 2.5px solid var(--g);
  box-shadow: var(--shadow);
  transition: transform 0.15s, box-shadow 0.15s;
}
.pnode:hover .bubble {
  transform: scale(1.1);
}
.pnode.sel {
  z-index: 2;
}
.pnode.sel .bubble {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--g) 25%, transparent), var(--shadow);
  background: var(--g);
  color: var(--surface);
}
.pnode.due .bubble::after {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 1.5px dashed var(--danger);
}
.cake {
  position: absolute;
  top: -8px;
  right: -8px;
  color: var(--gold);
  background: var(--surface);
  border-radius: 50%;
  padding: 2px;
  box-sizing: content-box;
}
.pname {
  font-size: 12px;
  max-width: 84px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 5px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
}
.pnode.sel .pname {
  font-weight: 700;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
  font-size: 12px;
  margin-top: 6px;
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.legend i {
  display: inline-block;
}
.lg-ring {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--attr-social) 45%, transparent);
  background: color-mix(in srgb, var(--attr-social) 8%, transparent);
}
.lg-tie {
  width: 18px;
  height: 0;
  border-top: 2px solid var(--text-3);
}
.lg-due {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1.5px dashed var(--danger);
}
.side {
  position: sticky;
  top: 20px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
}
.all {
  margin-top: 28px;
}
.all-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.all-head .section-title {
  margin: 0;
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  width: min(280px, 100%);
}
.search input {
  border: none;
  outline: none;
  background: none;
  font: inherit;
  color: var(--text);
  width: 100%;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}
.pcard {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  text-align: left;
  font: inherit;
  color: var(--text);
  cursor: pointer;
  border-left: 3px solid var(--g);
  transition: transform 0.15s, box-shadow 0.15s;
}
.pcard:hover {
  transform: translateY(-1px);
}
.pcard.sel {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--g) 40%, transparent), var(--shadow);
}
.bubble.sm {
  width: 34px;
  height: 34px;
  font-size: 14px;
  flex: none;
  box-shadow: none;
  border-width: 2px;
}
.info {
  display: grid;
  min-width: 0;
}
.small {
  font-size: 12px;
  color: var(--text-3);
}
.small.warn {
  color: var(--danger);
}
.small.gold {
  color: var(--gold);
  font-weight: 600;
}
.hearts {
  color: var(--attr-social);
  font-size: 10px;
  letter-spacing: 1px;
  flex: none;
}
.none {
  padding: 8px 2px;
}
@media (max-width: 1100px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .side {
    position: static;
    max-height: none;
  }
}
@media (max-width: 760px) {
  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .pname {
    font-size: 10px;
    max-width: 52px;
    padding: 0 3px;
  }
  .pnode {
    gap: 1px;
  }
  .pnode .bubble {
    width: calc(var(--d) * 0.68);
    height: calc(var(--d) * 0.68);
    border-width: 2px;
  }
  .me {
    transform: translate(-50%, -50%) scale(0.7);
  }
  .cake {
    top: -9px;
    right: -9px;
  }
  .map-card {
    padding: 12px 8px 10px;
  }
}
</style>
