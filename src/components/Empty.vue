<script setup lang="ts">
defineProps<{ icon?: object; title: string; text?: string }>()
</script>

<template>
  <div class="empty">
    <div v-if="icon" class="ic"><component :is="icon" :size="22" /></div>
    <b>{{ title }}</b>
    <p v-if="text" class="muted">{{ text }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty {
  display: grid;
  justify-items: center;
  text-align: center;
  gap: 6px;
  padding: 36px 20px;
}
.ic {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--gold-soft);
  color: var(--gold);
  margin-bottom: 6px;
}
b {
  font-size: 15px;
}
p {
  margin: 0 0 8px;
  max-width: 360px;
}
</style>
