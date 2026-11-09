import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { runTool, runWriteTool, WRITE_TOOLS } from '@/lib/mcpTools'
import { useData } from './data'

/** Ports the local ngnl-mcp server may listen on (it takes the first free one). */
const PORTS = [5311, 5312, 5313, 5314, 5315]
const RETRY_MS = 4000

export interface McpLogEntry {
  at: string
  client: string
  tool: string
  write: boolean
  ok: boolean
  error?: string
}

const load = (k: string, d: boolean) => {
  try {
    const v = localStorage.getItem(k)
    return v === null ? d : v === '1'
  } catch {
    return d
  }
}
const save = (k: string, v: boolean) => {
  try {
    localStorage.setItem(k, v ? '1' : '0')
  } catch {}
}

/** Phones and tablets can't run the local MCP server, so the feature is desktop-only. */
export const isMobileDevice = () =>
  typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent) ||
    (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches))

export const useMcp = defineStore('mcp', () => {
  const enabled = ref(load('ngnl-mcp', false))
  const allowWrite = ref(load('ngnl-mcp-write', true))
  // shallowRef: WebSocket objects must not be wrapped in reactive proxies (their methods need the real object).
  const sockets = shallowRef(new Map<number, { ws: WebSocket; client: string }>())
  const attempts = ref(0)
  /** Set once any connection opened, so "can't connect" help isn't shown after a normal disconnect. */
  const everConnected = ref(false)
  const log = ref<McpLogEntry[]>([])
  const mobile = isMobileDevice()

  /** Chrome asks before a public site may reach this computer; 'denied' means the user (or the browser) blocked it. */
  const permission = ref<'granted' | 'prompt' | 'denied' | 'unknown'>('unknown')
  async function checkPermission() {
    try {
      const p = await navigator.permissions.query({ name: 'local-network-access' as PermissionName })
      permission.value = p.state
      p.onchange = () => (permission.value = p.state)
    } catch {
      permission.value = 'unknown'
    }
  }

  const connected = computed(() => [...sockets.value.values()].filter((s) => s.ws.readyState === WebSocket.OPEN))
  const status = computed<'off' | 'waiting' | 'connected'>(() => (!enabled.value ? 'off' : connected.value.length ? 'connected' : 'waiting'))

  let timer: ReturnType<typeof setTimeout> | undefined

  function connectPort(port: number) {
    if (sockets.value.has(port)) return
    let ws: WebSocket
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}/ngnl`)
    } catch {
      return
    }
    const entry = { ws, client: 'AI 助手' }
    sockets.value = new Map(sockets.value).set(port, entry)
    ws.onopen = () => {
      everConnected.value = true
      ws.send(JSON.stringify({ type: 'hello', app: 'ngnl', version: 1 }))
      sockets.value = new Map(sockets.value) // poke reactivity
    }
    ws.onmessage = (e) => onMessage(entry, e.data)
    ws.onclose = () => {
      const next = new Map(sockets.value)
      if (next.get(port)?.ws === ws) next.delete(port)
      sockets.value = next
    }
  }

  function tick() {
    clearTimeout(timer)
    if (!enabled.value || mobile) return
    attempts.value++
    for (const p of PORTS) connectPort(p)
    timer = setTimeout(tick, RETRY_MS)
  }

  async function onMessage(entry: { ws: WebSocket; client: string }, raw: string) {
    let msg: { type: string; id?: string; tool?: string; args?: Record<string, unknown>; client?: string }
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    if (msg.type === 'welcome') {
      if (msg.client) entry.client = msg.client
      sockets.value = new Map(sockets.value)
      return
    }
    if (msg.type !== 'call' || !msg.id || !msg.tool) return
    if (msg.client) entry.client = msg.client
    const write = WRITE_TOOLS.has(msg.tool)
    const record = (ok: boolean, error?: string) => {
      log.value.unshift({ at: new Date().toISOString(), client: entry.client, tool: msg.tool!, write, ok, error })
      log.value.length = Math.min(log.value.length, 30)
    }
    try {
      if (!enabled.value) throw new Error('用户已关闭 AI 助手连接')
      if (write && !allowWrite.value) throw new Error('用户没有允许 AI 修改数据（设置 → AI 助手 → 允许修改）。只能读取。')
      const data = useData()
      const result = write ? await runWriteTool(data, msg.tool, msg.args ?? {}) : runTool(data, msg.tool, msg.args ?? {})
      entry.ws.send(JSON.stringify({ type: 'result', id: msg.id, ok: true, data: result ?? null }))
      record(true)
    } catch (e) {
      const error = (e as Error).message
      entry.ws.send(JSON.stringify({ type: 'result', id: msg.id, ok: false, error }))
      record(false, error)
    }
  }

  function disconnectAll() {
    clearTimeout(timer)
    for (const { ws } of sockets.value.values()) ws.close()
    sockets.value = new Map()
  }

  watch(enabled, (v) => {
    save('ngnl-mcp', v)
    attempts.value = 0
    if (v) tick()
    else disconnectAll()
  })
  watch(allowWrite, (v) => save('ngnl-mcp-write', v))

  /** Called once at startup: reconnect if the user left the connection on. */
  function start() {
    void checkPermission()
    if (enabled.value) tick()
  }

  return { enabled, allowWrite, status, connected, attempts, everConnected, log, mobile, permission, start, checkPermission }
})
