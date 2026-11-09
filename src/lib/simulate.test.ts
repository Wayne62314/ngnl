import { describe, expect, it } from 'vitest'
import { evaluate, formatSim, habitStats, headline, makesLoop, nextBirthday, perMonth, type Ctx } from './simulate'
import type { Asset, FieldDef, Habit, Item, LedgerEntry, Sim, SimEdge, SimNode } from './types'

const TODAY = '2026-11-09'
const base = { createdAt: '', updatedAt: '' }
const habit: Habit = { ...base, id: 'h', type: 'habit', title: '不点外卖', attr: 'body', days: [0, 1, 2, 3, 4, 5, 6], fields: { save: 25 } }
const wish: Asset = { ...base, id: 's2', type: 'asset', title: 'Switch 2', category: 'item', status: 'wanted', value: 2600, saved: 1200 }
const stall: LedgerEntry = { ...base, id: 'st', type: 'ledger', title: '摆摊', flow: 'income', amount: 150, repeat: 'week', date: '2026-01-03' }
const saveDef: FieldDef = { ...base, id: 'save', type: 'field', title: '每次省下', kind: 'money' }
const items: Item[] = [habit, wish, stall, saveDef]
// Checked in every day from 2026-10-25 to 2026-11-09: 16 of the last 30 days.
const done = new Set(Array.from({ length: 16 }, (_, i) => {
  const dt = new Date(2026, 10, 9 - i)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}))
const ctx: Ctx = { byId: new Map(items.map((i) => [i.id, i])), defs: [saveDef], done: () => done, today: TODAY }

const node = (id: string, kind: string, data: Record<string, unknown> = {}, off = false): SimNode => ({ id, kind, x: 0, y: 0, data, off })
const edge = (from: string, fromPort: string, to: string, toPort: string): SimEdge => ({ id: `${from}.${fromPort}-${to}.${toPort}`, from, fromPort, to, toPort })

describe('simulate', () => {
  it('reads habit stats over the last 30 days', () => {
    const s = habitStats(habit, done, TODAY)
    expect(done.size).toBe(16)
    expect(s.rate).toBeCloseTo(16 / 30)
    expect(s.perWeek).toBeCloseTo((16 / 30) * 7)
    expect(s.streak).toBe(16)
  })

  it('finds the next birthday, rolling into next year and handling Feb 29', () => {
    expect(nextBirthday('12-01', TODAY)).toBe('2026-12-01')
    expect(nextBirthday('1995-03-08', TODAY)).toBe('2027-03-08')
    expect(nextBirthday('11-09', TODAY)).toBe('2026-11-09')
    expect(nextBirthday('02-29', '2026-11-09')).toBe('2027-02-28')
  })

  it('averages recurring money per month', () => {
    expect(perMonth({ ...stall, repeat: 'week', amount: 70 })).toBeCloseTo((70 * 365) / 12 / 7)
    expect(perMonth({ ...stall, repeat: 'year', amount: 1200 })).toBe(100)
    expect(perMonth({ ...stall, repeat: 'none' })).toBe(0)
  })

  // The Switch 2 template: (每次省下 × 每天几次) + 摆摊折合每天 → 攒钱判定.
  const sim: Pick<Sim, 'nodes' | 'edges'> = {
    nodes: [
      node('habit', 'item', { itemId: 'h' }),
      node('wish', 'item', { itemId: 's2' }),
      node('stall', 'item', { itemId: 'st' }),
      node('mul', 'mul'),
      node('sum', 'sum'),
      node('deadline', 'date', { value: '2026-12-01' }),
      node('save', 'save'),
    ],
    edges: [
      edge('habit', 'f:save', 'mul', 'a'),
      edge('habit', 'perDay', 'mul', 'b'),
      edge('mul', 'out', 'sum', 'a'),
      edge('stall', 'day', 'sum', 'b'),
      edge('wish', 'value', 'save', 'target'),
      edge('wish', 'saved', 'save', 'have'),
      edge('sum', 'out', 'save', 'perDay'),
      edge('deadline', 'out', 'save', 'deadline'),
    ],
  }

  it('evaluates a chain and reports whether the goal is reachable', () => {
    const ev = evaluate(sim, ctx)
    const perDay = 25 * (16 / 30) + 150 / 7
    expect(ev.nodes.get('sum')!.outputs.out).toBeCloseTo(perDay)
    const out = ev.nodes.get('save')!.outputs
    expect(out.days).toBe(Math.ceil(1400 / perDay))
    expect(out.ok).toBe(false) // 22 days to the deadline isn't enough
    expect(out.gap as number).toBeCloseTo(1400 - perDay * 22)
    expect(ev.edges.get('mul.out-sum.a')).toBeCloseTo(25 * (16 / 30))
    // ¥ × 次 = ¥, and the sum of ¥ is ¥.
    expect(ev.units.get('mul')).toBe('元')
    expect(ev.units.get('sum')).toBe('元')
  })

  it('drops switched-off what-if nodes out of sums', () => {
    const off = { ...sim, nodes: sim.nodes.map((x) => (x.id === 'stall' ? { ...x, off: true } : x)) }
    const ev = evaluate(off, ctx)
    expect(ev.nodes.get('sum')!.outputs.out).toBeCloseTo(25 * (16 / 30))
    expect(ev.nodes.get('stall')!.note).toContain('关闭')
  })

  it('says yes when the deadline is far enough, and shows it as a headline', () => {
    const later = { ...sim, nodes: sim.nodes.map((x) => (x.id === 'deadline' ? { ...x, data: { value: '2027-06-01' } } : x)) }
    const ev = evaluate(later, ctx)
    expect(ev.nodes.get('save')!.outputs.ok).toBe(true)
    const h = headline({ ...later, ...base, id: 'x', type: 'sim', title: '' }, ev)
    expect(h?.text).toBe('能')
    expect(h?.sub).toContain('预计')
  })

  it('handles missing items, division by zero and loops', () => {
    const ev = evaluate(
      {
        nodes: [node('gone', 'item', { itemId: 'nope' }), node('z', 'num', { value: 0 }), node('one', 'num', { value: 1 }), node('div', 'div'), node('x', 'add'), node('y', 'add')],
        edges: [edge('one', 'out', 'div', 'a'), edge('z', 'out', 'div', 'b'), edge('x', 'out', 'y', 'a'), edge('y', 'out', 'x', 'a')],
      },
      ctx,
    )
    expect(ev.nodes.get('gone')!.note).toContain('删除')
    expect(ev.nodes.get('div')!.outputs.out).toBeNull()
    expect([...ev.cycle].sort()).toEqual(['x', 'y'])
    expect(makesLoop([edge('a', 'out', 'b', 'a')], 'b', 'a')).toBe(true)
    expect(makesLoop([edge('a', 'out', 'b', 'a')], 'a', 'c')).toBe(false)
  })

  it('formats values for wires', () => {
    expect(formatSim(0.533, { type: 'num', unit: '%' })).toBe('53.3%')
    expect(formatSim(2600, { type: 'num', unit: '元' })).toBe('¥2,600')
    expect(formatSim(13.333, { type: 'num', unit: '元' })).toBe('¥13.33')
    expect(formatSim('2026-12-01')).toBe('2026.12.1')
    expect(formatSim(true)).toBe('是')
    expect(formatSim(null)).toBe('—')
  })
})
