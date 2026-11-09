<script setup lang="ts">
import { ref } from 'vue'
import { AppWindow, Check, Copy, Download, Ellipsis, MonitorSmartphone, Share, SquarePlus } from 'lucide-vue-next'
import { useInstall } from '@/stores/install'
import { useUi } from '@/stores/ui'

const inst = useInstall()
const ui = useUi()

async function install() {
  if (await inst.install()) ui.toast('已安装，可以从桌面或应用列表打开')
}
const copied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.origin + location.pathname)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    ui.toast('复制失败，请手动复制地址栏里的网址', 'error')
  }
}
</script>

<template>
  <section id="install" class="card card-pad block">
    <h2 class="section-title"><MonitorSmartphone :size="16" />安装为应用</h2>

    <div v-if="inst.platform === 'installed'" class="ok"><Check :size="16" />已经作为应用在运行。</div>

    <template v-else>
      <p class="muted">装到桌面或手机主屏幕后，像普通 App 一样全屏打开，不用每次找网址，断网也能用。</p>

      <!-- Chrome / Edge / Android -->
      <button v-if="inst.platform === 'prompt'" class="btn primary" @click="install"><Download />安装应用</button>

      <!-- iPhone / iPad Safari -->
      <ol v-else-if="inst.platform === 'ios-safari'" class="steps">
        <li>
          <span class="ico"><Share :size="18" /></span>
          <span>点 Safari <b>底部中间的分享按钮</b>（iPad 在右上角）</span>
        </li>
        <li>
          <span class="ico"><SquarePlus :size="18" /></span>
          <span>往下滑，选 <b>「添加到主屏幕」</b></span>
        </li>
        <li>
          <span class="ico"><AppWindow :size="18" /></span>
          <span>点右上角 <b>「添加」</b>，然后从主屏幕的图标打开</span>
        </li>
      </ol>

      <!-- In-app browsers can't install -->
      <div v-else-if="inst.platform === 'in-app'" class="note">
        <Ellipsis :size="18" />
        <div>
          现在是在微信等 App 的内置浏览器里，无法安装。点右上角 <b>···</b>，选 <b>「在浏览器中打开」</b>（iPhone 选「在 Safari 中打开」），再按提示安装。
          <button class="btn sm" @click="copyLink"><component :is="copied ? Check : Copy" />或复制网址</button>
        </div>
      </div>

      <div v-else-if="inst.platform === 'ios-other'" class="note">
        <Share :size="18" />
        <div>
          请用 <b>Safari</b> 打开本页，再点分享按钮 →「添加到主屏幕」。
          <button class="btn sm" @click="copyLink"><component :is="copied ? Check : Copy" />复制网址</button>
        </div>
      </div>

      <div v-else-if="inst.platform === 'mac-safari'" class="note">
        <AppWindow :size="18" />
        <div>在菜单栏选 <b>「文件」→「添加到程序坞」</b>。</div>
      </div>

      <div v-else class="note">
        <AppWindow :size="18" />
        <div>当前浏览器不支持安装。用 <b>Chrome</b> 或 <b>Edge</b> 打开本页即可一键安装（地址栏右侧也会出现安装图标）；也可以直接把本页加入书签。</div>
      </div>

      <p v-if="inst.isIOS" class="warn faint small">
        注意：iPhone 上「主屏幕应用」和 Safari 的数据是分开保存的。安装后，在新打开的应用里进入「设置 → 多设备同步」用同步码加入，数据就会同步过来（或者先在 Safari 里导出备份，再在应用里恢复）。
      </p>
    </template>
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
.ok {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--attr-body);
  font-weight: 600;
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
  counter-reset: s;
}
.steps li {
  display: flex;
  align-items: center;
  gap: 12px;
  counter-increment: s;
}
.steps li::before {
  content: counter(s);
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--gold);
  background: var(--gold-soft);
}
.ico {
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 9px;
  display: grid;
  place-items: center;
  color: #0a84ff;
  background: color-mix(in srgb, #0a84ff 10%, var(--surface));
}
.note {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 13px;
  color: var(--text-2);
}
.note > svg {
  flex: none;
  color: var(--text-3);
  margin-top: 1px;
}
.note .btn {
  margin-top: 8px;
  display: flex;
}
.warn {
  margin-top: 12px !important;
}
</style>
