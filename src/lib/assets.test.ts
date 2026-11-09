import { describe, expect, it } from 'vitest'
import { amountInMonth, lastMonths, monthFlow, netWorth, treemap, yuan } from './assets'
import type { Asset, LedgerEntry } from './types'

const asset = (x: Partial<Asset>): Asset => ({ id: Math.random().toString(36), type: 'asset', title: 'a', category: 'item', status: 'owned', createdAt: '', updatedAt: '', ...x })
const led = (x: Partial<LedgerEntry>): LedgerEntry => ({ id: 'l', type: 'ledger', title: 'l', flow: 'expense', amount: 100, repeat: 'none', date: '2026-11-05', createdAt: '', updatedAt: '', ...x })

describe('assets', () => {
  it('nets what you own against what you owe, ignoring wanted and sold', () => {
    const n = netWorth([
      asset({ category: 'finance', value: 60000 }),
      asset({ value: 15000 }),
      asset({ category: 'debt', value: 5000 }),
      asset({ status: 'wanted', value: 2600 }),
      asset({ status: 'sold', value: 999 }),
      asset({ category: 'cred' }),
    ])
    expect(n).toEqual({ own: 75000, debt: 5000, net: 70000 })
  })

  it('expands repeating ledger entries into a month', () => {
    expect(amountInMonth(led({ repeat: 'month', date: '2026-01-10', amount: 3000 }), '2026-11')).toBe(3000)
    expect(amountInMonth(led({ repeat: 'month', date: '2026-01-10', until: '2026-10-31' }), '2026-11')).toBe(0)
    expect(amountInMonth(led({ repeat: 'month', date: '2026-12-01' }), '2026-11')).toBe(0)
    expect(amountInMonth(led({ repeat: 'none', date: '2026-11-05' }), '2026-11')).toBe(100)
    expect(amountInMonth(led({ repeat: 'none', date: '2026-10-05' }), '2026-11')).toBe(0)
    expect(amountInMonth(led({ repeat: 'year', date: '2024-11-20', amount: 1200 }), '2026-11')).toBe(1200)
    expect(amountInMonth(led({ repeat: 'year', date: '2024-11-20', amount: 1200 }), '2026-12')).toBe(0)
    // Mondays in November 2026: 2, 9, 16, 23, 30.
    expect(amountInMonth(led({ repeat: 'week', date: '2026-10-05', amount: 50 }), '2026-11')).toBe(250)
  })

  it('sums a month and its savings rate', () => {
    const f = monthFlow([led({ flow: 'income', repeat: 'month', amount: 20000, date: '2026-01-01' }), led({ repeat: 'month', amount: 6000, date: '2026-01-01' }), led({ amount: 2000 })], '2026-11')
    expect(f).toMatchObject({ income: 20000, expense: 8000, net: 12000 })
    expect(f.rate).toBeCloseTo(0.6)
    expect(lastMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
  })

  it('lays out a treemap that fills the box in proportion', () => {
    const r = treemap([{ value: 60 }, { value: 30 }, { value: 10 }], { x: 0, y: 0, w: 100, h: 50 })
    const area = r.reduce((s, x) => s + x.rect.w * x.rect.h, 0)
    expect(area).toBeCloseTo(5000)
    expect(r[0].rect.w * r[0].rect.h).toBeCloseTo(3000)
    for (const x of r) expect(x.rect.x + x.rect.w).toBeLessThanOrEqual(100.0001)
  })

  it('formats money, hiding it in privacy mode', () => {
    expect(yuan(15000)).toBe('¥15,000')
    expect(yuan(135000)).toBe('¥13.5 万')
    expect(yuan(-5000)).toBe('−¥5,000')
    expect(yuan(9, true)).toBe('¥ ••••')
  })
})
