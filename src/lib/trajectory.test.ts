import { describe, expect, it } from 'vitest'
import { activeOn, dateAt, footprints, frac, lanesFor, placeOn, routeOf, spanOf, statusOf, timePoints } from './trajectory'
import type { LifeEvent, Segment } from './types'

const gz = { name: '赣州', lat: 25.9, lng: 114.9 }
const wh = { name: '武汉', lat: 30.6, lng: 114.3 }
const sz = { name: '深圳', lat: 22.6, lng: 114.1 }
const hz = { name: '杭州', lat: 30.3, lng: 120.2 }
const seg = (x: Partial<Segment>): Segment => ({ id: Math.random().toString(36), type: 'segment', title: 's', lane: 'home', start: '2020-01-01', createdAt: '', updatedAt: '', ...x })
const ev = (x: Partial<LifeEvent>): LifeEvent => ({ id: Math.random().toString(36), type: 'event', title: 'e', date: '2020-01-01', kind: 'event', createdAt: '', updatedAt: '', ...x })
const T = '2026-11-09'

const segs = [
  seg({ title: '老家', start: '1998-01-01', end: '2015-08-31', place: gz }),
  seg({ title: '大学', start: '2015-09-01', end: '2019-06-30', place: wh }),
  seg({ title: '深圳', start: '2019-07-01', place: sz }),
  seg({ title: '杭州？', start: '2027-06-01', place: hz }),
  seg({ lane: 'work', title: 'B 公司', start: '2022-03-01' }),
]

describe('trajectory', () => {
  it('knows past, current and planned', () => {
    expect(statusOf(segs[0], T)).toBe('past')
    expect(statusOf(segs[2], T)).toBe('current')
    expect(statusOf(segs[3], T)).toBe('planned')
    expect(activeOn(segs[2], '2030-01-01')).toBe(true)
    expect(activeOn(segs[1], '2019-07-01')).toBe(false)
  })

  it('finds where you were on a date', () => {
    expect(placeOn('2010-05-01', segs, [])?.name).toBe('赣州')
    expect(placeOn('2017-05-01', segs, [])?.name).toBe('武汉')
    expect(placeOn('2026-11-09', segs, [])?.name).toBe('深圳')
    // A planned move takes over once its date comes.
    expect(placeOn('2027-07-01', segs, [])?.name).toBe('杭州')
    // No segment then: fall back to the latest experience with a place.
    expect(placeOn('1990-01-01', [], [ev({ date: '1989-01-01', place: wh })])?.name).toBe('武汉')
  })

  it('orders the route and merges repeats', () => {
    const route = routeOf(segs, [ev({ date: '2020-05-01', place: sz })], T)
    expect(route.map((r) => r.place.name)).toEqual(['赣州', '武汉', '深圳', '杭州'])
    expect(route.at(-1)!.planned).toBe(true)
  })

  it('maps dates onto the scrubber and back', () => {
    const span = spanOf(segs, [], T)
    expect(span.from).toBe('1998-01-01')
    expect(span.to).toBe('2029-01-01')
    expect(dateAt(frac('2019-07-01', span), span)).toBe('2019-07-01')
    expect(frac('1900-01-01', span)).toBe(0)
  })

  it('lists time points, tracks and footprints', () => {
    const pts = timePoints(segs, [ev({ date: '2021-04-10', title: '认识林夏', kind: 'event' })], lanesFor())
    expect(pts[0].date).toBe('1998-01-01')
    expect(pts.some((p) => p.label === '认识林夏')).toBe(true)
    expect(lanesFor(['宠物'], [seg({ lane: '学业' })]).map((l) => l.key).slice(-2)).toEqual(['宠物', '学业'])
    const fp = footprints(segs, [])
    expect(fp.map((f) => f.place.name)).toEqual(['赣州', '武汉', '深圳', '杭州'])
  })
})
