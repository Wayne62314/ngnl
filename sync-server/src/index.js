// NoGameNoLife sync relay (Cloudflare Worker + D1).
//
// Stores one end-to-end encrypted blob per sync code. The relay never sees the
// code or the key: clients send an id and a token derived from the code, and
// the data is AES-GCM ciphertext. All the relay can know is that some id
// stored N bytes at some time.
//
//   GET    /v1/blobs/:id   → 200 ciphertext (x-version header) | 404
//   PUT    /v1/blobs/:id   x-if-version: N  → 200 {version} | 409 {version}
//   DELETE /v1/blobs/:id   → 204
//
// Every call needs `Authorization: Bearer <token>`. The first PUT binds the
// token (its SHA-256) to the id; later calls must present the same token.

const MAX_BYTES = 1_900_000 // D1 rows are limited to 2 MB
const ID = /^\/v1\/blobs\/([0-9a-f]{64})$/
const TOKEN = /^Bearer ([0-9a-f]{64})$/
const DEFAULT_ORIGINS = 'https://wayne62314.github.io,http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173'

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))

function cors(req, env) {
  const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((s) => s.trim())
  const origin = req.headers.get('origin')
  const h = {
    'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type, x-if-version',
    'access-control-expose-headers': 'x-version',
    'access-control-max-age': '86400',
    vary: 'origin',
  }
  if (origin && allowed.includes(origin)) h['access-control-allow-origin'] = origin
  return h
}

const json = (status, body, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } })

export default {
  async fetch(req, env) {
    const headers = cors(req, env)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    const url = new URL(req.url)
    if (url.pathname === '/' && req.method === 'GET') return new Response('NoGameNoLife sync relay', { headers })

    const m = url.pathname.match(ID)
    if (!m) return json(404, { error: 'not found' }, headers)
    const id = m[1]
    const t = (req.headers.get('authorization') || '').match(TOKEN)
    if (!t) return json(401, { error: 'missing token' }, headers)
    const tokenHash = await sha256(t[1])

    const row = await env.DB.prepare('SELECT version, token_hash FROM blobs WHERE id = ?').bind(id).first()
    if (row && row.token_hash !== tokenHash) return json(403, { error: 'wrong token' }, headers)

    if (req.method === 'GET') {
      if (!row) return json(404, { error: 'no data' }, headers)
      const data = await env.DB.prepare('SELECT data FROM blobs WHERE id = ?').bind(id).first()
      // D1 may hand BLOBs back as ArrayBuffer or as a plain array of numbers.
      const blob = data.data instanceof ArrayBuffer || ArrayBuffer.isView(data.data) ? data.data : new Uint8Array(data.data)
      return new Response(blob, { headers: { ...headers, 'content-type': 'application/octet-stream', 'x-version': String(row.version), 'cache-control': 'no-store' } })
    }

    if (req.method === 'PUT') {
      const expected = Number(req.headers.get('x-if-version') ?? NaN)
      if (!Number.isInteger(expected) || expected < 0) return json(400, { error: 'x-if-version required' }, headers)
      if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES) return json(413, { error: 'too large' }, headers)
      const body = new Uint8Array(await req.arrayBuffer())
      if (body.length > MAX_BYTES) return json(413, { error: 'too large' }, headers)
      if (!body.length) return json(400, { error: 'empty body' }, headers)
      const now = Date.now()
      if (!row) {
        if (expected !== 0) return json(409, { version: 0 }, headers)
        const r = await env.DB.prepare('INSERT INTO blobs (id, token_hash, version, data, size, updated_at) VALUES (?, ?, 1, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
          .bind(id, tokenHash, body, body.length, now)
          .run()
        if (!r.meta.changes) return json(409, { version: -1 }, headers)
        return json(200, { version: 1 }, headers)
      }
      if (row.version !== expected) return json(409, { version: row.version }, headers)
      const r = await env.DB.prepare('UPDATE blobs SET data = ?, size = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?')
        .bind(body, body.length, now, id, expected)
        .run()
      if (!r.meta.changes) return json(409, { version: -1 }, headers)
      return json(200, { version: expected + 1 }, headers)
    }

    if (req.method === 'DELETE') {
      if (row) await env.DB.prepare('DELETE FROM blobs WHERE id = ?').bind(id).run()
      return new Response(null, { status: 204, headers })
    }

    return json(405, { error: 'method not allowed' }, headers)
  },
}
