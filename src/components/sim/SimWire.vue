<script setup lang="ts">
import { computed, inject } from 'vue'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Position } from '@vue-flow/core'
import { SIM_CANVAS } from './context'

const props = defineProps<{
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  selected?: boolean
}>()
const sim = inject(SIM_CANVAS)!

const path = computed(() => getBezierPath(props))
const label = computed(() => sim.edgeLabel(props.id))
</script>

<template>
  <BaseEdge
    :id="id"
    :path="path[0]"
    :interaction-width="18"
    :style="{ stroke: `var(--sim-${label?.type ?? 'num'})`, strokeWidth: selected ? 3.2 : 2, opacity: label?.text === '—' ? 0.45 : 0.9 }"
  />
  <EdgeLabelRenderer>
    <div
      v-if="label"
      class="wire-label nodrag nopan"
      :class="{ empty: label.text === '—', selected }"
      :style="{ transform: `translate(-50%, -50%) translate(${path[1]}px, ${path[2]}px)`, '--c': `var(--sim-${label.type})` }"
    >
      {{ label.text }}
    </div>
  </EdgeLabelRenderer>
</template>

<style scoped>
.wire-label {
  position: absolute;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface);
  border: 1.5px solid var(--c);
  color: var(--attr-career);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: var(--shadow);
}
.wire-label.empty {
  color: var(--text-3);
  font-weight: 500;
}
.wire-label.selected {
  outline: 2px solid var(--c);
}
</style>
