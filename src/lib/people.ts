import { addDays, diffDays, fromKey } from './dates'
import type { Person } from './types'

/** Broad circles used to colour and filter the relationship map. */
export type Group = 'family' | 'friend' | 'work' | 'other'
export const GROUPS: { key: Group; label: string; color: string }[] = [
  { key: 'family', label: '家人', color: 'var(--attr-social)' },
  { key: 'friend', label: '朋友', color: 'var(--gold)' },
  { key: 'work', label: '同学同事', color: 'var(--attr-mind)' },
  { key: 'other', label: '其他', color: 'var(--attr-spirit)' },
]
export const groupMeta = (g: Group) => GROUPS.find((x) => x.key === g)!

const FAMILY = /家|父|母|爸|妈|兄|弟|姐|妹|哥|爷|奶|姥|外公|外婆|叔|姨|舅|姑|伯|表|堂|伴侣|老公|老婆|丈夫|妻|对象|恋人|孩子|儿|女儿/
const FRIEND = /友|闺蜜|兄弟|发小|死党|哥们/
const WORK = /同学|同事|导师|老师|前辈|后辈|上司|领导|老板|下属|客户|合作|室友|校友|学长|学姐|学弟|学妹|师/

/** Guesses the circle from the free-text relation, e.g. "大学同学" → work/school. */
export function groupOf(p: Pick<Person, 'relation'>): Group {
  const r = p.relation?.trim() ?? ''
  if (!r) return 'other'
  // "兄弟" can mean a close friend; family words win only when no friend word is present.
  if (FRIEND.test(r) && !/亲兄弟|姐妹/.test(r)) return 'friend'
  if (FAMILY.test(r)) return 'family'
  if (WORK.test(r)) return 'work'
  return 'other'
}

/** Birthday is stored as "MM-DD" or "YYYY-MM-DD" (year optional). */
export function parseBirthday(b?: string): { y?: number; m: number; d: number } | undefined {
  const m = b?.match(/^(?:(\d{4})-)?(\d{2})-(\d{2})$/)
  if (!m) return undefined
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined
  return { y: m[1] ? Number(m[1]) : undefined, m: mo, d }
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/** The date (YYYY-MM-DD) of the next birthday on or after `today`. Feb 29 falls on Feb 28 in non-leap years. */
export function nextBirthday(p: Pick<Person, 'birthday'>, today: string): string | undefined {
  const b = parseBirthday(p.birthday)
  if (!b) return undefined
  const ty = fromKey(today).getFullYear()
  for (const y of [ty, ty + 1]) {
    const d = b.m === 2 && b.d === 29 && !isLeap(y) ? 28 : b.d
    const k = `${y}-${String(b.m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (k >= today) return k
  }
}

/** Days until the next birthday (0 = today), or null if no birthday is set or they're no longer around. */
export function daysToBirthday(p: Pick<Person, 'birthday'> & { status?: Person['status'] }, today: string): number | null {
  if (p.status) return null
  const n = nextBirthday(p, today)
  return n ? diffDays(today, n) : null
}

/** Age they turn on their next birthday, if the birth year is known. */
export function turningAge(p: Pick<Person, 'birthday'>, today: string): number | undefined {
  const b = parseBirthday(p.birthday)
  const n = nextBirthday(p, today)
  return b?.y && n ? fromKey(n).getFullYear() - b.y : undefined
}

export const PERSON_STATUS = {
  gone: { label: '已离开', hint: '断了联系，或者不想再联系' },
  deceased: { label: '已故', hint: '已经离开人世' },
} as const
/** "已故 · 2026年8月18日" / "已离开". */
export function statusLabel(p: Pick<Person, 'status' | 'statusDate'>): string | undefined {
  if (!p.status) return undefined
  return PERSON_STATUS[p.status].label + (p.statusDate ? ` · ${p.statusDate.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, '$1年$2月$3日')}` : '')
}

export function birthdayLabel(b?: string): string {
  const p = parseBirthday(b)
  if (!p) return ''
  return `${p.y ? `${p.y}年` : ''}${p.m}月${p.d}日`
}

/** Contact history, newest first, with the note written for that day (if any). */
export function contactLog(p: Person): { date: string; note: string }[] {
  return [...new Set(p.contacts ?? [])].sort().reverse().map((date) => ({ date, note: p.contactNotes?.[date] ?? '' }))
}

/** Number of contacts in the 30 days up to and including `today`. */
export const contactsLast30 = (p: Person, today: string) => {
  const from = addDays(today, -29)
  return (p.contacts ?? []).filter((d) => d >= from && d <= today).length
}
