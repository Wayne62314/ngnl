import { CalendarDays, Flag, Lightbulb, Newspaper, Repeat, Swords, User } from 'lucide-vue-next'
import type { Item } from './types'

export const itemIcon = (it: Pick<Item, 'type'> & { kind?: string }) => {
  switch (it.type) {
    case 'task':
      return Swords
    case 'habit':
      return Repeat
    case 'goal':
      return Flag
    case 'person':
      return User
    case 'event':
      return CalendarDays
    case 'note':
      return it.kind === 'intel' ? Newspaper : Lightbulb
  }
}

export const titleOf = (it: Item) => it.title?.trim() || '未命名'

/** Case-insensitive search over title, notes and tags; title matches rank first. */
export function search(items: Item[], q: string, limit = 30): Item[] {
  const s = q.trim().toLowerCase()
  if (!s) return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit)
  const scored: [number, Item][] = []
  for (const it of items) {
    const t = (it.title ?? '').toLowerCase()
    let score = t === s ? 0 : t.startsWith(s) ? 1 : t.includes(s) ? 2 : -1
    if (score < 0) {
      const extra = [it.notes, 'tags' in it ? it.tags?.join(' ') : '', 'traits' in it ? it.traits : '', 'relation' in it ? it.relation : '']
        .join(' ')
        .toLowerCase()
      if (extra.includes(s)) score = 3
    }
    if (score >= 0) scored.push([score, it])
  }
  return scored
    .sort((a, b) => a[0] - b[0] || b[1].updatedAt.localeCompare(a[1].updatedAt))
    .slice(0, limit)
    .map((x) => x[1])
}
