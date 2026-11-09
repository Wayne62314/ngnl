import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, onLocalChange } from '@/lib/api'
import { fingerprint } from '@/lib/merge'
import { readSyncConfig, writeSyncConfig, type SyncConfig } from '@/lib/storage'
import { decryptSnapshot, deriveKeys, encryptSnapshot, generateCode, normaliseCode, type SyncKeys } from '@/lib/syncCrypto'
import { useData } from './data'

/** The relay this build talks to by default; can be changed in settings (for a self-hosted relay). */
export const DEFAULT_SERVER = (import.meta.env.VITE_SYNC_SERVER as string | undefined) ?? ''

const PUSH_DELAY = 3000
const POLL_EVERY = 60_000
const REQUEST_TIMEOUT = 15_000

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Minimal client for the relay: an encrypted blob per sync code, with a version number for optimistic locking. */
async function relay(server: string, keys: SyncKeys, method: 'GET' | 'PUT' | 'DELETE', body?: Uint8Array, version?: number) {
  let res: Response
  try {
    res = await fetch(`${server.replace(/\/+$/, '')}/v1/blobs/${keys.id}`, {
      method,
      headers: {
        authorization: `Bearer ${keys.token}`,
        ...(version !== undefined ? { 'x-if-version': String(version) } : {}),
        ...(body ? { 'content-type': 'application/octet-stream' } : {}),
      },
      body: body as BodyInit | undefined,
      cache: 'no-store',
      // A blocked or flaky network can leave a request hanging forever; give up and retry later.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    })
  } catch (e) {
    const timedOut = (e as Error).name === 'TimeoutError'
    throw new HttpError(0, !navigator.onLine ? '网络已断开' : timedOut ? '连接同步服务器超时' : '连不上同步服务器')
  }
  if (res.ok || res.status === 404 || res.status === 409) return res
  const text = await res.text().catch(() => '')
  throw new HttpError(res.status, res.status === 403 ? '同步码与云端数据不匹配' : res.status === 413 ? '数据太大，超过同步上限' : `同步服务器出错（${res.status}）${text ? '：' + text.slice(0, 80) : ''}`)
}

export const useSync = defineStore('sync', () => {
  const config = ref<SyncConfig | null>(null)
  const state = ref<'off' | 'idle' | 'syncing' | 'offline' | 'error'>('off')
  const error = ref('')
  const lastSyncAt = computed(() => config.value?.lastSyncAt)
  const enabled = computed(() => !!config.value)

  let keys: SyncKeys | undefined
  let running: Promise<void> | undefined
  let again = false
  let pushTimer: ReturnType<typeof setTimeout> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined

  async function save(c: SyncConfig | null) {
    config.value = c
    await writeSyncConfig(c ? { ...c } : null)
  }

  /**
   * One round: download → merge into local → upload if the merged result
   * differs from what's on the relay. If someone else uploaded in between,
   * the relay answers 409 and we go round again with their version.
   */
  async function round(union = false) {
    const c = config.value
    if (!c) return
    keys ??= await deriveKeys(c.code)
    const data = useData()
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await relay(c.server, keys, 'GET')
      let version = 0
      let remoteFp = ''
      if (res.status !== 404) {
        version = Number(res.headers.get('x-version') ?? 0)
        const remote = await decryptSnapshot(new Uint8Array(await res.arrayBuffer()), keys.key)
        remoteFp = fingerprint(remote)
        const { changed } = await api.mergeRemote(remote, union)
        if (changed) await data.load()
      }
      const local = await api.export()
      if (fingerprint(local) === remoteFp) {
        await save({ ...c, version, lastSyncAt: new Date().toISOString() })
        return
      }
      const put = await relay(c.server, keys, 'PUT', await encryptSnapshot(local, keys.key), version)
      if (put.status === 409) continue // someone else synced first: merge their copy and retry
      const body = (await put.json()) as { version: number }
      await save({ ...c, version: body.version, lastSyncAt: new Date().toISOString() })
      return
    }
    throw new Error('同步冲突太多，请稍后再试')
  }

  /** Runs a sync round; calls made while one is running are folded into one more round. */
  function syncNow(union = false): Promise<void> {
    if (!config.value) return Promise.resolve()
    if (running) {
      again = true
      return running
    }
    state.value = 'syncing'
    running = (async () => {
      try {
        do {
          again = false
          await round(union)
          union = false
        } while (again)
        state.value = 'idle'
        error.value = ''
      } catch (e) {
        const err = e as HttpError
        state.value = err.status === 0 ? 'offline' : 'error'
        error.value = err.message
        throw e
      } finally {
        running = undefined
      }
    })()
    return running
  }
  const quietSync = () => syncNow().catch(() => {})

  function startTimers() {
    stopTimers()
    pollTimer = setInterval(() => document.visibilityState === 'visible' && quietSync(), POLL_EVERY)
  }
  function stopTimers() {
    clearInterval(pollTimer)
    clearTimeout(pushTimer)
  }

  let wired = false
  /** Called once at startup. */
  async function init() {
    const c = await readSyncConfig().catch(() => undefined)
    if (!wired) {
      wired = true
      onLocalChange(() => {
        if (!config.value) return
        clearTimeout(pushTimer)
        pushTimer = setTimeout(quietSync, PUSH_DELAY)
      })
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && quietSync())
      window.addEventListener('online', quietSync)
      // Push pending changes when the page is being hidden (closing the tab, switching apps on a phone).
      document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && pushTimer && quietSync())
    }
    if (c) {
      config.value = c
      state.value = 'idle'
      startTimers()
      await quietSync()
    }
  }

  /** Turns sync on with a new code; this device's data becomes the first copy on the relay. */
  async function enable(server = DEFAULT_SERVER) {
    if (!server) throw new Error('还没有配置同步服务器')
    keys = undefined
    await save({ code: generateCode(), server, version: 0 })
    startTimers()
    try {
      await syncNow(true)
    } catch (e) {
      await disable(false)
      throw e
    }
  }

  /** Joins sync on another device; its local data is merged in, not thrown away. */
  async function join(input: string, server = DEFAULT_SERVER) {
    const code = normaliseCode(input)
    if (!code) throw new Error('同步码格式不对，应为 26 位字母和数字')
    if (!server) throw new Error('还没有配置同步服务器')
    const k = await deriveKeys(code)
    const res = await relay(server, k, 'GET')
    if (res.status === 404) throw new Error('云端没有这个同步码的数据。请确认同步码，或先在另一台设备上开启同步')
    keys = k
    await save({ code, server, version: 0 })
    try {
      await syncNow(true)
    } catch (e) {
      await disable(false)
      throw e
    }
    startTimers()
  }

  /** Stops syncing on this device. Optionally deletes the encrypted copy on the relay (all devices stop syncing). */
  async function disable(deleteRemote: boolean) {
    stopTimers()
    const c = config.value
    if (deleteRemote && c) {
      keys ??= await deriveKeys(c.code)
      await relay(c.server, keys, 'DELETE')
    }
    keys = undefined
    await save(null)
    state.value = 'off'
    error.value = ''
  }

  return { config, state, error, enabled, lastSyncAt, init, enable, join, disable, syncNow }
})
