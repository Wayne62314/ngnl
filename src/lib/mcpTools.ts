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
import { PRESETS } from './portraits'
import { ATTRS, MOODS, type FieldDef, type Goal, type Item, type ItemType, type Person, type Sim, type SimEdge, type SimNode, type Task } from './types'
import { canConnect, evaluate, formatSim, headline, KINDS, makesLoop, newId, perMonth, portsOf, portsWithUnits, type Ctx } from './simulate'
import { monthFlow, netWorth } from './assets'

type Data = ReturnType<typeof useData>
type Args = Record<string, unknown>

export const WRITE_TOOLS = new Set(['create_item', 'update_item', 'checkin_habit', 'log_contact', 'link_items', 'set_mood', 'set_portrait', 'save_sim'])

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
  set_portrait: '设置立绘',
  list_assets: '查看资产与收支',
  get_sim_guide: '查看推演节点说明',
  list_sims: '查看推演图',
  save_sim: '保存推演图',
  suggest_links: '查看关联建议',
}

const TYPES: ItemType[] = ['task', 'habit', 'goal', 'person', 'event', 'note', 'asset', 'ledger', 'segment']
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
  for (const k of ['due', 'date', 'doneAt', 'start', 'end', 'until', 'acquired']) if (k in f && f[k] !== null && !isDate(f[k])) throw new Error(`${k} 需要 YYYY-MM-DD 格式`)
  if (type === 'task' && 'difficulty' in f && ![1, 2, 3].includes(f.difficulty as number)) throw new Error('difficulty 只能是 1、2、3')
  if (type === 'task' && 'status' in f && !['todo', 'doing', 'done', 'dropped'].includes(f.status as string)) throw new Error('任务 status 只能是 todo/doing/done/dropped')
  if (type === 'goal' && 'status' in f && !['unknown', 'todo', 'doing', 'done'].includes(f.status as string)) throw new Error('目标 status 只能是 unknown/todo/doing/done')
  if (type === 'person' && 'closeness' in f && ![1, 2, 3, 4, 5].includes(f.closeness as number)) throw new Error('closeness 只能是 1-5')
  if (type === 'person' && 'birthday' in f && f.birthday !== null && !/^(\d{4}-)?\d{2}-\d{2}$/.test(String(f.birthday))) throw new Error('birthday 需要 MM-DD 或 YYYY-MM-DD')
  if (type === 'habit' && 'days' in f && !(Array.isArray(f.days) && f.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) throw new Error('days 是 0-6 的数组，0=周日')
  if (type === 'asset' && 'category' in f && !['item', 'cred', 'fame', 'finance', 'debt'].includes(f.category as string)) throw new Error('资产 category 只能是 item/cred/fame/finance/debt')
  if (type === 'asset' && 'status' in f && !['owned', 'wanted', 'lost', 'sold'].includes(f.status as string)) throw new Error('资产 status 只能是 owned/wanted/lost/sold')
  for (const k of ['value', 'saved', 'amount']) if (k in f && f[k] !== null && !(typeof f[k] === 'number' && Number.isFinite(f[k]))) throw new Error(`${k} 需要是数字（元）`)
  if (type === 'ledger' && 'flow' in f && !['income', 'expense'].includes(f.flow as string)) throw new Error('收支 flow 只能是 income/expense')
  if (type === 'ledger' && 'repeat' in f && !['none', 'week', 'month', 'year'].includes(f.repeat as string)) throw new Error('收支 repeat 只能是 none/week/month/year')
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

const simCtx = (data: Data): Ctx => ({ byId: data.byId, defs: data.fieldDefs, done: data.doneDates, today: today() })
const portText = (p: { key: string; label: string; type: string; unit?: string }) => `${p.key}: ${p.type}${p.unit ? ' ' + p.unit : ''}（${p.label}）`

/** Custom field values by field name, so an assistant can read them. */
function namedFields(data: Data, it: Item) {
  if (!it.fields) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(it.fields)) {
    const def = data.byId.get(k) as FieldDef | undefined
    if (def) out[titleOf(def)] = v
  }
  return out
}

function simSummary(data: Data, s: Sim) {
  const ctx = simCtx(data)
  const ev = evaluate(s, ctx)
  const head = headline(s, ev)
  const fmt = (vals: Record<string, unknown>, ports: { key: string; type: 'num' | 'bool' | 'date'; unit?: string }[]) =>
    Object.keys(vals).length ? Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, formatSim((v ?? null) as never, ports.find((p) => p.key === k))])) : undefined
  return {
    id: s.id,
    title: titleOf(s),
    pinned: !!s.pinned,
    result: head ? `${head.text}${head.sub ? '：' + head.sub : ''}` : undefined,
    nodes: s.nodes.map((n) => {
      const r = ev.nodes.get(n.id)
      const ports = portsWithUnits(n, ctx, ev)
      const it = n.kind === 'item' ? data.byId.get(String(n.data.itemId)) : undefined
      return {
        id: n.id,
        kind: n.kind,
        title: it ? titleOf(it) : KINDS[n.kind]?.label,
        off: n.off || undefined,
        inputs: r ? fmt(r.inputs, ports.inputs) : undefined,
        outputs: r ? fmt(r.outputs, ports.outputs) : undefined,
        note: r?.note,
      }
    }),
    edges: s.edges.map((e) => `${e.from}.${e.fromPort} → ${e.to}.${e.toPort}`),
  }
}

/** Columns by depth (sources on the left), rows in order. */
function autoLayout(nodes: SimNode[], edges: SimEdge[]) {
  const depth = new Map(nodes.map((n) => [n.id, 0]))
  for (let pass = 0; pass < nodes.length; pass++)
    for (const e of edges) depth.set(e.to, Math.max(depth.get(e.to) ?? 0, (depth.get(e.from) ?? 0) + 1))
  const rows = new Map<number, number>()
  for (const n of nodes) {
    const c = depth.get(n.id) ?? 0
    const r = rows.get(c) ?? 0
    rows.set(c, r + 1)
    n.x = 40 + c * 320
    n.y = 40 + r * 240
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
        // The portrait can be a large image; tell the assistant what it is instead of sending it.
        profile: { ...data.profile, portrait: data.profile.portrait ? (data.profile.portrait.startsWith('preset:') ? data.profile.portrait : 'custom image') : undefined },
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
      return { item: it, customFields: namedFields(data, it), linked: data.linked(it.id).map(ref) }
    }

    case 'list_assets': {
      const ym = d.slice(0, 7)
      return {
        netWorth: netWorth(data.assets),
        thisMonth: monthFlow(data.ledger, ym),
        assets: data.assets.map((x) => ({
          id: x.id,
          title: titleOf(x),
          category: x.category,
          status: x.status,
          value: x.value,
          saved: x.saved,
          acquired: x.acquired,
          customFields: namedFields(data, x),
          notes: x.notes || undefined,
        })),
        ledger: data.ledger.map((e) => ({
          id: e.id,
          title: titleOf(e),
          flow: e.flow,
          amount: e.amount,
          repeat: e.repeat,
          perMonth: e.repeat === 'none' ? undefined : Math.round(perMonth(e) * 100) / 100,
          date: e.date,
          until: e.until,
          category: e.category,
        })),
      }
    }

    case 'get_sim_guide': {
      const ctx = simCtx(data)
      const ids = Array.isArray(a.itemIds) ? (a.itemIds as unknown[]) : []
      return {
        howTo:
          '推演图是只读的计算画布：item 节点从用户的数据读值，其他节点做计算，结果节点（save 攒钱判定 / verdict 判定 / show 数字卡片 / chart 走势图）给出答案。' +
          '连线从一个节点的输出端口连到另一个节点的输入端口，类型必须相同（num 连 num，date 连 date，bool 连 bool），每个输入只能接一条线，不能连成圈。' +
          '金额单位是元；百分比在数值上是 0-1 的小数（例如完成率 0.9）。没连的输入当作空值：add/sub 当 0，sum/avg 忽略。off: true 表示"假设这件事不发生"。',
        nodeData: {
          item: '{ itemId }',
          num: '{ value, unit? }  unit 写 元/天/次 等',
          date: '{ value: YYYY-MM-DD }',
          compare: '{ op: ">=" | ">" | "<=" | "<" | "=" }',
          minmax: '{ op: "max" | "min" }',
          per: '{ from, to: "day" | "week" | "month" | "year" }  例如每周 → 每天',
          'save / verdict / show': '{ label? } 一句说明；show 还可以有 unit',
        },
        kinds: Object.entries(KINDS)
          .filter(([k]) => k !== 'item')
          .map(([kind, k]) => ({ kind, label: k.label, hint: k.hint, inputs: k.ports!.inputs.map(portText), outputs: k.ports!.outputs.map(portText) })),
        items: ids.map((id) => {
          const it = need(data, id)
          return { ...ref(it), outputs: portsOf({ id: 'x', kind: 'item', x: 0, y: 0, data: { itemId: it.id } }, ctx).outputs.map(portText) }
        }),
      }
    }

    case 'suggest_links': {
      const list = a.id ? data.suggestions.filter((s) => s.from.id === a.id || s.to.id === a.id) : data.suggestions
      const limit = Math.min(Math.max(Number(a.limit) || 30, 1), 200)
      return {
        total: list.length,
        suggestions: list.slice(0, limit).map((s) => ({
          a: ref(s.from),
          b: ref(s.to),
          why: `「${titleOf(s.from)}」的${s.where}提到了「${s.match}」：${s.before}${s.match}${s.after}`,
        })),
        hint: '这些是文字里提到、但还没关联的条目。和用户确认后可以用 link_items 连上。',
      }
    }

    case 'list_sims': {
      if (a.id) return simSummary(data, need(data, a.id, 'sim') as Sim)
      return data.sims.map((s) => {
        const sum = simSummary(data, s)
        return { id: sum.id, title: sum.title, pinned: sum.pinned, result: sum.result, nodes: s.nodes.length }
      })
    }

    default:
      throw new Error(`未知工具：${name}`)
  }
}

/**
 * The portrait is only ever shown through <img>, where SVG can't run scripts
 * or load anything; this also strips those parts so the stored file stays tidy.
 */
export function cleanSvg(svg: string): string {
  const s = svg.trim()
  if (!/^<svg[\s>]/i.test(s) || !/<\/svg>\s*$/i.test(s)) throw new Error('svg 需要是完整的 <svg>…</svg>')
  if (s.length > 200_000) throw new Error('svg 太大（上限 200KB）')
  let out = s
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(href\s*=\s*)("|')(?!#|data:image\/)[^"']*\2/gi, '$1$2#$2')
  if (!/xmlns=/.test(out)) out = out.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  return out
}

/** Write tools are async because they go through the store's save path. */
export async function runWriteTool(data: Data, name: string, a: Args): Promise<unknown> {
  switch (name) {
    case 'create_item': {
      const type = a.type as ItemType
      if (!TYPES.includes(type)) throw new Error(`type 只能是 ${TYPES.join('/')}`)
      const fields = { ...((a.fields as Args) ?? {}) }
      if (!String(fields.title ?? '').trim()) throw new Error('需要 title')
      if ((type === 'event' || type === 'ledger') && !fields.date) fields.date = today()
      if (type === 'segment' && !fields.start) fields.start = today()
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
    case 'save_sim': {
      const existing = a.id ? (need(data, a.id, 'sim') as Sim) : undefined
      if (!Array.isArray(a.nodes)) throw new Error('需要 nodes 数组')
      const ctx = simCtx(data)
      const seen = new Set<string>()
      let placed = true
      const nodes: SimNode[] = (a.nodes as Args[]).map((n) => {
        const kind = String(n.kind ?? '')
        if (!KINDS[kind]) throw new Error(`没有这种节点：${kind}（用 get_sim_guide 查看）`)
        const id = typeof n.id === 'string' && n.id.trim() ? n.id.trim() : newId()
        if (seen.has(id)) throw new Error(`节点 id 重复：${id}`)
        seen.add(id)
        const nd: Args = { ...(KINDS[kind].data ?? {}), ...((n.data as Args) ?? {}) }
        if (kind === 'item') nd.itemId = need(data, nd.itemId).id
        if (kind === 'date' && nd.value !== undefined && !isDate(nd.value)) throw new Error('date 节点的 value 需要 YYYY-MM-DD')
        if (kind === 'num' && !Number.isFinite(Number(nd.value))) throw new Error('num 节点的 value 需要是数字')
        const hasPos = Number.isFinite(n.x) && Number.isFinite(n.y)
        if (!hasPos) placed = false
        return { id, kind, x: hasPos ? Number(n.x) : 0, y: hasPos ? Number(n.y) : 0, data: nd, off: n.off ? true : undefined }
      })
      const byNode = new Map(nodes.map((n) => [n.id, n]))
      const edges: SimEdge[] = []
      for (const e of (Array.isArray(a.edges) ? a.edges : []) as Args[]) {
        const from = byNode.get(String(e.from))
        const to = byNode.get(String(e.to))
        if (!from || !to) throw new Error(`连线的节点不存在：${String(e.from)} → ${String(e.to)}`)
        const out = portsOf(from, ctx).outputs.find((p) => p.key === e.fromPort)
        const inp = portsOf(to, ctx).inputs.find((p) => p.key === e.toPort)
        if (!out) throw new Error(`${from.id} 没有输出端口 ${String(e.fromPort)}`)
        if (!inp) throw new Error(`${to.id} 没有输入端口 ${String(e.toPort)}`)
        if (!canConnect(out.type, inp.type)) throw new Error(`类型不匹配：${from.id}.${out.key} 是 ${out.type}，${to.id}.${inp.key} 要 ${inp.type}`)
        if (edges.some((x) => x.to === to.id && x.toPort === inp.key)) throw new Error(`${to.id}.${inp.key} 已经接了一条线`)
        if (makesLoop(edges, from.id, to.id)) throw new Error(`${from.id} → ${to.id} 会连成一个圈`)
        edges.push({ id: newId(), from: from.id, fromPort: out.key, to: to.id, toPort: inp.key })
      }
      if (!placed) autoLayout(nodes, edges)
      const patch = {
        title: String(a.title ?? existing?.title ?? '').trim() || 'AI 搭的推演',
        nodes,
        edges,
        ...(a.pinned !== undefined ? { pinned: !!a.pinned } : {}),
      }
      let s: Sim | undefined
      if (existing) {
        await data.update<Sim>(existing.id, patch)
        s = data.byId.get(existing.id) as Sim
      } else s = await data.create('sim', patch)
      if (!s) throw new Error('保存失败')
      return { ...simSummary(data, s), open: `在 NoGameNoLife 的「推演」页打开：#/simulate/${s.id}` }
    }
    case 'set_portrait': {
      const profile = { ...data.profile }
      if (a.reset) {
        delete profile.portrait
      } else if (typeof a.preset === 'string') {
        if (!PRESETS.some((p) => p.key === a.preset)) throw new Error('没有这个内置角色')
        profile.portrait = 'preset:' + a.preset
      } else if (typeof a.svg === 'string') {
        profile.portrait = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(cleanSvg(a.svg))
      } else {
        throw new Error('需要 svg、preset 或 reset 之一')
      }
      await data.saveProfile(profile)
      return { ok: true, portrait: profile.portrait ? (profile.portrait.startsWith('preset:') ? profile.portrait : 'svg') : 'default' }
    }
    default:
      throw new Error(`未知工具：${name}`)
  }
}
