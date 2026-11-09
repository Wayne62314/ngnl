/**
 * End-to-end encryption for sync. Everything is derived from the sync code,
 * which never leaves the user's devices:
 *   - id    → where the encrypted data is stored on the relay
 *   - token → proves to the relay that you may read/write that slot
 *   - key   → AES-256-GCM key; the relay only ever sees ciphertext
 */
import type { Snapshot } from './types'

// Crockford base32: no I, L, O, U, so codes are easy to read and type.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function toBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

const CODE_LEN = 26 // 16 random bytes = 128 bits

/** A new random sync code, shown as XXXX-XXXX-…; 128 bits of randomness. */
export function generateCode(): string {
  return formatCode(toBase32(crypto.getRandomValues(new Uint8Array(16))))
}

export const formatCode = (raw: string) => raw.match(/.{1,4}/g)!.join('-')

/** Accepts what a person might type: lowercase, spaces, dashes, and the look-alikes I/L/O. */
export function normaliseCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
  if (s.length !== CODE_LEN || [...s].some((c) => !ALPHABET.includes(c))) return null
  return formatCode(s)
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const enc = new TextEncoder()

export interface SyncKeys {
  id: string
  token: string
  key: CryptoKey
}

export async function deriveKeys(code: string): Promise<SyncKeys> {
  const base = await crypto.subtle.importKey('raw', enc.encode(code.replace(/-/g, '')), 'HKDF', false, ['deriveBits', 'deriveKey'])
  const salt = enc.encode('ngnl-sync-v1')
  const bits = (info: string) => crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) }, base, 256)
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('key') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  return { id: hex(await bits('id')), token: hex(await bits('token')), key }
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

const FORMAT = 1

/** Snapshot → gzip → AES-GCM. Layout: [format byte][12-byte IV][ciphertext]. */
export async function encryptSnapshot(s: Snapshot, key: CryptoKey): Promise<Uint8Array> {
  const plain = await pipe(enc.encode(JSON.stringify(s)), new CompressionStream('gzip'))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain as BufferSource))
  const out = new Uint8Array(1 + iv.length + ct.length)
  out[0] = FORMAT
  out.set(iv, 1)
  out.set(ct, 1 + iv.length)
  return out
}

export async function decryptSnapshot(data: Uint8Array, key: CryptoKey): Promise<Snapshot> {
  if (data[0] !== FORMAT) throw new Error('云端数据格式不认识，可能需要更新应用')
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(1, 13) }, key, data.slice(13))
  } catch {
    throw new Error('无法解密云端数据：同步码不对，或数据已损坏')
  }
  const json = await pipe(new Uint8Array(plain), new DecompressionStream('gzip'))
  return JSON.parse(new TextDecoder().decode(json))
}
