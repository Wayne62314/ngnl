<script setup lang="ts">
import { useUi } from '@/stores/ui'
import { ATTR_ICON } from '@/lib/attrIcons'
const ui = useUi()
</script>

<template>
  <div class="floaters" aria-live="polite">
    <div v-for="f in ui.floaters" :key="f.id" class="float" :style="{ left: `${f.x}px`, top: `${f.y}px`, '--c': f.color }">
      <component :is="ATTR_ICON[f.attr]" :size="14" />{{ f.text }}
    </div>
  </div>
</template>

<style scoped>
.floaters {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 120;
}
.float {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  font-weight: 800;
  font-size: 13px;
  white-space: nowrap;
  color: var(--c);
  background: var(--surface);
  border: 1.5px solid color-mix(in srgb, var(--c) 50%, transparent);
  box-shadow: 0 4px 14px color-mix(in srgb, var(--c) 30%, transparent);
  animation: rise 1.3s cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
}
@keyframes rise {
  0% {
    transform: translate(-50%, -30%) scale(0.6);
    opacity: 0;
  }
  15% {
    transform: translate(-50%, -110%) scale(1.12);
    opacity: 1;
  }
  30% {
    transform: translate(-50%, -130%) scale(1);
  }
  100% {
    transform: translate(-50%, -260%) scale(1);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .float {
    animation-duration: 1.3s;
    animation-name: fade;
    transform: translate(-50%, -150%);
  }
  @keyframes fade {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
}
</style>
