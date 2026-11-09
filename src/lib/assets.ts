import type { Asset, AssetCategory, LedgerEntry } from './types'

export const CATEGORIES: { key: AssetCategory; label: string; color: string; priced: boolean }[] = [
  { key: 'finance', label: '金融', color: 'var(--attr-body)', priced: true },
  { key: 'item', label: '物品', color: 'var(--gold)', priced: true },
  { key: 'cred', label: '资历', color: 'var(--attr-mind)', priced: false },
  { key: 'fame', label: '名望', color: 'var(--attr-craft)', priced: false },
  { key: 'debt', label: '负债', color: 'var(--danger)', priced: true },
]
export const catOf = (k: AssetCategory) => CATEGORIES.find((c) => c.key === k) ?? CATEGORIES[1]
export const STATUS_LABEL = { owned: '拥有', wanted: '想要', lost: '已失去', sold: '已卖出' } as const

/** Net worth = what you own (with a value) − what you owe. */
export function netWorth(assets: Asset[]) {
  let own = 0
  let debt = 0
  for (const a of assets) {
    if (a.status !== 'owned' || !a.value) continue
    if (a.category === 'debt') debt += a.value
    else own += a.value
  }
  return { own, debt, net: own - debt }
}

const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate()

/** How much one ledger entry contributes in a month ("YYYY-MM"), expanding repeats. */
export function amountInMonth(e: LedgerEntry, ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  const first = `${ym}-01`
  const last = `${ym}-${String(daysIn(y, m)).padStart(2, '0')}`
  if (e.date > last || (e.until && e.until < first)) return 0
  switch (e.repeat) {
    case 'none':
      return e.date >= first ? e.amount : 0
    case 'month':
      return e.amount
    case 'year':
      return Number(e.date.slice(5, 7)) === m ? e.amount : 0
    case 'week': {
      // Count the weekly occurrences that fall inside the month (and inside the entry's own dates).
      let n = 0
      const d = new Date(e.date + 'T00:00:00')
      const end = new Date(last + 'T00:00:00')
      const start = new Date(first + 'T00:00:00')
      const stop = e.until ? new Date(e.until + 'T00:00:00') : end
      while (d <= end && d <= stop) {
        if (d >= start) n++
        d.setDate(d.getDate() + 7)
      }
      return n * e.amount
    }
  }
}

export function monthFlow(ledger: LedgerEntry[], ym: string) {
  let income = 0
  let expense = 0
  for (const e of ledger) {
    const v = amountInMonth(e, ym)
    if (e.flow === 'income') income += v
    else expense += v
  }
  return { ym, income, expense, net: income - expense, rate: income > 0 ? (income - expense) / income : null }
}

/** The last `n` months up to and including `ym`. */
export function lastMonths(ym: string, n: number): string[] {
  const [y, m] = ym.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - (n - 1 - i), 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

/** "¥12,345" or hidden dots in privacy mode. */
export function yuan(n: number | undefined, hidden = false): string {
  if (n === undefined) return '—'
  if (hidden) return '¥ ••••'
  const abs = Math.abs(n)
  const s = abs >= 1e8 ? `${(abs / 1e8).toFixed(2)} 亿` : abs >= 1e5 ? `${(abs / 1e4).toFixed(1)} 万` : abs.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
  return (n < 0 ? '−¥' : '¥') + s
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
/**
 * Squarified treemap: lays out values (largest first) in a w×h box so each
 * rectangle's area is proportional to its value and as close to square as possible.
 */
export function treemap<T extends { value: number }>(items: T[], box: Rect): (T & { rect: Rect })[] {
  const list = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value)
  const total = list.reduce((s, i) => s + i.value, 0)
  if (!total) return []
  const scale = (box.w * box.h) / total
  const out: (T & { rect: Rect })[] = []
  let rest = { ...box }
  let row: T[] = []
  const worst = (r: T[], side: number) => {
    const areas = r.map((i) => i.value * scale)
    const sum = areas.reduce((a, b) => a + b, 0)
    return Math.max(...areas.map((a) => Math.max((side * side * a) / (sum * sum), (sum * sum) / (side * side * a))))
  }
  const layoutRow = (r: T[]) => {
    const sum = r.reduce((s, i) => s + i.value * scale, 0)
    const horizontal = rest.w >= rest.h
    const side = horizontal ? rest.h : rest.w
    const thick = sum / side
    let off = 0
    for (const i of r) {
      const len = (i.value * scale) / thick
      out.push({ ...i, rect: horizontal ? { x: rest.x, y: rest.y + off, w: thick, h: len } : { x: rest.x + off, y: rest.y, w: len, h: thick } })
      off += len
    }
    rest = horizontal ? { x: rest.x + thick, y: rest.y, w: rest.w - thick, h: rest.h } : { x: rest.x, y: rest.y + thick, w: rest.w, h: rest.h - thick }
  }
  for (const i of list) {
    const side = Math.min(rest.w, rest.h)
    if (!row.length || worst([...row, i], side) <= worst(row, side)) row.push(i)
    else {
      layoutRow(row)
      row = [i]
    }
  }
  if (row.length) layoutRow(row)
  return out
}
