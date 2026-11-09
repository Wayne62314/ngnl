import type { Snapshot } from './types'

/**
 * Persists the snapshot in this browser's IndexedDB. Nothing leaves the
 * device: there is no server. The whole snapshot is written in one
 * transaction per change, so a write is either fully saved or not at all.
 */

const DB = 'ngnl'
const STORE = 'kv'

export interface Meta {
  /** ISO time of the last export the user made. */
  lastBackupAt?: string
  /** ISO time of the last change to the data. */
  changedAt?: string
  /** Last time we nagged about backing up, so the reminder is not shown every day. */
  remindedAt?: string
}

let dbp: Promise<IDBDatabase> | undefined
function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('这个浏览器不支持本地存储'))
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => {
      const db = req.result
      // Another tab upgraded the schema: let go so it can proceed.
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => reject(req.error ?? new Error('无法打开本地存储'))
    req.onblocked = () => reject(new Error('请关闭其他打开着的 NoGameNoLife 页面后刷新'))
  })
  dbp.catch(() => (dbp = undefined))
  return dbp
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const r = fn(t.objectStore(STORE))
        t.oncomplete = () => resolve((r ? r.result : undefined) as T)
        t.onerror = () => reject(t.error ?? new Error('本地存储读写失败'))
        t.onabort = () => reject(t.error ?? new Error('本地存储写入被中止（可能是空间不足）'))
      }),
  )
}

export const readSnapshot = () => tx<Snapshot | undefined>('readonly', (s) => s.get('state'))
export const readMeta = async () => (await tx<Meta | undefined>('readonly', (s) => s.get('meta'))) ?? {}

export function writeSnapshot(snap: Snapshot) {
  return tx<void>('readwrite', (s) => {
    s.put(snap, 'state')
    const meta = s.get('meta')
    meta.onsuccess = () => s.put({ ...(meta.result ?? {}), changedAt: new Date().toISOString() }, 'meta')
  })
}

export async function patchMeta(patch: Partial<Meta>) {
  return tx<void>('readwrite', (s) => {
    const meta = s.get('meta')
    meta.onsuccess = () => s.put({ ...(meta.result ?? {}), ...patch }, 'meta')
  })
}

/**
 * Asks the browser not to evict our data under storage pressure.
 * Returns whether the data is protected.
 */
export async function requestPersistence(): Promise<boolean> {
  const sm = navigator.storage
  if (!sm?.persist) return false
  if (await sm.persisted()) return true
  return sm.persist().catch(() => false)
}

export async function isPersisted(): Promise<boolean> {
  return (await navigator.storage?.persisted?.().catch(() => false)) ?? false
}

/** Tells other open tabs that the data changed, so they reload instead of overwriting it. */
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ngnl') : undefined
export const announceChange = () => channel?.postMessage('changed')
export function onExternalChange(cb: () => void) {
  channel?.addEventListener('message', (e) => e.data === 'changed' && cb())
}
