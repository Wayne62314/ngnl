import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/lib/api'
import { isPersisted, onExternalChange, patchMeta, readMeta, requestPersistence, resetMeta, type Meta } from '@/lib/storage'
import { today } from '@/lib/dates'
import { attrLevel, attrTotals, characterLevel, rankOf, xpEntries } from '@/lib/game'
import { attrOf } from '@/lib/types'
import type { Attr, Checkin, Goal, Habit, Item, ItemOf, ItemType, LifeEvent, Mood, Note, Person, Profile, Snapshot, Task } from '@/lib/types'
import { useUi } from './ui'

export type RelationKind = 'link' | 'goal' | 'task' | 'parent' | 'child' | 'prereq' | 'unlocks'

type Patch<T extends Item> = { [K in keyof T]?: T[K] | null }

const DEFAULTS: { [T in ItemType]: Partial<ItemOf<T>> } = {
  task: { status: 'todo', attr: 'mind', difficulty: 1 },
  habit: { attr: 'body', days: [0, 1, 2, 3, 4, 5, 6] },
  goal: { status: 'todo' },
  person: { closeness: 3 },
  event: { kind: 'event', feeling: 'neutral' },
  note: { kind: 'idea', status: 'seed' },
}

export const useData = defineStore('data', () => {
  const items = ref<Item[]>([])
  const links = ref<[string, string][]>([])
  const checkins = ref<Checkin[]>([])
  const moods = ref<Mood[]>([])
  const profile = ref<Profile>({})
  const loaded = ref(false)
  const loadError = ref('')
  const meta = ref<Meta>({})
  const persisted = ref(false)

  const byId = computed(() => new Map(items.value.map((i) => [i.id, i])))
  const ofType = <T extends ItemType>(t: T) => computed(() => items.value.filter((i): i is ItemOf<T> => i.type === t))
  const tasks = ofType('task')
  const habits = ofType('habit')
  const goals = ofType('goal')
  const people = ofType('person')
  const events = ofType('event')
  const notes = ofType('note')

  const linkMap = computed(() => {
    const m = new Map<string, Set<string>>()
    const add = (a: string, b: string) => (m.get(a) ?? m.set(a, new Set()).get(a)!).add(b)
    for (const [a, b] of links.value) {
      add(a, b)
      add(b, a)
    }
    return m
  })
  const linked = (id: string) =>
    [...(linkMap.value.get(id) ?? [])].map((x) => byId.value.get(x)).filter((x): x is Item => !!x)

  /**
   * Everything an item is connected to: explicit links plus the structure the
   * app already knows (a task's goal, a goal's tasks and sub-goals, prerequisites).
   * `how` says why, so the UI can label it and only offer "unlink" for real links.
   */
  const related = (id: string): { item: Item; how: RelationKind }[] => {
    const it = byId.value.get(id)
    if (!it) return []
    const out = new Map<string, { item: Item; how: RelationKind }>()
    const add = (x: Item | undefined, how: RelationKind) => x && x.id !== id && !out.has(x.id) && out.set(x.id, { item: x, how })
    for (const x of linked(id)) add(x, 'link')
    if (it.type === 'task') {
      add(it.goalId ? byId.value.get(it.goalId) : undefined, 'goal')
      for (const p of it.prereqIds ?? []) add(byId.value.get(p), 'prereq')
      for (const t of tasks.value) if (t.prereqIds?.includes(id)) add(t, 'unlocks')
    }
    if (it.type === 'goal') {
      add(it.parentId ? byId.value.get(it.parentId) : undefined, 'parent')
      for (const g of goals.value) if (g.parentId === id) add(g, 'child')
      for (const t of tasks.value) if (t.goalId === id) add(t, 'task')
    }
    return [...out.values()]
  }

  const checkinSets = computed(() => {
    const m = new Map<string, Set<string>>()
    for (const c of checkins.value) (m.get(c.habitId) ?? m.set(c.habitId, new Set()).get(c.habitId)!).add(c.date)
    return m
  })
  const doneDates = (habitId: string) => checkinSets.value.get(habitId) ?? new Set<string>()

  const xp = computed(() => xpEntries(items.value, checkins.value, moods.value))
  const totals = computed(() => attrTotals(xp.value, profile.value.baseLevels))
  const totalXp = computed(() => xp.value.reduce((s, e) => s + e.xp, 0))
  const level = computed(() => characterLevel(totalXp.value))
  const moodOf = (date: string) => moods.value.find((m) => m.date === date)

  function apply(s: Snapshot) {
    items.value = s.items
    links.value = s.links
    checkins.value = s.checkins
    moods.value = s.moods
    profile.value = s.profile ?? {}
  }

  async function load() {
    try {
      apply(await api.state())
      meta.value = await readMeta()
      loaded.value = true
      loadError.value = ''
    } catch (e) {
      loadError.value = (e as Error).message
    }
  }

  let started = false
  /** First load: also listens for changes made in other tabs and checks storage protection. */
  async function init() {
    if (started) return
    started = true
    onExternalChange(() => load())
    await load()
    persisted.value = await isPersisted()
  }

  /** Asks the browser to protect our data from automatic cleanup. Called after the first real edit. */
  async function protect() {
    if (persisted.value) return true
    persisted.value = await requestPersistence()
    return persisted.value
  }

  /** Downloads a JSON backup and remembers when, for the backup reminder. */
  async function exportBackup() {
    const snap = await api.export()
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ngnl-backup-${today()}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    const t = new Date().toISOString()
    meta.value = { ...meta.value, lastBackupAt: t }
    await patchMeta({ lastBackupAt: t })
  }

  async function snoozeBackup() {
    const t = new Date().toISOString()
    meta.value = { ...meta.value, remindedAt: t }
    await patchMeta({ remindedAt: t })
  }

  /** Runs a save; on failure reloads the saved state and reports the error. */
  async function sync<T>(p: Promise<T>): Promise<T | undefined> {
    try {
      return await p
    } catch (e) {
      useUi().toast(`保存失败：${(e as Error).message}`, 'error')
      await load()
    }
  }

  // ---- XP feedback: compare level/attr totals before and after a change ----
  function withXpFeedback(fn: () => void) {
    const beforeLevel = level.value.level
    const before = { ...totals.value }
    fn()
    const ui = useUi()
    let i = 0
    for (const [k, v] of Object.entries(totals.value) as [Attr, number][]) {
      const d = v - before[k]
      if (d <= 0) continue
      ui.xp(k, d, i++)
      const was = attrLevel(before[k]).level
      const now = attrLevel(v).level
      if (now > was) ui.toast(`${attrOf(k).label} 升到 Lv.${now}`, 'level', attrOf(k).color, k)
    }
    const lv = level.value.level
    if (lv > beforeLevel) {
      const rank = rankOf(lv).title
      ui.levelUp = { level: lv, rank: rank !== rankOf(beforeLevel).title ? rank : undefined }
    }
  }

  async function create<T extends ItemType>(type: T, data: Partial<ItemOf<T>> = {}): Promise<ItemOf<T> | undefined> {
    const item = await sync(api.create(type, { ...DEFAULTS[type], ...data }))
    if (item) items.value.push(item)
    if (!persisted.value) void protect()
    return item as ItemOf<T> | undefined
  }

  async function update<T extends Item>(id: string, patch: Patch<T>) {
    const i = items.value.findIndex((x) => x.id === id)
    if (i < 0) return
    const cur = items.value[i] as T
    const next = { ...cur } as Record<string, unknown>
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) delete next[k]
      else next[k] = v
    }
    // Finishing a task stamps doneAt so XP lands on the right day.
    if (cur.type === 'task' && 'status' in patch) {
      if (patch.status === 'done' && cur.status !== 'done') next.doneAt = today()
      if (patch.status !== 'done') delete next.doneAt
    }
    withXpFeedback(() => {
      items.value[i] = { ...next, updatedAt: new Date().toISOString() } as unknown as Item
    })
    const wire: Record<string, unknown> = { ...patch }
    if (cur.type === 'task' && 'status' in patch) wire.doneAt = next.doneAt ?? null
    await sync(api.update(id, wire))
  }

  async function remove(id: string) {
    const item = byId.value.get(id)
    items.value = items.value.filter((x) => x.id !== id)
    links.value = links.value.filter(([a, b]) => a !== id && b !== id)
    checkins.value = checkins.value.filter((c) => c.habitId !== id)
    // Detach references from other items so nothing points at a ghost.
    for (const it of items.value) {
      if (it.type === 'task') {
        if (it.goalId === id) update<Task>(it.id, { goalId: null })
        if (it.prereqIds?.includes(id)) update<Task>(it.id, { prereqIds: it.prereqIds.filter((x) => x !== id) })
      }
      if (it.type === 'goal' && it.parentId === id) update<Goal>(it.id, { parentId: item?.type === 'goal' ? (item.parentId ?? null) : null })
    }
    await sync(api.remove(id))
  }

  async function link(a: string, b: string) {
    if (a === b || linkMap.value.get(a)?.has(b)) return
    links.value.push([a, b])
    await sync(api.link(a, b))
  }

  async function unlink(a: string, b: string) {
    links.value = links.value.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a)))
    await sync(api.unlink(a, b))
  }

  async function toggleCheckin(habitId: string, date = today()) {
    const done = doneDates(habitId).has(date)
    withXpFeedback(() => {
      if (done) checkins.value = checkins.value.filter((c) => !(c.habitId === habitId && c.date === date))
      else checkins.value.push({ habitId, date })
    })
    await sync(api.checkin(habitId, date, !done))
  }

  async function setMood(date: string, mood: number | null, note = '') {
    withXpFeedback(() => {
      moods.value = moods.value.filter((m) => m.date !== date)
      if (mood !== null) moods.value.push({ date, mood, note })
    })
    await sync(api.mood(date, mood, note))
  }

  /** Toggles "contacted on this day" (used by the quick buttons). Un-marking also drops that day's note. */
  async function contact(personId: string, date = today()) {
    const p = byId.value.get(personId) as Person | undefined
    if (!p) return
    if (p.contacts?.includes(date)) await removeContact(personId, date)
    else await update<Person>(personId, { contacts: [...(p.contacts ?? []), date] })
  }

  /** Records a contact on `date` with an optional note (replaces that day's note). */
  async function logContact(personId: string, date: string, note: string) {
    const p = byId.value.get(personId) as Person | undefined
    if (!p) return
    const contacts = p.contacts?.includes(date) ? [...p.contacts] : [...(p.contacts ?? []), date]
    const notes = { ...(p.contactNotes ?? {}) }
    if (note.trim()) notes[date] = note.trim()
    else delete notes[date]
    await update<Person>(personId, { contacts, contactNotes: Object.keys(notes).length ? notes : null })
  }

  async function removeContact(personId: string, date: string) {
    const p = byId.value.get(personId) as Person | undefined
    if (!p) return
    const notes = { ...(p.contactNotes ?? {}) }
    delete notes[date]
    await update<Person>(personId, {
      contacts: (p.contacts ?? []).filter((d) => d !== date),
      contactNotes: Object.keys(notes).length ? notes : null,
    })
  }

  async function saveProfile(p: Profile) {
    profile.value = { ...p }
    await sync(api.profile(p))
  }

  async function importSnapshot(s: unknown) {
    apply(await api.import(s))
    // The user restored from a file, so a backup of this exact data exists.
    const t = new Date().toISOString()
    meta.value = { ...meta.value, lastBackupAt: t }
    await patchMeta({ lastBackupAt: t })
    void protect()
  }

  /**
   * Deletes the save: everything becomes empty. Done as a "restore" of an empty
   * backup, so if sync is still on, the next sync clears the other devices too.
   */
  async function wipe() {
    apply(await api.import({ version: 1, items: [], links: [], checkins: [], moods: [], profile: {} }))
    await resetMeta()
    meta.value = {}
  }

  return {
    items, links, checkins, moods, profile, loaded, loadError, meta, persisted,
    byId, tasks, habits, goals, people, events, notes, linked, related, doneDates,
    xp, totals, totalXp, level, moodOf,
    init, load, protect, exportBackup, snoozeBackup, create, update, remove, link, unlink, toggleCheckin, setMood, contact, logContact, removeContact, saveProfile, importSnapshot, wipe,
  }
})

export type { Task, Habit, Goal, Person, LifeEvent, Note }
