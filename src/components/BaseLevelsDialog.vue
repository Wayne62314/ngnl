<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive } from 'vue'
import { Minus, Plus, X } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { ATTR_ICON } from '@/lib/attrIcons'
import { attrLevel, attrXpForLevel, clampLevel, MAX_BASE_LEVEL } from '@/lib/game'
import { ATTRS, type Attr } from '@/lib/types'

const emit = defineEmits<{ close: [] }>()
const data = useData()
const ui = useUi()

const current = (k: Attr) => clampLevel(data.profile.baseLevels?.[k])
const draft = reactive(Object.fromEntries(ATTRS.map((a) => [a.key, current(a.key)])) as Record<Attr, number>)

/** Level shown on the card = starting level lifted by what you've earned since. */
const resulting = (k: Attr) => {
  const earned = data.totals[k] - attrXpForLevel(current(k))
  return attrLevel(attrXpForLevel(draft[k]) + earned).level
}

const step = (k: Attr, d: number) => (draft[k] = clampLevel(draft[k] + d))
const changes = computed(() => ATTRS.filter((a) => draft[a.key] !== current(a.key)))

async function save() {
  if (!changes.value.length) return emit('close')
  const ok = await ui.confirm({
    title: '修改初始等级？',
    message: '初始等级代表你开始使用前已有的水平，只影响六维属性，不影响角色总等级。以后还可以再改。',
    details: changes.value.map((a) => `${a.label}：初始 Lv.${current(a.key)} → Lv.${draft[a.key]}（当前显示 Lv.${resulting(a.key)}）`),
    confirmText: '确认修改',
  })
  if (!ok) return
  const base = Object.fromEntries(ATTRS.filter((a) => draft[a.key] > 1).map((a) => [a.key, draft[a.key]]))
  const p = { ...data.profile }
  if (Object.keys(base).length) p.baseLevels = base
  else delete p.baseLevels
  await data.saveProfile(p)
  ui.toast('初始等级已更新')
  emit('close')
}

const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !ui.confirmRequest && emit('close')
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="scrim" @mousedown.self="emit('close')">
      <div class="dialog card" role="dialog" aria-label="设置初始等级">
        <header>
          <b class="serif">设置初始等级</b>
          <button class="btn ghost sm icon" aria-label="关闭" @click="emit('close')"><X /></button>
        </header>
        <p class="muted">
          你不是从零开始的。给每项属性设一个起点，比如读书多年就把「智识」设高一些。之后做的事会在起点上继续累积经验。
        </p>
        <div class="rows">
          <div v-for="a in ATTRS" :key="a.key" class="row-attr" :style="{ '--c': a.color }">
            <span class="label"><component :is="ATTR_ICON[a.key]" :size="16" />{{ a.label }}</span>
            <span class="hint faint">{{ a.hint }}</span>
            <div class="stepper">
              <button class="btn ghost sm icon" :aria-label="`${a.label} 降低`" :disabled="draft[a.key] <= 1" @click="step(a.key, -1)"><Minus /></button>
              <input
                v-model.number="draft[a.key]"
                class="input num"
                type="number"
                min="1"
                :max="MAX_BASE_LEVEL"
                :aria-label="`${a.label} 初始等级`"
                @change="draft[a.key] = clampLevel(draft[a.key])"
              />
              <button class="btn ghost sm icon" :aria-label="`${a.label} 提高`" :disabled="draft[a.key] >= MAX_BASE_LEVEL" @click="step(a.key, 1)"><Plus /></button>
            </div>
            <span class="now faint num" :class="{ changed: draft[a.key] !== current(a.key) }">现在 Lv.{{ resulting(a.key) }}</span>
          </div>
        </div>
        <footer>
          <span class="faint small">范围 1–{{ MAX_BASE_LEVEL }}。保存前会再确认一次。</span>
          <div class="row">
            <button class="btn ghost" @click="emit('close')">取消</button>
            <button class="btn primary" :disabled="!changes.length" @click="save">保存（{{ changes.length }} 项改动）</button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(20, 15, 8, 0.4);
}
.dialog {
  width: min(560px, 100%);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 18px 20px;
  display: grid;
  gap: 14px;
  box-shadow: var(--shadow-lg);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 18px;
}
p {
  margin: 0;
}
.rows {
  display: grid;
  gap: 6px;
}
.row-attr {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto 76px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  background: var(--surface-2);
}
.label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  color: var(--c);
}
.hint {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stepper {
  display: flex;
  align-items: center;
  gap: 4px;
}
.stepper .input {
  width: 56px;
  text-align: center;
  padding: 0 4px;
}
.now {
  font-size: 12px;
  text-align: right;
}
.now.changed {
  color: var(--gold);
  font-weight: 700;
}
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.small {
  font-size: 12px;
}
@media (max-width: 520px) {
  .row-attr {
    grid-template-columns: 64px minmax(0, 1fr) 70px;
  }
  .hint {
    display: none;
  }
}
</style>
