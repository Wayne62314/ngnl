import type { Item, ItemType, Profile, Snapshot, SyncClock } from './types'
import { clockOf, emptyClock, linkKey } from './merge'

export const ITEM_TYPES: readonly ItemType[] = ['task', 'habit', 'goal', 'person', 'event', 'note', 'field', 'segment', 'asset', 'ledger', 'sim']

const now = () => new Date().toISOString()
/**
 * A timestamp that is "now", but never earlier than `prev` + 1 ms. If this
 * device's clock is behind the one that wrote `prev`, the new change still
 * counts as newer when devices merge.
 */
export const after = (prev?: string) => {
  const t = now()
  if (!prev || t > prev) return t
  const p = Date.parse(prev)
  return Number.isNaN(p) ? t : new Date(p + 1).toISOString()
}
const uuid = () =>
  globalThis.crypto?.randomUUID?.() ?? 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)

/** Links are undirected; store each pair in a stable order. */
const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a])

const META = ['id', 'type', 'createdAt', 'updatedAt']
function stripMeta(data: Record<string, unknown>) {
  const rest = { ...data }
  for (const k of META) delete rest[k]
  return rest
}

export const emptySnapshot = (): Snapshot => ({ version: 1, items: [], links: [], checkins: [], moods: [], profile: {}, clock: emptyClock() })

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

/**
 * Validates an imported backup and normalises it. Throws a readable error
 * instead of letting a broken file replace the user's data.
 */
export function parseSnapshot(raw: unknown): Snapshot {
  const s = raw as Partial<Snapshot> | null
  if (!s || typeof s !== 'object' || !Array.isArray(s.items)) throw new Error('这不是 NoGameNoLife 的备份文件')
  if (s.version !== 1) throw new Error(`不支持的备份版本：${String(s.version)}`)
  const items: Item[] = []
  const ids = new Set<string>()
  for (const it of s.items) {
    if (!it || typeof it.id !== 'string' || !ITEM_TYPES.includes(it.type)) throw new Error('备份里有无法识别的条目')
    if (ids.has(it.id)) continue
    ids.add(it.id)
    items.push({ ...it, createdAt: it.createdAt ?? now(), updatedAt: it.updatedAt ?? now() })
  }
  const linkSet = new Set<string>()
  const links: [string, string][] = []
  for (const l of s.links ?? []) {
    if (!Array.isArray(l) || l[0] === l[1] || !ids.has(l[0]) || !ids.has(l[1])) continue
    const p = pair(l[0], l[1])
    if (linkSet.has(p.join())) continue
    linkSet.add(p.join())
    links.push(p)
  }
  const checkinSet = new Set<string>()
  const checkins = (s.checkins ?? []).filter((c) => {
    const k = `${c?.habitId}|${c?.date}`
    if (!ids.has(c?.habitId) || !isDate(c?.date) || checkinSet.has(k)) return false
    checkinSet.add(k)
    return true
  }).map((c) => ({ habitId: c.habitId, date: c.date }))
  const moodMap = new Map<string, { date: string; mood: number; note: string }>()
  for (const m of s.moods ?? []) {
    if (isDate(m?.date) && Number.isInteger(m.mood) && m.mood >= 1 && m.mood <= 5) moodMap.set(m.date, { date: m.date, mood: m.mood, note: m.note ?? '' })
  }
  const moods = [...moodMap.values()].sort((a, b) => a.date.localeCompare(b.date))
  const profile = s.profile && typeof s.profile === 'object' ? s.profile : {}
  const clock = s.clock && typeof s.clock === 'object' ? clockOf(s as Snapshot) : emptyClock()
  return { version: 1, items, links, checkins, moods, profile, clock }
}

/**
 * The whole data model, held in memory. Every method mirrors one user action
 * and keeps the same rules the old SQLite server enforced (cascading deletes,
 * undirected links, null-removes-field patches).
 */
export class Repo {
  s: Snapshot

  constructor(s: Snapshot = emptySnapshot()) {
    this.s = s
  }

  /** Change times for sync; created on first use for data from before sync existed. */
  private get clock(): SyncClock {
    return (this.s.clock ??= emptyClock())
  }

  /** Replaces everything (restore from backup). A new epoch makes this win over other devices' copies. */
  replaceAll(s: Snapshot) {
    const t = now()
    this.s = { ...s, clock: { ...emptyClock(), epoch: t, profile: Object.keys(s.profile ?? {}).length ? t : '' } }
  }

  getItem(id: string): Item | undefined {
    return this.s.items.find((i) => i.id === id)
  }

  createItem(type: ItemType, data: Record<string, unknown>): Item {
    if (!ITEM_TYPES.includes(type)) throw new Error(`未知条目类型：${type}`)
    const t = now()
    const item = { ...stripMeta(data), id: uuid(), type, createdAt: t, updatedAt: t } as Item
    this.s.items.push(item)
    return item
  }

  /** Shallow-merges `patch` into the item. A null value removes the field. */
  updateItem(id: string, patch: Record<string, unknown>): Item {
    const idx = this.s.items.findIndex((i) => i.id === id)
    if (idx < 0) throw new Error('条目不存在')
    const cur = this.s.items[idx]
    const next: Record<string, unknown> = { ...cur, ...stripMeta(patch), updatedAt: after(cur.updatedAt) }
    for (const k of Object.keys(next)) if (next[k] === null) delete next[k]
    this.s.items[idx] = next as unknown as Item
    return next as unknown as Item
  }

  deleteItem(id: string) {
    const it = this.getItem(id)
    if (it) this.clock.tomb[id] = after(it.updatedAt)
    this.s.items = this.s.items.filter((i) => i.id !== id)
    this.s.links = this.s.links.filter(([a, b]) => a !== id && b !== id)
    this.s.checkins = this.s.checkins.filter((c) => c.habitId !== id)
  }

  link(a: string, b: string) {
    if (a === b) throw new Error('不能关联自己')
    if (!this.getItem(a) || !this.getItem(b)) throw new Error('条目不存在')
    const [x, y] = pair(a, b)
    if (!this.s.links.some(([p, q]) => p === x && q === y)) {
      this.s.links.push([x, y])
      this.clock.links[linkKey(x, y)] = after(this.clock.links[linkKey(x, y)])
    }
  }

  unlink(a: string, b: string) {
    const [x, y] = pair(a, b)
    const before = this.s.links.length
    this.s.links = this.s.links.filter(([p, q]) => !(p === x && q === y))
    if (this.s.links.length !== before) this.clock.links[linkKey(x, y)] = after(this.clock.links[linkKey(x, y)])
  }

  setCheckin(habitId: string, date: string, done: boolean) {
    const has = this.s.checkins.some((c) => c.habitId === habitId && c.date === date)
    if (done && !has) {
      if (!this.getItem(habitId)) throw new Error('条目不存在')
      this.s.checkins.push({ habitId, date })
      this.clock.checkins[`${habitId}|${date}`] = after(this.clock.checkins[`${habitId}|${date}`])
    } else if (!done && has) {
      this.s.checkins = this.s.checkins.filter((c) => !(c.habitId === habitId && c.date === date))
      this.clock.checkins[`${habitId}|${date}`] = after(this.clock.checkins[`${habitId}|${date}`])
    }
  }

  setMood(date: string, mood: number | null, note = '') {
    if (mood !== null && (!Number.isInteger(mood) || mood < 1 || mood > 5)) throw new Error('心情需在 1–5 之间')
    this.clock.moods[date] = after(this.clock.moods[date])
    this.s.moods = this.s.moods.filter((m) => m.date !== date)
    if (mood !== null) {
      this.s.moods.push({ date, mood, note })
      this.s.moods.sort((a, b) => a.date.localeCompare(b.date))
    }
  }

  setProfile(p: Profile) {
    this.s.profile = { ...p }
    this.clock.profile = after(this.clock.profile)
  }
}
