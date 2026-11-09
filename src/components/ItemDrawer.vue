<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowLeft, Link2, Lock, Plus, Trash2, X } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { friendly, today, addDays, weekdayLabel } from '@/lib/dates'
import { bestStreak, contactOverdue, CONTACT_INTERVAL, goalProgress, isLocked, lastContact, streak, TASK_XP } from '@/lib/game'
import { itemIcon, titleOf } from '@/lib/itemView'
import { parseBirthday } from '@/lib/people'
import { typeLabel, type Goal, type Habit, type Item, type LifeEvent, type Note, type Person, type Task } from '@/lib/types'
import Seg from './Seg.vue'
import AttrPick from './AttrPick.vue'
import ItemPicker from './ItemPicker.vue'
import RelatedGroups from './RelatedGroups.vue'

const data = useData()
const ui = useUi()

const id = computed(() => ui.drawer.at(-1))
const item = computed(() => (id.value ? data.byId.get(id.value) : undefined))
// Close silently if the open item vanished (deleted elsewhere, or import).
watch(item, (v) => {
  if (id.value && !v) ui.close()
})

// ---- debounced text fields (title + notes + other free text) ----
const draft = ref<Record<string, string>>({})
let timer: ReturnType<typeof setTimeout> | undefined
let pendingId: string | undefined
function flush() {
  clearTimeout(timer)
  if (pendingId && Object.keys(draft.value).length) {
    const patch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(draft.value)) patch[k] = k === 'tags' ? splitTags(v) : v
    data.update(pendingId, patch)
  }
  draft.value = {}
  pendingId = undefined
}
function text(field: string, v: string) {
  if (pendingId && pendingId !== id.value) flush()
  pendingId = id.value
  draft.value[field] = v
  clearTimeout(timer)
  timer = setTimeout(flush, 450)
}
const val = (field: string) =>
  field in draft.value ? draft.value[field] : field === 'tags' ? ((item.value as Note)?.tags ?? []).join('，') : (((item.value as any)?.[field] as string) ?? '')
const splitTags = (s: string) => [...new Set(s.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean))]

const set = (patch: Record<string, unknown>) => item.value && data.update(item.value.id, patch)

// Remove blank items the user created and abandoned.
function cleanupBlank(it: Item | undefined) {
  if (!it) return
  // An untitled "？" goal is intentional: it marks an unknown step in the vision tree.
  if (it.type === 'goal' && it.status === 'unknown') return
  if (!it.title?.trim() && !it.notes?.trim() && !data.linked(it.id).length) data.remove(it.id)
}
watch(id, (_n, old) => {
  flush()
  picking.value = null
  if (old && !ui.drawer.includes(old)) cleanupBlank(data.byId.get(old))
  nextTick(() => {
    fit(titleEl.value)
    if (item.value && !item.value.title) titleEl.value?.focus()
  })
})
onBeforeUnmount(flush)

const titleEl = ref<HTMLTextAreaElement>()
function fit(el?: HTMLTextAreaElement) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
const autosize = (e: Event) => fit(e.target as HTMLTextAreaElement)

function close() {
  flush()
  const stack = [...ui.drawer]
  ui.close()
  for (const x of stack) cleanupBlank(data.byId.get(x))
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !picking.value) close()
}

/** What else disappears with an item, so the confirmation can say so. */
function deleteDetails(it: Item): string[] {
  const out: string[] = []
  const links = data.linked(it.id).length
  if (it.type === 'task' && it.status === 'done') out.push(`它带来的 ${TASK_XP[it.difficulty] ?? 0} 点经验会被扣除`)
  if (it.type === 'habit') {
    const n = data.doneDates(it.id).size
    if (n) out.push(`${n} 次打卡记录会一起删除（共 ${n * 5} 点经验）`)
  }
  if (it.type === 'person') {
    const n = new Set((it as Person).contacts ?? []).size
    if (n) out.push(`${n} 条往来记录会一起删除`)
  }
  if (it.type === 'goal') {
    const kids = data.goals.filter((g) => g.parentId === it.id).length
    const tasks = data.tasks.filter((t) => t.goalId === it.id).length
    if (kids) out.push(`${kids} 个子目标会变成独立的目标（不会删除）`)
    if (tasks) out.push(`${tasks} 个任务会解除与它的挂靠（不会删除）`)
  }
  if (links) out.push(`与其他条目的 ${links} 条关联会移除`)
  return out
}

async function del() {
  const it = item.value
  if (!it) return
  const ok = await ui.confirm({
    title: `删除${typeLabel(it)}「${titleOf(it)}」？`,
    message: '删除后无法撤销（可以从之前导出的备份恢复）。',
    details: deleteDetails(it),
    confirmText: '删除',
    danger: true,
  })
  if (!ok || item.value?.id !== it.id) return
  draft.value = {}
  pendingId = undefined
  ui.back()
  await data.remove(it.id)
}

// ---- links ----
const picking = ref<null | 'link' | 'prereq'>(null)
const linked = computed(() => (item.value ? data.linked(item.value.id) : []))
function pickLink(other: string) {
  if (item.value) data.link(item.value.id, other)
  picking.value = null
}

// ---- task ----
const task = computed(() => (item.value?.type === 'task' ? (item.value as Task) : undefined))
const prereqs = computed(() => (task.value?.prereqIds ?? []).map((x) => data.byId.get(x)).filter((x): x is Item => !!x))
const locked = computed(() => !!task.value && isLocked(task.value, data.byId))
function pickPrereq(other: string) {
  if (!task.value) return
  set({ prereqIds: [...new Set([...(task.value.prereqIds ?? []), other])] })
  picking.value = null
}
const dependents = computed(() => (task.value ? data.tasks.filter((t) => t.prereqIds?.includes(task.value!.id)) : []))

// ---- habit ----
const habit = computed(() => (item.value?.type === 'habit' ? (item.value as Habit) : undefined))
const habitDone = computed(() => (habit.value ? data.doneDates(habit.value.id) : new Set<string>()))
function toggleDay(d: number) {
  if (!habit.value) return
  const s = new Set(habit.value.days)
  if (s.has(d)) s.delete(d)
  else s.add(d)
  set({ days: [...s].sort() })
}
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

// ---- goal ----
const goal = computed(() => (item.value?.type === 'goal' ? (item.value as Goal) : undefined))
const descendants = (gid: string): Set<string> => {
  const out = new Set<string>([gid])
  let grew = true
  while (grew) {
    grew = false
    for (const g of data.goals) if (g.parentId && out.has(g.parentId) && !out.has(g.id)) (out.add(g.id), (grew = true))
  }
  return out
}
const parentOptions = computed(() => {
  if (!goal.value) return []
  const bad = descendants(goal.value.id)
  return data.goals.filter((g) => !bad.has(g.id))
})
const childGoals = computed(() => (goal.value ? data.goals.filter((g) => g.parentId === goal.value!.id) : []))
const goalTasks = computed(() => (goal.value ? data.tasks.filter((t) => t.goalId === goal.value!.id) : []))
const progress = computed(() => (goal.value ? goalProgress(goal.value, data.goals, data.tasks) : { done: 0, total: 0 }))
async function addChildGoal() {
  if (!goal.value) return
  const g = await data.create('goal', { parentId: goal.value.id, status: 'unknown' })
  if (g) ui.open(g.id)
}
async function addGoalTask() {
  if (!goal.value) return
  const t = await data.create('task', { goalId: goal.value.id })
  if (t) ui.open(t.id)
}

// ---- person ----
const person = computed(() => (item.value?.type === 'person' ? (item.value as Person) : undefined))
const RELATIONS = ['家人', '伴侣', '挚友', '朋友', '同学', '同事', '导师', '前辈', '后辈', '网友']
/** Birthday being edited. Month and day are required, the year is optional; a half-filled date stays local until complete. */
const bdParts = ref<{ y?: number; m: number; d: number }>({ m: 0, d: 0 })
watch(
  () => [person.value?.id, person.value?.birthday],
  () => {
    const b = parseBirthday(person.value?.birthday)
    if (b) bdParts.value = { ...b }
    else if (bdParts.value.m && bdParts.value.d) bdParts.value = { m: 0, d: 0 }
  },
  { immediate: true },
)
watch(
  () => person.value?.id,
  () => (bdParts.value = { ...(parseBirthday(person.value?.birthday) ?? { m: 0, d: 0 }) }),
)
function setBirthday(part: 'y' | 'm' | 'd', raw: string) {
  const cur = { ...bdParts.value }
  const n = Number(raw) || 0
  if (part === 'y') cur.y = n >= 1900 && n <= 2100 ? n : undefined
  else cur[part] = n
  bdParts.value = cur
  if (!cur.m || !cur.d) {
    if (person.value?.birthday) set({ birthday: null })
    return
  }
  const md = `${String(cur.m).padStart(2, '0')}-${String(cur.d).padStart(2, '0')}`
  set({ birthday: cur.y ? `${cur.y}-${md}` : md })
}

// ---- event ----
const event = computed(() => (item.value?.type === 'event' ? (item.value as LifeEvent) : undefined))

// ---- note ----
const note = computed(() => (item.value?.type === 'note' ? (item.value as Note) : undefined))
async function convert(type: 'task' | 'goal') {
  if (!note.value) return
  const n = note.value
  const created = await data.create(type, type === 'goal' ? { title: n.title, status: 'todo' } : { title: n.title })
  if (!created) return
  await data.link(n.id, created.id)
  if (n.kind === 'idea') set({ status: 'done' })
  ui.open(created.id)
}

const isOpen = computed(() => !!item.value)
watch(isOpen, (o) => {
  if (o) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Transition name="scrim">
    <div v-if="isOpen" class="scrim" @mousedown.self="close" />
  </Transition>
  <Transition name="drawer">
    <aside v-if="item" class="drawer" role="dialog" :aria-label="titleOf(item)">
      <header class="bar">
        <button v-if="ui.drawer.length > 1" class="btn ghost sm icon" title="返回" @click="ui.back()"><ArrowLeft /></button>
        <span class="chip"><component :is="itemIcon(item)" />{{ typeLabel(item) }}</span>
        <span class="grow" />
        <button class="btn ghost sm" title="删除" aria-label="删除" @click="del">
          <Trash2 />
        </button>
        <button class="btn ghost sm icon" title="关闭 (Esc)" @click="close"><X /></button>
      </header>

      <div class="body" :key="item.id">
        <textarea
          ref="titleEl"
          class="title"
          rows="1"
          :value="val('title')"
          :placeholder="item.type === 'person' ? '名字' : '标题'"
          @input="(e) => (text('title', (e.target as HTMLTextAreaElement).value), autosize(e))"
          @keydown.enter.prevent
        />

        <!-- TASK -->
        <template v-if="task">
          <div v-if="locked" class="notice"><Lock :size="14" />前置任务还没完成，这个任务暂时锁定</div>
          <div class="field">
            <label>状态</label>
            <Seg
              :model-value="task.status"
              :options="[
                { value: 'todo', label: '待办' },
                { value: 'doing', label: '进行中' },
                { value: 'done', label: '完成', color: 'var(--ok)' },
                { value: 'dropped', label: '放下' },
              ]"
              @update:model-value="(v) => set({ status: v })"
            />
          </div>
          <div class="field">
            <label>属于哪种成长</label>
            <AttrPick :model-value="task.attr" @update:model-value="(v) => set({ attr: v })" />
          </div>
          <div class="stack">
            <div class="field">
              <label>难度</label>
              <Seg
                :model-value="task.difficulty"
                :options="[
                  { value: 1, label: `轻松 +${TASK_XP[1]}` },
                  { value: 2, label: `普通 +${TASK_XP[2]}` },
                  { value: 3, label: `艰巨 +${TASK_XP[3]}` },
                ]"
                @update:model-value="(v) => set({ difficulty: v })"
              />
            </div>
            <div class="field">
              <label>截止日期</label>
              <div class="row quick">
                <input type="date" class="input date" :value="task.due ?? ''" @change="(e) => set({ due: (e.target as HTMLInputElement).value || null })" />
                <button class="btn sm ghost" @click="set({ due: today() })">今天</button>
                <button class="btn sm ghost" @click="set({ due: addDays(today(), 1) })">明天</button>
                <button class="btn sm ghost" @click="set({ due: addDays(today(), 7) })">一周后</button>
                <button v-if="task.due" class="btn sm ghost" @click="set({ due: null })">清除</button>
              </div>
            </div>
          </div>
          <div class="field">
            <label>为哪个目标</label>
            <select class="select" :value="task.goalId ?? ''" @change="(e) => set({ goalId: (e.target as HTMLSelectElement).value || null })">
              <option value="">— 不属于任何目标 —</option>
              <option v-for="g in data.goals" :key="g.id" :value="g.id">{{ titleOf(g) }}</option>
            </select>
          </div>
          <div class="field">
            <label>前置任务（先完成它们）</label>
            <div class="refs">
              <div v-for="p in prereqs" :key="p.id" class="ref" @click="ui.open(p.id)">
                <span class="dot" :style="{ '--c': (p as Task).status === 'done' ? 'var(--ok)' : 'var(--text-3)' }" />
                <span class="grow ellipsis">{{ titleOf(p) }}</span>
                <button class="btn ghost sm icon" title="移除" @click.stop="set({ prereqIds: task.prereqIds!.filter((x) => x !== p.id) })"><X /></button>
              </div>
              <ItemPicker v-if="picking === 'prereq'" :types="['task']" :exclude="[task.id, ...(task.prereqIds ?? [])]" placeholder="搜索任务…" @pick="pickPrereq" @close="picking = null" />
              <button v-else class="btn sm ghost add" @click="picking = 'prereq'"><Plus />添加前置</button>
            </div>
            <div v-if="dependents.length" class="faint small">完成后解锁：{{ dependents.map(titleOf).join('、') }}</div>
          </div>
        </template>

        <!-- HABIT -->
        <template v-if="habit">
          <div class="stats">
            <div><b class="num">{{ streak(habit, habitDone, today()) }}</b><span>当前连续</span></div>
            <div><b class="num">{{ bestStreak(habit, habitDone) }}</b><span>最佳连续</span></div>
            <div><b class="num">{{ habitDone.size }}</b><span>累计次数</span></div>
          </div>
          <div class="field">
            <label>哪几天做</label>
            <div class="days">
              <button v-for="d in WEEK_ORDER" :key="d" :class="{ on: habit.days.includes(d) }" @click="toggleDay(d)">{{ weekdayLabel(d) }}</button>
            </div>
            <div class="row quick">
              <button class="btn sm ghost" @click="set({ days: [0, 1, 2, 3, 4, 5, 6] })">每天</button>
              <button class="btn sm ghost" @click="set({ days: [1, 2, 3, 4, 5] })">工作日</button>
              <button class="btn sm ghost" @click="set({ days: [0, 6] })">周末</button>
            </div>
          </div>
          <div class="field">
            <label>属于哪种成长</label>
            <AttrPick :model-value="habit.attr" @update:model-value="(v) => set({ attr: v })" />
          </div>
          <label class="row toggle">
            <input type="checkbox" :checked="!!habit.archived" @change="(e) => set({ archived: (e.target as HTMLInputElement).checked || null })" />
            暂停这个习惯（不再出现在今日，记录保留）
          </label>
        </template>

        <!-- GOAL -->
        <template v-if="goal">
          <div class="field">
            <label>状态</label>
            <Seg
              :model-value="goal.status"
              :options="[
                { value: 'unknown', label: '？ 还不清楚' },
                { value: 'todo', label: '未开始' },
                { value: 'doing', label: '进行中' },
                { value: 'done', label: '达成', color: 'var(--gold)' },
              ]"
              @update:model-value="(v) => set({ status: v })"
            />
          </div>
          <div class="field">
            <label>上层目标</label>
            <select class="select" :value="goal.parentId ?? ''" @change="(e) => set({ parentId: (e.target as HTMLSelectElement).value || null })">
              <option value="">— 这是一个终极目标 —</option>
              <option v-for="g in parentOptions" :key="g.id" :value="g.id">{{ titleOf(g) }}</option>
            </select>
          </div>
          <div v-if="progress.total" class="faint small">任务进度 {{ progress.done }} / {{ progress.total }}（含所有下层目标）</div>
          <div class="field">
            <label>下一步 / 子目标</label>
            <div class="refs">
              <div v-for="c in childGoals" :key="c.id" class="ref" @click="ui.open(c.id)">
                <span class="dot" :style="{ '--c': c.status === 'done' ? 'var(--gold)' : 'var(--text-3)' }" />
                <span class="grow ellipsis">{{ c.status === 'unknown' && !c.title ? '？' : titleOf(c) }}</span>
              </div>
              <button class="btn sm ghost add" @click="addChildGoal"><Plus />添加子目标</button>
            </div>
          </div>
          <div class="field">
            <label>挂在这里的任务</label>
            <div class="refs">
              <div v-for="t in goalTasks" :key="t.id" class="ref" @click="ui.open(t.id)">
                <span class="dot" :style="{ '--c': t.status === 'done' ? 'var(--ok)' : 'var(--text-3)' }" />
                <span class="grow ellipsis" :class="{ struck: t.status === 'done' }">{{ titleOf(t) }}</span>
              </div>
              <button class="btn sm ghost add" @click="addGoalTask"><Plus />添加任务</button>
            </div>
          </div>
        </template>

        <!-- PERSON -->
        <template v-if="person">
          <div class="grid2">
            <div class="field">
              <label>关系</label>
              <input class="input" list="relations" :value="val('relation')" placeholder="朋友、导师…" @input="(e) => text('relation', (e.target as HTMLInputElement).value)" />
              <datalist id="relations"><option v-for="r in RELATIONS" :key="r" :value="r" /></datalist>
            </div>
            <div class="field">
              <label>亲密度</label>
              <div class="hearts">
                <button v-for="n in 5" :key="n" :class="{ on: n <= person.closeness }" :title="`${n} / 5`" @click="set({ closeness: n })">♥</button>
              </div>
            </div>
          </div>
          <div class="field">
            <label>特征 / 印象</label>
            <input class="input" :value="val('traits')" placeholder="例如：靠谱、爱爬山、说话直" @input="(e) => text('traits', (e.target as HTMLInputElement).value)" />
          </div>
          <div class="grid2">
            <div class="field">
              <label>生日</label>
              <div class="bday">
                <select class="input" :value="bdParts.m || ''" aria-label="月" @change="(e) => setBirthday('m', (e.target as HTMLSelectElement).value)">
                  <option value="">月</option>
                  <option v-for="m in 12" :key="m" :value="m">{{ m }}月</option>
                </select>
                <select class="input" :value="bdParts.d || ''" aria-label="日" @change="(e) => setBirthday('d', (e.target as HTMLSelectElement).value)">
                  <option value="">日</option>
                  <option v-for="d in 31" :key="d" :value="d">{{ d }}日</option>
                </select>
                <input
                  class="input year"
                  inputmode="numeric"
                  maxlength="4"
                  placeholder="年(可选)"
                  :value="bdParts.y ?? ''"
                  :disabled="!bdParts.m || !bdParts.d"
                  @change="(e) => setBirthday('y', (e.target as HTMLInputElement).value)"
                />
              </div>
            </div>
            <div class="field">
              <label>怎么认识的</label>
              <input class="input" :value="val('met')" placeholder="例如：2019 年大学社团" @input="(e) => text('met', (e.target as HTMLInputElement).value)" />
            </div>
          </div>
          <div class="contact card-in">
            <div class="grow">
              <div>上次联系：<b>{{ lastContact(person) ? friendly(lastContact(person)!) : '还没记录' }}</b></div>
              <div class="faint small">
                <template v-if="CONTACT_INTERVAL[person.closeness]">建议每 {{ CONTACT_INTERVAL[person.closeness] }} 天联系一次</template>
                <template v-else>亲密度 1 不做提醒</template>
                <template v-if="contactOverdue(person, today()) !== null"> · <span class="warn-text">该联系了</span></template>
              </div>
            </div>
            <button class="btn sm" :class="{ primary: !person.contacts?.includes(today()) }" @click="data.contact(person.id)">
              {{ person.contacts?.includes(today()) ? '今天已联系 ✓' : '今天联系过' }}
            </button>
          </div>
          <div v-if="person.contacts?.length" class="faint small">共联系 {{ new Set(person.contacts).size }} 次。往来记录和备注在「人物」页查看。</div>
        </template>

        <!-- EVENT -->
        <template v-if="event">
          <div class="grid2">
            <div class="field">
              <label>日期</label>
              <input type="date" class="input" :value="event.date" @change="(e) => set({ date: (e.target as HTMLInputElement).value || today() })" />
            </div>
            <div class="field">
              <label>当时的感受</label>
              <Seg
                :model-value="event.feeling ?? 'neutral'"
                :options="[
                  { value: 'good', label: '美好', color: 'var(--ok)' },
                  { value: 'neutral', label: '平静' },
                  { value: 'bad', label: '艰难', color: 'var(--danger)' },
                ]"
                @update:model-value="(v) => set({ feeling: v })"
              />
            </div>
          </div>
          <div class="field">
            <label>类型</label>
            <Seg
              :model-value="event.kind"
              :options="[
                { value: 'event', label: '事件' },
                { value: 'milestone', label: '里程碑', color: 'var(--gold)' },
                { value: 'decision', label: '抉择', color: 'var(--attr-career)' },
              ]"
              @update:model-value="(v) => set({ kind: v })"
            />
          </div>
          <template v-if="event.kind === 'decision'">
            <div class="field">
              <label>当时有哪些选项</label>
              <textarea class="textarea" rows="2" :value="val('options')" placeholder="例如：考研 / 直接工作 / 出国" @input="(e) => text('options', (e.target as HTMLTextAreaElement).value)" />
            </div>
            <div class="field">
              <label>最终选择</label>
              <input class="input" :value="val('choice')" @input="(e) => text('choice', (e.target as HTMLInputElement).value)" />
            </div>
            <div class="field">
              <label>为什么这样选</label>
              <textarea class="textarea" rows="2" :value="val('reason')" @input="(e) => text('reason', (e.target as HTMLTextAreaElement).value)" />
            </div>
          </template>
        </template>

        <!-- NOTE -->
        <template v-if="note">
          <div class="field">
            <label>类型</label>
            <Seg
              :model-value="note.kind"
              :options="[
                { value: 'idea', label: '灵感：我自己的想法' },
                { value: 'intel', label: '情报：收集来的资料' },
              ]"
              @update:model-value="(v) => set(v === 'idea' ? { kind: v, status: note!.status ?? 'seed' } : { kind: v })"
            />
          </div>
          <div v-if="note.kind === 'idea'" class="field">
            <label>状态</label>
            <Seg
              :model-value="note.status ?? 'seed'"
              :options="[
                { value: 'seed', label: '萌芽' },
                { value: 'growing', label: '发展中' },
                { value: 'done', label: '已转化', color: 'var(--ok)' },
                { value: 'dropped', label: '放弃' },
              ]"
              @update:model-value="(v) => set({ status: v })"
            />
          </div>
          <div v-else class="field">
            <label>来源</label>
            <div class="row">
              <input class="input" :value="val('source')" placeholder="链接或出处" @input="(e) => text('source', (e.target as HTMLInputElement).value)" />
              <a v-if="/^https?:\/\//.test(note.source ?? '')" class="btn sm" :href="note.source" target="_blank" rel="noopener">打开</a>
            </div>
          </div>
          <div class="field">
            <label>标签</label>
            <input class="input" :value="val('tags')" placeholder="用逗号或空格分隔" @input="(e) => text('tags', (e.target as HTMLInputElement).value)" />
          </div>
          <div class="row">
            <button class="btn sm" @click="convert('task')">转为任务</button>
            <button class="btn sm" @click="convert('goal')">转为目标</button>
          </div>
        </template>

        <div class="field">
          <label>{{ item.type === 'event' ? '发生了什么' : item.type === 'note' ? '内容' : '备注' }}</label>
          <textarea class="textarea notes" :value="val('notes')" placeholder="写点什么…" @input="(e) => text('notes', (e.target as HTMLTextAreaElement).value)" />
        </div>

        <section class="links">
          <div class="label row"><Link2 :size="13" />关联 <span class="faint">{{ linked.length || '' }}</span></div>
          <div class="refs">
            <RelatedGroups :id="item.id" :kinds="['link']" editable />
            <ItemPicker v-if="picking === 'link'" :exclude="[item.id, ...linked.map((l) => l.id)]" @pick="pickLink" @close="picking = null" />
            <button v-else class="btn sm ghost add" @click="picking = 'link'"><Plus />关联到人物、目标、灵感…</button>
          </div>
        </section>

        <div class="meta faint">创建于 {{ friendly(item.createdAt.slice(0, 10)) }}</div>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(10, 9, 14, 0.22);
}
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 61;
  width: min(480px, 100vw);
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
}
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 24px 40px;
  display: grid;
  gap: 18px;
  align-content: start;
}
.title {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.35;
  resize: none;
  outline: none;
  padding: 0;
  overflow: hidden;
  min-height: 30px;
}
.title::placeholder {
  color: var(--text-3);
}
.grid2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 18px;
}
.quick {
  gap: 2px;
  flex-wrap: wrap;
}
.stack {
  display: grid;
  gap: 18px;
}
.date {
  width: 160px;
  margin-right: 6px;
}
.small {
  font-size: 12px;
}
.notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--sunken);
  color: var(--text-2);
  font-size: 13px;
}
.refs {
  display: grid;
  gap: 2px;
}
.ref {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 8px;
  cursor: pointer;
  min-height: 34px;
}
.ref:hover {
  background: var(--hover);
}
.ref .btn {
  opacity: 0;
}
.ref:hover .btn {
  opacity: 1;
}
.add {
  justify-self: start;
}
.struck {
  text-decoration: line-through;
  color: var(--text-3);
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.stats > div {
  display: grid;
  justify-items: center;
  padding: 12px 8px;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.stats b {
  font-size: 22px;
}
.stats span {
  font-size: 12px;
  color: var(--text-3);
}
.days {
  display: flex;
  gap: 6px;
}
.days button {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  color: var(--text-2);
}
.days button.on {
  background: var(--ink);
  color: var(--on-ink);
  border-color: var(--ink);
}
.toggle {
  color: var(--text-2);
  cursor: pointer;
}
.hearts {
  display: flex;
  gap: 2px;
}
.hearts button {
  border: none;
  background: none;
  font-size: 20px;
  line-height: 1;
  padding: 4px 2px;
  cursor: pointer;
  color: var(--border-strong);
  transition: transform 0.1s;
}
.hearts button.on {
  color: var(--attr-social);
}
.hearts button:hover {
  transform: scale(1.15);
}
.contact {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.warn-text {
  color: var(--danger);
  font-weight: 600;
}
.notes {
  min-height: 120px;
}
.bday {
  display: grid;
  grid-template-columns: 1fr 1fr 1.2fr;
  gap: 6px;
}
.bday .input {
  min-width: 0;
  padding-left: 8px;
  padding-right: 4px;
}
.links {
  display: grid;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px dashed var(--border);
}
.meta {
  font-size: 12px;
}
.scrim-enter-active,
.scrim-leave-active {
  transition: opacity 0.2s;
}
.scrim-enter-from,
.scrim-leave-to {
  opacity: 0;
}
.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}
</style>
