<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { AlertTriangle, CircleHelp } from 'lucide-vue-next'
import { useUi } from '@/stores/ui'

const ui = useUi()
const cancelBtn = ref<HTMLButtonElement>()
const okBtn = ref<HTMLButtonElement>()

// Focus the safe choice for deletions, the confirm button otherwise.
watch(
  () => ui.confirmRequest,
  (r) => r && nextTick(() => (r.danger ? cancelBtn.value : okBtn.value)?.focus()),
)
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    ui.confirmRequest?.resolve(false)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm">
      <div v-if="ui.confirmRequest" class="scrim" @mousedown.self="ui.confirmRequest.resolve(false)" @keydown="onKey">
        <div class="dialog card" role="alertdialog" aria-modal="true" :aria-label="ui.confirmRequest.title">
          <div class="head" :class="{ danger: ui.confirmRequest.danger }">
            <component :is="ui.confirmRequest.danger ? AlertTriangle : CircleHelp" :size="22" />
            <b>{{ ui.confirmRequest.title }}</b>
          </div>
          <p v-if="ui.confirmRequest.message" class="msg">{{ ui.confirmRequest.message }}</p>
          <ul v-if="ui.confirmRequest.details?.length" class="details">
            <li v-for="(d, i) in ui.confirmRequest.details" :key="i">{{ d }}</li>
          </ul>
          <div class="actions">
            <button ref="cancelBtn" class="btn ghost" @click="ui.confirmRequest.resolve(false)">取消</button>
            <button ref="okBtn" class="btn" :class="ui.confirmRequest.danger ? 'danger-solid' : 'primary'" @click="ui.confirmRequest.resolve(true)">
              {{ ui.confirmRequest.confirmText ?? '确认' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(20, 15, 8, 0.45);
}
.dialog {
  width: min(440px, 100%);
  padding: 20px 22px 18px;
  display: grid;
  gap: 12px;
  box-shadow: var(--shadow-lg);
}
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
  color: var(--gold);
}
.head b {
  color: var(--text);
}
.head.danger {
  color: var(--danger);
}
.msg {
  margin: 0;
  color: var(--text-2);
  white-space: pre-line;
  line-height: 1.6;
}
.details {
  margin: 0;
  padding: 10px 12px 10px 28px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 13px;
  line-height: 1.7;
  max-height: 220px;
  overflow-y: auto;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
.danger-solid {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
.confirm-enter-active,
.confirm-leave-active {
  transition: opacity 0.15s;
}
.confirm-enter-active .dialog {
  transition: transform 0.2s cubic-bezier(0.2, 1.2, 0.4, 1);
}
.confirm-enter-from,
.confirm-leave-to {
  opacity: 0;
}
.confirm-enter-from .dialog {
  transform: scale(0.95);
}
</style>
