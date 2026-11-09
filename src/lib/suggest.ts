/**
 * Implicit link suggestions: when one item's text names another item
 * ("和林夏去厦门旅行" names the person 林夏) but the two aren't connected yet,
 * suggest connecting them. Nothing is linked without the user saying yes.
 */
import { edgesOf } from './graph'
import type { Item, ItemType } from './types'

export interface Suggestion {
  /** The item whose text mentions the other. */
  from: Item
  /** The item being mentioned. */
  to: Item
  /** Where the mention is, e.g. "备注". */
  where: string
  /** Text around the mention, with the mention marked by [ ]. */
  before: string
  match: string
  after: string
}

/** Items that can be mentioned by name. Tasks and ledger lines are too generic. */
const TARGET_TYPES: ItemType[] = ['person', 'goal', 'habit', 'asset', 'event', 'note', 'segment']
const SOURCE_SKIP: ItemType[] = ['field', 'sim']

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** The searchable texts of an item, with a label for where each comes from. */
export function textsOf(it: Item): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [{ where: '标题', text: it.title ?? '' }, { where: '备注', text: it.notes ?? '' }]
  if (it.type === 'person') {
    out.push({ where: '印象', text: it.traits ?? '' }, { where: '怎么认识的', text: it.met ?? '' })
    for (const [d, note] of Object.entries(it.contactNotes ?? {})) out.push({ where: `${d} 的往来`, text: note })
  }
  if (it.type === 'event') out.push({ where: '选项', text: it.options ?? '' }, { where: '选择', text: it.choice ?? '' }, { where: '原因', text: it.reason ?? '' })
  if (it.type === 'note') out.push({ where: '来源', text: it.source ?? '' })
  for (const v of Object.values(it.fields ?? {})) if (typeof v === 'string' && !/^\d{4}-\d\d-\d\d$/.test(v)) out.push({ where: '字段', text: v })
  return out.filter((x) => x.text.trim())
}

const isWordChar = (c: string | undefined) => !!c && /[A-Za-z0-9_]/.test(c)
const ascii = (s: string) => /^[\x20-\x7e]+$/.test(s)

/** Every non-overlapping mention of a known name in a text, longest names first. */
export function mentions(text: string, names: { name: string; item: Item }[], self?: string): { index: number; name: string; item: Item }[] {
  const hits: { index: number; name: string; item: Item }[] = []
  const taken: [number, number][] = []
  const lower = text.toLowerCase()
  for (const n of names) {
    // An item's own name never hides the names inside it.
    if (n.item.id === self) continue
    const needle = n.name.toLowerCase()
    for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, i + 1)) {
      const j = i + needle.length
      // Latin names must be whole words: "Ann" is not in "Annual".
      if (ascii(n.name) && (isWordChar(text[i - 1]) || isWordChar(text[j]))) continue
      if (taken.some(([a, b]) => i < b && j > a)) continue
      taken.push([i, j])
      hits.push({ index: i, name: text.slice(i, j), item: n.item })
    }
  }
  return hits.sort((a, b) => a.index - b.index)
}

export function suggestLinks(items: Item[], links: [string, string][], dismissed: Iterable<string> = []): Suggestion[] {
  const skip = new Set(dismissed)
  for (const e of edgesOf(items, links)) skip.add(pairKey(e.a, e.b))

  // Names: at least 2 characters, and unique (two items called the same thing are ambiguous).
  const count = new Map<string, number>()
  const cands = items.filter((i) => TARGET_TYPES.includes(i.type) && (i.title ?? '').trim().length >= 2)
  for (const i of cands) count.set(i.title.trim().toLowerCase(), (count.get(i.title.trim().toLowerCase()) ?? 0) + 1)
  const names = cands
    .filter((i) => count.get(i.title.trim().toLowerCase()) === 1)
    .map((item) => ({ name: item.title.trim(), item }))
    .sort((a, b) => b.name.length - a.name.length)

  const out = new Map<string, Suggestion>()
  for (const it of items) {
    if (SOURCE_SKIP.includes(it.type)) continue
    for (const { where, text } of textsOf(it)) {
      for (const m of mentions(text, names, it.id)) {
        const key = pairKey(it.id, m.item.id)
        if (skip.has(key) || out.has(key)) continue
        const a = Math.max(0, m.index - 12)
        const b = m.index + m.name.length
        out.set(key, {
          from: it,
          to: m.item,
          where,
          before: (a > 0 ? '…' : '') + text.slice(a, m.index),
          match: m.name,
          after: text.slice(b, b + 12) + (b + 12 < text.length ? '…' : ''),
        })
      }
    }
  }
  // People first (they're what you most want connected), then by name.
  // Within that, stories (events, notes) before to-do lists.
  const rank = (s: Suggestion) => (s.to.type === 'person' || s.from.type === 'person' ? 0 : 2) + (s.from.type === 'task' ? 1 : 0)
  return [...out.values()].sort((x, y) => rank(x) - rank(y))
}

/** Suggestions that involve one item, in either direction. */
export const suggestionsFor = (all: Suggestion[], id: string) => all.filter((s) => s.from.id === id || s.to.id === id)
