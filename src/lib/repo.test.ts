import { describe, expect, it } from 'vitest'
import { Repo, parseSnapshot } from './repo'

describe('repo', () => {
  it('creates, patches, links and deletes items', () => {
    const r = new Repo()
    const a = r.createItem('task', { title: '读书', status: 'todo', id: 'hijack' })
    const b = r.createItem('person', { title: '小明', closeness: 4 })
    expect(a).toMatchObject({ type: 'task', title: '读书' })
    expect(a.id).not.toBe('hijack')

    const patched = r.updateItem(a.id, { status: 'done', title: null, id: 'hijack' }) as any
    expect(patched.status).toBe('done')
    expect(patched.title).toBeUndefined()
    expect(patched.id).toBe(a.id)

    r.link(b.id, a.id)
    r.link(a.id, b.id)
    expect(r.s.links).toHaveLength(1)
    expect(() => r.link(a.id, a.id)).toThrow()

    r.deleteItem(b.id)
    expect(r.s.items.map((i) => i.id)).toEqual([a.id])
    expect(r.s.links).toHaveLength(0)
  })

  it('rejects bad input', () => {
    const r = new Repo()
    expect(() => r.createItem('nope' as any, {})).toThrow()
    expect(() => r.updateItem('missing', {})).toThrow()
    expect(() => r.setMood('2026-11-09', 9)).toThrow()
    expect(() => r.setCheckin('missing', '2026-11-09', true)).toThrow()
  })

  it('tracks checkins and moods, and round-trips a backup', () => {
    const r = new Repo()
    const h = r.createItem('habit', { title: '跑步', days: [1] })
    r.setCheckin(h.id, '2026-11-09', true)
    r.setCheckin(h.id, '2026-11-09', true) // idempotent
    r.setMood('2026-11-09', 4, '还行')
    r.setProfile({ name: 'Ethen' })
    const backup = JSON.parse(JSON.stringify(r.s))
    expect(backup.checkins).toEqual([{ habitId: h.id, date: '2026-11-09' }])

    r.deleteItem(h.id)
    expect(r.s.checkins).toHaveLength(0)

    const restored = parseSnapshot(backup)
    expect(restored.checkins).toHaveLength(1)
    expect(restored.moods[0]).toMatchObject({ mood: 4, note: '还行' })
    expect(restored.profile.name).toBe('Ethen')
  })

  it('validates and cleans imported backups', () => {
    expect(() => parseSnapshot(null)).toThrow()
    expect(() => parseSnapshot({ version: 2, items: [] })).toThrow()
    expect(() => parseSnapshot({ version: 1, items: [{ id: 'x', type: 'bad' }] })).toThrow()

    const s = parseSnapshot({
      version: 1,
      items: [
        { id: 'a', type: 'task', title: 'x' },
        { id: 'b', type: 'habit', title: 'y' },
      ],
      links: [['b', 'a'], ['a', 'b'], ['a', 'ghost'], ['a', 'a']],
      checkins: [{ habitId: 'b', date: '2026-11-09' }, { habitId: 'ghost', date: '2026-11-09' }, { habitId: 'b', date: 'bad' }],
      moods: [{ date: '2026-11-09', mood: 3 }, { date: '2026-11-10', mood: 7 }],
    })
    expect(s.links).toEqual([['a', 'b']])
    expect(s.checkins).toHaveLength(1)
    expect(s.moods).toEqual([{ date: '2026-11-09', mood: 3, note: '' }])
    expect(s.items[0].createdAt).toBeTruthy()
  })
})
