<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Download, LoaderCircle, Trash2 } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useSync } from '@/stores/sync'
import { useUi } from '@/stores/ui'

const data = useData()
const sync = useSync()
const ui = useUi()
const router = useRouter()

const open = ref(false)
const scope = ref<'device' | 'all'>('device')
const typed = ref('')
const busy = ref(false)
const ready = computed(() => typed.value.trim() === '删除' && !busy.value)

function start() {
  open.value = true
  scope.value = 'device'
  typed.value = ''
}

async function confirm() {
  if (!ready.value) return
  busy.value = true
  try {
    if (sync.enabled && scope.value === 'device') {
      // Leave the cloud copy and the other devices alone.
      await sync.disable(false)
      await data.wipe()
    } else {
      await data.wipe()
      // Push the empty save now so the other devices clear on their next sync.
      if (sync.enabled) await sync.syncNow().catch(() => {})
    }
    open.value = false
    ui.toast(sync.enabled ? '存档已删除，其他设备同步后也会清空' : '存档已删除')
    router.push('/')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="danger-zone">
    <div class="row head">
      <div class="grow">
        <b>删除存档</b>
        <div class="faint small">清空这个角色的全部数据：任务、习惯、目标、人物、经历、灵感、心情、等级和立绘。设置（主题等）会保留。</div>
      </div>
      <button v-if="!open" class="btn danger-btn sm" @click="start"><Trash2 />删除存档…</button>
    </div>

    <div v-if="open" class="confirm">
      <b>确定要删除存档吗？此操作无法撤销。</b>
      <p class="muted">现在共有 {{ data.items.length }} 个条目、{{ data.checkins.length }} 次打卡，角色 Lv.{{ data.level.level }}。删除前建议先导出一份备份，以后还能从备份恢复。</p>
      <button class="btn sm" @click="data.exportBackup()"><Download />先导出备份</button>

      <fieldset v-if="sync.enabled" class="scope">
        <legend class="small faint">这个存档正在多设备同步</legend>
        <label>
          <input v-model="scope" type="radio" value="device" />
          <span><b>只删除这台设备上的</b><span class="faint small">这台设备停止同步；云端和其他设备上的存档不受影响。</span></span>
        </label>
        <label>
          <input v-model="scope" type="radio" value="all" />
          <span><b>删除所有设备上的</b><span class="faint small">其他设备下次同步时也会被清空。</span></span>
        </label>
      </fieldset>

      <label class="type">
        <span class="small">输入「删除」以确认</span>
        <input v-model="typed" class="input" placeholder="删除" autocomplete="off" @keydown.enter="confirm" />
      </label>
      <div class="row actions">
        <button class="btn danger-solid" :disabled="!ready" @click="confirm">
          <LoaderCircle v-if="busy" class="spin" /><Trash2 v-else />永久删除存档
        </button>
        <button class="btn ghost" :disabled="busy" @click="open = false">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.danger-zone {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px dashed var(--border-strong);
}
.head {
  gap: 14px;
}
.small {
  font-size: 12px;
}
.danger-btn {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 40%, transparent);
}
.confirm {
  margin-top: 14px;
  padding: 14px 16px;
  border-radius: 12px;
  display: grid;
  gap: 12px;
  justify-items: start;
  border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);
  background: color-mix(in srgb, var(--danger) 6%, transparent);
}
.confirm p {
  margin: 0 !important;
}
.scope {
  margin: 0;
  padding: 0;
  border: none;
  display: grid;
  gap: 8px;
  width: 100%;
}
.scope label {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
}
.scope label > span {
  display: grid;
}
.scope input {
  margin-top: 4px;
  accent-color: var(--danger);
}
.type {
  display: grid;
  gap: 4px;
  width: min(240px, 100%);
}
.actions {
  gap: 8px;
}
.danger-solid {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
.danger-solid:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
