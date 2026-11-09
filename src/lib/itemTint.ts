import { groupMeta, groupOf } from './people'
import { attrOf, type Item } from './types'

/** One colour per item, used by link badges: people by circle, tasks/habits by attribute. */
export function tintOf(it: Item): string {
  switch (it.type) {
    case 'person':
      return groupMeta(groupOf(it)).color
    case 'task':
    case 'habit':
      return attrOf(it.attr).color
    case 'goal':
      return 'var(--gold)'
    case 'event':
      return 'var(--text-2)'
    case 'note':
      return it.kind === 'intel' ? 'var(--attr-mind)' : 'var(--attr-spirit)'
  }
}
