import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Repo } from './repo'
import { fingerprint, mergeSnapshots, stable } from './merge'
import type { Snapshot } from './types'

let clock = Date.parse('2026-11-09T08:00:00Z')
const tick = () => vi.setSystemTime((clock += 1000))
beforeEach(() => {
  vi.useFakeTimers()
  tick()
})
afterEach(() => vi.useRealTimers())

const copy = (s: Snapshot) => structuredClone(s)
/** Two devices that start from the same synced data. */
function devices() {
  const a = new Repo()
  tick()
  const t1 = a.createItem('task', { title: 'A', status: 'todo' })
  tick()
  const t2 = a.createItem('task', { title: 'B', status: 'todo' })
  const h = a.createItem('habit', { title: 'H', days: [0, 1, 2, 3, 4, 5, 6] })
  const p = a.createItem('person', { title: 'P', closeness: 3 })
  tick()
  const b = new Repo(copy(a.s))
  return { a, b, t1, t2, h, p }
}
const title = (s: Snapshot, id: string) => s.items.find((i) => i.id === id)?.title

describe('merge', () => {
  it('keeps both sides when they edited different items offline', () => {
    const { a, b, t1, t2 } = devices()
    tick()
    a.updateItem(t1.id, { title: 'A改' })
    tick()
    b.updateItem(t2.id, { title: 'B改' })
    const m = mergeSnapshots(a.s, b.s)
    expect(title(m, t1.id)).toBe('A改')
    expect(title(m, t2.id)).toBe('B改')
  })

  it('takes the later edit of the same item', () => {
    const { a, b, t1 } = devices()
    tick()
    a.updateItem(t1.id, { title: '先改' })
    tick()
    b.updateItem(t1.id, { title: '后改' })
    expect(title(mergeSnapshots(a.s, b.s), t1.id)).toBe('后改')
    expect(title(mergeSnapshots(b.s, a.s), t1.id)).toBe('后改')
  })

  it('deletes unless the item was edited after the deletion', () => {
    const { a, b, t1, t2 } = devices()
    tick()
    b.updateItem(t1.id, { title: '删之前改的' })
    tick()
    a.deleteItem(t1.id)
    a.deleteItem(t2.id)
    tick()
    b.updateItem(t2.id, { title: '删之后改的' })
    const m = mergeSnapshots(a.s, b.s)
    expect(title(m, t1.id)).toBeUndefined()
    expect(title(m, t2.id)).toBe('删之后改的')
    expect(m.clock!.tomb[t1.id]).toBeTruthy()
    expect(m.clock!.tomb[t2.id]).toBeUndefined()
  })

  it('merges check-ins, links and moods by their last change', () => {
    const { a, b, h, p, t1 } = devices()
    tick()
    a.setCheckin(h.id, '2026-11-08', true)
    a.setCheckin(h.id, '2026-11-09', true)
    a.link(t1.id, p.id)
    a.setMood('2026-11-09', 3, '')
    tick()
    b.setCheckin(h.id, '2026-11-07', true)
    b.setMood('2026-11-09', 5, 'B 更晚')
    // B later learns of A's check-in for the 9th and un-checks it.
    b.s.checkins.push({ habitId: h.id, date: '2026-11-09' })
    tick()
    b.setCheckin(h.id, '2026-11-09', false)
    const m = mergeSnapshots(a.s, b.s)
    expect(m.checkins.map((c) => c.date)).toEqual(['2026-11-07', '2026-11-08'])
    expect(m.links).toHaveLength(1)
    expect(m.moods).toEqual([{ date: '2026-11-09', mood: 5, note: 'B 更晚' }])

    tick()
    a.unlink(t1.id, p.id)
    a.setMood('2026-11-09', null)
    const m2 = mergeSnapshots(a.s, m)
    expect(m2.links).toHaveLength(0)
    expect(m2.moods).toHaveLength(0)
  })

  it('drops links and check-ins that point at deleted items', () => {
    const { a, b, h, p, t1 } = devices()
    tick()
    b.link(t1.id, p.id)
    b.setCheckin(h.id, '2026-11-09', true)
    tick()
    a.deleteItem(p.id)
    a.deleteItem(h.id)
    const m = mergeSnapshots(a.s, b.s)
    expect(m.links).toHaveLength(0)
    expect(m.checkins).toHaveLength(0)
  })

  it('converges: order does not matter and merging again changes nothing', () => {
    const { a, b, t1, h } = devices()
    tick()
    a.updateItem(t1.id, { title: 'x' })
    a.setCheckin(h.id, '2026-11-01', true)
    a.setProfile({ name: 'A' })
    tick()
    b.createItem('note', { title: 'n', kind: 'idea' })
    b.setProfile({ name: 'B' })
    const ab = mergeSnapshots(a.s, b.s)
    const ba = mergeSnapshots(b.s, a.s)
    expect(fingerprint(ab)).toBe(fingerprint(ba))
    expect(fingerprint(mergeSnapshots(ab, ab))).toBe(fingerprint(ab))
    expect(ab.profile.name).toBe('B')
  })

  it('lets a restored backup win, but joins by union', () => {
    const { a, b, t1 } = devices()
    tick()
    b.updateItem(t1.id, { title: 'B 的新改动' })
    tick()
    a.replaceAll({ version: 1, items: [], links: [], checkins: [], moods: [], profile: { name: '恢复' } })
    const m = mergeSnapshots(a.s, b.s)
    expect(m.items).toHaveLength(0)
    expect(m.profile.name).toBe('恢复')

    const joined = mergeSnapshots(a.s, b.s, { union: true })
    expect(title(joined, t1.id)).toBe('B 的新改动')
  })

  it('merges data from before sync existed (no clocks) as a union', () => {
    const old = (title: string, id: string): Snapshot => ({
      version: 1,
      items: [{ id, type: 'task', title, status: 'todo', attr: 'mind', difficulty: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
      links: [],
      checkins: [{ habitId: id, date: '2026-01-01' }],
      moods: [],
      profile: {},
    })
    const m = mergeSnapshots(old('a', 'x1'), old('b', 'x2'))
    expect(m.items.map((i) => i.id)).toEqual(['x1', 'x2'])
    expect(m.checkins).toHaveLength(2)
  })

  it('treats the same content with different key order as equal', () => {
    expect(stable({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(stable({ a: [{ x: 1, y: 2 }], b: 1 }))
    const { a, t1 } = devices()
    const shuffled = structuredClone(a.s)
    shuffled.items = shuffled.items.map((it) => Object.fromEntries(Object.entries(it).reverse()) as typeof it)
    expect(fingerprint(shuffled)).toBe(fingerprint(a.s))
    expect(title(mergeSnapshots(a.s, shuffled), t1.id)).toBe('A')
  })

  it('lets an edit win even if the stored version claims a later time (clock skew)', () => {
    const { a, b, t1 } = devices()
    // Another device with a fast clock wrote this version "in the future".
    const future = new Date(clock + 3_600_000).toISOString()
    a.s.items = a.s.items.map((i) => (i.id === t1.id ? { ...i, title: '来自快时钟', updatedAt: future } : i))
    b.s = mergeSnapshots(b.s, a.s)
    tick()
    b.updateItem(t1.id, { title: '之后真正的修改' })
    expect(title(mergeSnapshots(a.s, b.s), t1.id)).toBe('之后真正的修改')
  })

  it('never lets an empty profile from a new device blank out a filled one', () => {
    const filled: Snapshot = { version: 1, items: [], links: [], checkins: [], moods: [], profile: { name: '阿岚', background: '程序员' } }
    const empty: Snapshot = { version: 1, items: [], links: [], checkins: [], moods: [], profile: {} }
    expect(mergeSnapshots(filled, empty, { union: true }).profile.name).toBe('阿岚')
    expect(mergeSnapshots(empty, filled, { union: true }).profile.name).toBe('阿岚')
    // After a restore on one device and a fresh phone joining.
    const a = new Repo()
    a.replaceAll(filled)
    tick()
    const phone = new Repo()
    phone.replaceAll(empty)
    expect(mergeSnapshots(a.s, phone.s, { union: true }).profile.name).toBe('阿岚')
  })
})

import { cleanSvg } from './mcpTools'
describe('portrait svg from an AI', () => {
  it('keeps drawing, drops scripts, handlers and external links', () => {
    const out = cleanSvg('<svg viewBox="0 0 10 10"><script>alert(1)</script><circle onclick="x()" r="4"/><image href="https://evil/x.png"/><use href="#a"/></svg>')
    expect(out).not.toMatch(/script|onclick|evil/)
    expect(out).toContain('<circle')
    expect(out).toContain('href="#a"')
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(() => cleanSvg('<div>no</div>')).toThrow()
  })
})
