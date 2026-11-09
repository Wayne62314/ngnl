/**
 * 星图: every item as a star, every connection as a line — the links you made
 * plus the structure the app already knows (a task's goal, sub-goals,
 * prerequisites, what a wish or a stretch of life is for).
 */
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force'
import type { Item, ItemType } from './types'

export type EdgeKind = 'link' | 'goal' | 'parent' | 'prereq'
export const EDGE_LABEL: Record<EdgeKind, string> = { link: '关联', goal: '为了目标', parent: '子目标', prereq: '前置' }

/** Types that appear as stars (field definitions and canvases are tools, not parts of a life). */
export const GRAPH_TYPES: ItemType[] = ['person', 'goal', 'task', 'habit', 'event', 'note', 'asset', 'segment', 'ledger']

export interface GNode extends SimulationNodeDatum {
  id: string
  item: Item
  degree: number
  r: number
  x: number
  y: number
}
export interface GEdge {
  a: string
  b: string
  kind: EdgeKind
}

/** All connections between the given items, one per pair (an explicit link wins). */
export function edgesOf(items: Item[], links: [string, string][]): GEdge[] {
  const ids = new Set(items.map((i) => i.id))
  const out = new Map<string, GEdge>()
  const add = (a: string | undefined, b: string | undefined, kind: EdgeKind) => {
    if (!a || !b || a === b || !ids.has(a) || !ids.has(b)) return
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    if (!out.has(key) || kind === 'link') out.set(key, { a, b, kind })
  }
  for (const it of items) {
    if (it.type === 'task') {
      add(it.id, it.goalId, 'goal')
      for (const p of it.prereqIds ?? []) add(p, it.id, 'prereq')
    }
    if (it.type === 'goal') add(it.id, it.parentId, 'parent')
    if (it.type === 'asset' || it.type === 'segment') add(it.id, it.goalId, 'goal')
  }
  for (const [a, b] of links) add(a, b, 'link')
  return [...out.values()]
}

export interface Graph {
  nodes: GNode[]
  edges: GEdge[]
  /** Item id → ids it touches. */
  adj: Map<string, Set<string>>
}

export function buildGraph(items: Item[], links: [string, string][], opts: { types: Set<ItemType>; isolated: boolean; closedTasks?: boolean }): Graph {
  const pool = items.filter(
    (i) => opts.types.has(i.type) && (opts.closedTasks || i.type !== 'task' || (i.status !== 'done' && i.status !== 'dropped')),
  )
  let edges = edgesOf(pool, links)
  const adj = new Map<string, Set<string>>()
  const touch = (a: string, b: string) => (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b)
  for (const e of edges) {
    touch(e.a, e.b)
    touch(e.b, e.a)
  }
  const kept = opts.isolated ? pool : pool.filter((i) => adj.has(i.id))
  const keptIds = new Set(kept.map((i) => i.id))
  edges = edges.filter((e) => keptIds.has(e.a) && keptIds.has(e.b))
  const nodes: GNode[] = kept.map((item) => {
    const degree = adj.get(item.id)?.size ?? 0
    return { id: item.id, item, degree, r: 4 + Math.sqrt(degree) * 2.6, x: 0, y: 0 }
  })
  return { nodes, edges, adj }
}

/**
 * Force layout, run to rest up front (no animation), then scaled into a
 * w×h box. Deterministic: the same data always gives the same picture.
 */
export function layout(g: Graph, w: number, h: number, pad = 40): void {
  if (!g.nodes.length) return
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const links = g.edges.map((e) => ({ source: byId.get(e.a)!, target: byId.get(e.b)! }))
  forceSimulation(g.nodes)
    .force('link', forceLink(links).distance(46).strength(0.6))
    .force('charge', forceManyBody().strength(-70).distanceMax(400))
    .force('collide', forceCollide<GNode>((n) => n.r + 5))
    .force('x', forceX().strength(0.05))
    .force('y', forceY().strength(0.05 * (w / h)))
    .stop()
    .tick(320)
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const n of g.nodes) {
    x0 = Math.min(x0, n.x - n.r)
    x1 = Math.max(x1, n.x + n.r)
    y0 = Math.min(y0, n.y - n.r)
    y1 = Math.max(y1, n.y + n.r)
  }
  const s = Math.min((w - 2 * pad) / Math.max(1, x1 - x0), (h - 2 * pad) / Math.max(1, y1 - y0), 2.2)
  const ox = (w - (x1 - x0) * s) / 2
  const oy = (h - (y1 - y0) * s) / 2
  for (const n of g.nodes) {
    n.x = ox + (n.x - x0) * s
    n.y = oy + (n.y - y0) * s
  }
}

/** The best-connected items: the hubs of a life. */
export const hubs = (g: Graph, n = 6) => [...g.nodes].sort((a, b) => b.degree - a.degree).filter((x) => x.degree > 0).slice(0, n)
