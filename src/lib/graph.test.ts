import { describe, expect, it } from 'vitest'
import { buildGraph, edgesOf, hubs, layout } from './graph'
import type { Item, ItemType } from './types'

const base = { createdAt: '', updatedAt: '', title: 'x' }
const items: Item[] = [
  { ...base, id: 'g1', type: 'goal', status: 'todo' },
  { ...base, id: 'g2', type: 'goal', status: 'todo', parentId: 'g1' },
  { ...base, id: 't1', type: 'task', status: 'todo', attr: 'mind', difficulty: 1, goalId: 'g2' },
  { ...base, id: 't2', type: 'task', status: 'todo', attr: 'mind', difficulty: 1, prereqIds: ['t1'] },
  { ...base, id: 'p1', type: 'person', closeness: 3 },
  { ...base, id: 'a1', type: 'asset', category: 'item', status: 'wanted', goalId: 'g1' },
  { ...base, id: 'n1', type: 'note', kind: 'idea' },
  { ...base, id: 'f1', type: 'field', kind: 'number' },
]
const links: [string, string][] = [
  ['p1', 't1'],
  ['t1', 'g2'], // duplicates the task's goal: the explicit link wins
  ['f1', 'p1'], // fields aren't stars
]
const all = new Set<ItemType>(['goal', 'task', 'person', 'asset', 'note'])

describe('graph', () => {
  it('collects links and structure, one edge per pair', () => {
    const e = edgesOf(items.filter((i) => i.type !== 'field'), links)
    const kinds = Object.fromEntries(e.map((x) => [[x.a, x.b].sort().join('-'), x.kind]))
    expect(kinds).toEqual({ 'g1-g2': 'parent', 'g2-t1': 'link', 't1-t2': 'prereq', 'p1-t1': 'link', 'a1-g1': 'goal' })
  })

  it('drops loners unless asked, and filters by type', () => {
    expect(buildGraph(items, links, { types: all, isolated: false }).nodes.map((n) => n.id).sort()).toEqual(['a1', 'g1', 'g2', 'p1', 't1', 't2'])
    expect(buildGraph(items, links, { types: all, isolated: true }).nodes).toHaveLength(7)
    // Finished tasks only when asked.
    const done = items.map((i) => (i.id === 't2' ? { ...i, status: 'done' } : i)) as Item[]
    expect(buildGraph(done, links, { types: all, isolated: true }).nodes.map((n) => n.id)).not.toContain('t2')
    expect(buildGraph(done, links, { types: all, isolated: true, closedTasks: true }).nodes.map((n) => n.id)).toContain('t2')
    const noTasks = buildGraph(items, links, { types: new Set<ItemType>(['goal', 'person', 'asset']), isolated: false })
    expect(noTasks.nodes.map((n) => n.id).sort()).toEqual(['a1', 'g1', 'g2'])
  })

  it('lays out inside the box, deterministically, with hubs first', () => {
    const g = buildGraph(items, links, { types: all, isolated: true })
    layout(g, 1000, 700)
    for (const n of g.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.x).toBeLessThanOrEqual(1000)
      expect(n.y).toBeGreaterThanOrEqual(0)
      expect(n.y).toBeLessThanOrEqual(700)
    }
    const again = buildGraph(items, links, { types: all, isolated: true })
    layout(again, 1000, 700)
    expect(again.nodes.map((n) => Math.round(n.x))).toEqual(g.nodes.map((n) => Math.round(n.x)))
    expect(hubs(g)[0].id).toBe('t1')
  })
})
