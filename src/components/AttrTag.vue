<script setup lang="ts">
import { computed } from 'vue'
import { attrOf, type Attr } from '@/lib/types'
const props = defineProps<{ attr: Attr }>()
const a = computed(() => attrOf(props.attr))
</script>

<template>
  <span class="chip attr" :style="{ '--c': a.color }"><span class="dot" />{{ a.label }}</span>
</template>

<style scoped>
.attr {
  background: color-mix(in srgb, var(--c) 11%, transparent);
  color: var(--c);
  font-weight: 500;
}
.dot {
  width: 6px;
  height: 6px;
}
</style>
