import { describe, expect, it } from 'vitest'
import { decryptSnapshot, deriveKeys, encryptSnapshot, generateCode, normaliseCode } from './syncCrypto'
import type { Snapshot } from './types'

const snap: Snapshot = { version: 1, items: [], links: [], checkins: [{ habitId: 'h', date: '2026-11-09' }], moods: [], profile: { name: '阿岚' } }

describe('sync crypto', () => {
  it('makes readable codes and accepts sloppy typing', () => {
    const code = generateCode()
    expect(code).toMatch(/^([0-9A-Z]{4}-){6}[0-9A-Z]{2}$/)
    expect(normaliseCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code)
    expect(normaliseCode('O0IL' + code.slice(4).replace(/-/g, ''))).toBe('0011-' + code.slice(5))
    expect(normaliseCode('too-short')).toBeNull()
    expect(normaliseCode(code.replace(/^./, 'U'))).toBeNull()
  })

  it('derives the same id, token and key on every device', async () => {
    const code = generateCode()
    const a = await deriveKeys(code)
    const b = await deriveKeys(code)
    expect(a.id).toBe(b.id)
    expect(a.token).toBe(b.token)
    expect(a.id).not.toBe(a.token)
    expect((await deriveKeys(generateCode())).id).not.toBe(a.id)
  })

  it('round-trips data and rejects the wrong code', async () => {
    const k = await deriveKeys(generateCode())
    const blob = await encryptSnapshot(snap, k.key)
    expect(new TextDecoder().decode(blob)).not.toContain('阿岚')
    expect(await decryptSnapshot(blob, k.key)).toEqual(snap)
    const other = await deriveKeys(generateCode())
    await expect(decryptSnapshot(blob, other.key)).rejects.toThrow('同步码不对')
  })
})
