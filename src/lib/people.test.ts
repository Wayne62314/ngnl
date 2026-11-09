import { describe, expect, it } from 'vitest'
import { contactLog, daysToBirthday, groupOf, nextBirthday, parseBirthday, statusLabel, turningAge } from './people'
import { contactOverdue } from './game'
import type { Person } from './types'

const person = (x: Partial<Person>): Person => ({ id: 'p', type: 'person', title: 'A', closeness: 3, createdAt: '2026-01-01T00:00:00Z', updatedAt: '', ...x })

describe('people', () => {
  it('groups relations into circles', () => {
    expect(groupOf({ relation: '家人' })).toBe('family')
    expect(groupOf({ relation: '妈妈' })).toBe('family')
    expect(groupOf({ relation: '大学同学' })).toBe('work')
    expect(groupOf({ relation: '导师' })).toBe('work')
    expect(groupOf({ relation: '挚友' })).toBe('friend')
    expect(groupOf({ relation: '好兄弟' })).toBe('friend')
    expect(groupOf({ relation: '' })).toBe('other')
    expect(groupOf({ relation: '邻居' })).toBe('other')
  })

  it('parses birthdays with or without a year', () => {
    expect(parseBirthday('03-15')).toEqual({ y: undefined, m: 3, d: 15 })
    expect(parseBirthday('1998-03-15')).toEqual({ y: 1998, m: 3, d: 15 })
    expect(parseBirthday('13-01')).toBeUndefined()
    expect(parseBirthday('')).toBeUndefined()
  })

  it('counts down to the next birthday across the year end and leap days', () => {
    expect(daysToBirthday({ birthday: '11-09' }, '2026-11-09')).toBe(0)
    expect(daysToBirthday({ birthday: '11-10' }, '2026-11-09')).toBe(1)
    expect(nextBirthday({ birthday: '01-02' }, '2026-12-30')).toBe('2027-01-02')
    expect(nextBirthday({ birthday: '2000-02-29' }, '2027-01-01')).toBe('2027-02-28')
    expect(nextBirthday({ birthday: '2000-02-29' }, '2028-01-01')).toBe('2028-02-29')
    expect(daysToBirthday({}, '2026-11-09')).toBeNull()
    expect(turningAge({ birthday: '1998-12-01' }, '2026-11-09')).toBe(28)
    expect(turningAge({ birthday: '12-01' }, '2026-11-09')).toBeUndefined()
  })

  it('lists contacts newest first with notes', () => {
    const p = person({ contacts: ['2026-11-01', '2026-11-08', '2026-11-01'], contactNotes: { '2026-11-08': '吃饭' } })
    expect(contactLog(p)).toEqual([
      { date: '2026-11-08', note: '吃饭' },
      { date: '2026-11-01', note: '' },
    ])
  })

  it('stops reminding about people who are gone or have died', () => {
    const p = person({ closeness: 5, birthday: '11-20', contacts: ['2026-01-02'] })
    expect(contactOverdue(p, '2026-11-09')).not.toBeNull()
    expect(daysToBirthday(p, '2026-11-09')).toBe(11)
    for (const status of ['gone', 'deceased'] as const) {
      expect(contactOverdue({ ...p, status }, '2026-11-09')).toBeNull()
      expect(daysToBirthday({ ...p, status }, '2026-11-09')).toBeNull()
    }
    expect(statusLabel({ status: 'deceased', statusDate: '2026-08-18' })).toBe('已故 · 2026年8月18日')
    expect(statusLabel({ status: 'gone' })).toBe('已离开')
    expect(statusLabel({})).toBeUndefined()
  })
})
