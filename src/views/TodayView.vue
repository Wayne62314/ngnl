<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Cake, Check, Flame, HardDriveDownload, Lightbulb, Newspaper, PhoneCall, Plus, Sunrise, Smartphone, X } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { addDays, fromKey, greeting, today, weekdayLabel } from '@/lib/dates'
import { activeStreak, contactOverdue, isScheduled, streak, taskBucket } from '@/lib/game'
import { daysToBirthday } from '@/lib/people'
import { useInstall } from '@/stores/install'
import { titleOf } from '@/lib/itemView'
import { attrOf, MOODS, type Task } from '@/lib/types'
import Avatar from '@/components/Avatar.vue'
import TaskRow from '@/components/TaskRow.vue'
import CharacterCard from '@/components/CharacterCard.vue'
import PinnedSims from '@/components/PinnedSims.vue'

const data = useData()
const router = useRouter()
const ui = useUi()
const t = today()
const d = fromKey(t)
const dateLine = `${d.getMonth() + 1}月${d.getDate()}日 · 星期${weekdayLabel(d.getDay())}`

// ---- tasks ----
const open = computed(() => data.tasks.filter((x) => taskBucket(x, t) !== 'closed'))
const overdue = computed(() => open.value.filter((x) => taskBucket(x, t) === 'overdue').sort((a, b) => a.due!.localeCompare(b.due!)))
const todays = computed(() => open.value.filter((x) => ['today', 'doing'].includes(taskBucket(x, t))))
const doneToday = computed(() => data.tasks.filter((x) => x.status === 'done' && x.doneAt === t))

const quick = ref('')
async function addTask() {
  const title = quick.value.trim()
  if (!title) return
  quick.value = ''
  await data.create('task', { title, due: t })
}
const reschedule = (task: Task, due: string) => data.update<Task>(task.id, { due })
const drop = (task: Task) => data.update<Task>(task.id, { status: 'dropped' })

// ---- habits ----
const habits = computed(() => data.habits.filter((h) => !h.archived && isScheduled(h, t)))
const habitsDone = computed(() => habits.value.filter((h) => data.doneDates(h.id).has(t)).length)

// ---- xp today ----
const xpToday = computed(() => data.xp.filter((e) => e.date === t).reduce((s, e) => s + e.xp, 0))
const active = computed(() => activeStreak(data.xp, t))
const taskTotal = computed(() => doneToday.value.length + todays.value.length + overdue.value.length)
/** A line under the name that reacts to how the day is going. */
const headline = computed(() => {
  const left = todays.value.length + overdue.value.length
  if (taskTotal.value && !left) return '今天的任务全部完成！'
  if (doneToday.value.length) return `还剩 ${left} 件事，继续。`
  if (left) return `今天有 ${left} 件事等你。`
  return '今天想做点什么？'
})

// ---- mood ----
const mood = computed(() => data.moodOf(t))
const moodNote = ref(mood.value?.note ?? '')
function pickMood(v: number) {
  data.setMood(t, mood.value?.mood === v ? null : v, moodNote.value)
}
function saveMoodNote() {
  if (mood.value && moodNote.value !== mood.value.note) data.setMood(t, mood.value.mood, moodNote.value)
}

// ---- capture ----
const capture = ref('')
async function captureNote(kind: 'idea' | 'intel') {
  const text = capture.value.trim()
  if (!text) return
  const [first, ...rest] = text.split('\n')
  capture.value = ''
  await data.create('note', { kind, title: first.slice(0, 80), notes: [first.length > 80 ? first : '', ...rest].join('\n').trim() || undefined, ...(kind === 'idea' ? { status: 'seed' } : {}) })
  ui.toast(kind === 'idea' ? '灵感已收进仓库' : '情报已归档')
}

// ---- people to reach out to ----
const birthdays = computed(() =>
  data.people
    .map((p) => ({ p, days: daysToBirthday(p, t) }))
    .filter((x) => x.days !== null && x.days <= 3)
    .sort((a, b) => a.days! - b.days!),
)
const reachOut = computed(() =>
  data.people
    .filter((p) => !birthdays.value.some((b) => b.p.id === p.id))
    .map((p) => ({ p, over: contactOverdue(p, t) }))
    .filter((x) => x.over !== null)
    .sort((a, b) => b.p.closeness - a.p.closeness || b.over! - a.over!)
    .slice(0, 4),
)

// ---- onboarding ----
const steps = computed(() => [
  { done: !!data.profile.name?.trim(), label: '给你的角色起个名字', to: '/character' },
  { done: !!data.profile.baseLevels, label: '设定六维初始等级', to: '/character' },
  { done: data.habits.length > 0, label: '养成第一个习惯', to: '/habits' },
  { done: data.goals.some((g) => !g.parentId), label: '立下一个终极目标', to: '/goals' },
  { done: data.people.length > 0, label: '记下一位重要的人', to: '/people' },
])
const onboarding = computed(() => steps.value.some((s) => !s.done))

// ---- install nudge (phones only, until installed or dismissed) ----
const inst = useInstall()
const nudgeKey = 'ngnl-install-nudge'
const nudgeHidden = ref((() => {
  try {
    return localStorage.getItem(nudgeKey) === '1'
  } catch {
    return false
  }
})())
const showNudge = computed(
  () => !nudgeHidden.value && matchMedia('(max-width: 760px)').matches && ['prompt', 'ios-safari', 'in-app', 'ios-other'].includes(inst.platform),
)
function hideNudge() {
  nudgeHidden.value = true
  try {
    localStorage.setItem(nudgeKey, '1')
  } catch {}
}
async function nudgeAction() {
  if (inst.platform === 'prompt' && (await inst.install())) return
  router.push('/settings#install')
}

// ---- backup reminder: data lives only in this browser ----
const daysSince = (iso?: string) => (iso ? (Date.now() - Date.parse(iso)) / 86400000 : Infinity)
const needBackup = computed(() => {
  const m = data.meta
  if (data.items.length < 5 || !m.changedAt) return false
  if (daysSince(m.remindedAt) < 7) return false
  // Remind when there are changes since the last backup and it is at least two weeks old.
  return daysSince(m.lastBackupAt) >= 14 && (!m.lastBackupAt || m.changedAt > m.lastBackupAt)
})
</script>

<template>
  <div class="page today">
    <!-- Hero: greeting | character card | today's quests -->
    <section class="hero">
      <div class="hero-left">
        <div class="hello">{{ greeting() }} · {{ dateLine }}</div>
        <h1 class="headline serif">{{ data.profile.name || '旅人' }}</h1>
        <p class="tagline serif">{{ headline }}</p>
        <div class="stats">
          <div><b class="num">{{ doneToday.length }}<small>/{{ taskTotal }}</small></b><span>今日任务</span></div>
          <div><b class="num">{{ habitsDone }}<small>/{{ habits.length }}</small></b><span>今日习惯</span></div>
          <div><b class="num gold">+{{ xpToday }}</b><span>今日经验</span></div>
          <div><b class="num" :class="{ fire: active > 0 }">{{ active }}</b><span>连续天数</span></div>
        </div>
        <form class="quick-hero" @submit.prevent="addTask">
          <input v-model="quick" placeholder="记一件今天要做的事…" aria-label="添加今天要做的事" />
          <button class="btn primary" type="submit" :disabled="!quick.trim()"><Plus />添加</button>
        </form>
        <div class="xpline faint num">Lv.{{ data.level.level }} · {{ data.level.into }} / {{ data.level.need }} XP · 距 Lv.{{ data.level.level + 1 }} 还差 {{ data.level.need - data.level.into }}</div>
      </div>

      <div class="hero-card">
        <CharacterCard :width="320" />
      </div>

      <div class="hero-right">
        <h2 class="section-title">今天要做 <span class="count">{{ todays.length + overdue.length }}</span></h2>
        <div class="card tasks">

          <div v-if="overdue.length" class="overdue">
            <div class="sub-head">逾期 · 选一个处理方式，不扣分</div>
            <TaskRow v-for="x in overdue" :key="x.id" :task="x">
              <div class="fix" @click.stop>
                <button class="btn sm" @click="reschedule(x, t)">今天做</button>
                <button class="btn sm ghost" @click="reschedule(x, addDays(t, 1))">明天</button>
                <button class="btn sm ghost" @click="drop(x)">放下</button>
              </div>
            </TaskRow>
          </div>

          <div class="list">
            <TaskRow v-for="x in todays" :key="x.id" :task="x" />
            <TaskRow v-for="x in doneToday" :key="x.id" :task="x" />
          </div>
          <div v-if="!todays.length && !overdue.length && !doneToday.length" class="none faint">今天还没有安排。在上面写下一件小事吧。</div>
          <RouterLink to="/tasks" class="more">全部任务 →</RouterLink>
        </div>
      </div>
    </section>

    <section v-if="showNudge" class="card nudge">
      <Smartphone :size="20" />
      <div class="grow">
        <b>装到主屏幕，像 App 一样用</b>
        <div class="muted">{{ inst.platform === 'prompt' ? '一键安装，全屏打开，断网也能用。' : '两步就好，全屏打开，断网也能用。' }}</div>
      </div>
      <button class="btn primary sm" @click="nudgeAction">{{ inst.platform === 'prompt' ? '安装' : '怎么装' }}</button>
      <button class="btn ghost sm icon" aria-label="不再提示" @click="hideNudge"><X /></button>
    </section>

    <section v-if="needBackup" class="card backup">
      <HardDriveDownload :size="20" />
      <div class="grow">
        <b>{{ data.meta.lastBackupAt ? '有两周没备份了' : '给你的存档做个备份吧' }}</b>
        <div class="muted">数据只存在这个浏览器里。导出一份放到网盘，换电脑或清理浏览器时就不会丢。</div>
      </div>
      <button class="btn primary sm" @click="data.exportBackup()">导出备份</button>
      <button class="btn ghost sm" @click="data.snoozeBackup()">稍后</button>
    </section>

    <section v-if="onboarding" class="card onboard">
      <div class="ob-head">
        <Sunrise :size="20" />
        <div>
          <b>欢迎来到你的人生面板</b>
          <div class="muted">先完成这几步，角色就会开始成长。完成任务、打卡习惯、记录心情都会获得经验。</div>
        </div>
      </div>
      <div class="ob-steps">
        <RouterLink v-for="(s, i) in steps" :key="i" :to="s.to" class="ob-step" :class="{ done: s.done }">
          <span class="check round" :class="{ on: s.done }"><Check /></span>
          {{ s.label }}
        </RouterLink>
      </div>
    </section>

    <PinnedSims />

    <section class="row-2">
      <div>
        <h2 class="section-title">今日习惯 <span class="count">{{ habitsDone }} / {{ habits.length }}</span></h2>
        <div v-if="habits.length" class="habits">
          <button
            v-for="h in habits"
            :key="h.id"
            class="habit card"
            :class="{ on: data.doneDates(h.id).has(t) }"
            :style="{ '--c': attrOf(h.attr).color }"
            @click="data.toggleCheckin(h.id)"
            @contextmenu.prevent="ui.open(h.id)"
          >
            <span class="check round" :class="{ on: data.doneDates(h.id).has(t) }"><Check /></span>
            <span class="grow ellipsis">{{ titleOf(h) }}</span>
            <span v-if="streak(h, data.doneDates(h.id), t)" class="streak num"><Flame :size="13" />{{ streak(h, data.doneDates(h.id), t) }}</span>
          </button>
        </div>
        <div v-else class="card none faint">
          今天没有排习惯。<RouterLink to="/habits">去添加 →</RouterLink>
        </div>
      </div>
      <section class="card card-pad">
          <h2 class="section-title">今天心情如何</h2>
          <div class="moods">
            <button v-for="m in MOODS" :key="m.v" :class="{ on: mood?.mood === m.v }" :title="m.label" @click="pickMood(m.v)">
              <span class="emoji">{{ m.emoji }}</span>
              <span class="ml">{{ m.label }}</span>
            </button>
          </div>
          <input
            v-if="mood"
            v-model="moodNote"
            class="input mood-note"
            placeholder="一句话记下今天…"
            @blur="saveMoodNote"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          />
      </section>
    </section>

    <section class="row-2">
      <section class="card card-pad">
          <h2 class="section-title">随手记</h2>
          <textarea v-model="capture" class="textarea" rows="3" placeholder="一个想法、一条有用的信息…（第一行是标题）" @keydown.ctrl.enter="captureNote('idea')" />
          <div class="row cap-btns">
            <button class="btn sm" :disabled="!capture.trim()" @click="captureNote('idea')"><Lightbulb />存为灵感</button>
            <button class="btn sm" :disabled="!capture.trim()" @click="captureNote('intel')"><Newspaper />存为情报</button>
          </div>
      </section>
      <section v-if="reachOut.length || birthdays.length" class="card card-pad">
          <h2 class="section-title">{{ birthdays.length ? '记得联系' : '好久没联系' }}</h2>
          <div class="people">
            <div v-for="{ p, days } in birthdays" :key="p.id" class="person" @click="ui.open(p.id)">
              <Avatar :name="p.title" :size="30" />
              <div class="grow">
                <div class="ellipsis">{{ titleOf(p) }}</div>
                <div class="small bday"><Cake :size="12" />{{ days === 0 ? '今天生日！' : `${days} 天后生日` }}</div>
              </div>
              <button class="btn sm ghost" title="今天联系过" @click.stop="data.contact(p.id)"><PhoneCall />{{ p.contacts?.includes(t) ? '已联系' : '联系过' }}</button>
            </div>
            <div v-for="{ p } in reachOut" :key="p.id" class="person" @click="ui.open(p.id)">
              <Avatar :name="p.title" :size="30" />
              <div class="grow">
                <div class="ellipsis">{{ titleOf(p) }}</div>
                <div class="faint small">{{ p.relation || '朋友' }}</div>
              </div>
              <button class="btn sm ghost" title="今天联系过" @click.stop="data.contact(p.id)"><PhoneCall />联系过</button>
            </div>
          </div>
      </section>
    </section>
  </div>
</template>

<style scoped>
.nudge {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
  color: var(--gold);
  background: linear-gradient(135deg, var(--gold-soft), var(--surface) 75%);
}
.nudge b {
  color: var(--text);
}
.backup {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  margin-bottom: 16px;
  color: var(--gold);
}
.backup b {
  color: var(--text);
}
@media (max-width: 760px) {
  .backup {
    flex-wrap: wrap;
  }
}
.onboard {
  padding: 18px 20px;
  margin-bottom: 24px;
  background: linear-gradient(135deg, var(--gold-soft), var(--surface) 70%);
}
.ob-head {
  display: flex;
  gap: 12px;
  color: var(--gold);
}
.ob-head b {
  color: var(--text);
  font-size: 15px;
}
.ob-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
  margin-top: 14px;
}
.ob-step {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  text-decoration: none;
  font-weight: 500;
  transition: border-color 0.15s;
}
.ob-step:hover {
  border-color: var(--gold);
}
.ob-step.done {
  color: var(--text-3);
  text-decoration: line-through;
}
.ob-step .check {
  width: 18px;
  height: 18px;
}
.ob-step .check svg {
  width: 11px;
}
.quick {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.quick input {
  border: none;
  background: transparent;
  outline: none;
  padding: 2px 0;
}
.overdue {
  background: color-mix(in srgb, var(--danger) 5%, transparent);
  border-bottom: 1px solid var(--border);
}
.sub-head {
  font-size: 12px;
  font-weight: 600;
  color: var(--danger);
  padding: 8px 16px 0;
}
.fix {
  display: flex;
  gap: 2px;
}
.none {
  padding: 22px 16px;
  text-align: center;
}
.none a {
  color: var(--gold);
}
.more {
  display: block;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  font-size: 13px;
  color: var(--text-3);
  text-decoration: none;
}
.more:hover {
  color: var(--text);
}
.habits {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 10px;
}
.habit {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
  box-shadow: none;
}
.habit:hover {
  border-color: var(--c);
}
.habit.on {
  background: color-mix(in srgb, var(--c) 9%, var(--surface));
  border-color: color-mix(in srgb, var(--c) 45%, transparent);
}
.habit .check {
  pointer-events: none;
}
.streak {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  font-weight: 700;
  color: var(--attr-craft);
}
.moods {
  display: flex;
  justify-content: space-between;
  gap: 4px;
}
.moods button {
  flex: 1;
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 8px 0 6px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: none;
  cursor: pointer;
  transition: all 0.15s;
}
.moods button:hover {
  background: var(--hover);
}
.moods .emoji {
  font-size: 24px;
  filter: grayscale(0.6);
  opacity: 0.75;
  transition: all 0.15s;
}
.moods button:hover .emoji,
.moods button.on .emoji {
  filter: none;
  opacity: 1;
  transform: scale(1.1);
}
.moods button.on {
  background: var(--gold-soft);
  border-color: color-mix(in srgb, var(--gold) 40%, transparent);
}
.ml {
  font-size: 11px;
  color: var(--text-3);
}
.mood-note {
  margin-top: 10px;
}
.cap-btns {
  margin-top: 8px;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.people {
  display: grid;
  gap: 4px;
}
.person {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px;
  margin: 0 -6px;
  border-radius: 10px;
  cursor: pointer;
}
.bday {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--gold);
  font-weight: 600;
}
.person:hover {
  background: var(--hover);
}
.small {
  font-size: 12px;
}
/* Below this the side column moves under the main one, as a two-up grid. */
/* ---- option B hero ---- */
.today {
  max-width: 1240px;
}
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px minmax(0, 1.05fr);
  gap: 40px;
  align-items: start;
  margin: 8px 0 36px;
}
.hero > * {
  min-width: 0;
}
.hello {
  font-size: 14px;
  color: var(--text-2);
}
.headline {
  margin: 6px 0 0;
  font-size: 48px;
  font-weight: 900;
  line-height: 1.15;
  letter-spacing: 0.04em;
}
.tagline {
  margin: 8px 0 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-2);
}
.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 24px;
  margin-top: 30px;
}
.stats b {
  display: block;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
}
.stats small {
  font-size: 16px;
  color: var(--text-3);
  font-weight: 500;
}
.stats span {
  font-size: 13px;
  color: var(--text-2);
}
.stats .gold {
  color: var(--gold);
}
.stats .fire {
  color: var(--attr-craft);
}
.quick-hero {
  display: flex;
  gap: 8px;
  margin-top: 30px;
}
.quick-hero input {
  flex: 1;
  min-width: 0;
  height: 46px;
  padding: 0 16px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--surface);
  outline: none;
}
.quick-hero input:focus {
  border-color: var(--gold);
}
.quick-hero .btn {
  height: 46px;
  border-radius: 14px;
  padding: 0 18px;
}
.xpline {
  margin-top: 14px;
  font-size: 12px;
}
.hero-card {
  display: flex;
  justify-content: center;
}
.tasks {
  overflow: hidden;
}
.row-2 {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
  margin-bottom: 20px;
}
.row-2 > * {
  min-width: 0;
}
@media (max-width: 1180px) {
  .hero {
    grid-template-columns: 300px minmax(0, 1fr);
    gap: 28px 36px;
  }
  .hero-card {
    grid-row: span 2;
    order: -1;
  }
  .headline {
    font-size: 40px;
  }
}
@media (max-width: 760px) {
  .hero {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
  }
  .hero-card {
    grid-row: auto;
    order: 0;
  }
  .hero-card :deep(.card-wrap) {
    --w: 250px !important;
  }
  .headline {
    font-size: 34px;
  }
  .tagline {
    font-size: 18px;
  }
  .stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-top: 20px;
  }
  .stats b {
    font-size: 22px;
  }
  .stats small {
    font-size: 12px;
  }
  .stats span {
    font-size: 11px;
  }
  .row-2 {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
