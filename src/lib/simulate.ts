/**
 * 推演 (simulation canvas) engine: node kinds, their ports, and evaluation.
 *
 * Everything here is read-only: nodes read your data and compute; nothing is
 * ever written back. Values flowing along wires are numbers, yes/no, or dates
 * (YYYY-MM-DD). A missing value is `null` (an input not connected, a node
 * switched off, a division by zero…) and shows as "—".
 */
import { addDays, diffDays, fromKey, toKey } from './dates'
import { isScheduled, goalProgress } from './game'
import { isNumeric } from './fields'
import type { FieldDef, Goal, Habit, Item, LedgerEntry, Sim, SimEdge, SimNode, Task } from './types'

export type PortType = 'num' | 'bool' | 'date'
export type Value = number | boolean | string | null
export interface Port {
  key: string
  label: string
  type: PortType
  /** Shown after the value: 元, 天, 次… */
  unit?: string
}
export interface Ports {
  inputs: Port[]
  outputs: Port[]
}

export interface Ctx {
  byId: Map<string, Item>
  defs: FieldDef[]
  /** Habit id → dates it was checked in. */
  done: (habitId: string) => Set<string>
  today: string
}

// ---------------------------------------------------------------------------
// Node catalogue
// ---------------------------------------------------------------------------

export type Group = 'data' | 'value' | 'math' | 'logic' | 'time' | 'money' | 'result'
export const GROUPS: { key: Group; label: string }[] = [
  { key: 'data', label: '我的数据' },
  { key: 'value', label: '数值' },
  { key: 'math', label: '计算' },
  { key: 'time', label: '时间' },
  { key: 'money', label: '理财' },
  { key: 'logic', label: '判断' },
  { key: 'result', label: '结果' },
]

interface KindDef {
  label: string
  group: Group
  hint: string
  /** Fixed ports; item nodes compute theirs from the item. */
  ports?: Ports
  /** Default `data` for a new node. */
  data?: Record<string, unknown>
}

const n = (key: string, label: string, unit?: string): Port => ({ key, label, type: 'num', unit })
const b = (key: string, label: string): Port => ({ key, label, type: 'bool' })
const d = (key: string, label: string): Port => ({ key, label, type: 'date' })

export const KINDS: Record<string, KindDef> = {
  item: { label: '条目', group: 'data', hint: '从你的数据里读值' },
  num: { label: '数字', group: 'value', hint: '自己填一个数', ports: { inputs: [], outputs: [n('out', '值')] }, data: { value: 0 } },
  date: { label: '日期', group: 'value', hint: '自己选一个日期', ports: { inputs: [], outputs: [d('out', '日期')] } },
  today: { label: '今天', group: 'value', hint: '永远是今天', ports: { inputs: [], outputs: [d('out', '今天')] } },

  add: { label: '加', group: 'math', hint: 'A + B（没连的当 0）', ports: { inputs: [n('a', 'A'), n('b', 'B')], outputs: [n('out', 'A + B')] } },
  sub: { label: '减', group: 'math', hint: 'A − B（没连的当 0）', ports: { inputs: [n('a', 'A'), n('b', 'B')], outputs: [n('out', 'A − B')] } },
  mul: { label: '乘', group: 'math', hint: 'A × B', ports: { inputs: [n('a', 'A'), n('b', 'B')], outputs: [n('out', 'A × B')] } },
  div: { label: '除', group: 'math', hint: 'A ÷ B', ports: { inputs: [n('a', 'A'), n('b', 'B')], outputs: [n('out', 'A ÷ B')] } },
  sum: {
    label: '求和',
    group: 'math',
    hint: '把几项加起来，关掉的项不算',
    ports: { inputs: [n('a', '1'), n('b', '2'), n('c', '3'), n('d', '4'), n('e', '5')], outputs: [n('out', '合计')] },
  },
  avg: {
    label: '平均',
    group: 'math',
    hint: '连上的几项取平均',
    ports: { inputs: [n('a', '1'), n('b', '2'), n('c', '3'), n('d', '4')], outputs: [n('out', '平均')] },
  },
  minmax: {
    label: '取大 / 取小',
    group: 'math',
    hint: '两个里取较大或较小的',
    ports: { inputs: [n('a', 'A'), n('b', 'B')], outputs: [n('out', '结果')] },
    data: { op: 'max' },
  },
  per: {
    label: '换算周期',
    group: 'time',
    hint: '每周 → 每天、每月 → 每年…',
    ports: { inputs: [n('in', '数值')], outputs: [n('out', '换算后')] },
    data: { from: 'week', to: 'day' },
  },
  daysBetween: {
    label: '相差几天',
    group: 'time',
    hint: '从 A 到 B 有几天',
    ports: { inputs: [d('a', '从'), d('b', '到')], outputs: [n('out', '天数', '天')] },
  },
  addDays: {
    label: '几天以后',
    group: 'time',
    hint: '日期 + 天数',
    ports: { inputs: [d('date', '日期'), n('days', '天数', '天')], outputs: [d('out', '日期')] },
  },
  compound: {
    label: '复利',
    group: 'money',
    hint: '本金按年利率滚几年',
    ports: { inputs: [n('principal', '本金', '元'), n('rate', '年利率', '%'), n('years', '年数', '年')], outputs: [n('out', '到期', '元')] },
  },
  depreciate: {
    label: '折旧',
    group: 'money',
    hint: '买价按使用年限直线折旧',
    ports: { inputs: [n('price', '买价', '元'), n('age', '已用', '年'), n('life', '寿命', '年')], outputs: [n('out', '现值', '元')] },
  },
  compare: {
    label: '比较',
    group: 'logic',
    hint: 'A ≥ B 吗？',
    ports: { inputs: [n('a', 'A'), n('b', 'B')], outputs: [b('out', '是否成立')] },
    data: { op: '>=' },
  },
  dateBefore: {
    label: '赶得上吗',
    group: 'logic',
    hint: '日期 A 不晚于 B 吗？',
    ports: { inputs: [d('a', 'A'), d('b', 'B')], outputs: [b('out', 'A 不晚于 B')] },
  },
  and: { label: '并且', group: 'logic', hint: '都成立才成立', ports: { inputs: [b('a', 'A'), b('b', 'B'), b('c', 'C')], outputs: [b('out', '都成立')] } },
  or: { label: '或者', group: 'logic', hint: '有一个成立就成立', ports: { inputs: [b('a', 'A'), b('b', 'B'), b('c', 'C')], outputs: [b('out', '有一个成立')] } },
  not: { label: '不是', group: 'logic', hint: '反过来', ports: { inputs: [b('in', '条件')], outputs: [b('out', '相反')] } },
  if: {
    label: '如果…就…',
    group: 'logic',
    hint: '条件成立取 A，否则取 B',
    ports: { inputs: [b('cond', '如果'), n('a', '就'), n('b', '否则')], outputs: [n('out', '结果')] },
  },
  save: {
    label: '攒钱判定',
    group: 'result',
    hint: '目标金额、已有、每天能攒、截止日 → 能不能',
    ports: {
      inputs: [n('target', '目标', '元'), n('have', '已有', '元'), n('perDay', '每天攒', '元'), d('deadline', '截止日')],
      outputs: [b('ok', '能不能'), n('days', '还要几天', '天'), d('date', '预计攒够'), n('gap', '到截止还差', '元')],
    },
  },
  verdict: { label: '判定', group: 'result', hint: '把一个条件显示成 能 / 不能', ports: { inputs: [b('in', '条件')], outputs: [] } },
  show: { label: '数字卡片', group: 'result', hint: '把一个数大大地显示出来', ports: { inputs: [n('in', '数值')], outputs: [] } },
  chart: {
    label: '走势图',
    group: 'result',
    hint: '从现在起每天攒一点，几时到目标',
    ports: { inputs: [n('start', '起点', '元'), n('perDay', '每天', '元'), n('target', '目标', '元'), n('days', '看多少天', '天')], outputs: [] },
  },
}

export const PERIODS = [
  { key: 'day', label: '每天', days: 1 },
  { key: 'week', label: '每周', days: 7 },
  { key: 'month', label: '每月', days: 365 / 12 },
  { key: 'year', label: '每年', days: 365 },
] as const
const periodDays = (k: unknown) => PERIODS.find((p) => p.key === k)?.days ?? 1

export const COMPARE_OPS = ['>=', '>', '<=', '<', '='] as const

// ---------------------------------------------------------------------------
// Item nodes: what each kind of item exposes
// ---------------------------------------------------------------------------

/** The last `days` days up to today. */
const windowDays = (today: string, days: number) => Array.from({ length: days }, (_, i) => addDays(today, -i))

export function habitStats(h: Habit, done: Set<string>, today: string, days = 30) {
  const win = windowDays(today, days)
  const scheduled = win.filter((k) => isScheduled(h, k))
  const hits = win.filter((k) => done.has(k)).length
  const hitsOnSchedule = scheduled.filter((k) => done.has(k)).length
  let streak = 0
  for (let k = done.has(today) ? today : addDays(today, -1); ; k = addDays(k, -1)) {
    if (done.has(k)) streak++
    else if (isScheduled(h, k)) break
    if (streak > 3650) break
  }
  return {
    rate: scheduled.length ? hitsOnSchedule / scheduled.length : 0,
    perDay: hits / days,
    perWeek: (hits / days) * 7,
    streak,
  }
}

/** Next occurrence of a "MM-DD" / "YYYY-MM-DD" birthday, on or after today. */
export function nextBirthday(bday: string, today: string): string | null {
  const md = bday.length >= 10 ? bday.slice(5, 10) : bday.slice(0, 5)
  if (!/^\d\d-\d\d$/.test(md)) return null
  const y = Number(today.slice(0, 4))
  const fit = (yy: number) => {
    const [m, dd] = md.split('-').map(Number)
    const dt = new Date(yy, m - 1, dd)
    // Feb 29 in a non-leap year → Feb 28.
    if (dt.getMonth() !== m - 1) dt.setDate(0)
    return toKey(dt)
  }
  const thisYear = fit(y)
  return thisYear >= today ? thisYear : fit(y + 1)
}

/** A ledger entry's amount per month, on average. */
export function perMonth(e: LedgerEntry): number {
  switch (e.repeat) {
    case 'week':
      return (e.amount * 365) / 12 / 7
    case 'month':
      return e.amount
    case 'year':
      return e.amount / 12
    default:
      return 0
  }
}

interface ItemPort extends Port {
  get: () => Value
}

function itemPorts(it: Item, ctx: Ctx): ItemPort[] {
  const out: ItemPort[] = []
  const num = (key: string, label: string, get: () => number | null, unit?: string) => out.push({ key, label, type: 'num', unit, get })
  const date = (key: string, label: string, get: () => string | null) => out.push({ key, label, type: 'date', get })
  const bool = (key: string, label: string, get: () => boolean) => out.push({ key, label, type: 'bool', get })

  switch (it.type) {
    case 'habit': {
      const s = () => habitStats(it, ctx.done(it.id), ctx.today)
      num('rate', '完成率(近30天)', () => s().rate, '%')
      num('perDay', '平均每天几次', () => s().perDay, '次')
      num('perWeek', '平均每周几次', () => s().perWeek, '次')
      num('streak', '连续天数', () => s().streak, '天')
      break
    }
    case 'asset':
      num('value', it.status === 'wanted' ? '价格' : it.category === 'debt' ? '欠款' : '估值', () => it.value ?? null, '元')
      if (it.status === 'wanted') {
        num('saved', '已经攒了', () => it.saved ?? 0, '元')
        num('remain', '还差', () => (it.value === undefined ? null : Math.max(0, it.value - (it.saved ?? 0))), '元')
      }
      if (it.acquired) date('acquired', '获得日期', () => it.acquired ?? null)
      break
    case 'ledger': {
      num('amount', '每次金额', () => it.amount, '元')
      if (it.repeat !== 'none') {
        num('month', '折合每月', () => perMonth(it), '元')
        num('day', '折合每天', () => (perMonth(it) * 12) / 365, '元')
      }
      date('date', it.repeat === 'none' ? '日期' : '开始日期', () => it.date)
      break
    }
    case 'person':
      num('closeness', '亲密度', () => it.closeness)
      if (it.birthday) {
        date('birthday', '下次生日', () => nextBirthday(it.birthday!, ctx.today))
        num('toBirthday', '距生日', () => {
          const nb = nextBirthday(it.birthday!, ctx.today)
          return nb ? diffDays(ctx.today, nb) : null
        }, '天')
      }
      break
    case 'event':
      date('date', '日期', () => it.date)
      num('ago', '距今', () => diffDays(it.date, ctx.today), '天')
      break
    case 'task':
      if (it.due) date('due', '截止日', () => it.due ?? null)
      bool('done', '完成了', () => it.status === 'done')
      break
    case 'goal': {
      const goals = [...ctx.byId.values()].filter((x): x is Goal => x.type === 'goal')
      const tasks = [...ctx.byId.values()].filter((x): x is Task => x.type === 'task')
      num('progress', '进度', () => {
        const p = goalProgress(it, goals, tasks)
        return p.total ? p.done / p.total : 0
      }, '%')
      bool('done', '达成了', () => it.status === 'done')
      break
    }
    case 'segment':
      date('start', '开始', () => it.start)
      if (it.end) date('end', '结束', () => it.end ?? null)
      break
  }

  // Custom fields that hold a number, a date or a yes/no.
  for (const def of ctx.defs) {
    const v = it.fields?.[def.id]
    if (v === undefined || v === '') continue
    const key = 'f:' + def.id
    const label = def.title || '未命名字段'
    if (isNumeric(def.kind) && typeof v === 'number') {
      num(key, label, () => (def.kind === 'percent' ? v / 100 : v), def.kind === 'money' ? '元' : def.kind === 'percent' ? '%' : def.unit)
    } else if (def.kind === 'date' && typeof v === 'string') date(key, label, () => v)
    else if (def.kind === 'bool') bool(key, label, () => !!v)
  }
  return out
}

/** Items that make sense as a data source on the canvas. */
export const SOURCE_TYPES = ['habit', 'asset', 'ledger', 'person', 'event', 'goal', 'task', 'segment', 'note'] as const

export function portsOf(node: SimNode, ctx: Ctx): Ports {
  if (node.kind === 'item') {
    const it = ctx.byId.get(String(node.data.itemId ?? ''))
    return { inputs: [], outputs: it ? itemPorts(it, ctx).map(({ get: _get, ...p }) => p) : [] }
  }
  return KINDS[node.kind]?.ports ?? { inputs: [], outputs: [] }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface NodeResult {
  inputs: Record<string, Value>
  outputs: Record<string, Value>
  /** Plain-language reason a node can't compute, e.g. "条目已被删除". */
  note?: string
  /** For the chart node: projected points. */
  series?: { day: number; value: number }[]
}
export interface Evaluation {
  nodes: Map<string, NodeResult>
  /** Node id → unit of its "out" value, worked out from what flows in (¥ × 次 = ¥). */
  units: Map<string, string | undefined>
  /** Edge id → the value travelling along it. */
  edges: Map<string, Value>
  /** Node ids that sit on a loop (they get no value). */
  cycle: Set<string>
}

const isNum = (v: Value): v is number => typeof v === 'number' && Number.isFinite(v)
const isDate = (v: Value): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v)
const fin = (x: number) => (Number.isFinite(x) ? x : null)

function compute(node: SimNode, inp: Record<string, Value>, ctx: Ctx): NodeResult {
  const r: NodeResult = { inputs: inp, outputs: {} }
  const set = (v: Value, key = 'out') => (r.outputs[key] = v)
  const nums = (...keys: string[]) => keys.map((k) => inp[k]).filter(isNum)
  const a = inp.a
  const bb = inp.b

  switch (node.kind) {
    case 'item': {
      const it = ctx.byId.get(String(node.data.itemId ?? ''))
      if (!it) {
        r.note = '这个条目已被删除'
        break
      }
      for (const p of itemPorts(it, ctx)) set(p.get(), p.key)
      break
    }
    case 'num': {
      const v = Number(node.data.value)
      set(Number.isFinite(v) ? v : null)
      break
    }
    case 'date':
      set(isDate(node.data.value as Value) ? (node.data.value as string) : ctx.today)
      break
    case 'today':
      set(ctx.today)
      break
    case 'add':
      set(isNum(a) || isNum(bb) ? (isNum(a) ? a : 0) + (isNum(bb) ? bb : 0) : null)
      break
    case 'sub':
      set(isNum(a) || isNum(bb) ? (isNum(a) ? a : 0) - (isNum(bb) ? bb : 0) : null)
      break
    case 'mul':
      set(isNum(a) && isNum(bb) ? a * bb : null)
      break
    case 'div':
      set(isNum(a) && isNum(bb) && bb !== 0 ? a / bb : null)
      if (isNum(bb) && bb === 0) r.note = '不能除以 0'
      break
    case 'sum': {
      const xs = nums('a', 'b', 'c', 'd', 'e')
      set(xs.length ? xs.reduce((s, x) => s + x, 0) : null)
      break
    }
    case 'avg': {
      const xs = nums('a', 'b', 'c', 'd')
      set(xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
      break
    }
    case 'minmax': {
      const xs = nums('a', 'b')
      set(xs.length ? (node.data.op === 'min' ? Math.min(...xs) : Math.max(...xs)) : null)
      break
    }
    case 'per':
      set(isNum(inp.in) ? (inp.in / periodDays(node.data.from)) * periodDays(node.data.to) : null)
      break
    case 'daysBetween':
      set(isDate(a) && isDate(bb) ? diffDays(a, bb) : null)
      break
    case 'addDays':
      set(isDate(inp.date) && isNum(inp.days) ? addDays(inp.date, Math.ceil(inp.days)) : null)
      break
    case 'compound': {
      const { principal: p, rate, years } = inp
      set(isNum(p) && isNum(rate) && isNum(years) ? fin(p * Math.pow(1 + rate, years)) : null)
      break
    }
    case 'depreciate': {
      const { price, age, life } = inp
      set(isNum(price) && isNum(age) && isNum(life) && life > 0 ? Math.max(0, price * (1 - age / life)) : null)
      break
    }
    case 'compare': {
      if (!isNum(a) || !isNum(bb)) {
        set(null)
        break
      }
      const op = String(node.data.op ?? '>=')
      set(op === '>' ? a > bb : op === '<' ? a < bb : op === '<=' ? a <= bb : op === '=' ? Math.abs(a - bb) < 1e-9 : a >= bb)
      break
    }
    case 'dateBefore':
      set(isDate(a) && isDate(bb) ? a <= bb : null)
      break
    case 'and': {
      const xs = ['a', 'b', 'c'].map((k) => inp[k]).filter((v): v is boolean => typeof v === 'boolean')
      set(xs.length ? xs.every(Boolean) : null)
      break
    }
    case 'or': {
      const xs = ['a', 'b', 'c'].map((k) => inp[k]).filter((v): v is boolean => typeof v === 'boolean')
      set(xs.length ? xs.some(Boolean) : null)
      break
    }
    case 'not':
      set(typeof inp.in === 'boolean' ? !inp.in : null)
      break
    case 'if':
      set(typeof inp.cond === 'boolean' ? (inp.cond ? (inp.a ?? null) : (inp.b ?? null)) : null)
      break
    case 'save': {
      const { target, have, perDay, deadline } = inp
      if (!isNum(target)) {
        r.note = '连上目标金额'
        break
      }
      const left = target - (isNum(have) ? have : 0)
      if (left <= 0) {
        Object.assign(r.outputs, { ok: true, days: 0, date: ctx.today, gap: 0 })
        break
      }
      if (!isNum(perDay) || perDay <= 0) {
        Object.assign(r.outputs, { ok: false, days: null, date: null, gap: left })
        r.note = '每天攒不下钱，永远攒不够'
        break
      }
      const days = Math.ceil(left / perDay)
      const date = addDays(ctx.today, days)
      const out: Record<string, Value> = { days, date, ok: true, gap: 0 }
      if (isDate(deadline)) {
        const until = Math.max(0, diffDays(ctx.today, deadline))
        out.ok = date <= deadline
        out.gap = Math.max(0, left - perDay * until)
      }
      Object.assign(r.outputs, out)
      break
    }
    case 'chart': {
      const start = isNum(inp.start) ? inp.start : 0
      const per = isNum(inp.perDay) ? inp.perDay : 0
      let span = isNum(inp.days) && inp.days > 0 ? Math.min(3650, Math.round(inp.days)) : 0
      if (!span) span = isNum(inp.target) && per > 0 ? Math.min(3650, Math.max(30, Math.ceil(((inp.target - start) / per) * 1.2))) : 180
      const step = Math.max(1, Math.round(span / 60))
      r.series = []
      for (let day = 0; day <= span; day += step) r.series.push({ day, value: start + per * day })
      break
    }
  }
  return r
}

/** Evaluates every node in dependency order. Switched-off nodes output nothing. */
export function evaluate(sim: Pick<Sim, 'nodes' | 'edges'>, ctx: Ctx): Evaluation {
  const byNode = new Map(sim.nodes.map((x) => [x.id, x]))
  const edges = sim.edges.filter((e) => byNode.has(e.from) && byNode.has(e.to))
  const incoming = new Map<string, SimEdge[]>()
  for (const e of edges) (incoming.get(e.to) ?? incoming.set(e.to, []).get(e.to)!).push(e)

  // Kahn's algorithm; anything left over sits on (or behind) a loop.
  const indeg = new Map(sim.nodes.map((x) => [x.id, 0]))
  for (const e of edges) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  const queue = sim.nodes.filter((x) => !indeg.get(x.id)).map((x) => x.id)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const e of edges) if (e.from === id) {
      indeg.set(e.to, indeg.get(e.to)! - 1)
      if (!indeg.get(e.to)) queue.push(e.to)
    }
  }
  const cycle = new Set(sim.nodes.map((x) => x.id).filter((id) => !order.includes(id)))

  const res = new Map<string, NodeResult>()
  const edgeVals = new Map<string, Value>()
  for (const id of order) {
    const node = byNode.get(id)!
    const inp: Record<string, Value> = {}
    for (const e of incoming.get(id) ?? []) {
      const v = res.get(e.from)?.outputs[e.fromPort] ?? null
      inp[e.toPort] = v
      edgeVals.set(e.id, v)
    }
    res.set(id, node.off ? { inputs: inp, outputs: {}, note: '已关闭（假设不发生）' } : compute(node, inp, ctx))
  }
  for (const id of cycle) res.set(id, { inputs: {}, outputs: {}, note: '连成了一个圈，算不出来' })

  // Units: math nodes carry the unit of what goes in.
  const units = new Map<string, string | undefined>()
  const unitOf = (e: SimEdge): string | undefined => {
    const src = byNode.get(e.from)!
    if (UNIT_PASS.has(src.kind) && e.fromPort === 'out') return units.get(src.id)
    if (src.kind === 'num') return (src.data.unit as string) || undefined
    return portsOf(src, ctx).outputs.find((p) => p.key === e.fromPort)?.unit
  }
  for (const id of order) {
    const node = byNode.get(id)!
    if (!UNIT_PASS.has(node.kind)) continue
    const ins = (incoming.get(id) ?? []).filter((e) => node.kind !== 'if' || e.toPort !== 'cond').sort((x, y) => x.toPort.localeCompare(y.toPort))
    const us = ins.map(unitOf)
    let u: string | undefined
    if (node.kind === 'mul') {
      const real = us.filter((x) => x && x !== '次' && x !== '%')
      u = real.length === 1 ? real[0] : undefined
    } else if (node.kind === 'div') {
      const ua = us[ins.findIndex((e) => e.toPort === 'a')]
      const ub = us[ins.findIndex((e) => e.toPort === 'b')]
      u = ua && ua !== ub ? ua : undefined
    } else u = us.find(Boolean)
    units.set(id, u)
  }
  return { nodes: res, edges: edgeVals, cycle, units }
}

const UNIT_PASS = new Set(['add', 'sub', 'mul', 'div', 'sum', 'avg', 'minmax', 'per', 'if'])

/** Ports with the units worked out during evaluation filled in. */
export function portsWithUnits(node: SimNode, ctx: Ctx, ev: Evaluation): Ports {
  const p = portsOf(node, ctx)
  if (node.kind === 'num') return { inputs: [], outputs: [{ ...p.outputs[0], unit: (node.data.unit as string) || undefined }] }
  if (!UNIT_PASS.has(node.kind)) return p
  const u = ev.units.get(node.id)
  return { inputs: p.inputs, outputs: p.outputs.map((o) => (o.key === 'out' ? { ...o, unit: u } : o)) }
}

/** Can a wire go from this output to that input? */
export const canConnect = (from: PortType | undefined, to: PortType | undefined) => !!from && from === to

/** Would adding from→to close a loop? */
export function makesLoop(edges: SimEdge[], from: string, to: string): boolean {
  if (from === to) return true
  const seen = new Set<string>()
  const stack = [to]
  while (stack.length) {
    const id = stack.pop()!
    if (id === from) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const e of edges) if (e.from === id) stack.push(e.to)
  }
  return false
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatSim(v: Value, port?: Pick<Port, 'type' | 'unit'>, hidden = false): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'string') {
    const dt = fromKey(v)
    return `${dt.getFullYear()}.${dt.getMonth() + 1}.${dt.getDate()}`
  }
  if (port?.unit === '%') return `${Math.round(v * 1000) / 10}%`
  if (port?.unit === '元') {
    if (hidden) return '¥••••'
    const abs = Math.abs(v)
    const s = abs >= 1e5 ? `${(abs / 1e4).toFixed(1)}万` : abs.toLocaleString('zh-CN', { maximumFractionDigits: abs < 100 ? 2 : 0 })
    return (v < 0 ? '−¥' : '¥') + s
  }
  const s = Math.abs(v) >= 100 ? Math.round(v).toLocaleString('zh-CN') : String(Math.round(v * 100) / 100)
  return port?.unit ? `${s} ${port.unit}` : s
}

/** The headline a sim shows on the Today page: its first result node. */
export function headline(sim: Sim, ev: Evaluation, hidden = false): { text: string; ok: boolean | null; sub?: string } | null {
  for (const node of sim.nodes) {
    const r = ev.nodes.get(node.id)
    if (!r || node.off) continue
    if (node.kind === 'save' && r.outputs.ok !== undefined) {
      const ok = r.outputs.ok as boolean | null
      const date = r.outputs.date as string | null
      const gap = r.outputs.gap as number | null
      return {
        ok,
        text: ok ? '能' : '不能',
        sub: ok
          ? date
            ? `预计 ${formatSim(date)} 攒够`
            : undefined
          : isNum(gap ?? null) && gap! > 0
            ? `到截止还差 ${formatSim(gap, { type: 'num', unit: '元' }, hidden)}${date ? `，要到 ${formatSim(date)}` : ''}`
            : r.note,
      }
    }
    if (node.kind === 'verdict' && typeof r.inputs.in === 'boolean') return { ok: r.inputs.in, text: r.inputs.in ? '能' : '不能', sub: String(node.data.label ?? '') || undefined }
    if (node.kind === 'show' && r.inputs.in !== undefined) return { ok: null, text: formatSim(r.inputs.in, { type: 'num', unit: node.data.unit as string | undefined }, hidden), sub: String(node.data.label ?? '') || undefined }
  }
  return null
}

export const newId = () => Math.random().toString(36).slice(2, 10)
