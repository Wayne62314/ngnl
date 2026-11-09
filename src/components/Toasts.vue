<script setup lang="ts">
import { useUi } from '@/stores/ui'
const ui = useUi()
</script>

<template>
  <div class="toasts" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in ui.toasts" :key="t.id" class="toast" :class="t.kind" :style="t.color ? { '--c': t.color } : undefined">
        <span v-if="t.kind === 'level'">✨</span>
        {{ t.text }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 100;
  display: grid;
  gap: 8px;
  justify-items: end;
  pointer-events: none;
}
.toast {
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--on-ink);
  box-shadow: var(--shadow-lg);
  font-weight: 600;
  font-size: 13px;
}
.toast.xp {
  background: var(--surface);
  color: var(--c);
  border: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
}
.toast.level {
  background: linear-gradient(90deg, var(--gold-2), var(--gold));
  color: #1c1a24;
  font-size: 14px;
  padding: 10px 18px;
}
.toast.error {
  background: var(--danger);
  color: #fff;
  border-radius: 12px;
}
.toast-enter-active {
  transition: all 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.3);
}
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.9);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
@media (max-width: 760px) {
  .toasts {
    right: 16px;
    bottom: 84px;
  }
}
</style>
