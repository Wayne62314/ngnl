<script setup lang="ts">
import { computed, inject } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Eye, EyeOff, X, ExternalLink, CircleCheck, CircleX } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { COMPARE_OPS, formatSim, KINDS, PERIODS, type Port } from '@/lib/simulate'
import { itemIcon, titleOf } from '@/lib/itemView'
import { tintOf } from '@/lib/itemTint'
import { typeLabel } from '@/lib/types'
import { SIM_CANVAS } from './context'

const props = defineProps<{ id: string; selected?: boolean }>()
const sim = inject(SIM_CANVAS)!
const data = useData()

const node = computed(() => sim.node(props.id))
const ports = computed(() => sim.ports(props.id))
const res = computed(() => sim.ev.value.nodes.get(props.id))
const item = computed(() => (node.value?.kind === 'item' ? data.byId.get(String(node.value.data.itemId ?? '')) : undefined))
const kind = computed(() => KINDS[node.value?.kind ?? ''])
const group = computed(() => kind.value?.group ?? 'data')
const title = computed(() => (item.value ? titleOf(item.value) : node.value?.kind === 'item' ? '已删除的条目' : kind.value?.label ?? node.value?.kind))
const sub = computed(() => (item.value ? typeLabel(item.value) : kind.value?.hint))
const accent = computed(() => (item.value ? tintOf(item.value) : `var(--sim-${group.value})`))
const isResult = computed(() => group.value === 'result')

const show = (v: unknown, p?: Pick<Port, 'type' | 'unit'>) => formatSim((v ?? null) as never, p, sim.hidden.value)
const set = (patch: Record<string, unknown>) => sim.setData(props.id, patch)

// Big verdict for result nodes.
const verdict = computed(() => {
  const r = res.value
  const n = node.value
  if (!r || !n || n.off) return null
  if (n.kind === 'save') return typeof r.outputs.ok === 'boolean' ? (r.outputs.ok as boolean) : null
  if (n.kind === 'verdict') return typeof r.inputs.in === 'boolean' ? (r.inputs.in as boolean) : null
  return null
})

// Chart node: a small projection line.
const chart = computed(() => {
  const s = res.value?.series
  if (!s?.length) return null
  const target = res.value?.inputs.target
  const W = 220
  const H = 80
  const vals = s.map((p) => p.value).concat(typeof target === 'number' ? [target] : [])
  const lo = Math.min(0, ...vals)
  const hi = Math.max(lo + 1, ...vals)
  const last = s[s.length - 1].day || 1
  const x = (day: number) => (day / last) * W
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H
  const hit = typeof target === 'number' ? s.find((p) => p.value >= target) : undefined
  return {
    W,
    H,
    path: s.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join(''),
    targetY: typeof target === 'number' ? y(target) : null,
    hit: hit ? { x: x(hit.day), y: y(hit.value), day: hit.day } : null,
    last,
  }
})
</script>

<template>
  <div v-if="node" class="sn" :class="{ off: node.off, selected, result: isResult }" :style="{ '--accent': accent }">
    <header class="sn-head">
      <component :is="itemIcon(item)" v-if="item" :size="14" class="sn-ic" />
      <span v-else class="sn-dot" />
      <div class="sn-title">
        <b>{{ title }}</b>
        <small>{{ sub }}</small>
      </div>
      <div class="sn-tools nodrag">
        <button v-if="item" class="sn-btn" title="打开条目" @click.stop="sim.openItem(item.id)"><ExternalLink :size="13" /></button>
        <button class="sn-btn" :title="node.off ? '打开（算进去）' : '关掉（假设不发生）'" @click.stop="sim.toggleOff(id)">
          <EyeOff v-if="node.off" :size="13" />
          <Eye v-else :size="13" />
        </button>
        <button class="sn-btn" title="删除节点" @click.stop="sim.remove(id)"><X :size="13" /></button>
      </div>
    </header>

    <!-- inputs -->
    <div v-for="p in ports.inputs" :key="'i' + p.key" class="sn-row in" :class="'t-' + p.type">
      <Handle type="target" :position="Position.Left" :id="p.key" :class="'h-' + p.type" />
      <span class="sn-label">{{ p.label }}</span>
      <span class="sn-val in-val">{{ sim.inputLabel(id, p.key) ?? '' }}</span>
    </div>

    <!-- settings -->
    <div v-if="node.kind === 'num'" class="sn-set nodrag">
      <input class="sn-input num" type="number" step="any" :value="node.data.value" @change="(e) => set({ value: Number((e.target as HTMLInputElement).value) || 0 })" />
      <input class="sn-input unit" placeholder="单位" :value="node.data.unit ?? ''" @change="(e) => set({ unit: (e.target as HTMLInputElement).value })" />
    </div>
    <div v-else-if="node.kind === 'date'" class="sn-set nodrag">
      <input class="sn-input" type="date" :value="node.data.value ?? ''" @change="(e) => set({ value: (e.target as HTMLInputElement).value })" />
    </div>
    <div v-else-if="node.kind === 'compare'" class="sn-set nodrag">
      <span class="muted">A</span>
      <select class="sn-input" :value="node.data.op" @change="(e) => set({ op: (e.target as HTMLSelectElement).value })">
        <option v-for="op in COMPARE_OPS" :key="op" :value="op">{{ op === '>=' ? '≥' : op === '<=' ? '≤' : op }}</option>
      </select>
      <span class="muted">B 吗？</span>
    </div>
    <div v-else-if="node.kind === 'minmax'" class="sn-set nodrag">
      <select class="sn-input" :value="node.data.op" @change="(e) => set({ op: (e.target as HTMLSelectElement).value })">
        <option value="max">取较大的</option>
        <option value="min">取较小的</option>
      </select>
    </div>
    <div v-else-if="node.kind === 'per'" class="sn-set nodrag">
      <select class="sn-input" :value="node.data.from" @change="(e) => set({ from: (e.target as HTMLSelectElement).value })">
        <option v-for="p in PERIODS" :key="p.key" :value="p.key">{{ p.label }}</option>
      </select>
      <span class="muted">→</span>
      <select class="sn-input" :value="node.data.to" @change="(e) => set({ to: (e.target as HTMLSelectElement).value })">
        <option v-for="p in PERIODS" :key="p.key" :value="p.key">{{ p.label }}</option>
      </select>
    </div>
    <div v-else-if="isResult && node.kind !== 'chart'" class="sn-set nodrag">
      <input class="sn-input" placeholder="写个说明，比如 年底前买得起吗" :value="node.data.label ?? ''" @change="(e) => set({ label: (e.target as HTMLInputElement).value })" />
    </div>

    <!-- results -->
    <div v-if="verdict !== null" class="sn-verdict" :class="verdict ? 'yes' : 'no'">
      <CircleCheck v-if="verdict" :size="22" />
      <CircleX v-else :size="22" />
      <b>{{ verdict ? '能' : '不能' }}</b>
    </div>
    <div v-if="node.kind === 'show' && res && !node.off" class="sn-big">
      {{ show(res.inputs.in, { type: 'num', unit: (node.data.unit as string) || undefined }) }}
      <input class="sn-input unit nodrag" placeholder="单位：元 / % / 天" :value="node.data.unit ?? ''" @change="(e) => set({ unit: (e.target as HTMLInputElement).value })" />
    </div>
    <svg v-if="chart" class="sn-chart" :viewBox="`-4 -6 ${chart.W + 8} ${chart.H + 12}`">
      <line v-if="chart.targetY !== null" x1="0" :x2="chart.W" :y1="chart.targetY" :y2="chart.targetY" class="target" />
      <path :d="chart.path" class="line" />
      <circle v-if="chart.hit" :cx="chart.hit.x" :cy="chart.hit.y" r="4" class="hit" />
    </svg>
    <div v-if="chart" class="sn-chart-cap">
      {{ chart.hit ? `第 ${chart.hit.day} 天到达目标` : `看 ${chart.last} 天` }}
    </div>

    <!-- outputs -->
    <div v-for="p in ports.outputs" :key="'o' + p.key" class="sn-row out" :class="'t-' + p.type">
      <span class="sn-label">{{ p.label }}</span>
      <span class="sn-val">{{ res ? show(res.outputs[p.key], p) : '—' }}</span>
      <Handle type="source" :position="Position.Right" :id="p.key" :class="'h-' + p.type" />
    </div>
    <div v-if="node.kind === 'item' && item && !ports.outputs.length" class="sn-note">这个条目没有可以计算的数值。给它加个数字字段试试。</div>

    <div v-if="res?.note" class="sn-note">{{ res.note }}</div>
  </div>
</template>

<style scoped>
.sn {
  --computed: var(--attr-career);
  width: 236px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  box-shadow: var(--shadow);
  font-size: 12px;
  color: var(--text);
  padding-bottom: 6px;
  transition: opacity 0.2s, box-shadow 0.2s;
}
.sn.selected {
  box-shadow: 0 0 0 2px var(--accent), var(--shadow-lg);
}
.sn.off {
  opacity: 0.5;
  border-style: dashed;
}
.sn.result {
  width: 252px;
  border-color: color-mix(in srgb, var(--gold) 55%, var(--border-strong));
}
.sn-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 8px 8px 12px;
  border-bottom: 1px solid var(--border);
  border-top: 3px solid var(--accent);
  border-radius: 13px 13px 0 0;
  margin-bottom: 4px;
}
.sn-ic {
  color: var(--accent);
  flex: none;
}
.sn-dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  background: var(--accent);
  flex: none;
}
.sn-title {
  display: grid;
  min-width: 0;
  flex: 1;
}
.sn-title b {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sn-title small {
  color: var(--text-3);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sn-tools {
  display: flex;
  gap: 1px;
  opacity: 0.35;
  transition: opacity 0.15s;
}
.sn:hover .sn-tools,
.sn.selected .sn-tools,
.sn.off .sn-tools {
  opacity: 1;
}
.sn-btn {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-2);
  cursor: pointer;
}
.sn-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.sn-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  padding: 0 14px;
}
.sn-row.out {
  justify-content: flex-end;
}
.sn-label {
  color: var(--text-2);
}
.sn-row.in .sn-label {
  flex: 1;
}
.sn-val {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--computed);
  white-space: nowrap;
}
.in-val {
  font-weight: 500;
  color: var(--text-3);
}
.sn-set {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px 6px;
}
.sn-input {
  min-width: 0;
  flex: 1;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--sunken);
  color: var(--text);
  font: inherit;
  font-size: 12px;
}
.sn-input.unit {
  flex: 0 0 64px;
}
.sn-input:focus {
  outline: 2px solid var(--gold);
  outline-offset: -1px;
}
.sn-verdict {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 6px 12px;
  padding: 10px;
  border-radius: 10px;
  font-family: var(--font-serif);
  font-size: 22px;
}
.sn-verdict.yes {
  background: color-mix(in srgb, var(--ok) 14%, transparent);
  color: var(--ok);
}
.sn-verdict.no {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}
.sn-big {
  display: grid;
  gap: 6px;
  padding: 4px 12px 6px;
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 900;
  color: var(--computed);
}
.sn-big .sn-input {
  font-family: var(--font);
  font-weight: 400;
}
.sn-chart {
  display: block;
  width: calc(100% - 24px);
  margin: 6px 12px 0;
  overflow: visible;
}
.sn-chart .line {
  fill: none;
  stroke: var(--computed);
  stroke-width: 2.2;
  stroke-linejoin: round;
}
.sn-chart .target {
  stroke: var(--gold);
  stroke-dasharray: 4 4;
}
.sn-chart .hit {
  fill: var(--gold);
}
.sn-chart-cap {
  padding: 2px 12px 4px;
  color: var(--text-3);
  font-size: 11px;
}
.sn-note {
  margin: 4px 12px 2px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--sunken);
  color: var(--text-2);
  font-size: 11px;
  line-height: 1.5;
}
.muted {
  color: var(--text-3);
}

/* Handles: colour by what flows through them. */
.sn :deep(.vue-flow__handle) {
  width: 11px;
  height: 11px;
  border: 2px solid var(--surface);
  background: var(--sim-num);
}
.sn :deep(.vue-flow__handle.h-bool) {
  background: var(--sim-bool);
  border-radius: 3px;
}
.sn :deep(.vue-flow__handle.h-date) {
  background: var(--sim-date);
  transform: translate(-50%, -50%) rotate(45deg);
  border-radius: 2px;
}
.sn :deep(.vue-flow__handle-right.h-date) {
  transform: translate(50%, -50%) rotate(45deg);
}
.sn :deep(.vue-flow__handle-left) {
  left: 0;
}
.sn :deep(.vue-flow__handle-right) {
  right: 0;
}
</style>
