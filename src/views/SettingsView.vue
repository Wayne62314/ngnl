<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, ShieldCheck, ShieldAlert, Upload } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { CONTACT_XP, HABIT_XP, MOOD_XP, TASK_XP } from '@/lib/game'
import Seg from '@/components/Seg.vue'

const data = useData()
const ui = useUi()

const readTheme = (): 'system' | 'light' | 'dark' => {
  try {
    const t = localStorage.getItem('ngnl-theme')
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}
const theme = ref(readTheme())
function setTheme(t: 'system' | 'light' | 'dark') {
  theme.value = t
  if (t === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
  try {
    if (t === 'system') localStorage.removeItem('ngnl-theme')
    else localStorage.setItem('ngnl-theme', t)
  } catch {}
}

const file = ref<HTMLInputElement>()
const confirming = ref<unknown>(null)
async function pick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!f) return
  try {
    confirming.value = JSON.parse(await f.text())
  } catch {
    ui.toast('这不是有效的备份文件', 'error')
  }
}
async function doImport() {
  try {
    await data.importSnapshot(confirming.value)
    ui.toast('已从备份恢复')
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  }
  confirming.value = null
}
const lastBackup = computed(() => {
  const t = data.meta.lastBackupAt
  if (!t) return '还没有导出过备份'
  const days = Math.floor((Date.now() - Date.parse(t)) / 86400000)
  return days === 0 ? '上次备份：今天' : `上次备份：${days} 天前`
})
async function protect() {
  if (await data.protect()) ui.toast('浏览器已同意保护你的数据')
  else ui.toast('浏览器暂时没有同意。安装为应用或经常使用后通常会自动获得保护', 'error')
}
const counts = () => {
  const s = confirming.value as { items?: unknown[] }
  return Array.isArray(s?.items) ? s.items.length : 0
}
</script>

<template>
  <div class="page narrow">
    <header class="page-head">
      <h1 class="page-title">设置与备份</h1>
    </header>

    <section class="card card-pad block">
      <h2 class="section-title">外观</h2>
      <Seg
        :model-value="theme"
        :options="[
          { value: 'system', label: '跟随系统' },
          { value: 'light', label: '浅色' },
          { value: 'dark', label: '深色' },
        ]"
        @update:model-value="setTheme"
      />
    </section>

    <section class="card card-pad block">
      <h2 class="section-title">数据</h2>
      <p class="muted">
        所有内容只保存在<b>这个浏览器</b>里，不会上传到任何服务器，开发者也看不到。换电脑、换浏览器或清除浏览器数据前，请先导出备份。
      </p>
      <p class="faint">现在共有 {{ data.items.length }} 个条目、{{ data.links.length }} 条关联、{{ data.checkins.length }} 次打卡、{{ data.moods.length }} 天心情。{{ lastBackup }}。</p>
      <div class="guard" :class="{ ok: data.persisted }">
        <component :is="data.persisted ? ShieldCheck : ShieldAlert" :size="18" />
        <span class="grow">{{ data.persisted ? '已受保护：浏览器空间不足时也不会自动清理你的数据' : '未受保护：浏览器在空间不足时可能清理这些数据' }}</span>
        <button v-if="!data.persisted" class="btn sm" @click="protect">请求保护</button>
      </div>
      <div class="row">
        <button class="btn" @click="data.exportBackup()"><Download />导出备份</button>
        <button class="btn" @click="file?.click()"><Upload />从备份恢复</button>
        <input ref="file" type="file" accept="application/json,.json" hidden @change="pick" />
      </div>
      <div v-if="confirming" class="confirm">
        <b>用备份替换当前所有数据？</b>
        <p class="muted">备份里有 {{ counts() }} 个条目。当前的 {{ data.items.length }} 个条目会被覆盖，无法撤销。建议先导出一份当前数据。</p>
        <div class="row">
          <button class="btn primary" @click="doImport">替换</button>
          <button class="btn ghost" @click="confirming = null">取消</button>
        </div>
      </div>
    </section>

    <section class="card card-pad block">
      <h2 class="section-title">经验规则</h2>
      <table class="rules">
        <tbody>
          <tr><td>完成任务</td><td class="num">轻松 +{{ TASK_XP[1] }} · 普通 +{{ TASK_XP[2] }} · 艰巨 +{{ TASK_XP[3] }}，加到任务所属的属性</td></tr>
          <tr><td>习惯打卡</td><td class="num">+{{ HABIT_XP }}，加到习惯所属的属性</td></tr>
          <tr><td>联系一个人</td><td class="num">+{{ CONTACT_XP }} 社交（每人每天一次）</td></tr>
          <tr><td>记录心情</td><td class="num">+{{ MOOD_XP }} 心境（每天一次）</td></tr>
          <tr><td>没做到</td><td>不扣分。习惯只是连续天数归零，逾期任务可以改期或放下。</td></tr>
        </tbody>
      </table>
    </section>

    <section class="card card-pad block">
      <h2 class="section-title">快捷键</h2>
      <p class="muted"><kbd>Ctrl</kbd> + <kbd>K</kbd> 搜索任何条目，或直接输入标题新建。<kbd>Esc</kbd> 关闭详情。</p>
    </section>
  </div>
</template>

<style scoped>
.narrow {
  max-width: 720px;
}
.block {
  margin-bottom: 16px;
}
.block p {
  margin: 0 0 12px;
}
code,
kbd {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--sunken);
}
.guard {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--warn, #b7791f);
  background: color-mix(in srgb, currentColor 8%, transparent);
}
.guard.ok {
  color: var(--attr-body);
}
.guard span {
  color: var(--text-2);
}
.confirm {
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);
  background: color-mix(in srgb, var(--danger) 6%, transparent);
}
.confirm p {
  margin: 4px 0 12px;
}
.rules {
  width: 100%;
  border-collapse: collapse;
}
.rules td {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
.rules tr:last-child td {
  border-bottom: none;
}
.rules td:first-child {
  width: 110px;
  font-weight: 600;
}
</style>
