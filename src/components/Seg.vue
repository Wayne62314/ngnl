<script setup lang="ts" generic="T extends string | number">
defineProps<{ options: { value: T; label: string; color?: string }[]; modelValue: T | undefined; size?: 'sm' }>()
const emit = defineEmits<{ 'update:modelValue': [v: T] }>()
</script>

<template>
  <div class="seg" :class="size" role="radiogroup">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="radio"
      :aria-checked="o.value === modelValue"
      :class="{ on: o.value === modelValue }"
      :style="o.color ? { '--c': o.color } : undefined"
      @click="emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: var(--sunken);
}
button {
  border: none;
  background: transparent;
  padding: 4px 11px;
  border-radius: 7px;
  cursor: pointer;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.12s;
}
button:hover {
  color: var(--text);
}
button.on {
  background: var(--surface);
  color: var(--c, var(--text));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  font-weight: 600;
}
.sm button {
  padding: 2px 8px;
  font-size: 12px;
}
</style>
