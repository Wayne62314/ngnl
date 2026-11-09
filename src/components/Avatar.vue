<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name?: string; size?: number; level?: number }>(), { size: 40 })
const initial = computed(() => (props.name?.trim() || '旅').slice(0, 1).toUpperCase())
</script>

<template>
  <div class="avatar" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.42}px` }">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="av-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="var(--gold-2)" />
          <stop offset="1" stop-color="var(--gold)" />
        </linearGradient>
      </defs>
      <path d="M50 3l40.7 23.5v47L50 97 9.3 73.5v-47z" fill="url(#av-g)" />
      <path d="M50 11l33.8 19.5v39L50 89 16.2 69.5v-39z" fill="var(--ink)" />
    </svg>
    <span>{{ initial }}</span>
  </div>
</template>

<style scoped>
.avatar {
  position: relative;
  display: grid;
  place-items: center;
  flex: none;
}
svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
span {
  position: relative;
  font-weight: 700;
  color: var(--gold-2);
}
</style>
