import type { Item, ItemType, Profile, Snapshot } from './types'
import { Repo, parseSnapshot } from './repo'
import { announceChange, readSnapshot, writeSnapshot } from './storage'
import { fingerprint, mergeSnapshots } from './merge'

/**
 * Same shape as the old HTTP client, but everything happens in this browser.
 * Each mutation runs on the in-memory repo and is then saved to IndexedDB.
 * If saving fails, the caller reloads state() from disk, which discards the
 * unsaved in-memory change.
 */

let repo: Repo | undefined
let queue: Promise<unknown> = Promise.resolve()

const clone = <T>(v: T): T => structuredClone(v)
/** Inputs may be Vue reactive proxies, which can't be structured-cloned; flatten them to plain data. */
const plain = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

async function ensure(): Promise<Repo> {
  if (!repo) {
    const s = await readSnapshot()
    repo = new Repo(s ? parseSnapshot(s) : undefined)
  }
  return repo
}

/** Called after every change the user makes on this device (not after merges from sync). */
const listeners = new Set<() => void>()
export function onLocalChange(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Serialises mutations so two quick clicks can't save out of order. */
function mutate<T>(fn: (r: Repo) => T, opts: { local?: boolean } = { local: true }): Promise<T> {
  const run = queue.then(async () => {
    const r = await ensure()
    const out = fn(r)
    await writeSnapshot(clone(r.s))
    announceChange()
    if (opts.local) for (const cb of listeners) cb()
    return clone(out)
  })
  queue = run.catch(() => undefined)
  return run
}

export const api = {
  /** Reloads from disk (dropping any unsaved in-memory state) and returns a copy. */
  async state(): Promise<Snapshot> {
    await queue
    repo = undefined
    return clone((await ensure()).s)
  },
  create: (type: ItemType, data: Record<string, unknown>) => mutate<Item>((r) => r.createItem(type, plain(data))),
  update: (id: string, patch: Record<string, unknown>) => mutate<Item>((r) => r.updateItem(id, plain(patch))),
  remove: (id: string) => mutate((r) => r.deleteItem(id)),
  link: (a: string, b: string) => mutate((r) => r.link(a, b)),
  unlink: (a: string, b: string) => mutate((r) => r.unlink(a, b)),
  checkin: (habitId: string, date: string, done: boolean) => mutate((r) => r.setCheckin(habitId, date, done)),
  mood: (date: string, mood: number | null, note = '') => mutate((r) => r.setMood(date, mood, note)),
  profile: (p: Profile) => mutate<Profile>((r) => (r.setProfile(plain(p)), r.s.profile)),
  /** Replaces everything with a validated backup. */
  import: (raw: unknown) => {
    const s = parseSnapshot(plain(raw))
    return mutate<Snapshot>((r) => (r.replaceAll(s), r.s))
  },
  /**
   * Merges a copy from another device into this one and saves the result.
   * `union` is for a device joining sync: its own data is kept, not replaced.
   */
  mergeRemote(remote: Snapshot, union = false): Promise<{ snapshot: Snapshot; changed: boolean }> {
    const incoming = parseSnapshot(remote)
    return mutate(
      (r) => {
        const before = fingerprint(r.s)
        r.s = mergeSnapshots(r.s, incoming, { union })
        return { snapshot: r.s, changed: fingerprint(r.s) !== before }
      },
      { local: false },
    )
  },
  async export(): Promise<Snapshot> {
    await queue
    return clone((await ensure()).s)
  },
}
