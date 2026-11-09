/**
 * Game rules. Everything here is derived from the user's real records, so XP and
 * levels can never drift out of sync with the data they come from.
 */
import { addDays, diffDays, weekday } from './dates'
import { ATTRS, type Attr, type Checkin, type Goal, type Habit, type Item, type Mood, type Person, type Profile, type Task } from './types'

export const TASK_XP = { 1: 10, 2: 25, 3: 50 } as const
export const HABIT_XP = 5
export const CONTACT_XP = 5
export const MOOD_XP = 2

export interface XpEntry {
  attr: Attr
  xp: number
  date: string
}

/** Every XP-producing action, as a flat list. */
export function xpEntries(items: Item[], checkins: Checkin[], moods: Mood[]): XpEntry[] {
  const out: XpEntry[] = []
  const habits = new Map<string, Habit>()
  for (const it of items) {
    if (it.type === 'task' && it.status === 'done') {
      out.push({ attr: it.attr, xp: TASK_XP[it.difficulty] ?? 10, date: (it.doneAt ?? it.updatedAt).slice(0, 10) })
    } else if (it.type === 'habit') habits.set(it.id, it)
    else if (it.type === 'person') {
      for (const d of new Set(it.contacts ?? [])) out.push({ attr: 'social', xp: CONTACT_XP, date: d })
    }
  }
  for (const c of checkins) {
    const h = habits.get(c.habitId)
    if (h) out.push({ attr: h.attr, xp: HABIT_XP, date: c.date })
  }
  for (const m of moods) out.push({ attr: 'spirit', xp: MOOD_XP, date: m.date })
  return out
}

export interface LevelInfo {
  level: number
  /** XP earned inside the current level. */
  into: number
  /** XP needed to finish the current level. */
  need: number
  total: number
}

/**
 * Level curve: going from level L to L+1 costs cost(L) XP. Both curves grow
 * quadratically so levels keep meaning something after years of use: an
 * active user (~50 XP a day) reaches about Lv.28 after one year.
 */
export function levelFor(total: number, cost: (level: number) => number): LevelInfo {
  let level = 1
  let rest = total
  while (rest >= cost(level)) {
    rest -= cost(level)
    level++
  }
  return { level, into: rest, need: cost(level), total }
}

export const CHARACTER_COST = (l: number) => Math.round(30 + 20 * l + 1.5 * l * l)
export const ATTR_COST = (l: number) => Math.round(20 + 10 * l + 0.8 * l * l)
export const characterLevel = (xp: number) => levelFor(xp, CHARACTER_COST)

/** Rank titles unlocked by character level. A custom title in the profile overrides them. */
export const RANKS: { from: number; title: string }[] = [
  { from: 1, title: '见习冒险者' },
  { from: 5, title: '初级冒险者' },
  { from: 10, title: '熟练冒险者' },
  { from: 15, title: '资深冒险者' },
  { from: 22, title: '精英冒险者' },
  { from: 30, title: '人生大师' },
  { from: 40, title: '传奇' },
]
export function rankOf(level: number): { title: string; next?: { from: number; title: string } } {
  let i = 0
  while (i + 1 < RANKS.length && RANKS[i + 1].from <= level) i++
  return { title: RANKS[i].title, next: RANKS[i + 1] }
}

/** Longest run of consecutive days with any XP, ever. */
export function bestActiveStreak(entries: XpEntry[]): number {
  const days = [...new Set(entries.map((e) => e.date))].sort()
  let best = 0
  let run = 0
  for (let i = 0; i < days.length; i++) {
    run = i && addDays(days[i - 1], 1) === days[i] ? run + 1 : 1
    best = Math.max(best, run)
  }
  return best
}

/** Consecutive days with any XP, ending today (or yesterday, if today has nothing yet). */
export function activeStreak(entries: XpEntry[], today: string): number {
  const days = new Set(entries.map((e) => e.date))
  let d = days.has(today) ? today : addDays(today, -1)
  let n = 0
  while (days.has(d)) {
    n++
    d = addDays(d, -1)
  }
  return n
}
export const attrLevel = (xp: number) => levelFor(xp, ATTR_COST)

/** Attribute XP needed to go from Lv.1 to `level`. */
export function attrXpForLevel(level: number): number {
  let xp = 0
  for (let l = 1; l < level; l++) xp += ATTR_COST(l)
  return xp
}

export const MAX_BASE_LEVEL = 50

/**
 * Attribute XP from what you did, plus the starting levels you set for
 * yourself. Starting levels only lift the attributes; the character level
 * counts earned XP alone.
 */
export function attrTotals(entries: XpEntry[], base: Partial<Record<Attr, number>> = {}): Record<Attr, number> {
  const t = Object.fromEntries(ATTRS.map((a) => [a.key, attrXpForLevel(clampLevel(base[a.key]))])) as Record<Attr, number>
  for (const e of entries) t[e.attr] = (t[e.attr] ?? 0) + e.xp
  return t
}
export const clampLevel = (n: unknown) => Math.min(MAX_BASE_LEVEL, Math.max(1, Math.round(Number(n) || 1)))

export const isScheduled = (h: Habit, date: string) => h.days.includes(weekday(date))

/**
 * Consecutive scheduled days completed, counting back from `today`. If today is
 * scheduled but not done yet, the streak is still alive and counts from yesterday.
 * Unscheduled days are skipped and never break a streak.
 */
export function streak(h: Habit, done: Set<string>, today: string): number {
  if (!h.days.length) return 0
  let n = 0
  let d = today
  if (isScheduled(h, d) && !done.has(d)) d = addDays(d, -1)
  for (let guard = 0; guard < 3660; guard++) {
    if (isScheduled(h, d)) {
      if (!done.has(d)) break
      n++
    }
    d = addDays(d, -1)
  }
  return n
}

/** Longest run of completed scheduled days ever. */
export function bestStreak(h: Habit, done: Set<string>): number {
  if (!done.size || !h.days.length) return 0
  const sorted = [...done].sort()
  let best = 0
  let run = 0
  let d = sorted[0]
  const last = sorted[sorted.length - 1]
  while (d <= last) {
    if (isScheduled(h, d)) {
      if (done.has(d)) best = Math.max(best, ++run)
      else run = 0
    }
    d = addDays(d, 1)
  }
  return best
}

/** Suggested days between contacts, by closeness (1–5). 0 = no reminder. */
export const CONTACT_INTERVAL = [0, 0, 90, 30, 14, 7]

export const lastContact = (p: Person) => (p.contacts?.length ? [...p.contacts].sort().at(-1) : undefined)

/** Days overdue for contact, or null if not due. People never contacted count from when they were added. */
export function contactOverdue(p: Person, today: string): number | null {
  if (p.status) return null
  const interval = CONTACT_INTERVAL[p.closeness] ?? 0
  if (!interval) return null
  const since = lastContact(p) ?? p.createdAt.slice(0, 10)
  const over = diffDays(since, today) - interval
  return over >= 0 ? over : null
}

export type TaskBucket = 'overdue' | 'today' | 'doing' | 'upcoming' | 'someday' | 'closed'

export function taskBucket(t: Task, today: string): TaskBucket {
  if (t.status === 'done' || t.status === 'dropped') return 'closed'
  if (t.due && t.due < today) return 'overdue'
  if (t.due === today) return 'today'
  if (t.status === 'doing') return 'doing'
  return t.due ? 'upcoming' : 'someday'
}

/** A task is locked while any prerequisite is still open. */
export function isLocked(t: Task, byId: Map<string, Item>): boolean {
  return (t.prereqIds ?? []).some((id) => {
    const p = byId.get(id)
    return p?.type === 'task' && p.status !== 'done' && p.status !== 'dropped'
  })
}

/** Progress of a goal: its own tasks plus all descendant goals' tasks; done goals count as complete. */
export function goalProgress(goal: Goal, goals: Goal[], tasks: Task[]): { done: number; total: number } {
  let done = 0
  let total = 0
  const visit = (g: Goal, depth: number) => {
    if (depth > 50) return
    for (const t of tasks) {
      if (t.goalId !== g.id || t.status === 'dropped') continue
      total++
      if (t.status === 'done') done++
    }
    for (const c of goals) if (c.parentId === g.id) visit(c, depth + 1)
  }
  visit(goal, 0)
  return { done, total }
}

export const TIER_NAMES = ['铜', '银', '金', '钻石', '传说']

export interface Achievement {
  key: string
  name: string
  icon: string
  /** Thresholds for each tier, lowest first. */
  tiers: number[]
  value: number
  /** Number of tiers reached (0 = locked). */
  tier: number
  /** What reaching a threshold means, e.g. n => `完成 ${n} 个任务`. */
  desc: (n: number) => string
}

/** Tiered achievements, so there is always a next step even after years of use. */
export function achievements(data: {
  items: Item[]
  checkins: Checkin[]
  moods: Mood[]
  profile: Profile
  bestStreak: number
  xp: XpEntry[]
}): Achievement[] {
  const tasksDone = data.items.filter((i) => i.type === 'task' && i.status === 'done').length
  const people = data.items.filter((i): i is Person => i.type === 'person')
  const contacts = people.reduce((s, p) => s + new Set(p.contacts ?? []).size, 0)
  const events = data.items.filter((i) => i.type === 'event').length
  const ideas = data.items.filter((i) => i.type === 'note' && i.kind === 'idea').length
  const goals = data.items.filter((i): i is Goal => i.type === 'goal')
  const rootsDone = goals.filter((g) => !g.parentId && g.status === 'done').length
  const depth = (g: Goal, n = 1): number => {
    const kids = goals.filter((c) => c.parentId === g.id)
    return n > 20 || !kids.length ? n : Math.max(...kids.map((k) => depth(k, n + 1)))
  }
  const maxDepth = Math.max(0, ...goals.filter((g) => !g.parentId).map((g) => depth(g)))
  const p = data.profile
  const profileFilled = [p.name, p.background, p.strengths, p.weaknesses, p.interests].every((v) => v?.trim()) ? 1 : 0
  const level = characterLevel(data.xp.reduce((s, e) => s + e.xp, 0)).level

  const a = (key: string, name: string, icon: string, tiers: number[], value: number, desc: (n: number) => string): Achievement => ({
    key,
    name,
    icon,
    tiers,
    value,
    tier: tiers.filter((t) => value >= t).length,
    desc,
  })
  return [
    a('tasks', '行动派', '⚔️', [1, 10, 100, 500, 1000], tasksDone, (n) => `完成 ${n} 个任务`),
    a('streak', '习惯成自然', '🔥', [7, 30, 100, 365], data.bestStreak, (n) => `一个习惯连续坚持 ${n} 次`),
    a('checkins', '日积月累', '📅', [30, 300, 1000, 3000], data.checkins.length, (n) => `累计打卡 ${n} 次`),
    a('active', '从不缺席', '☀️', [7, 30, 100, 365, 1000], bestActiveStreak(data.xp), (n) => `连续 ${n} 天都有进展`),
    a('level', '成长', '⭐', [5, 10, 20, 30, 40], level, (n) => `角色达到 Lv.${n}`),
    a('mood', '心境记录者', '📔', [7, 100, 365, 1000], data.moods.length, (n) => `记录 ${n} 天心情`),
    a('people', '同行者', '🤝', [5, 20, 50], people.length, (n) => `记下 ${n} 位重要的人`),
    a('contacts', '常联系', '📞', [10, 100, 500, 1500], contacts, (n) => `联系 ${n} 次`),
    a('events', '回望', '🕰️', [10, 30, 100], events, (n) => `记录 ${n} 段经历`),
    a('ideas', '灵感迸发', '💡', [10, 50, 200], ideas, (n) => `收集 ${n} 条灵感`),
    a('vision', '远见', '🗺️', [3, 5], maxDepth, (n) => `愿景树达到 ${n} 层`),
    a('dream', '梦想成真', '👑', [1, 3, 5], rootsDone, (n) => `达成 ${n} 个终极目标`),
    a('self', '认识自己', '🪞', [1], profileFilled, () => '填完角色档案'),
  ]
}
