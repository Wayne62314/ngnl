/**
 * What an AI assistant can do through the MCP connection. Each tool runs here,
 * in the page, against the same store the UI uses — so changes show up live
 * and earn XP exactly like clicks do. The local MCP server only forwards calls.
 */
import type { useData } from '@/stores/data'
import { addDays, today, weekdayLabel } from './dates'
import {
  activeStreak,
  attrLevel,
  bestStreak,
  contactOverdue,
  goalProgress,
  isLocked,
  isScheduled,
  lastContact,
  rankOf,
  streak,
  taskBucket,
} from './game'
import { contactLog, daysToBirthday } from './people'
import { search as searchItems, titleOf } from './itemView'
import { ATTRS, MOODS, type Goal, type Item, type ItemType, type Person, type Task } from './types'

type Data = ReturnType<typeof useData>
type Args = Record<string, unknown>

export const WRITE_TOOLS = new Set(['create_item', 'update_item', 'checkin_habit', 'log_contact', 'link_items', 'set_mood'])

export const TOOL_LABELS: Record<string, string> = {
  get_overview: '查看总览',
  list_tasks: '查看任务',
  list_habits: '查看习惯',
  list_goals: '查看愿景树',
  list_people: '查看人物',
  get_activity: '查看最近活动',
  search: '搜索',
  get_item: '查看条目',
  create_item: '新建条目',
  update_item: '修改条目',
  checkin_habit: '习惯打卡',
  log_contact: '记录联系',
  link_items: '关联条目',
  set_mood: '记录心情',
}

const TYPES: ItemType[] = ['task', 'habit', 'goal', 'person', 'event', 'note']
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const dateArg = (v: unknown, name = 'date') => {
  if (v === undefined || v === null || v === '') return today()
  if (!isDate(v)) throw new Error(`${name} 需要 YYYY-MM-DD 格式`)
  return v
}
const ref = (it: Item) => ({ id: it.id, type: it.type, title: titleOf(it) })
const attrLabel = (k?: string) => ATTRS.find((a) => a.key === k)?.label

function need(data: Data, id: unknown, type?: ItemType): Item {
  const it = typeof id === 'string' ? data.byId.get(id) : undefined
  if (!it) throw new Error(`找不到条目 ${String(id)}`)
  if (type && it.type !== type) throw new Error(`${titleOf(it)} 不是${type}`)
  return it
}

/** Light validation so a confused model can't write nonsense into the user's data. */
function checkFields(type: ItemType, f: Args) {
  if ('attr' in f && f.attr !== null && !ATTRS.some((a) => a.key === f.attr)) throw new Error('attr 只能是 mind/body/craft/social/career/spirit')
  for (const k of ['due', 'date', 'doneAt']) if (k in f && f[k] !== null && !isDate(f[k])) throw new Error(`${k} 需要 YYYY-MM-DD 格式`)
  if (type === 'task' && 'difficulty' in f && ![1, 2, 3].includes(f.difficulty as number)) throw new Error('difficulty 只能是 1、2、3')
  if (type === 'task' && 'status' in f && !['todo', 'doing', 'done', 'dropped'].includes(f.status as string)) throw new Error('任务 status 只能是 todo/doing/done/dropped')
  if (type === 'goal' && 'status' in f && !['unknown', 'todo', 'doing', 'done'].includes(f.status as string)) throw new Error('目标 status 只能是 unknown/todo/doing/done')
  if (type === 'person' && 'closeness' in f && ![1, 2, 3, 4, 5].includes(f.closeness as number)) throw new Error('closeness 只能是 1-5')
  if (type === 'person' && 'birthday' in f && f.birthday !== null && !/^(\d{4}-)?\d{2}-\d{2}$/.test(String(f.birthday))) throw new Error('birthday 需要 MM-DD 或 YYYY-MM-DD')
  if (type === 'habit' && 'days' in f && !(Array.isArray(f.days) && f.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) throw new Error('days 是 0-6 的数组，0=周日')
  for (const k of ['goalId', 'parentId']) if (k in f && f[k] !== null && typeof f[k] !== 'string') throw new Error(`${k} 需要是条目 id`)
}

function taskView(data: Data, t: Task, d: string) {
  return {
    id: t.id,
    title: titleOf(t),
    status: t.status,
    bucket: taskBucket(t, d),
    attr: attrLabel(t.attr),
    difficulty: t.difficulty,
    due: t.due,
    doneAt: t.doneAt,
    goal: t.goalId ? titleOf(data.byId.get(t.goalId) ?? ({ title: '?' } as Item)) : undefined,
    locked: isLocked(t, data.byId) || undefined,
    notes: t.notes || undefined,
  }
}

export function runTool(data: Data, name: string, a: Args): unknown {
  const d = today()
  switch (name) {
    case 'get_overview': {
      const habits = data.habits.filter((h) => !h.archived && isScheduled(h, d))
      const open = data.tasks.filter((t) => taskBucket(t, d) !== 'closed')
      return {
        today: `${d} 星期${weekdayLabel(new Date().getDay())}`,
        name: data.profile.name,
        title: data.profile.title || rankOf(data.level.level).title,
        profile: data.profile,
        level: data.level.level,
        xp: { intoLevel: data.level.into, neededForNext: data.level.need, total: data.totalXp, today: data.xp.filter((e) => e.date === d).reduce((s, e) => s + e.xp, 0) },
        activeDaysInARow: activeStreak(data.xp, d),
        attributes: ATTRS.map((x) => ({ key: x.key, label: x.label, level: attrLevel(data.totals[x.key]).level, xp: data.totals[x.key] })),
        todayTasks: {
          overdue: open.filter((t) => taskBucket(t, d) === 'overdue').map((t) => ref(t)),
          today: open.filter((t) => ['today', 'doing'].includes(taskBucket(t, d))).map((t) => ref(t)),
          doneToday: data.tasks.filter((t) => t.status === 'done' && t.doneAt === d).map((t) => ref(t)),
        },
        todayHabits: habits.map((h) => ({ ...ref(h), done: data.doneDates(h.id).has(d), streak: streak(h, data.doneDates(h.id), d) })),
        moodToday: data.moodOf(d)?.mood,
        counts: Object.fromEntries(TYPES.map((t) => [t, data.items.filter((i) => i.type === t).length])),
        peopleToContact: data.people.filter((p) => contactOverdue(p, d) !== null).map((p) => ref(p)),
      }
    }

    case 'list_tasks': {
      const bucket = (a.bucket as string) || 'open'
      let goalIds: Set<string> | undefined
      if (a.goalId) {
        need(data, a.goalId, 'goal')
        goalIds = new Set([a.goalId as string])
        let grew = true
        while (grew) {
          grew = false
          for (const g of data.goals) if (g.parentId && goalIds.has(g.parentId) && !goalIds.has(g.id)) (goalIds.add(g.id), (grew = true))
        }
      }
      const list = data.tasks
        .filter((t) => {
          const b = taskBucket(t, d)
          if (bucket === 'open' && b === 'closed') return false
          if (!['open', 'all'].includes(bucket) && b !== bucket) return false
          return !goalIds || (t.goalId && goalIds.has(t.goalId))
        })
        .sort((x, y) => (x.due ?? '9999').localeCompare(y.due ?? '9999'))
      const limit = Math.min(Math.max(Number(a.limit) || 100, 1), 500)
      return { total: list.length, tasks: list.slice(0, limit).map((t) => taskView(data, t, d)) }
    }

    case 'list_habits': {
      return data.habits
        .filter((h) => a.includePaused || !h.archived)
        .map((h) => {
          const done = data.doneDates(h.id)
          let s = 0
          let n = 0
          for (let i = 1; i <= 28; i++) {
            const k = addDays(d, -i)
            if (k < h.createdAt.slice(0, 10)) break
            if (!isScheduled(h, k)) continue
            s++
            if (done.has(k)) n++
          }
          return {
            id: h.id,
            title: titleOf(h),
            attr: attrLabel(h.attr),
            days: h.days.map((x) => '周' + weekdayLabel(x)).join(''),
            paused: h.archived || undefined,
            doneToday: done.has(d),
            scheduledToday: isScheduled(h, d),
            streak: streak(h, done, d),
            bestStreak: bestStreak(h, done),
            last4WeeksRate: s ? Math.round((n / s) * 100) + '%' : null,
            recentCheckins: [...done].filter((k) => k >= addDays(d, -27)).sort(),
          }
        })
    }

    case 'list_goals': {
      const node = (g: Goal): unknown => {
        const p = goalProgress(g, data.goals, data.tasks)
        return {
          id: g.id,
          title: g.status === 'unknown' && !g.title?.trim() ? '？' : titleOf(g),
          status: g.status,
          progress: p.total ? `${p.done}/${p.total}` : undefined,
          notes: g.notes || undefined,
          steps: data.goals.filter((c) => c.parentId === g.id).map(node),
        }
      }
      const ids = new Set(data.goals.map((g) => g.id))
      return data.goals.filter((g) => !g.parentId || !ids.has(g.parentId)).map(node)
    }

    case 'list_people': {
      const recent = Math.min(Math.max(Number(a.recentContacts ?? 5), 0), 50)
      return data.people
        .slice()
        .sort((x, y) => y.closeness - x.closeness)
        .map((p) => ({
          id: p.id,
          name: titleOf(p),
          relation: p.relation,
          closeness: p.closeness,
          birthday: p.birthday,
          daysToBirthday: daysToBirthday(p, d) ?? undefined,
          met: p.met,
          traits: p.traits,
          notes: p.notes || undefined,
          lastContact: lastContact(p),
          shouldContact: contactOverdue(p, d) !== null,
          recentContacts: contactLog(p).slice(0, recent),
          knows: data.linked(p.id).filter((x) => x.type === 'person').map((x) => titleOf(x)),
        }))
    }

    case 'get_activity': {
      const days = Math.min(Math.max(Number(a.days) || 7, 1), 365)
      const from = addDays(d, -(days - 1))
      const out = []
      for (let k = from; k <= d; k = addDays(k, 1)) {
        const xp: Record<string, number> = {}
        for (const e of data.xp) if (e.date === k) xp[attrLabel(e.attr)!] = (xp[attrLabel(e.attr)!] ?? 0) + e.xp
        const m = data.moodOf(k)
        out.push({
          date: k,
          xp,
          tasksDone: data.tasks.filter((t) => t.status === 'done' && t.doneAt === k).map((t) => titleOf(t)),
          habitCheckins: data.checkins.filter((c) => c.date === k).map((c) => titleOf(data.byId.get(c.habitId) ?? ({} as Item))),
          mood: m ? `${m.mood} ${MOODS[m.mood - 1].label}` : undefined,
          moodNote: m?.note || undefined,
          contacted: data.people.filter((p) => p.contacts?.includes(k)).map((p) => ({ name: titleOf(p), note: p.contactNotes?.[k] })),
        })
      }
      return { from, to: d, days: out }
    }

    case 'search': {
      const pool = a.type ? data.items.filter((i) => i.type === a.type) : data.items
      return searchItems(pool, String(a.query ?? ''), 30).map(ref)
    }

    case 'get_item': {
      const it = need(data, a.id)
      return { item: it, linked: data.linked(it.id).map(ref) }
    }

    default:
      throw new Error(`未知工具：${name}`)
  }
}

/** Write tools are async because they go through the store's save path. */
export async function runWriteTool(data: Data, name: string, a: Args): Promise<unknown> {
  switch (name) {
    case 'create_item': {
      const type = a.type as ItemType
      if (!TYPES.includes(type)) throw new Error('type 只能是 task/habit/goal/person/event/note')
      const fields = { ...((a.fields as Args) ?? {}) }
      if (!String(fields.title ?? '').trim()) throw new Error('需要 title')
      if (type === 'event' && !fields.date) fields.date = today()
      checkFields(type, fields)
      if (fields.goalId) need(data, fields.goalId, 'goal')
      if (fields.parentId) need(data, fields.parentId, 'goal')
      const it = await data.create(type, fields as never)
      if (!it) throw new Error('保存失败')
      return it
    }
    case 'update_item': {
      const it = need(data, a.id)
      const fields = { ...((a.fields as Args) ?? {}) }
      for (const k of ['id', 'type', 'createdAt', 'updatedAt']) delete fields[k]
      checkFields(it.type, fields)
      await data.update(it.id, fields as never)
      return data.byId.get(it.id)
    }
    case 'checkin_habit': {
      const h = need(data, a.habitId, 'habit')
      const date = dateArg(a.date)
      const want = a.done !== false
      if (data.doneDates(h.id).has(date) !== want) await data.toggleCheckin(h.id, date)
      return { habit: titleOf(h), date, done: want }
    }
    case 'log_contact': {
      const p = need(data, a.personId, 'person') as Person
      const date = dateArg(a.date)
      await data.logContact(p.id, date, String(a.note ?? ''))
      return { person: titleOf(p), date, note: a.note ?? '' }
    }
    case 'link_items': {
      const x = need(data, a.a)
      const y = need(data, a.b)
      if (a.unlink) await data.unlink(x.id, y.id)
      else await data.link(x.id, y.id)
      return { linked: !a.unlink, a: ref(x), b: ref(y) }
    }
    case 'set_mood': {
      const date = dateArg(a.date)
      const mood = Number(a.mood)
      if (!Number.isInteger(mood) || mood < 1 || mood > 5) throw new Error('mood 需要 1-5')
      await data.setMood(date, mood, String(a.note ?? ''))
      return { date, mood: `${mood} ${MOODS[mood - 1].label}` }
    }
    default:
      throw new Error(`未知工具：${name}`)
  }
}
