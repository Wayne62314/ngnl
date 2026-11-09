<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Bot, Check, Copy, Download, Laptop, PenLine, ShieldAlert, Smartphone } from 'lucide-vue-next'
import { useMcp } from '@/stores/mcp'
import { useUi } from '@/stores/ui'
import { TOOL_LABELS } from '@/lib/mcpTools'
import { friendly } from '@/lib/dates'

const mcp = useMcp()
const ui = useUi()

// Where the user saved the server file; only used to fill in the commands below.
const PATH_KEY = 'ngnl-mcp-path'
const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
const defaultPath = isMac ? '~/Downloads/ngnl-mcp.mjs' : 'C:\\Users\\你的用户名\\Downloads\\ngnl-mcp.mjs'
const path = ref((() => {
  try {
    return localStorage.getItem(PATH_KEY) || defaultPath
  } catch {
    return defaultPath
  }
})())
watch(path, (v) => {
  try {
    localStorage.setItem(PATH_KEY, v)
  } catch {}
})

const quoted = computed(() => (/\s/.test(path.value) ? `"${path.value}"` : path.value))
const codeCmd = computed(() => `claude mcp add ngnl -- node ${quoted.value}`)
const desktopJson = computed(() => JSON.stringify({ mcpServers: { ngnl: { command: 'node', args: [path.value] } } }, null, 2))

const copied = ref('')
async function copy(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
    setTimeout(() => copied.value === key && (copied.value = ''), 1500)
  } catch {
    ui.toast('复制失败，请手动选择文字复制', 'error')
  }
}

const clients = computed(() => [...new Set(mcp.connected.map((s) => s.client))].join('、'))
const isLocalPage = ['localhost', '127.0.0.1'].includes(location.hostname)
const stuck = computed(() => mcp.status === 'waiting' && mcp.attempts >= 2)
const time = (iso: string) => {
  const d = new Date(iso)
  return `${friendly(iso.slice(0, 10)) === '今天' ? '' : friendly(iso.slice(0, 10)) + ' '}${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

const EXAMPLES = ['看看我这周过得怎么样，给我写个周报', '我哪个习惯坚持得最差？帮我分析原因', '帮我把愿景树里的「？」拆成具体步骤', '最近该联系谁？结合往来记录给点建议', '把逾期的任务都改到明天']
</script>

<template>
  <section class="card card-pad block">
    <h2 class="section-title"><Bot :size="16" />AI 助手 <span class="count">MCP</span></h2>

    <!-- Phones can't run the local server. -->
    <div v-if="mcp.mobile" class="mobile">
      <Smartphone :size="22" />
      <div>
        <b>请在电脑上使用 AI 助手</b>
        <p class="muted">
          AI 助手需要在电脑上运行一个小程序，把 Claude 等 AI 和这个页面连接起来，手机浏览器无法运行它。请用电脑的 Chrome 或 Edge 打开
          <b>wayne62314.github.io/ngnl</b>，在这里开启连接。
        </p>
        <p class="faint small">提示：手机和电脑上的数据目前是分开保存的，可以用「导出 / 从备份恢复」把数据带到电脑上。</p>
      </div>
    </div>

    <template v-else>
      <p class="muted">
        让 Claude 等 AI 助手直接读取和更新你的数据：写周报、分析习惯、拆解目标、提醒联系人……
        数据仍然只在你的电脑上，AI 的每次读写都经由这个页面完成，并记录在下面。
      </p>

      <div class="switches">
        <label class="switch">
          <input v-model="mcp.enabled" type="checkbox" />
          <span class="track"><span class="thumb" /></span>
          <span>
            <b>连接 AI 助手</b>
            <span class="status" :class="mcp.status">
              <template v-if="mcp.status === 'off'">未开启</template>
              <template v-else-if="mcp.status === 'waiting'">等待连接…</template>
              <template v-else>已连接：{{ clients }}</template>
            </span>
          </span>
        </label>
        <label class="switch">
          <input v-model="mcp.allowWrite" type="checkbox" />
          <span class="track"><span class="thumb" /></span>
          <span>
            <b>允许 AI 修改数据</b>
            <span class="faint small">关闭后 AI 只能读取，不能新建、修改、打卡</span>
          </span>
        </label>
      </div>

      <div v-if="mcp.outdated" class="help">
        <ShieldAlert :size="18" />
        <div>
          <b>连接程序有新版本。</b>新版可以让 AI 查看资产与收支、帮你搭推演图、找出漏掉的关联。重新下载下面的 ngnl-mcp.mjs，覆盖原来的文件，再重启 Claude 即可。
        </div>
      </div>

      <div v-if="stuck" class="help">
        <ShieldAlert :size="18" />
        <div>
          <template v-if="mcp.everConnected">
            <b>AI 助手已断开。</b>通常是 Claude 关闭了或会话结束了。重新打开 Claude 后会自动重新连接，不需要做什么。
          </template>
          <template v-else-if="mcp.permission === 'denied' && !isLocalPage">
            <b>浏览器阻止了本页面访问这台电脑上的程序。</b>
            点地址栏左侧的图标 → 「网站设置」→ 把「本地网络访问」（或「访问此设备上的其他应用和服务」）改为<b>允许</b>，然后刷新页面。
          </template>
          <template v-else>
            <b>还没连上。</b>请确认：① 已按下面的步骤把 ngnl-mcp 加到 Claude 里，并且 Claude 正在运行（Claude Code 需要开着一个会话）；
            ② 浏览器弹出"是否允许访问此设备上的应用"时选了<b>允许</b>；③ 使用 Chrome 或 Edge（Safari 不支持）。
          </template>
        </div>
      </div>

      <details class="setup" :open="mcp.status !== 'connected'">
        <summary><Laptop :size="15" />第一次使用：三步设置</summary>
        <ol>
          <li>
            <b>安装 <a href="https://nodejs.org/" target="_blank" rel="noopener">Node.js</a></b>（18 或更高版本，装过可跳过）。
          </li>
          <li>
            <b>下载连接程序</b>，放到一个不会被删掉的位置：
            <div class="row gap">
              <a class="btn sm" href="./ngnl-mcp.mjs" download="ngnl-mcp.mjs"><Download />下载 ngnl-mcp.mjs</a>
              <span class="faint small">单个文件，不需要安装，源码公开可查看</span>
            </div>
            <label class="path">
              <span class="faint small">保存的位置（填好后下面的命令会自动更新）</span>
              <input v-model="path" class="input" spellcheck="false" />
            </label>
          </li>
          <li>
            <b>加到你的 AI 助手里</b>（任选其一）：
            <div class="cmd">
              <div class="cmd-head"><span>Claude Code：在终端运行</span><button class="btn ghost sm" @click="copy(codeCmd, 'code')"><component :is="copied === 'code' ? Check : Copy" />复制</button></div>
              <pre>{{ codeCmd }}</pre>
            </div>
            <div class="cmd">
              <div class="cmd-head">
                <span>Claude Desktop：设置 → 开发者 → 编辑配置，填入</span>
                <button class="btn ghost sm" @click="copy(desktopJson, 'desktop')"><component :is="copied === 'desktop' ? Check : Copy" />复制</button>
              </div>
              <pre>{{ desktopJson }}</pre>
              <div class="faint small">保存后重启 Claude Desktop。其他支持 MCP 的 AI 工具也可以用同样的命令。</div>
            </div>
          </li>
        </ol>
        <p class="faint small">然后打开上面的「连接 AI 助手」。第一次连接时浏览器会询问是否允许本页面访问这台电脑上的应用，请选择允许。使用时保持本页面开着。</p>
      </details>

      <div v-if="mcp.status === 'connected'" class="examples">
        <div class="faint small">试试对 AI 说：</div>
        <div class="chips">
          <button v-for="e in EXAMPLES" :key="e" class="chip ex" title="复制" @click="copy(e, e)">
            <component :is="copied === e ? Check : Copy" :size="12" />{{ e }}
          </button>
        </div>
      </div>

      <div v-if="mcp.log.length" class="log">
        <div class="faint small">最近的 AI 操作（仅本次打开页面期间）</div>
        <div v-for="(l, i) in mcp.log" :key="i" class="entry" :class="{ bad: !l.ok }">
          <span class="num faint">{{ time(l.at) }}</span>
          <span class="grow ellipsis">{{ l.client }} · {{ TOOL_LABELS[l.tool] ?? l.tool }}<template v-if="l.error"> — {{ l.error }}</template></span>
          <span v-if="l.write" class="chip gold"><PenLine :size="11" />修改</span>
        </div>
      </div>
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
.mobile {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--gold-soft);
  color: var(--gold);
}
.mobile b {
  color: var(--text);
}
.mobile p {
  margin: 6px 0 0 !important;
}
.switches {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
}
.switch {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}
.switch > span:last-child {
  display: grid;
}
.switch input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.track {
  width: 40px;
  height: 22px;
  flex: none;
  border-radius: 999px;
  background: var(--border-strong);
  position: relative;
  transition: background 0.2s;
}
.thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s;
}
.switch input:checked + .track {
  background: var(--gold);
}
.switch input:checked + .track .thumb {
  transform: translateX(18px);
}
.switch input:focus-visible + .track {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
.status {
  font-size: 12px;
  color: var(--text-3);
}
.status.waiting {
  color: var(--gold);
}
.status.connected {
  color: var(--attr-body);
  font-weight: 600;
}
.help {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  margin-bottom: 14px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--text-2);
  background: color-mix(in srgb, var(--danger) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
}
.help svg {
  color: var(--danger);
  flex: none;
  margin-top: 1px;
}
.setup {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 14px;
}
.setup summary {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-weight: 600;
}
.setup ol {
  margin: 12px 0 8px;
  padding-left: 20px;
  display: grid;
  gap: 14px;
}
.setup li {
  line-height: 1.6;
}
.setup a:not(.btn) {
  color: var(--gold);
}
.gap {
  gap: 10px;
  margin: 6px 0;
  flex-wrap: wrap;
}
.path {
  display: grid;
  gap: 4px;
  margin-top: 6px;
}
.path .input {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
}
.cmd {
  margin-top: 8px;
}
.cmd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
}
.cmd pre {
  margin: 4px 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--sunken);
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
.examples {
  margin-top: 14px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.ex {
  cursor: pointer;
  border: none;
  font: inherit;
  font-size: 12px;
}
.ex:hover {
  color: var(--gold);
}
.log {
  margin-top: 16px;
  display: grid;
  gap: 4px;
}
.entry {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 8px;
  border-radius: 8px;
  font-size: 13px;
  background: var(--surface-2);
}
.entry .num {
  font-size: 12px;
  flex: none;
}
.entry.bad {
  color: var(--danger);
}
</style>
