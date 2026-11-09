// Runs the worker against a real SQLite database standing in for D1.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import worker from './index.js'

function fakeD1() {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
  return {
    prepare: (sql) => {
      const stmt = db.prepare(sql)
      let args = []
      const api = {
        bind: (...a) => ((args = a), api),
        first: async () => stmt.get(...args) ?? null,
        run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
      }
      return api
    },
  }
}

const ID = 'a'.repeat(64)
const TOKEN = 'b'.repeat(64)
const ORIGIN = 'https://wayne62314.github.io'
let env
beforeEach(() => (env = { DB: fakeD1() }))

const call = (method, { id = ID, token = TOKEN, version, body, origin = ORIGIN } = {}) =>
  worker.fetch(
    new Request(`https://relay.test/v1/blobs/${id}`, {
      method,
      body,
      headers: { origin, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(version !== undefined ? { 'x-if-version': String(version) } : {}) },
    }),
    env,
  )
const bytes = (s) => new TextEncoder().encode(s)

describe('sync relay', () => {
  it('creates, reads and updates with version checks', async () => {
    expect((await call('GET')).status).toBe(404)
    const put = await call('PUT', { version: 0, body: bytes('v1') })
    expect(await put.json()).toEqual({ version: 1 })

    const get = await call('GET')
    expect(get.headers.get('x-version')).toBe('1')
    expect(get.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(new TextDecoder().decode(await get.arrayBuffer())).toBe('v1')

    expect((await call('PUT', { version: 1, body: bytes('v2') })).status).toBe(200)
    // A device that hasn't seen v2 yet is told to pull first.
    const stale = await call('PUT', { version: 1, body: bytes('old') })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({ version: 2 })
    // Creating again over existing data is a conflict too.
    expect((await call('PUT', { version: 0, body: bytes('x') })).status).toBe(409)
  })

  it('binds the slot to its token', async () => {
    await call('PUT', { version: 0, body: bytes('secret') })
    expect((await call('GET', { token: 'c'.repeat(64) })).status).toBe(403)
    expect((await call('PUT', { token: 'c'.repeat(64), version: 1, body: bytes('hijack') })).status).toBe(403)
    expect((await call('DELETE', { token: 'c'.repeat(64) })).status).toBe(403)
    expect((await call('GET', { token: null })).status).toBe(401)
  })

  it('rejects bad input and unknown origins', async () => {
    expect((await call('GET', { id: 'nope' })).status).toBe(404)
    expect((await call('PUT', { body: bytes('x') })).status).toBe(400)
    expect((await call('PUT', { version: 0, body: new Uint8Array(2_000_000) })).status).toBe(413)
    const evil = await call('GET', { origin: 'https://evil.example' })
    expect(evil.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('deletes', async () => {
    await call('PUT', { version: 0, body: bytes('x') })
    expect((await call('DELETE')).status).toBe(204)
    expect((await call('GET')).status).toBe(404)
  })
})
