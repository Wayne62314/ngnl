<script setup lang="ts">
import { computed, provide, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueFlow, type VueFlowStore, type Connection, type EdgeChange, type NodeChange } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import { ArrowLeft, Bot, Eye, EyeOff, Maximize, Minus, Pin, PinOff, Plus, Search, Trash2, Workflow, X } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { today as todayKey, friendly } from '@/lib/dates'
import { canConnect, evaluate, formatSim, GROUPS, headline, KINDS, makesLoop, newId, portsWithUnits, SOURCE_TYPES, type Ctx } from '@/lib/simulate'
import { TEMPLATES } from '@/lib/simTemplates'
import { itemIcon, search, titleOf } from '@/lib/itemView'
import { tintOf } from '@/lib/itemTint'
import { typeLabel, type Item, type Sim, type SimEdge, type SimNode } from '@/lib/types'
import SimNodeCard from '@/components/sim/SimNodeCard.vue'
import SimWire from '@/components/sim/SimWire.vue'
import { SIM_CANVAS } from '@/components/sim/context'
import Empty from '@/components/Empty.vue'

const data = useData()
const ui = useUi()
const route = useRoute()
const router = useRouter()
const t = todayKey()

// ---- privacy (shared with 资产) ----
const hidden = ref((() => {
  try {
    return localStorage.getItem('ngnl-privacy') !== '0'
  } catch {
    return true
  }
})())
watch(hidden, (v) => {
  try {
    localStorage.setItem('ngnl-privacy', v ? '1' : '0')
  } catch {}
})

// ---- evaluation context: your live data ----
const ctx = computed<Ctx>(() => ({ byId: data.byId, defs: data.fieldDefs, done: data.doneDates, today: t }))

// ---- list of canvases ----
const list = computed(() =>
  [...data.sims]
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
    .map((s) => ({ sim: s, head: headline(s, evaluate(s, ctx.value), hidden.value) })),
)

async function fromTemplate(key: string) {
  const tpl = TEMPLATES.find((x) => x.key === key)!
  const built = tpl.build(data.items, t)
  const s = await data.create('sim', built)
  if (s) router.push(`/simulate/${s.id}`)
}

// ---- the open canvas ----
const current = computed(() => {
  const id = route.params.id as string | undefined
  const it = id ? data.byId.get(id) : undefined
  return it?.type === 'sim' ? (it as Sim) : undefined
})
const title = ref('')
/** Working copy of the open canvas; saved back (debounced) whenever it changes. */
const draft = reactive<{ id: string; nodes: SimNode[]; edges: SimEdge[] }>({ id: '', nodes: [], edges: [] })
const initNodes = shallowRef<{ id: string; type: string; position: { x: number; y: number }; data: object }[]>([])
const initEdges = shallowRef<{ id: string; type: string; source: string; sourceHandle: string; target: string; targetHandle: string }[]>([])
const toFlowNode = (n: SimNode) => ({ id: n.id, type: 'sim', position: { x: n.x, y: n.y }, data: {} })
const toFlowEdge = (e: SimEdge) => ({ id: e.id, type: 'sim', source: e.from, sourceHandle: e.fromPort, target: e.to, targetHandle: e.toPort })

watch(
  () => current.value?.id,
  (id) => {
    if (!id || id === draft.id) return
    const s = current.value!
    draft.id = id
    draft.nodes = JSON.parse(JSON.stringify(s.nodes))
    draft.edges = JSON.parse(JSON.stringify(s.edges))
    initNodes.value = draft.nodes.map(toFlowNode)
    initEdges.value = draft.edges.map(toFlowEdge)
    title.value = s.title
  },
  { immediate: true },
)
watch(
  () => route.params.id,
  (id) => {
    if (!id) draft.id = ''
  },
)

let saveTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => [draft.nodes, draft.edges],
  () => {
    if (!draft.id) return
    const id = draft.id
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (data.byId.has(id)) data.update<Sim>(id, { nodes: JSON.parse(JSON.stringify(draft.nodes)), edges: JSON.parse(JSON.stringify(draft.edges)) })
    }, 500)
  },
  { deep: true },
)

function saveTitle() {
  if (current.value && title.value.trim() !== current.value.title) data.update<Sim>(current.value.id, { title: title.value.trim() || '未命名推演' })
}

const ev = computed(() => evaluate(draft, ctx.value))
const nodeById = computed(() => new Map(draft.nodes.map((n) => [n.id, n])))
const portsOfId = (id: string) => {
  const n = nodeById.value.get(id)
  return n ? portsWithUnits(n, ctx.value, ev.value) : { inputs: [], outputs: [] }
}

// ---- Vue Flow wiring (controlled: every change passes through here) ----
const FLOW = 'ngnl-sim'
/** The live Vue Flow instance (a new one each time a canvas opens). */
const inst = shallowRef<VueFlowStore>()
const flow = new Proxy({} as VueFlowStore, { get: (_, k) => (inst.value as unknown as Record<string | symbol, unknown>)?.[k] })

function dropNode(id: string) {
  draft.nodes = draft.nodes.filter((n) => n.id !== id)
  draft.edges = draft.edges.filter((e) => e.from !== id && e.to !== id)
}
function onNodesChange(changes: NodeChange[]) {
  for (const c of changes) if (c.type === 'remove') dropNode(c.id)
  flow.applyNodeChanges(changes)
}
function onEdgesChange(changes: EdgeChange[]) {
  for (const c of changes) if (c.type === 'remove') draft.edges = draft.edges.filter((e) => e.id !== c.id)
  flow.applyEdgeChanges(changes)
}
function onDragStop({ nodes }: { nodes: { id: string; position: { x: number; y: number } }[] }) {
  for (const fn of nodes) {
    const n = nodeById.value.get(fn.id)
    if (n) Object.assign(n, { x: Math.round(fn.position.x), y: Math.round(fn.position.y) })
  }
}
const portType = (nodeId: string, port: string | null | undefined, side: 'inputs' | 'outputs') =>
  portsOfId(nodeId)[side].find((p) => p.key === port)?.type

function isValid(c: Connection) {
  return canConnect(portType(c.source, c.sourceHandle, 'outputs'), portType(c.target, c.targetHandle, 'inputs')) && !makesLoop(draft.edges, c.source, c.target)
}
function onConnect(c: Connection) {
  if (!c.sourceHandle || !c.targetHandle) return
  if (!isValid(c)) {
    ui.toast(makesLoop(draft.edges, c.source, c.target) ? '这样会连成一个圈' : '类型对不上：数字连数字，日期连日期，是/否连是/否', 'error')
    return
  }
  // One wire per input: a new wire replaces the old one.
  const old = draft.edges.filter((e) => e.to === c.target && e.toPort === c.targetHandle)
  if (old.length) flow.removeEdges(old.map((e) => e.id))
  const e: SimEdge = { id: newId(), from: c.source, fromPort: c.sourceHandle, to: c.target, toPort: c.targetHandle }
  draft.edges.push(e)
  flow.addEdges([toFlowEdge(e)])
}

// Dev-only hook for automated checks in the browser.
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__ngnlSim = { draft, flow, onConnect, isValid, ev }

// ---- adding nodes ----
const canvasEl = ref<HTMLElement>()
function addNode(kind: string, extra: Record<string, unknown> = {}, at?: { x: number; y: number }) {
  let pos = at
  if (!pos) {
    const r = canvasEl.value?.getBoundingClientRect()
    pos = r ? flow.screenToFlowCoordinate({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 }
    // Nudge so repeated clicks don't stack exactly.
    pos = { x: pos.x - 118 + ((draft.nodes.length * 24) % 120), y: pos.y - 60 + ((draft.nodes.length * 24) % 120) }
  }
  const n: SimNode = { id: newId(), kind, x: Math.round(pos.x), y: Math.round(pos.y), data: { ...(KINDS[kind]?.data ?? {}), ...extra } }
  draft.nodes.push(n)
  flow.addNodes([toFlowNode(n)])
  if (narrow.value) paletteOpen.value = false
}
const addItem = (it: Item, at?: { x: number; y: number }) => addNode('item', { itemId: it.id }, at)

function onDragStart(e: DragEvent, payload: { kind: string; itemId?: string }) {
  e.dataTransfer?.setData('application/x-ngnl-sim', JSON.stringify(payload))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
}
function onDrop(e: DragEvent) {
  const raw = e.dataTransfer?.getData('application/x-ngnl-sim')
  if (!raw) return
  e.preventDefault()
  const p = JSON.parse(raw) as { kind: string; itemId?: string }
  const at = flow.screenToFlowCoordinate({ x: e.clientX - 20, y: e.clientY - 20 })
  addNode(p.kind, p.itemId ? { itemId: p.itemId } : {}, at)
}

// ---- palette ----
const narrow = ref(typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches)
const paletteOpen = ref(!narrow.value)
const q = ref('')
const sources = computed(() => data.items.filter((i) => (SOURCE_TYPES as readonly string[]).includes(i.type)))
const found = computed(() => {
  if (q.value.trim()) return search(sources.value, q.value, 30)
  // Without a search: what's most useful to reason about.
  const pick = (type: string, n: number) => sources.value.filter((i) => i.type === type).slice(0, n)
  return [...pick('asset', 6), ...pick('habit', 6), ...pick('ledger', 6), ...pick('goal', 3), ...pick('person', 3)]
})
const kindsBy = computed(() => GROUPS.filter((g) => g.key !== 'data').map((g) => ({ ...g, kinds: Object.entries(KINDS).filter(([, k]) => k.group === g.key) })))

// ---- canvas actions ----
function edgeLabel(id: string) {
  const e = draft.edges.find((x) => x.id === id)
  if (!e) return undefined
  const p = portsOfId(e.from).outputs.find((x) => x.key === e.fromPort)
  return { text: formatSim(ev.value.edges.get(id) ?? null, p, hidden.value), type: p?.type ?? 'num' }
}

provide(SIM_CANVAS, {
  node: (id) => nodeById.value.get(id),
  ports: portsOfId,
  ev,
  edgeLabel,
  inputLabel(nodeId, port) {
    const e = draft.edges.find((x) => x.to === nodeId && x.toPort === port)
    return e ? edgeLabel(e.id)?.text : undefined
  },
  setData(id, patch) {
    const n = nodeById.value.get(id)
    if (n) n.data = { ...n.data, ...patch }
  },
  toggleOff(id) {
    const n = nodeById.value.get(id)
    if (n) n.off = !n.off || undefined
  },
  remove: (id) => flow.removeNodes([id]),
  openItem: (id) => ui.open(id),
  hidden,
})

async function togglePin() {
  if (!current.value) return
  await data.update<Sim>(current.value.id, { pinned: !current.value.pinned || null })
  ui.toast(current.value?.pinned ? '已固定到今日页' : '已从今日页取下')
}
async function removeSim(s: Sim) {
  const ok = await ui.confirm({ title: `删除「${titleOf(s)}」？`, message: '只删除这张推演图，你的数据不受影响。', confirmText: '删除', danger: true })
  if (!ok) return
  if (draft.id === s.id) await router.push('/simulate')
  await data.remove(s.id)
}
function fit() {
  flow.fitView({ padding: 0.15, duration: 300 })
}

const edgesHelp = ref(false)
</script>

<template>
  <!-- ======== list of canvases ======== -->
  <div v-if="!current" class="page wide">
    <header class="page-head">
      <div>
        <h1 class="page-title">推演</h1>
        <div class="page-sub">把你的习惯、资产、收支拖到画布上，用线连起来，算算能不能做到。只读计算，不会改动你的数据。</div>
      </div>
    </header>

    <div v-if="route.params.id" class="card card-pad gone">这张推演图不存在了。<RouterLink to="/simulate">回到列表</RouterLink></div>

    <h2 class="section-title">新建</h2>
    <div class="tpls">
      <button v-for="tp in TEMPLATES" :key="tp.key" class="card tpl" @click="fromTemplate(tp.key)">
        <component :is="tp.key === 'blank' ? Plus : Workflow" :size="20" class="tpl-ic" />
        <b>{{ tp.title }}</b>
        <span>{{ tp.hint }}</span>
      </button>
      <RouterLink to="/settings#ai" class="card tpl ai">
        <Bot :size="20" class="tpl-ic" />
        <b>让 AI 帮我连</b>
        <span>连上 AI 助手后，说一句"帮我算算年底前能不能买得起 Switch 2"，它会读你的数据搭好一张图。</span>
      </RouterLink>
    </div>

    <h2 class="section-title">我的推演图 <span class="count">{{ list.length }}</span></h2>
    <Empty v-if="!list.length" :icon="Workflow" title="还没有推演图" text="从上面的模板开始，看看你的数据能算出什么。" />
    <div v-else class="sims">
      <article v-for="{ sim: s, head } in list" :key="s.id" class="card sim-card" @click="router.push(`/simulate/${s.id}`)">
        <div class="sim-top">
          <b>{{ titleOf(s) }}</b>
          <Pin v-if="s.pinned" :size="14" class="pin" />
        </div>
        <div v-if="head" class="sim-head" :class="head.ok === true ? 'yes' : head.ok === false ? 'no' : ''">
          <strong>{{ head.text }}</strong>
          <span v-if="head.sub">{{ head.sub }}</span>
        </div>
        <div v-else class="sim-head"><span>还没有结果节点</span></div>
        <div class="sim-foot">
          <span>{{ s.nodes.length }} 个节点 · {{ s.edges.length }} 条线 · {{ friendly(s.updatedAt.slice(0, 10)) }}改过</span>
          <button class="btn ghost sm icon" title="删除" @click.stop="removeSim(s)"><Trash2 :size="14" /></button>
        </div>
      </article>
    </div>
  </div>

  <!-- ======== the canvas ======== -->
  <div v-else class="editor" :class="{ narrow }">
    <div class="bar">
      <button class="btn ghost sm icon" title="返回列表" @click="router.push('/simulate')"><ArrowLeft :size="16" /></button>
      <input v-model="title" class="title-input" placeholder="给这张图起个名字" @change="saveTitle" @keydown.enter="($event.target as HTMLInputElement).blur()" />
      <div class="bar-actions">
        <button class="btn sm" :class="{ primary: paletteOpen && narrow }" @click="paletteOpen = !paletteOpen"><Plus :size="14" /> 添加</button>
        <button class="btn sm" :title="current.pinned ? '从今日页取下' : '把结果固定到今日页'" @click="togglePin">
          <component :is="current.pinned ? PinOff : Pin" :size="14" />
          <span class="hide-narrow">{{ current.pinned ? '取消固定' : '固定到今日' }}</span>
        </button>
        <button class="btn ghost sm icon" :title="hidden ? '显示金额' : '隐藏金额'" @click="hidden = !hidden">
          <EyeOff v-if="hidden" :size="15" />
          <Eye v-else :size="15" />
        </button>
        <button class="btn ghost sm icon" title="删除这张图" @click="removeSim(current)"><Trash2 :size="15" /></button>
      </div>
    </div>

    <div class="body">
      <aside v-show="paletteOpen" class="palette">
        <div class="pal-head">
          <b>添加节点</b>
          <small>点一下放到画布中间，或者直接拖过去</small>
          <button v-if="narrow" class="btn ghost sm icon close" @click="paletteOpen = false"><X :size="15" /></button>
        </div>
        <div class="pal-sec">
          <div class="pal-title">我的数据</div>
          <label class="pal-search">
            <Search :size="14" />
            <input v-model="q" placeholder="搜你的习惯、资产、收支…" />
          </label>
          <button
            v-for="it in found"
            :key="it.id"
            class="pal-item"
            draggable="true"
            :style="{ '--c': tintOf(it) }"
            @click="addItem(it)"
            @dragstart="onDragStart($event, { kind: 'item', itemId: it.id })"
          >
            <component :is="itemIcon(it)" :size="14" />
            <span class="nm">{{ titleOf(it) }}</span>
            <small>{{ typeLabel(it) }}</small>
          </button>
          <div v-if="!found.length" class="pal-empty">没找到。先去记一些习惯、资产或收支吧。</div>
        </div>
        <div v-for="g in kindsBy" :key="g.key" class="pal-sec">
          <div class="pal-title">{{ g.label }}</div>
          <div class="pal-grid">
            <button
              v-for="[key, k] in g.kinds"
              :key="key"
              class="pal-kind"
              draggable="true"
              :title="k.hint"
              :style="{ '--c': `var(--sim-${g.key})` }"
              @click="addNode(key)"
              @dragstart="onDragStart($event, { kind: key })"
            >
              <span class="dot" />{{ k.label }}
            </button>
          </div>
        </div>
      </aside>

      <div ref="canvasEl" class="canvas" @dragover.prevent @drop="onDrop">
        <VueFlow
          :id="FLOW"
          :key="draft.id"
          :nodes="initNodes"
          :edges="initEdges"
          :apply-default="false"
          :is-valid-connection="isValid"
          :delete-key-code="['Delete', 'Backspace']"
          :min-zoom="0.2"
          :max-zoom="2"
          :snap-to-grid="true"
          :snap-grid="[8, 8]"
          @nodes-change="onNodesChange"
          @edges-change="onEdgesChange"
          @connect="onConnect"
          @node-drag-stop="onDragStop"
          fit-view-on-init
          @pane-ready="(i) => (inst = i)"
          @edge-double-click="({ edge }) => flow.removeEdges([edge.id])"
        >
          <template #node-sim="p">
            <SimNodeCard :id="p.id" :selected="p.selected" />
          </template>
          <template #edge-sim="p">
            <SimWire v-bind="p" />
          </template>
        </VueFlow>

        <div v-if="!draft.nodes.length" class="hint-empty">
          <Workflow :size="28" />
          <b>从左边拖一些东西进来</b>
          <span>比如一个想买的东西、一个省钱的习惯，再拖一个「攒钱判定」，把它们连起来。</span>
        </div>

        <div class="zoom">
          <button title="放大" @click="flow.zoomIn({ duration: 200 })"><Plus :size="15" /></button>
          <button title="缩小" @click="flow.zoomOut({ duration: 200 })"><Minus :size="15" /></button>
          <button title="适应画面" @click="fit"><Maximize :size="14" /></button>
        </div>

        <div class="legend" :class="{ open: edgesHelp }" @click="edgesHelp = !edgesHelp">
          <span><i class="num" />数字</span>
          <span><i class="date" />日期</span>
          <span><i class="bool" />是 / 否</span>
          <span class="purple">紫色 = 算出来的值</span>
          <template v-if="edgesHelp">
            <span class="tip">从右边的点拖到左边的点来连线；双击线删除；选中节点按 Delete 删除。眼睛按钮可以暂时关掉一个节点，看看"如果没有它"会怎样。</span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wide {
  max-width: 1280px;
}
.editor,
.page {
  --sim-num: var(--gold);
  --sim-date: var(--attr-mind);
  --sim-bool: var(--attr-social);
  --sim-data: var(--text-2);
  --sim-value: var(--text-3);
  --sim-math: var(--gold);
  --sim-time: var(--attr-mind);
  --sim-money: var(--attr-body);
  --sim-logic: var(--attr-social);
  --sim-result: var(--attr-career);
}
.gone {
  margin-bottom: 20px;
}
.tpls {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
  margin-bottom: 28px;
}
.tpl {
  display: grid;
  gap: 6px;
  align-content: start;
  padding: 18px;
  text-align: left;
  font: inherit;
  color: var(--text);
  cursor: pointer;
  text-decoration: none;
  transition: transform 0.15s, box-shadow 0.15s;
}
.tpl:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}
.tpl span {
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.5;
}
.tpl-ic {
  color: var(--gold);
}
.tpl.ai .tpl-ic {
  color: var(--attr-career);
}
.sims {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.sim-card {
  display: grid;
  gap: 10px;
  padding: 16px 16px 10px;
  cursor: pointer;
  transition: box-shadow 0.15s;
}
.sim-card:hover {
  box-shadow: var(--shadow-lg);
}
.sim-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sim-top b {
  flex: 1;
  font-family: var(--font-serif);
  font-size: 16px;
}
.pin {
  color: var(--gold);
}
.sim-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--sunken);
  color: var(--text-2);
  font-size: 13px;
}
.sim-head strong {
  font-family: var(--font-serif);
  font-size: 24px;
  color: var(--attr-career);
}
.sim-head.yes strong {
  color: var(--ok);
}
.sim-head.no strong {
  color: var(--danger);
}
.sim-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-3);
  font-size: 12px;
}

/* ---- editor ---- */
.editor {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 64px);
  padding: 12px 20px 0;
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 10px;
}
.title-input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 900;
  color: var(--text);
}
.title-input:hover,
.title-input:focus {
  border-color: var(--border);
  background: var(--surface);
  outline: none;
}
.bar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  border: 1px solid var(--border);
  border-radius: var(--radius) var(--radius) 0 0;
  overflow: hidden;
  background: var(--surface);
}
.palette {
  width: 248px;
  flex: none;
  overflow-y: auto;
  border-right: 1px solid var(--border);
  background: var(--surface);
  padding: 14px 12px 120px;
}
.pal-head {
  position: relative;
  display: grid;
  gap: 2px;
  margin-bottom: 12px;
}
.pal-head small {
  color: var(--text-3);
  font-size: 11px;
}
.pal-head .close {
  position: absolute;
  right: -4px;
  top: -4px;
}
.pal-sec {
  margin-bottom: 14px;
}
.pal-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--text-3);
  margin-bottom: 6px;
}
.pal-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  margin-bottom: 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--sunken);
  color: var(--text-3);
}
.pal-search input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 12px;
  color: var(--text);
  outline: none;
}
.pal-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  background: none;
  font: inherit;
  font-size: 12px;
  color: var(--text);
  text-align: left;
  cursor: grab;
}
.pal-item svg {
  color: var(--c);
  flex: none;
}
.pal-item .nm {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pal-item small {
  color: var(--text-3);
  font-size: 11px;
}
.pal-item:hover,
.pal-kind:hover {
  background: var(--hover);
}
.pal-empty {
  color: var(--text-3);
  font-size: 12px;
  padding: 4px 8px;
}
.pal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.pal-kind {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font: inherit;
  font-size: 12px;
  color: var(--text);
  cursor: grab;
  text-align: left;
}
.pal-kind .dot {
  width: 8px;
  height: 8px;
  border-radius: 3px;
  background: var(--c);
  flex: none;
}
.canvas {
  position: relative;
  flex: 1;
  min-width: 0;
  background-color: var(--bg);
  background-image: radial-gradient(circle, color-mix(in srgb, var(--text-3) 35%, transparent) 1px, transparent 1.2px);
  background-size: 22px 22px;
}
.canvas :deep(.vue-flow__node) {
  border: none;
  padding: 0;
  background: none;
}
.canvas :deep(.vue-flow__connection-path) {
  stroke: var(--gold);
  stroke-width: 2;
}
.hint-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 6px;
  padding: 24px;
  text-align: center;
  color: var(--text-3);
  pointer-events: none;
}
.hint-empty b {
  color: var(--text-2);
}
.hint-empty span {
  max-width: 320px;
  font-size: 13px;
}
.zoom {
  position: absolute;
  top: 12px;
  right: 12px;
  display: grid;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow);
  overflow: hidden;
}
.zoom button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 30px;
  border: none;
  background: none;
  color: var(--text-2);
  cursor: pointer;
}
.zoom button:hover {
  background: var(--hover);
}
.legend {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  max-width: 360px;
  padding: 6px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface) 90%, transparent);
  border: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-2);
  cursor: pointer;
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.legend i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--sim-num);
}
.legend i.date {
  background: var(--sim-date);
  border-radius: 2px;
  transform: rotate(45deg);
}
.legend i.bool {
  background: var(--sim-bool);
  border-radius: 2px;
}
.legend .purple {
  color: var(--attr-career);
  font-weight: 700;
}
.legend .tip {
  flex-basis: 100%;
  line-height: 1.6;
  color: var(--text-2);
}

@media (max-width: 760px) {
  .editor {
    height: calc(100dvh - 52px - 64px - env(safe-area-inset-bottom));
    padding: 8px 8px 0;
  }
  .hide-narrow {
    display: none;
  }
  .palette {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 5;
    width: min(300px, 86%);
    padding-bottom: 24px;
    box-shadow: var(--shadow-lg);
  }
  .legend {
    max-width: calc(100% - 70px);
  }
  .legend .purple {
    display: none;
  }
  .title-input {
    font-size: 16px;
  }
}
</style>
