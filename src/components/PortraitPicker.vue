<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Bot, Check, ImageUp, Trash2, X } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { useMcp } from '@/stores/mcp'
import { PRESETS, presetSrc, resizeImage } from '@/lib/portraits'
import { attrOf } from '@/lib/types'

const emit = defineEmits<{ close: [] }>()
const data = useData()
const ui = useUi()
const mcp = useMcp()

const current = () => data.profile.portrait
const file = ref<HTMLInputElement>()
const busy = ref(false)

async function save(portrait: string | undefined) {
  const p = { ...data.profile }
  if (portrait) p.portrait = portrait
  else delete p.portrait
  await data.saveProfile(p)
}
async function upload(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  busy.value = true
  try {
    await save(await resizeImage(f))
    ui.toast('立绘已更新')
    emit('close')
  } catch (err) {
    ui.toast((err as Error).message || '图片读取失败', 'error')
  } finally {
    busy.value = false
  }
}
async function reset() {
  const custom = current()?.startsWith('data:')
  if (custom) {
    const ok = await ui.confirm({
      title: '移除当前立绘？',
      message: '你上传或 AI 画的这张立绘会被删除，卡片换回默认角色。',
      confirmText: '移除',
      danger: true,
    })
    if (!ok) return
  }
  await save(undefined)
  emit('close')
}
async function pick(key: string) {
  await save('preset:' + key)
  emit('close')
}

const onKey = (e: KeyboardEvent) => e.key === 'Escape' && emit('close')
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="scrim" @mousedown.self="emit('close')">
      <div class="dialog card" role="dialog" aria-label="更换立绘">
        <header>
          <b class="serif">更换立绘</b>
          <button class="btn ghost sm icon" aria-label="关闭" @click="emit('close')"><X /></button>
        </header>

        <section>
          <button class="upload" :disabled="busy" @click="file?.click()">
            <ImageUp :size="22" />
            <span>
              <b>上传图片</b>
              <span class="faint small">照片、自己画的、AI 生成的都可以。会在本机压缩，并随同步加密保存。</span>
            </span>
          </button>
          <input ref="file" type="file" accept="image/*" hidden @change="upload" />
        </section>

        <section>
          <div class="label">内置角色</div>
          <div class="presets">
            <button
              v-for="p in PRESETS"
              :key="p.key"
              class="preset"
              :class="{ on: current() === 'preset:' + p.key }"
              :style="{ '--c': attrOf(p.attr).color }"
              @click="pick(p.key)"
            >
              <img :src="presetSrc(p.key)" :alt="p.name" />
              <span>{{ p.name }} · {{ attrOf(p.attr).label }}</span>
              <Check v-if="current() === 'preset:' + p.key" :size="14" class="tick" />
            </button>
          </div>
        </section>

        <section class="ai">
          <Bot :size="18" />
          <div>
            <b>让 AI 画一张</b>
            <p class="faint small">
              <template v-if="mcp.status === 'connected'">AI 助手已连接。对它说：「根据我的角色档案，给我画一张角色立绘」，它会直接画好放到卡片上。</template>
              <template v-else>在电脑上连接 AI 助手（设置 → AI 助手）后，对 Claude 说「给我画一张角色立绘」，它会画好直接放到卡片上。</template>
            </p>
          </div>
        </section>

        <footer v-if="current()">
          <button class="btn ghost sm" @click="reset"><Trash2 />恢复默认（按最强属性自动选）</button>
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
  overflow-x: hidden;
  padding: 18px 20px;
  display: grid;
  gap: 16px;
  box-shadow: var(--shadow-lg);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 18px;
}
.small {
  font-size: 12px;
}
.label {
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 8px;
}
.upload {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1.5px dashed var(--border-strong);
  background: var(--surface-2);
  color: var(--gold);
  cursor: pointer;
  text-align: left;
}
.upload b {
  display: block;
  color: var(--text);
}
.upload:hover {
  border-color: var(--gold);
}
.presets {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.preset {
  position: relative;
  display: grid;
  gap: 6px;
  padding: 6px 6px 8px;
  border-radius: 14px;
  border: 1.5px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  font-size: 12px;
  color: var(--text-2);
}
.preset img {
  width: 100%;
  aspect-ratio: 32 / 42;
  object-fit: cover;
  border-radius: 9px;
}
.preset:hover,
.preset.on {
  border-color: var(--c);
  color: var(--text);
}
.tick {
  position: absolute;
  top: 10px;
  right: 10px;
  color: #fff;
  background: var(--c);
  border-radius: 50%;
  padding: 2px;
}
.ai {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--gold-soft);
  color: var(--gold);
}
.ai b {
  color: var(--text);
}
.ai p {
  margin: 2px 0 0;
}
footer {
  display: flex;
  justify-content: flex-end;
}
</style>
