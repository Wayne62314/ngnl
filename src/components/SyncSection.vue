<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { renderSVG } from 'uqr'
import { Check, Cloud, CloudOff, Copy, Eye, EyeOff, Laptop, Link2, LoaderCircle, RefreshCw, ShieldCheck, Smartphone } from 'lucide-vue-next'
import { DEFAULT_SERVER, useSync } from '@/stores/sync'
import { useUi } from '@/stores/ui'

const sync = useSync()
const ui = useUi()
const route = useRoute()
const router = useRouter()

// ---- relay address (advanced; defaults to this build's relay) ----
const SERVER_KEY = 'ngnl-sync-server'
const server = ref((() => {
  try {
    return localStorage.getItem(SERVER_KEY) || DEFAULT_SERVER
  } catch {
    return DEFAULT_SERVER
  }
})())
watch(server, (v) => {
  try {
    if (v && v !== DEFAULT_SERVER) localStorage.setItem(SERVER_KEY, v)
    else localStorage.removeItem(SERVER_KEY)
  } catch {}
})

const busy = ref(false)
async function run(fn: () => Promise<unknown>, ok?: string) {
  busy.value = true
  try {
    await fn()
    if (ok) ui.toast(ok)
  } catch (e) {
    ui.toast((e as Error).message, 'error')
  } finally {
    busy.value = false
  }
}

// ---- pairing ----
const showCode = ref(false)
const joinLink = computed(() => {
  const code = sync.config?.code
  return code ? `${location.origin}${location.pathname}#/settings?join=${code}` : ''
})
const qr = computed(() => (joinLink.value ? renderSVG(joinLink.value, { border: 1, whiteColor: '#fff', blackColor: '#1c1a24' }) : ''))
const copied = ref(false)
async function copyCode() {
  try {
    await navigator.clipboard.writeText(sync.config!.code)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    ui.toast('复制失败，请手动抄写', 'error')
  }
}

// ---- joining (typed code, or opened from the QR link) ----
const joinInput = ref('')
const pendingJoin = ref('')
onMounted(() => {
  const j = route.query.join
  if (typeof j === 'string' && j) {
    pendingJoin.value = j
    router.replace({ query: {} }) // don't leave the code in the address bar or history
    document.getElementById('sync')?.scrollIntoView({ behavior: 'smooth' })
  }
})
async function join(code: string) {
  await run(async () => {
    await sync.join(code, server.value)
    pendingJoin.value = ''
    joinInput.value = ''
  }, '已加入同步，数据已合并')
}

const confirmDelete = ref(false)

const ago = computed(() => {
  const t = sync.lastSyncAt
  if (!t) return ''
  const s = Math.round((Date.now() - Date.parse(t)) / 1000)
  if (s < 60) return '刚刚'
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
  return new Date(t).toLocaleString()
})
// Refresh the "x 分钟前" text.
const nowTick = ref(0)
setInterval(() => nowTick.value++, 30_000)
</script>

<template>
  <section id="sync" class="card card-pad block">
    <h2 class="section-title"><Cloud :size="16" />多设备同步</h2>

    <!-- Opened from a pairing QR code / link -->
    <div v-if="pendingJoin && !sync.enabled" class="join-prompt">
      <Smartphone :size="22" />
      <div class="grow">
        <b>把这台设备加入同步？</b>
        <p class="muted">这台设备上已有的数据会和云端合并，不会丢失。之后在任意一台设备上的修改都会自动同步到其他设备。</p>
        <div class="row">
          <button class="btn primary" :disabled="busy" @click="join(pendingJoin)"><LoaderCircle v-if="busy" class="spin" />加入同步</button>
          <button class="btn ghost" @click="pendingJoin = ''">取消</button>
        </div>
      </div>
    </div>

    <template v-if="!sync.enabled">
      <p class="muted">
        在电脑、手机等多台设备之间自动同步。数据在你的设备上<b>先加密再上传</b>，钥匙就是同步码，只保存在你的设备里，服务器（包括开发者）看不到任何内容。不需要注册账号。
      </p>
      <div class="options">
        <div class="opt">
          <Laptop :size="18" />
          <div class="grow">
            <b>第一次开启</b>
            <div class="faint small">在数据最全的那台设备上开启，然后用其他设备扫码加入</div>
          </div>
          <button class="btn primary" :disabled="busy || !server" @click="run(() => sync.enable(server), '同步已开启')">
            <LoaderCircle v-if="busy" class="spin" />开启同步
          </button>
        </div>
        <form class="opt" @submit.prevent="join(joinInput)">
          <Link2 :size="18" />
          <div class="grow">
            <b>已有同步码</b>
            <input v-model="joinInput" class="input code-input" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX" spellcheck="false" autocomplete="off" />
          </div>
          <button class="btn" type="submit" :disabled="busy || !joinInput.trim() || !server">加入</button>
        </form>
      </div>
    </template>

    <template v-else>
      <div class="status" :class="sync.state">
        <LoaderCircle v-if="sync.state === 'syncing'" :size="16" class="spin" />
        <CloudOff v-else-if="sync.state === 'offline' || sync.state === 'error'" :size="16" />
        <ShieldCheck v-else :size="16" />
        <span class="grow">
          <template v-if="sync.state === 'syncing'">正在同步…</template>
          <template v-else-if="sync.state === 'offline'">
            暂时连不上同步服务器，联网后会自动同步。修改都保存在本机，不会丢。
            <span class="hint">如果一直连不上：同步服务器在中国大陆可能需要开启代理 / VPN 才能访问。</span>
          </template>
          <template v-else-if="sync.state === 'error'">同步出错：{{ sync.error }}</template>
          <template v-else>已同步<span v-if="ago" :key="nowTick"> · {{ ago }}</span>，端到端加密</template>
        </span>
        <button class="btn ghost sm" :disabled="sync.state === 'syncing'" @click="run(() => sync.syncNow())"><RefreshCw />立即同步</button>
      </div>

      <div class="pair">
        <div class="qr" v-html="qr" />
        <div class="grow">
          <b>添加另一台设备</b>
          <ol class="steps">
            <li>用手机相机扫左边的二维码，会打开 NoGameNoLife 并询问是否加入；</li>
            <li>或在另一台设备的「设置 → 多设备同步」里输入同步码。</li>
          </ol>
          <div class="code">
            <code>{{ showCode ? sync.config!.code : '••••-••••-••••-••••-••••-••••-••' }}</code>
            <button class="btn ghost sm icon" :title="showCode ? '隐藏' : '显示'" @click="showCode = !showCode"><component :is="showCode ? EyeOff : Eye" /></button>
            <button class="btn ghost sm" @click="copyCode"><component :is="copied ? Check : Copy" />复制</button>
          </div>
          <p class="faint small warn">同步码就是钥匙：拿到它的人能看到你的数据，不要发给别人。丢了也不要紧，每台设备上都有完整数据，重新开启同步即可。</p>
        </div>
      </div>

      <div class="row off">
        <button class="btn ghost sm" :disabled="busy" @click="run(() => sync.disable(false), '这台设备已停止同步')">在这台设备上关闭同步</button>
        <button v-if="!confirmDelete" class="btn ghost sm danger" @click="confirmDelete = true">关闭并删除云端数据</button>
        <span v-else class="row">
          <span class="small">所有设备都会停止同步（本机数据保留）。</span>
          <button class="btn danger sm" :disabled="busy" @click="run(() => sync.disable(true), '云端数据已删除')">确认删除</button>
          <button class="btn ghost sm" @click="confirmDelete = false">取消</button>
        </span>
      </div>
    </template>

    <details class="adv">
      <summary class="faint small">高级：同步服务器</summary>
      <input v-model="server" class="input" :disabled="sync.enabled" placeholder="https://…" spellcheck="false" />
      <p class="faint small">默认使用本应用的同步服务器。也可以自己部署一个（源码在仓库的 sync-server 目录）。服务器只能看到加密后的数据。</p>
    </details>
  </section>
</template>

<style scoped>
.block p {
  margin: 0 0 12px;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.small {
  font-size: 12px;
}
.join-prompt {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 14px;
  border-radius: 12px;
  background: var(--gold-soft);
  border: 1px solid color-mix(in srgb, var(--gold) 40%, transparent);
  color: var(--gold);
}
.join-prompt b {
  color: var(--text);
}
.join-prompt p {
  margin: 4px 0 10px !important;
}
.options {
  display: grid;
  gap: 10px;
}
.opt {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
}
.opt > svg {
  color: var(--text-3);
  flex: none;
}
.code-input {
  margin-top: 6px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 13px;
  letter-spacing: 0.04em;
}
.status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  background: color-mix(in srgb, var(--attr-body) 9%, transparent);
  color: var(--attr-body);
}
.status span {
  color: var(--text-2);
}
.hint {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-3);
}
.status.offline {
  background: var(--sunken);
  color: var(--text-3);
}
.status.error {
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  color: var(--danger);
}
.pair {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  margin-top: 16px;
}
.qr {
  width: 148px;
  flex: none;
  padding: 6px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--border);
}
.qr :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}
.steps {
  margin: 6px 0 10px;
  padding-left: 18px;
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.7;
}
.code {
  display: flex;
  align-items: center;
  gap: 4px;
}
.code code {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 13px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--sunken);
  letter-spacing: 0.04em;
  overflow-wrap: anywhere;
}
.warn {
  margin-top: 8px !important;
}
.off {
  margin-top: 14px;
  gap: 8px;
  flex-wrap: wrap;
}
.danger {
  color: var(--danger);
}
.adv {
  margin-top: 14px;
}
.adv summary {
  cursor: pointer;
}
.adv .input {
  margin-top: 8px;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
}
.adv p {
  margin-top: 6px !important;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 600px) {
  .pair {
    flex-direction: column;
    align-items: center;
  }
  .qr {
    width: 200px;
  }
  .opt {
    flex-wrap: wrap;
  }
}
</style>
