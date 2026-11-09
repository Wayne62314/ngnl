<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { ArrowRightToLine, Crown, Network, Plus } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { goalProgress } from '@/lib/game'
import type { Goal } from '@/lib/types'
import Empty from '@/components/Empty.vue'

const data = useData()
const ui = useUi()

// Ultimate goals live on the right edge; start scrolled there so they're visible first.
const wrap = ref<HTMLElement>()
onMounted(() => nextTick(() => wrap.value && (wrap.value.scrollLeft = wrap.value.scrollWidth)))

const W = 210
const H = 74
const COL = W + 64
const ROW = H + 16
const TREE_GAP = 40

interface Node {
  g: Goal
  depth: number
  x: number
  y: number
  parent?: Node
  progress: { done: number; total: number }
}

/**
 * Lays each tree out right-to-left: the ultimate goal sits on the right and
 * the steps that lead to it fan out to the left, like a path toward the goal.
 */
const layout = computed(() => {
  const goals = data.goals
  const ids = new Set(goals.map((g) => g.id))
  const kids = new Map<string, Goal[]>()
  for (const g of goals) if (g.parentId && ids.has(g.parentId)) (kids.get(g.parentId) ?? kids.set(g.parentId, []).get(g.parentId)!).push(g)
  for (const list of kids.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt))
  const roots = goals.filter((g) => !g.parentId || !ids.has(g.parentId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const nodes: Node[] = []
  let cursor = 0
  let maxDepth = 0
  const seen = new Set<string>()

  function place(g: Goal, depth: number, parent?: Node): Node {
    seen.add(g.id)
    const n: Node = { g, depth, x: 0, y: 0, parent, progress: goalProgress(g, goals, data.tasks) }
    nodes.push(n)
    maxDepth = Math.max(maxDepth, depth)
    const children = (kids.get(g.id) ?? []).filter((c) => !seen.has(c.id))
    if (!children.length || depth > 30) {
      n.y = cursor
      cursor += ROW
    } else {
      const placed = children.map((c) => place(c, depth + 1, n))
      n.y = (placed[0].y + placed[placed.length - 1].y) / 2
    }
    return n
  }
  for (const r of roots) {
    place(r, 0)
    cursor += TREE_GAP
  }
  for (const n of nodes) n.x = (maxDepth - n.depth) * COL
  return { nodes, width: (maxDepth + 1) * COL - (COL - W), height: Math.max(0, cursor - TREE_GAP - (ROW - H)), roots: roots.length }
})

const edge = (n: Node) => {
  const p = n.parent!
  const x1 = n.x + W
  const y1 = n.y + H / 2
  const x2 = p.x
  const y2 = p.y + H / 2
  const mx = (x1 + x2) / 2
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
}

const STATUS = {
  unknown: '还不清楚',
  todo: '未开始',
  doing: '进行中',
  done: '已达成',
} as const

async function newRoot() {
  const g = await data.create('goal', { status: 'todo' })
  if (g) ui.open(g.id)
}
async function addStep(n: Node) {
  const g = await data.create('goal', { parentId: n.g.id, status: 'unknown' })
  if (g) ui.open(g.id)
}
async function insertAbove(n: Node) {
  const g = await data.create('goal', { status: 'todo', ...(n.g.parentId ? { parentId: n.g.parentId } : {}) })
  if (!g) return
  await data.update<Goal>(n.g.id, { parentId: g.id })
  ui.open(g.id)
}
</script>

<template>
  <div class="page wide">
    <header class="page-head">
      <div>
        <h1 class="page-title">愿景树</h1>
        <div class="page-sub">终极目标在最右边，往左是通往它的路。还不知道的步骤，就先留一个「？」。</div>
      </div>
      <button class="btn primary" @click="newRoot"><Crown />新的终极目标</button>
    </header>

    <div v-if="layout.nodes.length" ref="wrap" class="card canvas-wrap">
      <div class="canvas" :style="{ width: `${layout.width}px`, height: `${layout.height}px` }">
        <svg class="edges" :width="layout.width" :height="layout.height">
          <path
            v-for="n in layout.nodes.filter((x) => x.parent)"
            :key="n.g.id"
            :d="edge(n)"
            :class="{ lit: n.g.status === 'done' }"
          />
        </svg>
        <div
          v-for="n in layout.nodes"
          :key="n.g.id"
          class="node"
          :class="[n.g.status, { root: n.depth === 0 }]"
          :style="{ left: `${n.x}px`, top: `${n.y}px`, width: `${W}px`, height: `${H}px` }"
          @click="ui.open(n.g.id)"
        >
          <div class="nt">
            <Crown v-if="n.depth === 0" :size="14" class="crown" />
            <span class="ellipsis">{{ n.g.title || (n.g.status === 'unknown' ? '？' : '未命名') }}</span>
          </div>
          <div class="ns">
            <span>{{ STATUS[n.g.status] }}</span>
            <span v-if="n.progress.total" class="num">{{ n.progress.done }}/{{ n.progress.total }}</span>
          </div>
          <div v-if="n.progress.total" class="np"><div :style="{ width: `${(n.progress.done / n.progress.total) * 100}%` }" /></div>

          <button class="add left" title="添加通往它的一步" @click.stop="addStep(n)"><Plus :size="14" /></button>
          <button class="add right" title="在它之后插入一个更大的目标" @click.stop="insertAbove(n)"><ArrowRightToLine :size="13" /></button>
        </div>
      </div>
    </div>
    <div v-else class="card">
      <Empty :icon="Network" title="立下第一个终极目标" text="它可以很远很大，比如「成为独立游戏开发者」「环游世界」。然后往回想：要达成它，前一步需要什么？不知道就先写个「？」。">
        <button class="btn primary" @click="newRoot"><Crown />写下终极目标</button>
      </Empty>
    </div>

    <p v-if="layout.nodes.length" class="faint tip">
      悬停节点：左侧 <b>＋</b> 添加通往它的一步，右侧 <b>→|</b> 在它之后插入更大的目标。任务可以在详情里挂到任意节点上，进度会自动汇总。
    </p>
  </div>
</template>

<style scoped>
.wide {
  max-width: none;
}
.canvas-wrap {
  overflow: auto;
  padding: 32px 40px;
  background:
    radial-gradient(circle, var(--border) 1px, transparent 1px) 0 0 / 22px 22px,
    var(--surface);
}
.canvas {
  position: relative;
  margin: 0 auto;
}
.edges {
  position: absolute;
  inset: 0;
  overflow: visible;
}
.edges path {
  fill: none;
  stroke: var(--border-strong);
  stroke-width: 2;
}
.edges path.lit {
  stroke: var(--gold);
}
.node {
  position: absolute;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface);
  border: 1.5px solid var(--border-strong);
  box-shadow: var(--shadow);
  cursor: pointer;
  display: grid;
  align-content: center;
  gap: 2px;
  transition: border-color 0.15s, transform 0.15s;
}
.node:hover {
  border-color: var(--text-3);
  transform: translateY(-1px);
}
.node.root {
  border-width: 2px;
  border-color: var(--gold);
  background: linear-gradient(135deg, var(--gold-soft), var(--surface));
}
.node.unknown {
  border-style: dashed;
  background: var(--surface-2);
  box-shadow: none;
}
.node.unknown .nt {
  color: var(--text-2);
}
.node.doing {
  border-color: var(--attr-mind);
}
.node.done {
  border-color: var(--gold);
  background: var(--gold-soft);
}
.nt {
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
}
.crown {
  color: var(--gold);
  flex: none;
}
.ns {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-3);
}
.np {
  height: 3px;
  border-radius: 2px;
  background: var(--sunken);
  overflow: hidden;
}
.np div {
  height: 100%;
  background: var(--gold);
}
.add {
  position: absolute;
  top: 50%;
  width: 24px;
  height: 24px;
  margin-top: -12px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text-2);
  display: grid;
  place-items: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  padding: 0;
}
.add:hover {
  background: var(--ink);
  color: var(--on-ink);
  border-color: var(--ink);
}
.add.left {
  left: -13px;
}
.add.right {
  right: -13px;
}
.node:hover .add {
  opacity: 1;
}
.tip {
  margin-top: 14px;
  font-size: 13px;
}
@media (hover: none) {
  .add {
    opacity: 1;
  }
}
</style>
