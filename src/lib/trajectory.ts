import { addDays } from './dates'
import type { LifeEvent, Place, Segment } from './types'

export interface Lane {
  key: string
  label: string
  color: string
}
export const BUILTIN_LANES: Lane[] = [
  { key: 'home', label: '居住', color: 'var(--attr-mind)' },
  { key: 'work', label: '工作学业', color: 'var(--attr-career)' },
  { key: 'love', label: '感情', color: 'var(--attr-social)' },
  { key: 'health', label: '健康', color: 'var(--attr-body)' },
  { key: 'money', label: '财务', color: 'var(--gold)' },
]
const CUSTOM_COLORS = ['var(--attr-spirit)', 'var(--attr-craft)', 'var(--text-2)']

/** Built-in tracks plus the ones the user added (and any track a segment uses that isn't listed). */
export function lanesFor(custom: string[] = [], segments: Segment[] = []): Lane[] {
  const keys = new Set(BUILTIN_LANES.map((l) => l.key))
  const extra = [...custom]
  for (const s of segments) if (!keys.has(s.lane) && !extra.includes(s.lane)) extra.push(s.lane)
  return [...BUILTIN_LANES, ...extra.map((k, i) => ({ key: k, label: k, color: CUSTOM_COLORS[i % CUSTOM_COLORS.length] }))]
}
export const laneOf = (key: string, lanes: Lane[]) => lanes.find((l) => l.key === key) ?? { key, label: key, color: 'var(--text-2)' }

export type SegStatus = 'past' | 'current' | 'planned'
/** A segment is a plan if it hasn't started yet; current if today falls inside it. */
export function statusOf(s: Segment, today: string): SegStatus {
  if (s.start > today) return 'planned'
  if (s.end && s.end < today) return 'past'
  return 'current'
}

/** Is the segment active on `date`? An open end means "still going" (up to today, or forever for plans). */
export const activeOn = (s: Segment, date: string) => s.start <= date && (!s.end || s.end >= date)

/** Time span to draw: from the earliest record to two years ahead of the latest of today / plans. */
export function spanOf(segments: Segment[], events: LifeEvent[], today: string): { from: string; to: string } {
  const starts = [...segments.map((s) => s.start), ...events.map((e) => e.date)].filter(Boolean).sort()
  const ends = [...segments.map((s) => s.end ?? s.start), today].sort()
  const from = starts[0] && starts[0] < today ? starts[0].slice(0, 4) + '-01-01' : addDays(today, -365 * 3).slice(0, 4) + '-01-01'
  const last = ends.at(-1)!
  const to = String(Number(last.slice(0, 4)) + 2) + '-01-01'
  return { from, to }
}

/** Position of a date inside the span, 0…1. */
export function frac(date: string, span: { from: string; to: string }): number {
  const t = (d: string) => new Date(d + 'T00:00:00').getTime()
  return Math.min(1, Math.max(0, (t(date) - t(span.from)) / (t(span.to) - t(span.from))))
}
/** The date at a position 0…1 inside the span. */
export function dateAt(f: number, span: { from: string; to: string }): string {
  const a = new Date(span.from + 'T00:00:00').getTime()
  const b = new Date(span.to + 'T00:00:00').getTime()
  const d = new Date(a + (b - a) * Math.min(1, Math.max(0, f)))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface TimePoint {
  date: string
  label: string
  color: string
  kind: 'start' | 'end' | 'event' | 'decision'
  id: string
}
/** Every moment that has a record: segments starting or ending, and experiences. */
export function timePoints(segments: Segment[], events: LifeEvent[], lanes: Lane[]): TimePoint[] {
  const out: TimePoint[] = []
  for (const s of segments) {
    const lane = laneOf(s.lane, lanes)
    out.push({ date: s.start, label: `${lane.label}：${s.title || '未命名'} 开始`, color: lane.color, kind: 'start', id: s.id })
    if (s.end) out.push({ date: s.end, label: `${lane.label}：${s.title || '未命名'} 结束`, color: lane.color, kind: 'end', id: s.id })
  }
  for (const e of events) out.push({ date: e.date, label: e.title || '经历', color: e.kind === 'decision' ? 'var(--attr-career)' : 'var(--text)', kind: e.kind === 'decision' ? 'decision' : 'event', id: e.id })
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Where you were on a date: the place of the home-track segment then, else of any active segment, else the latest experience with a place. */
export function placeOn(date: string, segments: Segment[], events: LifeEvent[]): Place | undefined {
  const active = segments.filter((s) => s.place && activeOn(s, date)).sort((a, b) => b.start.localeCompare(a.start))
  const home = active.find((s) => s.lane === 'home')
  if (home) return home.place
  if (active[0]) return active[0].place
  return events.filter((e) => e.place && e.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0]?.place
}

export interface RouteStop {
  place: Place
  from: string
  planned: boolean
}
/**
 * The route of your life: where you lived, in order (home track only, so trips
 * and one-off experiences stay as dots instead of criss-crossing the map).
 * With no home track yet, any segment with a place is used.
 */
export function routeOf(segments: Segment[], _events: LifeEvent[], today: string): RouteStop[] {
  const placed = segments.filter((s) => s.place)
  const home = placed.filter((s) => s.lane === 'home')
  const stops = (home.length ? home : placed)
    .map((s) => ({ place: s.place!, from: s.start, planned: s.start > today }))
    .sort((a, b) => a.from.localeCompare(b.from))
  const out: RouteStop[] = []
  for (const s of stops) if (out.at(-1)?.place.name !== s.place.name) out.push(s)
  return out
}

/** Footprints: every place, with what happened there and when. */
export function footprints(segments: Segment[], events: LifeEvent[], today = '9999-12-31') {
  const m = new Map<string, { place: Place; from: string; to: string; segments: Segment[]; events: LifeEvent[] }>()
  const add = (p: Place, d1: string, d2: string) => {
    const k = p.name
    const cur = m.get(k) ?? { place: p, from: d1, to: d2, segments: [], events: [] }
    if (d1 < cur.from) cur.from = d1
    if (d2 > cur.to) cur.to = d2
    m.set(k, cur)
    return cur
  }
  // An open segment that has started runs until today (shown as "至今").
  for (const s of segments) if (s.place) add(s.place, s.start, s.end ?? (s.start <= today ? today : s.start)).segments.push(s)
  for (const e of events) if (e.place) add(e.place, e.date, e.date).events.push(e)
  return [...m.values()].sort((a, b) => a.from.localeCompare(b.from))
}
