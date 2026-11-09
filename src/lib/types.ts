export type Attr = 'mind' | 'body' | 'craft' | 'social' | 'career' | 'spirit'

export const ATTRS: { key: Attr; label: string; hint: string; color: string }[] = [
  { key: 'mind', label: '智识', hint: '学习、阅读、思考', color: 'var(--attr-mind)' },
  { key: 'body', label: '体魄', hint: '运动、睡眠、饮食', color: 'var(--attr-body)' },
  { key: 'craft', label: '创造', hint: '写作、编程、做东西', color: 'var(--attr-craft)' },
  { key: 'social', label: '社交', hint: '陪伴、联系、合作', color: 'var(--attr-social)' },
  { key: 'career', label: '事业', hint: '工作、理财、职业成长', color: 'var(--attr-career)' },
  { key: 'spirit', label: '心境', hint: '情绪、反思、休息', color: 'var(--attr-spirit)' },
]
export const attrOf = (k: Attr | undefined) => ATTRS.find((a) => a.key === k) ?? ATTRS[0]

interface Base {
  id: string
  createdAt: string
  updatedAt: string
  title: string
  notes?: string
  /** Custom field values, keyed by the id of a `field` item. */
  fields?: Record<string, FieldValue>
}

/** A place on the offline map. */
export interface Place {
  name: string
  lat: number
  lng: number
}

export type TaskStatus = 'todo' | 'doing' | 'done' | 'dropped'
export interface Task extends Base {
  type: 'task'
  status: TaskStatus
  attr: Attr
  difficulty: 1 | 2 | 3
  due?: string
  goalId?: string
  prereqIds?: string[]
  doneAt?: string
}

export interface Habit extends Base {
  type: 'habit'
  attr: Attr
  /** Days of week the habit is scheduled on, 0 = Sunday. */
  days: number[]
  archived?: boolean
}

export type GoalStatus = 'unknown' | 'todo' | 'doing' | 'done'
export interface Goal extends Base {
  type: 'goal'
  status: GoalStatus
  parentId?: string
  order?: number
}

export interface Person extends Base {
  type: 'person'
  relation?: string
  closeness: number
  traits?: string
  /** Dates (YYYY-MM-DD) the user marked as "联系过". */
  contacts?: string[]
  /** Optional note per contact date, e.g. "一起吃饭，他想换工作". */
  contactNotes?: Record<string, string>
  /** "MM-DD" or "YYYY-MM-DD". */
  birthday?: string
  /** How and when you met. */
  met?: string
}

export type EventKind = 'event' | 'milestone' | 'decision'
export interface LifeEvent extends Base {
  type: 'event'
  date: string
  place?: Place
  kind: EventKind
  feeling?: 'good' | 'neutral' | 'bad'
  options?: string
  choice?: string
  reason?: string
}

export type NoteKind = 'idea' | 'intel'
export type IdeaStatus = 'seed' | 'growing' | 'done' | 'dropped'
export interface Note extends Base {
  type: 'note'
  kind: NoteKind
  status?: IdeaStatus
  source?: string
  tags?: string[]
}

// ---- custom fields ----
export type FieldKind = 'number' | 'money' | 'date' | 'duration' | 'percent' | 'text' | 'select' | 'bool' | 'item'
export type FieldValue = number | string | boolean
/** A field definition (name, type, unit). Its values live in other items' `fields`. */
export interface FieldDef extends Base {
  type: 'field'
  kind: FieldKind
  unit?: string
  /** Choices for kind "select". */
  options?: string[]
}

// ---- trajectory ----
/** A stretch of time on one track of your life (where you lived, a job, a relationship…). */
export interface Segment extends Base {
  type: 'segment'
  /** Track key: home / work / love / health / money, or any custom track name. */
  lane: string
  /** YYYY-MM-DD; an end in the future (or a start in the future) marks a plan. */
  start: string
  end?: string
  place?: Place
  feeling?: 'good' | 'neutral' | 'bad'
  goalId?: string
}

// ---- assets ----
export type AssetCategory = 'item' | 'cred' | 'fame' | 'finance' | 'debt'
export type AssetStatus = 'owned' | 'wanted' | 'lost' | 'sold'
export interface Asset extends Base {
  type: 'asset'
  category: AssetCategory
  status: AssetStatus
  /** Estimated value in yuan (debts: the amount owed). */
  value?: number
  /** For wishlist items: how much is already put aside for it. */
  saved?: number
  acquired?: string
  goalId?: string
}
export type LedgerRepeat = 'none' | 'week' | 'month' | 'year'
/** Money in or out: a one-off amount, or a recurring one (salary, rent). */
export interface LedgerEntry extends Base {
  type: 'ledger'
  flow: 'income' | 'expense'
  amount: number
  repeat: LedgerRepeat
  /** First (or only) date. */
  date: string
  /** Last date of a recurring entry, if it has ended. */
  until?: string
  category?: string
}

// ---- simulation canvas ----
export interface SimNode {
  id: string
  kind: string
  x: number
  y: number
  /** Node settings: the item it reads, the operation, a constant… */
  data: Record<string, unknown>
  /** What-if nodes can be switched off without deleting them. */
  off?: boolean
}
export interface SimEdge {
  id: string
  from: string
  fromPort: string
  to: string
  toPort: string
}
export interface Sim extends Base {
  type: 'sim'
  nodes: SimNode[]
  edges: SimEdge[]
  pinned?: boolean
}

export type Item = Task | Habit | Goal | Person | LifeEvent | Note | FieldDef | Segment | Asset | LedgerEntry | Sim
export type ItemType = Item['type']
export type ItemOf<T extends ItemType> = Extract<Item, { type: T }>

export interface Checkin {
  habitId: string
  date: string
}
export interface Mood {
  date: string
  mood: number
  note: string
}
export interface Profile {
  name?: string
  title?: string
  background?: string
  strengths?: string
  weaknesses?: string
  interests?: string
  /** "preset:<key>" or an image data URL (see portraits.ts). */
  portrait?: string
  /** Starting level per attribute (who you already were before using the app). Missing = 1. */
  baseLevels?: Partial<Record<Attr, number>>
  /** Net worth recorded once a month ("YYYY-MM" → yuan), for the trend chart. */
  netWorth?: Record<string, number>
  /** Extra trajectory tracks the user added, in display order. */
  lanes?: string[]
}

export interface Snapshot {
  version: 1
  items: Item[]
  links: [string, string][]
  checkins: Checkin[]
  moods: Mood[]
  profile: Profile
  /** Change times used to merge copies from different devices (see merge.ts). */
  clock?: SyncClock
}

/**
 * When each piece of data last changed, so two devices that both edited
 * offline can be merged record by record instead of one overwriting the other.
 * Items carry their own `updatedAt`; everything else is tracked here.
 */
export interface SyncClock {
  /** Set when the whole dataset is replaced (restore from backup); a newer epoch wins outright. */
  epoch: string
  /** Deleted item id → when it was deleted. */
  tomb: Record<string, string>
  /** "a|b" → last time this link was added or removed. */
  links: Record<string, string>
  /** "habitId|date" → last time this check-in was set or cleared. */
  checkins: Record<string, string>
  /** date → last time that day's mood was set or cleared. */
  moods: Record<string, string>
  profile: string
}

export const TYPE_META: Record<ItemType, { label: string; route: string }> = {
  task: { label: '任务', route: '/tasks' },
  habit: { label: '习惯', route: '/habits' },
  goal: { label: '目标', route: '/goals' },
  person: { label: '人物', route: '/people' },
  event: { label: '经历', route: '/timeline' },
  note: { label: '笔记', route: '/notes' },
  field: { label: '字段', route: '/settings' },
  segment: { label: '处境', route: '/trajectory' },
  asset: { label: '资产', route: '/assets' },
  ledger: { label: '收支', route: '/assets' },
  sim: { label: '推演图', route: '/simulate' },
}

export const typeLabel = (it: Item) =>
  it.type === 'note' ? (it.kind === 'idea' ? '灵感' : '情报') : TYPE_META[it.type].label

export const MOODS = [
  { v: 1, emoji: '😞', label: '很糟' },
  { v: 2, emoji: '😕', label: '低落' },
  { v: 3, emoji: '😐', label: '平常' },
  { v: 4, emoji: '🙂', label: '不错' },
  { v: 5, emoji: '😄', label: '很棒' },
]
