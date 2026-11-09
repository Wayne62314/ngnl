import { describe, expect, it } from 'vitest'
import { mentions, pairKey, suggestLinks, suggestionsFor } from './suggest'
import type { Item } from './types'

const base = { createdAt: '', updatedAt: '' }
const person = (id: string, title: string, extra = {}): Item => ({ ...base, id, type: 'person', title, closeness: 3, ...extra })
const items: Item[] = [
  person('lx', '林夏'),
  person('mom', '妈妈'),
  person('m', '妈'), // one character: never matched
  person('ann', 'Ann'),
  person('cm', '陈默', { contactNotes: { '2026-10-01': '他说林夏想换工作' } }),
  { ...base, id: 'trip', type: 'event', title: '和林夏去厦门旅行', date: '2026-05-01', kind: 'event', notes: '妈妈也想去' },
  { ...base, id: 'task', type: 'task', title: '给妈妈打电话', status: 'todo', attr: 'social', difficulty: 1 },
  { ...base, id: 'n', type: 'note', kind: 'idea', title: 'Annual review', notes: 'ask Ann about it' },
  { ...base, id: 'g', type: 'goal', status: 'todo', title: '学会 Godot', notes: '' },
  { ...base, id: 't2', type: 'task', title: '学会 Godot 的信号', status: 'todo', attr: 'mind', difficulty: 1, goalId: 'g' },
]

describe('link suggestions', () => {
  it('prefers longer names and never overlaps', () => {
    const names = [
      { name: '妈妈', item: items[1] },
      { name: '妈', item: items[2] },
    ]
    expect(mentions('妈妈说', names).map((m) => m.name)).toEqual(['妈妈'])
  })

  it('finds mentions across titles, notes and contact notes', () => {
    const s = suggestLinks(items, [])
    const pairs = s.map((x) => `${x.from.id}>${x.to.id}`).sort()
    expect(pairs).toEqual(['cm>lx', 'n>ann', 'task>mom', 'trip>lx', 'trip>mom'].sort())
    const cm = s.find((x) => x.from.id === 'cm')!
    expect(cm.where).toBe('2026-10-01 的往来')
    expect(`${cm.before}[${cm.match}]${cm.after}`).toBe('他说[林夏]想换工作')
  })

  it('skips pairs already connected, structure included, and dismissed ones', () => {
    const s = suggestLinks(items, [['trip', 'lx']], [pairKey('mom', 'task')])
    expect(s.some((x) => x.from.id === 'trip' && x.to.id === 'lx')).toBe(false)
    expect(s.some((x) => x.to.id === 'mom' && x.from.id === 'task')).toBe(false)
    // t2 names its own goal, but it's already under that goal.
    expect(s.some((x) => x.from.id === 't2')).toBe(false)
    expect(suggestionsFor(s, 'mom').map((x) => x.from.id)).toEqual(['trip'])
  })

  it('treats same-named items as ambiguous', () => {
    const twins = [...items, person('lx2', '林夏')]
    expect(suggestLinks(twins, []).some((x) => x.match === '林夏')).toBe(false)
  })
})
