<script setup lang="ts">
import { computed } from 'vue'
import { attrOf, type Attr } from '@/lib/types'
import { ATTR_ICON } from '@/lib/attrIcons'
const props = defineProps<{ attr: Attr }>()
const a = computed(() => attrOf(props.attr))
</script>

<template>
  <span class="chip attr" :style="{ '--c': a.color }"><component :is="ATTR_ICON[a.key]" class="ic" />{{ a.label }}</span>
</template>

<style scoped>
.attr {
  background: color-mix(in srgb, var(--c) 11%, transparent);
  color: var(--c);
  font-weight: 500;
}
.ic {
  width: 12px;
  height: 12px;
  stroke-width: 2.4;
}
</style>
