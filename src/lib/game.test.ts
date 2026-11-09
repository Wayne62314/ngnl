import { describe, expect, it } from 'vitest'
import { addDays, weekday } from './dates'
import { attrTotals, bestStreak, characterLevel, contactOverdue, goalProgress, isLocked, levelFor, streak, taskBucket, xpEntries } from './game'
import type { Goal, Habit, Item, Person, Task } from './types'

const base = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', title: 'x' }
const task = (p: Partial<Task>): Task => ({ ...base, id: 't' + Math.random(), type: 'task', status: 'todo', attr: 'mind', difficulty: 1, ...p })
const habit = (days: number[]): Habit => ({ ...base, id: 'h', type: 'habit', attr: 'body', days })

describe('levels', () => {
  it('starts at level 1 and rolls over exactly at the threshold', () => {
    expect(levelFor(0, 40, 20)).toMatchObject({ level: 1, into: 0, need: 60 })
    expect(levelFor(59, 40, 20).level).toBe(1)
    expect(levelFor(60, 40, 20)).toMatchObject({ level: 2, into: 0, need: 80 })
    expect(characterLevel(60 + 80 + 5)).toMatchObject({ level: 3, into: 5 })
  })
})

describe('xp', () => {
  it('counts done tasks by difficulty, habit checkins, contacts and moods', () => {
    const h = habit([0, 1, 2, 3, 4, 5, 6])
    const items: Item[] = [
      task({ status: 'done', difficulty: 3, attr: 'craft', doneAt: '2026-02-01' }),
      task({ status: 'todo', difficulty: 3 }),
      task({ status: 'dropped', difficulty: 2 }),
      h,
      { ...base, id: 'p', type: 'person', closeness: 3, contacts: ['2026-02-01', '2026-02-01', '2026-02-02'] },
    ]
    const t = attrTotals(xpEntries(items, [{ habitId: 'h', date: '2026-02-01' }, { habitId: 'gone', date: '2026-02-01' }], [{ date: '2026-02-01', mood: 4, note: '' }]))
    expect(t).toEqual({ mind: 0, body: 5, craft: 50, social: 10, career: 0, spirit: 2 })
  })
})

describe('streak', () => {
  const today = '2026-11-09' // a Monday
  it('skips unscheduled days and survives an unfinished today', () => {
    expect(weekday(today)).toBe(1)
    const h = habit([1, 3, 5]) // Mon, Wed, Fri
    const done = new Set(['2026-11-06', '2026-11-04', '2026-11-02'])
    expect(streak(h, done, today)).toBe(3)
    done.add(today)
    expect(streak(h, done, today)).toBe(4)
  })
  it('breaks on a missed scheduled day', () => {
    const h = habit([0, 1, 2, 3, 4, 5, 6])
    const done = new Set([today, addDays(today, -1), addDays(today, -3)])
    expect(streak(h, done, today)).toBe(2)
    expect(bestStreak(h, done)).toBe(2)
  })
  it('is zero with no schedule', () => {
    expect(streak(habit([]), new Set([today]), today)).toBe(0)
  })
})

describe('tasks', () => {
  const today = '2026-11-09'
  it('buckets tasks', () => {
    expect(taskBucket(task({ due: '2026-11-08' }), today)).toBe('overdue')
    expect(taskBucket(task({ due: today }), today)).toBe('today')
    expect(taskBucket(task({ status: 'doing' }), today)).toBe('doing')
    expect(taskBucket(task({ due: '2026-12-01' }), today)).toBe('upcoming')
    expect(taskBucket(task({}), today)).toBe('someday')
    expect(taskBucket(task({ status: 'done', due: '2026-01-01' }), today)).toBe('closed')
  })
  it('locks until prerequisites are done', () => {
    const a = task({ id: 'a' })
    const b = task({ prereqIds: ['a', 'missing'] })
    const byId = new Map<string, Item>([['a', a]])
    expect(isLocked(b, byId)).toBe(true)
    a.status = 'done'
    expect(isLocked(b, byId)).toBe(false)
  })
})

describe('goals', () => {
  it('rolls up descendant tasks and ignores dropped ones', () => {
    const g = (id: string, parentId?: string): Goal => ({ ...base, id, type: 'goal', status: 'todo', parentId })
    const goals = [g('root'), g('a', 'root'), g('b', 'a')]
    const tasks = [task({ goalId: 'root', status: 'done' }), task({ goalId: 'b' }), task({ goalId: 'b', status: 'dropped' })]
    expect(goalProgress(goals[0], goals, tasks)).toEqual({ done: 1, total: 2 })
  })
})

describe('contact reminders', () => {
  const p = (closeness: number, contacts?: string[]): Person => ({ ...base, id: 'p', type: 'person', closeness, contacts })
  it('uses the closeness interval', () => {
    expect(contactOverdue(p(5, ['2026-11-01']), '2026-11-09')).toBe(1)
    expect(contactOverdue(p(5, ['2026-11-05']), '2026-11-09')).toBeNull()
    expect(contactOverdue(p(1, ['2020-01-01']), '2026-11-09')).toBeNull()
  })
})
