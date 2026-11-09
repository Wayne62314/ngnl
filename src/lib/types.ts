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
}

export type EventKind = 'event' | 'milestone' | 'decision'
export interface LifeEvent extends Base {
  type: 'event'
  date: string
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

export type Item = Task | Habit | Goal | Person | LifeEvent | Note
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
}

export interface Snapshot {
  version: 1
  items: Item[]
  links: [string, string][]
  checkins: Checkin[]
  moods: Mood[]
  profile: Profile
}

export const TYPE_META: Record<ItemType, { label: string; route: string }> = {
  task: { label: '任务', route: '/tasks' },
  habit: { label: '习惯', route: '/habits' },
  goal: { label: '目标', route: '/goals' },
  person: { label: '人物', route: '/people' },
  event: { label: '经历', route: '/timeline' },
  note: { label: '笔记', route: '/notes' },
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
