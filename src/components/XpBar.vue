<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ into: number; need: number; height?: number; color?: string }>(), { height: 6 })
const pct = computed(() => (props.need > 0 ? Math.min(100, (props.into / props.need) * 100) : 0))
</script>

<template>
  <div
    class="bar"
    role="progressbar"
    :aria-valuenow="into"
    :aria-valuemax="need"
    :style="{ height: `${height}px`, '--c': color ?? 'linear-gradient(90deg, var(--gold-2), var(--gold))' }"
  >
    <div class="fill" :style="{ width: `${pct}%` }" />
  </div>
</template>

<style scoped>
.bar {
  width: 100%;
  border-radius: 999px;
  background: var(--sunken);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: inherit;
  background: var(--c);
  transition: width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}
</style>
