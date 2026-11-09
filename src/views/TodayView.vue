<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Cake, Check, Flame, HardDriveDownload, Lightbulb, Newspaper, PhoneCall, Plus, Repeat, Sparkles, Sunrise, Swords } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { addDays, fromKey, greeting, today, weekdayLabel } from '@/lib/dates'
import { activeStreak, contactOverdue, isScheduled, rankOf, streak, taskBucket } from '@/lib/game'
import { daysToBirthday } from '@/lib/people'
import { titleOf } from '@/lib/itemView'
import { attrOf, MOODS, type Task } from '@/lib/types'
import Avatar from '@/components/Avatar.vue'
import XpBar from '@/components/XpBar.vue'
import TaskRow from '@/components/TaskRow.vue'

const data = useData()
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
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

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
  { done: data.habits.length > 0, label: '养成第一个习惯', to: '/habits' },
  { done: data.goals.some((g) => !g.parentId), label: '立下一个终极目标', to: '/goals' },
  { done: data.people.length > 0, label: '记下一位重要的人', to: '/people' },
])
const onboarding = computed(() => steps.value.some((s) => !s.done))

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
  <div class="page">
    <header class="banner">
      <RouterLink to="/character" class="who">
        <div class="av">
          <Avatar :name="data.profile.name" :size="68" />
          <span class="lvbadge num">{{ data.level.level }}</span>
        </div>
        <div class="grow">
          <div class="hello">{{ greeting() }} · {{ dateLine }}</div>
          <h1 class="name">{{ data.profile.name || '旅人' }}</h1>
          <div class="rankline">
            <span class="rank">{{ data.profile.title || rankOf(data.level.level).title }}</span>
            <span class="lvtext num">Lv.{{ data.level.level }}</span>
          </div>
          <div class="xp"><XpBar :into="data.level.into" :need="data.level.need" :height="8" /></div>
          <div class="xpnums num">{{ data.level.into }} / {{ data.level.need }} XP · 距 Lv.{{ data.level.level + 1 }} 还差 {{ data.level.need - data.level.into }}</div>
        </div>
      </RouterLink>
      <div class="quests">
        <div class="quest">
          <Swords :size="18" />
          <b class="num">{{ doneToday.length }}<small>/{{ taskTotal }}</small></b>
          <span>今日任务</span>
          <i :style="{ width: `${pct(doneToday.length, taskTotal)}%` }" />
        </div>
        <div class="quest">
          <Repeat :size="18" />
          <b class="num">{{ habitsDone }}<small>/{{ habits.length }}</small></b>
          <span>今日习惯</span>
          <i :style="{ width: `${pct(habitsDone, habits.length)}%` }" />
        </div>
        <div class="quest gold">
          <Sparkles :size="18" />
          <b class="num">+{{ xpToday }}</b>
          <span>今日经验</span>
        </div>
        <div class="quest fire" :class="{ lit: active > 0 }">
          <Flame :size="18" />
          <b class="num">{{ active }}<small>天</small></b>
          <span>连续活跃</span>
        </div>
      </div>
    </header>

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

    <div class="grid">
      <div class="col">
        <section>
          <h2 class="section-title">今天要做 <span class="count">{{ todays.length + overdue.length }}</span></h2>
          <div class="card">
            <form class="quick" @submit.prevent="addTask">
              <Plus :size="16" class="faint" />
              <input v-model="quick" class="grow" placeholder="添加今天要做的事，回车保存" />
            </form>

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
        </section>

        <section>
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
        </section>
      </div>

      <div class="col">
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
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
  gap: 24px;
  align-items: start;
}
.col {
  display: grid;
  gap: 24px;
  min-width: 0;
}
.col > * {
  min-width: 0;
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
.banner {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: center;
  padding: 22px 24px;
  margin-bottom: 20px;
  border-radius: 20px;
  overflow: hidden;
  color: #f4f1ea;
  background:
    radial-gradient(circle at 12% 0%, rgba(226, 176, 74, 0.28), transparent 45%),
    radial-gradient(circle at 100% 100%, rgba(120, 86, 220, 0.25), transparent 50%),
    linear-gradient(135deg, #1d1b27, #2a2537);
  box-shadow: var(--shadow-lg);
}
/* faint hexagon pattern */
.banner::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.07;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='64' viewBox='0 0 56 64'%3E%3Cpath d='M28 2l24 14v32L28 62 4 48V16z' fill='none' stroke='%23e2b04a' stroke-width='1.5'/%3E%3C/svg%3E");
  pointer-events: none;
}
.who {
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}
.av {
  position: relative;
  flex: none;
  filter: drop-shadow(0 0 18px rgba(226, 176, 74, 0.35));
}
.lvbadge {
  position: absolute;
  right: -6px;
  bottom: -2px;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 800;
  color: #1c1a24;
  background: linear-gradient(135deg, #f0c869, #c08a22);
  border: 2px solid #1d1b27;
}
.hello {
  font-size: 13px;
  color: rgba(244, 241, 234, 0.6);
}
.name {
  margin: 2px 0 4px;
  font-size: 26px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rankline {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.rank {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #f0c869;
  background: rgba(226, 176, 74, 0.14);
  border: 1px solid rgba(226, 176, 74, 0.35);
}
.lvtext {
  font-weight: 800;
  color: #f0c869;
}
/* The XP bar's track uses --sunken; give it a light track on the dark banner. */
.xp {
  max-width: 420px;
  --sunken: rgba(255, 255, 255, 0.12);
}
.xpnums {
  margin-top: 6px;
  font-size: 12px;
  color: rgba(244, 241, 234, 0.55);
}
.quests {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, 136px);
  gap: 10px;
}
.quest {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 10px;
  align-items: center;
  padding: 11px 14px 13px;
  border-radius: 14px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(244, 241, 234, 0.6);
}
.quest svg {
  grid-row: span 2;
}
.quest b {
  font-size: 20px;
  line-height: 1.1;
  color: #f4f1ea;
}
.quest small {
  font-size: 13px;
  font-weight: 600;
  color: rgba(244, 241, 234, 0.45);
  margin-left: 1px;
}
.quest span {
  font-size: 12px;
}
.quest i {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  background: linear-gradient(90deg, #f0c869, #c08a22);
  transition: width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.quest.gold svg,
.quest.gold b {
  color: #f0c869;
}
.quest.fire.lit svg {
  color: #ff8a3d;
  filter: drop-shadow(0 0 6px rgba(255, 138, 61, 0.6));
}
@media (max-width: 980px) {
  .banner {
    grid-template-columns: 1fr;
  }
  .quests {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .banner {
    padding: 18px 16px;
    border-radius: 16px;
    gap: 16px;
  }
  .name {
    font-size: 22px;
  }
  .quests {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
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
@media (max-width: 1180px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .col:last-child {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    align-items: start;
  }
}
</style>
