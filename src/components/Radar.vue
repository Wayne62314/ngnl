<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ values: { label: string; value: number; color: string }[]; max: number }>()

const R = 100
const C = 140
const n = computed(() => props.values.length)
const pt = (i: number, r: number) => {
  const a = (Math.PI * 2 * i) / n.value - Math.PI / 2
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const
}
const ring = (f: number) => props.values.map((_, i) => pt(i, R * f).join(',')).join(' ')
const shape = computed(() =>
  props.values.map((v, i) => pt(i, R * Math.max(0.04, Math.min(1, v.value / props.max))).join(',')).join(' '),
)
</script>

<template>
  <svg :viewBox="`0 0 ${C * 2} ${C * 2}`" class="radar" role="img" aria-label="属性雷达图">
    <defs>
      <linearGradient id="radar-fill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="var(--gold-2)" stop-opacity="0.45" />
        <stop offset="1" stop-color="var(--gold)" stop-opacity="0.2" />
      </linearGradient>
    </defs>
    <polygon v-for="f in [1, 0.75, 0.5, 0.25]" :key="f" :points="ring(f)" class="grid" />
    <line v-for="(_, i) in values" :key="i" :x1="C" :y1="C" :x2="pt(i, R)[0]" :y2="pt(i, R)[1]" class="axis" />
    <polygon :points="shape" class="shape" />
    <circle v-for="(v, i) in values" :key="'d' + i" :cx="pt(i, R * Math.max(0.04, Math.min(1, v.value / max)))[0]" :cy="pt(i, R * Math.max(0.04, Math.min(1, v.value / max)))[1]" r="4" :fill="v.color" />
    <g v-for="(v, i) in values" :key="'l' + i">
      <text :x="pt(i, R + 22)[0]" :y="pt(i, R + 22)[1]" class="lab" :fill="v.color">{{ v.label }}</text>
      <text :x="pt(i, R + 22)[0]" :y="pt(i, R + 22)[1] + 14" class="val">Lv.{{ v.value }}</text>
    </g>
  </svg>
</template>

<style scoped>
.radar {
  width: 100%;
  max-width: 320px;
  overflow: visible;
}
.grid {
  fill: none;
  stroke: var(--border);
}
.axis {
  stroke: var(--border);
}
.shape {
  fill: url(#radar-fill);
  stroke: var(--gold);
  stroke-width: 2;
  stroke-linejoin: round;
  transition: all 0.5s;
}
.lab {
  font-size: 13px;
  font-weight: 700;
  text-anchor: middle;
  dominant-baseline: middle;
}
.val {
  font-size: 11px;
  text-anchor: middle;
  dominant-baseline: middle;
  fill: var(--text-3);
}
</style>
