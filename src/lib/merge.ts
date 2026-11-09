import type { Checkin, Item, Mood, Snapshot, SyncClock } from './types'

export const emptyClock = (): SyncClock => ({ epoch: '', tomb: {}, links: {}, checkins: {}, moods: {}, profile: '' })

export const clockOf = (s: Snapshot): SyncClock => {
  const c = s.clock
  return {
    epoch: c?.epoch ?? '',
    tomb: { ...(c?.tomb ?? {}) },
    links: { ...(c?.links ?? {}) },
    checkins: { ...(c?.checkins ?? {}) },
    moods: { ...(c?.moods ?? {}) },
    profile: c?.profile ?? '',
  }
}

/** JSON with object keys sorted, so equal content compares equal on every device. */
export function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']'
  const o = v as Record<string, unknown>
  return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}'
}

export const linkKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
export const checkinKey = (c: Checkin) => `${c.habitId}|${c.date}`

const later = (a: string | undefined, b: string | undefined) => ((a ?? '') >= (b ?? '') ? a ?? '' : b ?? '')

/**
 * For a set-like collection (links, check-ins): the side whose clock entry is
 * newer decides whether the key is present. With no clock on either side
 * (data from before sync existed) the key is kept if either side has it.
 */
function mergeSet(
  aHas: Set<string>,
  bHas: Set<string>,
  aClock: Record<string, string>,
  bClock: Record<string, string>,
): { keys: Set<string>; clock: Record<string, string> } {
  const keys = new Set<string>()
  const clock: Record<string, string> = {}
  for (const k of new Set([...aHas, ...bHas, ...Object.keys(aClock), ...Object.keys(bClock)])) {
    const ta = aClock[k]
    const tb = bClock[k]
    let present: boolean
    if (ta === undefined && tb === undefined) present = aHas.has(k) || bHas.has(k)
    else if ((ta ?? '') > (tb ?? '')) present = aHas.has(k)
    else if ((tb ?? '') > (ta ?? '')) present = bHas.has(k)
    else present = aHas.has(k) || bHas.has(k)
    if (present) keys.add(k)
    const t = later(ta, tb)
    if (t) clock[k] = t
  }
  return { keys, clock }
}

/** Picks the newer version of an item; ties go to a stable choice so both devices agree. */
function newer(a: Item, b: Item): Item {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b
  return stable(a) >= stable(b) ? a : b
}

/**
 * Merges two copies of the data, record by record. The result is the same no
 * matter which side is "local" (so every device converges to the same data).
 *
 * `union` ignores epochs: used when a device first joins sync, so its own
 * data is merged in rather than replaced.
 */
export function mergeSnapshots(a: Snapshot, b: Snapshot, opts: { union?: boolean } = {}): Snapshot {
  const ca = clockOf(a)
  const cb = clockOf(b)
  if (!opts.union && ca.epoch !== cb.epoch) {
    // One side restored a backup after the other last synced: the restore wins.
    return ca.epoch > cb.epoch ? normalise(a) : normalise(b)
  }

  // Tombstones: keep the latest deletion time per id.
  const tomb: Record<string, string> = { ...ca.tomb }
  for (const [id, t] of Object.entries(cb.tomb)) tomb[id] = later(tomb[id], t)

  // Items: newest version wins; a deletion newer than the last edit removes it.
  const byId = new Map<string, Item>()
  for (const it of [...a.items, ...b.items]) {
    const cur = byId.get(it.id)
    byId.set(it.id, cur ? newer(cur, it) : it)
  }
  const items = [...byId.values()]
    .filter((it) => !(tomb[it.id] && tomb[it.id] >= it.updatedAt))
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id))
  const alive = new Set(items.map((i) => i.id))
  // An edit after a deletion brings the item back; drop that stale tombstone.
  for (const id of Object.keys(tomb)) if (alive.has(id)) delete tomb[id]

  // Links and check-ins: per-key last-writer-wins.
  const L = mergeSet(new Set(a.links.map(([x, y]) => linkKey(x, y))), new Set(b.links.map(([x, y]) => linkKey(x, y))), ca.links, cb.links)
  const links = [...L.keys]
    .map((k) => k.split('|') as [string, string])
    .filter(([x, y]) => alive.has(x) && alive.has(y))
    .sort((p, q) => p.join().localeCompare(q.join()))

  const C = mergeSet(new Set(a.checkins.map(checkinKey)), new Set(b.checkins.map(checkinKey)), ca.checkins, cb.checkins)
  const checkins = [...C.keys]
    .map((k) => {
      const i = k.lastIndexOf('|')
      return { habitId: k.slice(0, i), date: k.slice(i + 1) }
    })
    .filter((c) => alive.has(c.habitId))
    .sort((p, q) => p.date.localeCompare(q.date) || p.habitId.localeCompare(q.habitId))

  // Moods: per day, the newer change wins (including "cleared").
  const ma = new Map(a.moods.map((m) => [m.date, m]))
  const mb = new Map(b.moods.map((m) => [m.date, m]))
  const moods: Mood[] = []
  const moodClock: Record<string, string> = {}
  for (const d of new Set([...ma.keys(), ...mb.keys(), ...Object.keys(ca.moods), ...Object.keys(cb.moods)])) {
    const ta = ca.moods[d] ?? ''
    const tb = cb.moods[d] ?? ''
    const pickA = ta > tb ? true : tb > ta ? false : !!ma.get(d) && (!mb.get(d) || stable(ma.get(d)) >= stable(mb.get(d)))
    const m = pickA ? ma.get(d) : mb.get(d)
    if (m) moods.push(m)
    const t = later(ta, tb)
    if (t) moodClock[d] = t
  }
  moods.sort((p, q) => p.date.localeCompare(q.date))

  // Profile: newer save wins. With no history on either side, the fuller one wins,
  // so a fresh device joining sync can never blank out a filled-in profile.
  const filled = (p: object | undefined) => Object.values(p ?? {}).filter((v) => typeof v === 'string' && v.trim()).length
  let profile = a.profile ?? {}
  if (cb.profile > ca.profile) profile = b.profile ?? {}
  else if (cb.profile === ca.profile) {
    const fa = filled(a.profile)
    const fb = filled(b.profile)
    if (fb > fa || (fb === fa && stable(b.profile ?? {}) > stable(a.profile ?? {}))) profile = b.profile ?? {}
  }

  return {
    version: 1,
    items,
    links,
    checkins,
    moods,
    profile,
    clock: { epoch: later(ca.epoch, cb.epoch), tomb, links: L.clock, checkins: C.clock, moods: moodClock, profile: later(ca.profile, cb.profile) },
  }
}

/** Same data in a canonical order, so equal content serialises identically. */
export function normalise(s: Snapshot): Snapshot {
  return mergeSnapshots(s, { version: 1, items: [], links: [], checkins: [], moods: [], profile: s.profile, clock: { ...clockOf(s) } }, { union: true })
}

/** Stable fingerprint of the content, to tell whether two copies differ. */
export const fingerprint = (s: Snapshot) => stable(normalise(s))
