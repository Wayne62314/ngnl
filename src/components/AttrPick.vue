<script setup lang="ts">
import { ATTRS, type Attr } from '@/lib/types'
import { ATTR_ICON } from '@/lib/attrIcons'
defineProps<{ modelValue: Attr | undefined }>()
const emit = defineEmits<{ 'update:modelValue': [v: Attr] }>()
</script>

<template>
  <div class="attrs" role="radiogroup">
    <button
      v-for="a in ATTRS"
      :key="a.key"
      type="button"
      role="radio"
      :aria-checked="a.key === modelValue"
      :title="a.hint"
      :class="{ on: a.key === modelValue }"
      :style="{ '--c': a.color }"
      @click="emit('update:modelValue', a.key)"
    >
      <component :is="ATTR_ICON[a.key]" :size="14" class="ic" />{{ a.label }}
    </button>
  </div>
</template>

<style scoped>
.attrs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  font-size: 13px;
  color: var(--text-2);
  transition: all 0.12s;
}
button:hover {
  border-color: var(--c);
}
.ic {
  color: var(--c);
}
button.on {
  border-color: var(--c);
  background: color-mix(in srgb, var(--c) 12%, var(--surface));
  color: var(--c);
  font-weight: 600;
}
</style>
