<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ExternalLink, Maximize, Minus, Orbit, Plus, Search, X } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { buildGraph, EDGE_LABEL, GRAPH_TYPES, hubs, layout, type GNode } from '@/lib/graph'
import { itemIcon, search, titleOf } from '@/lib/itemView'
import { TYPE_META, typeLabel, type ItemType } from '@/lib/types'
import RelatedGroups from '@/components/RelatedGroups.vue'
import LinkSuggestions from '@/components/LinkSuggestions.vue'
import Empty from '@/components/Empty.vue'

const data = useData()
const ui = useUi()

/** Portrait sky on phones, landscape elsewhere (decided once, on open). */
const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches
const W = narrow ? 700 : 1000
const H = narrow ? 900 : 680
/** Label size in sky units: the phone sky is drawn at about half scale. */
const FONT = narrow ? 20 : 11

const COLOR: Partial<Record<ItemType, string>> = {
  person: 'var(--attr-social)',
  goal: 'var(--gold)',
  task: 'var(--attr-mind)',
  habit: 'var(--attr-body)',
  event: 'var(--text-2)',
  note: 'var(--attr-spirit)',
  asset: 'var(--attr-craft)',
  segment: 'var(--attr-career)',
  ledger: 'var(--text-3)',
}

// ---- filters (remembered on this device) ----
const DEFAULT_TYPES: ItemType[] = ['person', 'goal', 'task', 'habit', 'event', 'note', 'asset', 'segment']
function loadTypes(): ItemType[] {
  try {
    const v = JSON.parse(localStorage.getItem('ngnl-graph-types') ?? 'null')
    if (Array.isArray(v)) return v.filter((t) => GRAPH_TYPES.includes(t))
  } catch {}
  return DEFAULT_TYPES
}
const types = ref(new Set<ItemType>(loadTypes()))
const isolated = ref(false)
const closedTasks = ref(false)
watch(types, (v) => {
  try {
    localStorage.setItem('ngnl-graph-types', JSON.stringify([...v]))
  } catch {}
})
function toggleType(t: ItemType) {
  const s = new Set(types.value)
  if (s.has(t)) s.delete(t)
  else s.add(t)
  types.value = s
}
const counts = computed(() => {
  const m = new Map<ItemType, number>()
  for (const it of data.items) m.set(it.type, (m.get(it.type) ?? 0) + 1)
  return m
})

// ---- graph ----
const graph = computed(() => {
  const g = buildGraph(data.items, data.links, { types: types.value, isolated: isolated.value, closedTasks: closedTasks.value })
  layout(g, W, H)
  return g
})
const byId = computed(() => new Map(graph.value.nodes.map((n) => [n.id, n])))
const lines = computed(() =>
  graph.value.edges.map((e) => {
    const a = byId.value.get(e.a)!
    const b = byId.value.get(e.b)!
    return { key: e.a + e.b, a: e.a, b: e.b, kind: e.kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y }
  }),
)
const top = computed(() => hubs(graph.value))

// ---- focus ----
const focus = ref<string | null>(null)
const hover = ref<string | null>(null)
const focusItem = computed(() => (focus.value ? data.byId.get(focus.value) : undefined))
const near = computed(() => {
  if (!focus.value) return null
  const s = new Set(graph.value.adj.get(focus.value) ?? [])
  s.add(focus.value)
  return s
})
watch(graph, () => {
  if (focus.value && !byId.value.has(focus.value)) focus.value = null
})
function pick(n: GNode) {
  focus.value = focus.value === n.id ? null : n.id
}
function centerOn(id: string) {
  const n = byId.value.get(id)
  if (!n) return
  focus.value = id
  k.value = Math.max(k.value, 1.8)
  tx.value = W / 2 - n.x * k.value
  ty.value = H / 2 - n.y * k.value
}

// ---- search ----
const q = ref('')
const matches = computed(() => (q.value.trim() ? search(graph.value.nodes.map((n) => n.item), q.value, 8) : []))
const matchIds = computed(() => new Set(matches.value.map((m) => m.id)))

// ---- labels: hubs always, others when zoomed in or highlighted ----
const showLabel = (n: GNode) =>
  n.id === hover.value || n.id === focus.value || matchIds.value.has(n.id) || (near.value ? near.value.has(n.id) : n.degree >= 6 || k.value >= 2.2)

// ---- zoom & pan ----
const k = ref(1)
const tx = ref(0)
const ty = ref(0)
const svg = ref<SVGSVGElement>()
function toLocal(e: { clientX: number; clientY: number }) {
  const r = svg.value!.getBoundingClientRect()
  // preserveAspectRatio "meet": the drawing is centred and scaled uniformly.
  const s = Math.min(r.width / W, r.height / H)
  return [(e.clientX - r.left - (r.width - W * s) / 2) / s, (e.clientY - r.top - (r.height - H * s) / 2) / s]
}
function zoomAt(f: number, cx = W / 2, cy = H / 2) {
  const nk = Math.min(8, Math.max(0.4, k.value * f))
  tx.value = cx - ((cx - tx.value) * nk) / k.value
  ty.value = cy - ((cy - ty.value) * nk) / k.value
  k.value = nk
}
const reset = () => ((k.value = 1), (tx.value = 0), (ty.value = 0))
function wheel(e: WheelEvent) {
  e.preventDefault()
  const [x, y] = toLocal(e)
  zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, x, y)
}
let drag: { x: number; y: number; tx: number; ty: number; moved: boolean } | null = null
function down(e: PointerEvent) {
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  const [x, y] = toLocal(e)
  drag = { x, y, tx: tx.value, ty: ty.value, moved: false }
}
function move(e: PointerEvent) {
  if (!drag) return
  const [x, y] = toLocal(e)
  if (Math.abs(x - drag.x) + Math.abs(y - drag.y) > 4) drag.moved = true
  tx.value = drag.tx + (x - drag.x)
  ty.value = drag.ty + (y - drag.y)
}
function up(e: PointerEvent) {
  if (drag && !drag.moved) {
    // A click: on a star, focus it; on empty sky, clear the focus.
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-node]') as HTMLElement | null
    const n = el ? byId.value.get(el.dataset.node!) : undefined
    if (n) pick(n)
    else focus.value = null
  }
  drag = null
}
</script>

<template>
  <div class="page wide">
    <header class="page-head">
      <div>
        <h1 class="page-title">星图</h1>
        <div class="page-sub">你的人、目标、习惯、经历和东西，是怎么连在一起的。</div>
      </div>
      <label class="find">
        <Search :size="15" />
        <input v-model="q" placeholder="找一颗星…" @keydown.enter="matches[0] && centerOn(matches[0].id)" />
        <div v-if="matches.length" class="find-list">
          <button v-for="m in matches" :key="m.id" @click="centerOn(m.id), (q = '')">
            <component :is="itemIcon(m)" :size="14" :style="{ color: COLOR[m.type] }" />
            <span>{{ titleOf(m) }}</span>
            <small>{{ typeLabel(m) }}</small>
          </button>
        </div>
      </label>
    </header>

    <div class="filters">
      <button
        v-for="t in GRAPH_TYPES"
        :key="t"
        class="chip-t"
        :class="{ on: types.has(t) }"
        :style="{ '--c': COLOR[t] }"
        :disabled="!counts.get(t)"
        @click="toggleType(t)"
      >
        <span class="dot" />{{ t === 'note' ? '灵感/情报' : TYPE_META[t].label }}
        <small>{{ counts.get(t) ?? 0 }}</small>
      </button>
      <label class="loners">
        <input v-model="isolated" type="checkbox" />
        显示没有连线的
      </label>
      <label class="loners">
        <input v-model="closedTasks" type="checkbox" />
        包括已完成的任务
      </label>
    </div>

    <Empty
      v-if="!graph.nodes.length"
      :icon="Orbit"
      title="星图还是空的"
      text="在条目详情里把相关的东西关联起来（人物和经历、任务和目标…），它们就会在这里连成星座。"
    />
    <div v-else class="stage">
      <div class="sky">
        <svg
          ref="svg"
          :viewBox="`0 0 ${W} ${H}`"
          :style="{ aspectRatio: `${W} / ${H}` }"
          role="img"
          :aria-label="`星图：${graph.nodes.length} 个条目，${graph.edges.length} 条连线`"
          @wheel="wheel"
          @pointerdown="down"
          @pointermove="move"
          @pointerup="up"
          @pointercancel="drag = null"
        >
          <g :transform="`translate(${tx} ${ty}) scale(${k})`">
            <line
              v-for="l in lines"
              :key="l.key"
              :x1="l.x1"
              :y1="l.y1"
              :x2="l.x2"
              :y2="l.y2"
              class="edge"
              :class="[l.kind, { lit: focus && (l.a === focus || l.b === focus), dim: focus && l.a !== focus && l.b !== focus }]"
              :stroke-width="1.2 / Math.sqrt(k)"
            />
            <g
              v-for="n in graph.nodes"
              :key="n.id"
              :data-node="n.id"
              class="star"
              :class="{ dim: near && !near.has(n.id), focus: n.id === focus, match: matchIds.has(n.id) }"
              :transform="`translate(${n.x} ${n.y})`"
              :style="{ '--c': COLOR[n.item.type] }"
              @pointerenter="hover = n.id"
              @pointerleave="hover = null"
              @dblclick="ui.open(n.id)"
            >
              <circle v-if="n.degree >= 4 || n.id === focus" class="halo" :r="n.r * 2.1" />
              <circle :r="n.r" class="core" />
              <text v-if="showLabel(n)" :y="n.r + FONT / Math.sqrt(k)" :font-size="FONT / Math.sqrt(k)" class="label">{{ titleOf(n.item) }}</text>
            </g>
          </g>
        </svg>
        <div class="zoom">
          <button title="放大" @click="zoomAt(1.4)"><Plus :size="15" /></button>
          <button title="缩小" @click="zoomAt(1 / 1.4)"><Minus :size="15" /></button>
          <button title="复位" @click="reset"><Maximize :size="14" /></button>
        </div>
        <div class="stats">{{ graph.nodes.length }} 颗星 · {{ graph.edges.length }} 条线</div>
      </div>

      <aside class="side card">
        <template v-if="focusItem">
          <div class="side-head">
            <component :is="itemIcon(focusItem)" :size="18" :style="{ color: COLOR[focusItem.type] }" />
            <div>
              <b>{{ titleOf(focusItem) }}</b>
              <small>{{ typeLabel(focusItem) }} · 连着 {{ graph.adj.get(focusItem.id)?.size ?? 0 }} 个</small>
            </div>
            <button class="btn ghost sm icon" title="取消选中" @click="focus = null"><X :size="15" /></button>
          </div>
          <button class="btn sm open" @click="ui.open(focusItem.id)"><ExternalLink :size="14" />打开详情</button>
          <RelatedGroups :id="focusItem.id" />
          <LinkSuggestions :id="focusItem.id" />
        </template>
        <template v-else>
          <h2 class="section-title">连接最多的</h2>
          <button v-for="n in top" :key="n.id" class="hub" @click="centerOn(n.id)">
            <span class="dot" :style="{ background: COLOR[n.item.type] }" />
            <span class="nm">{{ titleOf(n.item) }}</span>
            <small>{{ n.degree }}</small>
          </button>
          <div class="legend">
            <div><i class="solid" />{{ EDGE_LABEL.link }}（你连的）</div>
            <div><i class="dash" />目标、子目标、前置（自动）</div>
          </div>
          <p class="tip">点一颗星看它连着什么；双击打开；滚轮缩放，拖动平移。</p>
          <LinkSuggestions title="可能漏掉的连线" :limit="4" class="missing" />
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.wide {
  max-width: 1280px;
}
.find {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 260px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text-3);
}
.find input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  font: inherit;
  color: var(--text);
  outline: none;
}
.find-list {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 10;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}
.find-list button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: 8px;
  background: none;
  font: inherit;
  font-size: 13px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.find-list button:hover {
  background: var(--hover);
}
.find-list span {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.find-list small {
  color: var(--text-3);
}
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
}
.chip-t {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  font: inherit;
  font-size: 12px;
  color: var(--text-3);
  cursor: pointer;
}
.chip-t .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-strong);
}
.chip-t.on {
  color: var(--text);
  border-color: color-mix(in srgb, var(--c) 45%, var(--border));
}
.chip-t.on .dot {
  background: var(--c);
}
.chip-t small {
  color: var(--text-3);
}
.chip-t:disabled {
  opacity: 0.4;
  cursor: default;
}
.loners {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 6px;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
}
.stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 14px;
  align-items: start;
}
.sky {
  position: relative;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  overflow: hidden;
  background:
    radial-gradient(ellipse at 50% 45%, color-mix(in srgb, var(--gold) 9%, transparent), transparent 65%),
    var(--surface);
}
.sky svg {
  display: block;
  width: 100%;
  height: auto;
  touch-action: none;
  cursor: grab;
  user-select: none;
}
.sky svg:active {
  cursor: grabbing;
}
.edge {
  stroke: var(--border-strong);
  opacity: 0.8;
  transition: opacity 0.2s;
}
.edge.goal,
.edge.parent,
.edge.prereq {
  stroke-dasharray: 3 3;
}
.edge.lit {
  stroke: var(--gold);
  opacity: 1;
}
.edge.dim {
  opacity: 0.15;
}
.star {
  cursor: pointer;
  transition: opacity 0.2s;
}
.star.dim {
  opacity: 0.18;
}
.core {
  fill: var(--c);
  stroke: var(--surface);
  stroke-width: 1.5;
}
.halo {
  fill: var(--c);
  opacity: 0.12;
}
.star:hover .core,
.star.focus .core {
  stroke: var(--text);
  stroke-width: 2;
}
.star.match .core {
  stroke: var(--gold);
  stroke-width: 3;
}
.label {
  fill: var(--text);
  text-anchor: middle;
  paint-order: stroke;
  stroke: var(--surface);
  stroke-width: 3px;
  stroke-linejoin: round;
  pointer-events: none;
}
.zoom {
  position: absolute;
  top: 12px;
  right: 12px;
  display: grid;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow);
  overflow: hidden;
}
.zoom button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 30px;
  border: none;
  background: none;
  color: var(--text-2);
  cursor: pointer;
}
.zoom button:hover {
  background: var(--hover);
}
.stats {
  position: absolute;
  left: 14px;
  bottom: 10px;
  font-size: 12px;
  color: var(--text-3);
  pointer-events: none;
}
.side {
  display: grid;
  gap: 8px;
  padding: 16px;
  max-height: 680px;
  overflow-y: auto;
}
.side-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.side-head > div {
  display: grid;
  flex: 1;
  min-width: 0;
}
.side-head b {
  font-family: var(--font-serif);
  font-size: 17px;
}
.side-head small {
  color: var(--text-3);
  font-size: 12px;
}
.open {
  justify-self: start;
}
.hub {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  background: none;
  font: inherit;
  font-size: 13px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.hub:hover {
  background: var(--hover);
}
.hub .dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex: none;
}
.hub .nm {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hub small {
  color: var(--text-3);
}
.legend {
  display: grid;
  gap: 6px;
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-2);
}
.legend div {
  display: flex;
  align-items: center;
  gap: 8px;
}
.legend i {
  width: 22px;
  border-top: 1.5px solid var(--border-strong);
}
.legend i.dash {
  border-top-style: dashed;
}
.missing {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.tip {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.6;
}
@media (max-width: 900px) {
  .stage {
    grid-template-columns: 1fr;
  }
  .side {
    max-height: none;
  }
}
@media (max-width: 760px) {
  .find {
    width: 100%;
  }
}
</style>
