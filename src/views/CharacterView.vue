<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useData } from '@/stores/data'
import { addDays, fromKey, today } from '@/lib/dates'
import { achievements, attrLevel, bestStreak, rankOf } from '@/lib/game'
import { ATTR_ICON } from '@/lib/attrIcons'
import { ATTRS, MOODS, type Profile } from '@/lib/types'
import Avatar from '@/components/Avatar.vue'
import XpBar from '@/components/XpBar.vue'
import Radar from '@/components/Radar.vue'

const data = useData()
const t = today()

// ---- profile, saved on blur ----
const form = reactive<Profile>({ ...data.profile })
watch(
  () => data.profile,
  (p) => Object.assign(form, p),
)
function save() {
  const clean = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v))
  if (JSON.stringify(clean) !== JSON.stringify(data.profile)) data.saveProfile(clean)
}
const FIELDS: { key: keyof Profile; label: string; ph: string }[] = [
  { key: 'background', label: '背景', ph: '你从哪里来，现在在做什么' },
  { key: 'strengths', label: '特长', ph: '你擅长什么' },
  { key: 'weaknesses', label: '弱点', ph: '你想改进什么' },
  { key: 'interests', label: '兴趣', ph: '让你着迷的事' },
]

// ---- attributes ----
const attrs = computed(() =>
  ATTRS.map((a) => ({ ...a, info: attrLevel(data.totals[a.key]) })),
)
const radar = computed(() => attrs.value.map((a) => ({ label: a.label, value: a.info.level, color: a.color })))
const radarMax = computed(() => Math.max(5, ...attrs.value.map((a) => a.info.level)))
const rank = computed(() => rankOf(data.level.level))
const top = computed(() => [...attrs.value].sort((a, b) => b.info.total - a.info.total)[0])

// ---- stats ----
const best = computed(() => Math.max(0, ...data.habits.map((h) => bestStreak(h, data.doneDates(h.id)))))
const stats = computed(() => [
  { label: '完成任务', value: data.tasks.filter((x) => x.status === 'done').length },
  { label: '习惯打卡', value: data.checkins.length },
  { label: '最长连续', value: best.value },
  { label: '记录心情', value: data.moods.length },
])

// ---- mood strip (30 days) ----
const days = computed(() =>
  Array.from({ length: 30 }, (_, i) => {
    const d = addDays(t, i - 29)
    return { d, m: data.moodOf(d) }
  }),
)
const moodAvg = computed(() => {
  const ms = days.value.filter((x) => x.m).map((x) => x.m!.mood)
  return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0
})
const dayLabel = (k: string) => `${fromKey(k).getMonth() + 1}/${fromKey(k).getDate()}`

const ach = computed(() =>
  achievements({ items: data.items, checkins: data.checkins, moods: data.moods, profile: data.profile, bestStreak: best.value }),
)
const unlocked = computed(() => ach.value.filter((a) => a.unlocked).length)
</script>

<template>
  <div class="page">
    <section class="card sheet">
      <div class="id">
        <Avatar :name="form.name" :size="96" />
        <div class="grow">
          <input v-model="form.name" class="name" placeholder="你的名字" @blur="save" />
          <div class="rankrow">
            <span class="rank">{{ rank.title }}</span>
            <span v-if="rank.next" class="faint small">Lv.{{ rank.next.from }} 解锁「{{ rank.next.title }}」</span>
          </div>
          <input v-model="form.title" class="title" placeholder="自定义称号（可选），例如：深夜写代码的人" @blur="save" />
          <div class="lvl">
            <span class="lv num">Lv.{{ data.level.level }}</span>
            <XpBar :into="data.level.into" :need="data.level.need" :height="8" />
            <span class="faint num xp">{{ data.level.into }} / {{ data.level.need }}</span>
          </div>
          <div class="faint small">
            累计 {{ data.totalXp }} XP<template v-if="top && top.info.total"> · 最强属性：<b :style="{ color: top.color }">{{ top.label }}</b></template>
          </div>
        </div>
      </div>
    </section>

    <div class="grid">
      <section class="card card-pad">
        <h2 class="section-title">六维属性</h2>
        <div class="radar-wrap"><Radar :values="radar" :max="radarMax" /></div>
        <div class="attrs">
          <div v-for="a in attrs" :key="a.key" class="attr" :title="a.hint">
            <span class="an" :style="{ color: a.color }"><component :is="ATTR_ICON[a.key]" :size="14" />{{ a.label }}</span>
            <XpBar :into="a.info.into" :need="a.info.need" :color="a.color" :height="5" />
            <span class="num faint">Lv.{{ a.info.level }}</span>
          </div>
        </div>
        <p class="faint small hint">属性来自你做的事：每个任务和习惯都属于一种属性，完成就会为它积累经验。</p>
      </section>

      <section class="card card-pad">
        <h2 class="section-title">角色档案</h2>
        <div class="fields">
          <div v-for="f in FIELDS" :key="f.key" class="field">
            <label>{{ f.label }}</label>
            <textarea v-model="form[f.key]" class="textarea" rows="2" :placeholder="f.ph" @blur="save" />
          </div>
        </div>
      </section>
    </div>

    <div class="stats">
      <div v-for="s in stats" :key="s.label" class="card stat">
        <b class="num">{{ s.value }}</b>
        <span>{{ s.label }}</span>
      </div>
    </div>

    <section class="card card-pad">
      <h2 class="section-title">
        近 30 天心情
        <span v-if="moodAvg" class="count">平均 {{ MOODS[Math.round(moodAvg) - 1].emoji }} {{ moodAvg.toFixed(1) }}</span>
      </h2>
      <div class="strip">
        <div v-for="x in days" :key="x.d" class="day" :title="`${dayLabel(x.d)}${x.m ? ' ' + MOODS[x.m.mood - 1].label + (x.m.note ? '：' + x.m.note : '') : ' 未记录'}`">
          <div class="bar" :class="'m' + (x.m?.mood ?? 0)" :style="{ height: `${x.m ? 20 + x.m.mood * 14 : 6}px` }" />
        </div>
      </div>
      <div class="row strip-axis faint small">
        <span>{{ dayLabel(days[0].d) }}</span><span class="grow" /><span>今天</span>
      </div>
    </section>

    <section>
      <h2 class="section-title">成就 <span class="count">{{ unlocked }} / {{ ach.length }}</span></h2>
      <div class="achs">
        <div v-for="a in ach" :key="a.key" class="card ach" :class="{ on: a.unlocked }">
          <span class="ai">{{ a.icon }}</span>
          <div>
            <b>{{ a.name }}</b>
            <div class="faint small">{{ a.desc }}</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.rankrow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 2px 0 2px;
}
.rank {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: var(--gold);
  background: var(--gold-soft);
  border: 1px solid color-mix(in srgb, var(--gold) 35%, transparent);
}
.an {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.page {
  display: grid;
  gap: 24px;
}
.sheet {
  padding: 26px 28px;
  background:
    radial-gradient(circle at 0% 0%, var(--gold-soft), transparent 55%),
    var(--surface);
}
.id {
  display: flex;
  align-items: center;
  gap: 24px;
}
.name,
.title {
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  outline: none;
  padding: 0;
}
.name {
  font-size: 28px;
  font-weight: 800;
}
.title {
  color: var(--text-2);
  margin: 2px 0 12px;
}
.name:focus,
.title:focus {
  box-shadow: 0 1px 0 var(--gold);
}
.lvl {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 440px;
  margin-bottom: 6px;
}
.lv {
  font-size: 18px;
  font-weight: 800;
  color: var(--gold);
}
.xp {
  font-size: 12px;
  white-space: nowrap;
}
.small {
  font-size: 12px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
.radar-wrap {
  display: grid;
  justify-items: center;
  padding: 4px 0 8px;
}
.attrs {
  display: grid;
  gap: 8px;
}
.attr {
  display: grid;
  grid-template-columns: 62px 1fr 44px;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.an {
  font-weight: 700;
}
.attr .num {
  text-align: right;
  font-size: 12px;
}
.hint {
  margin: 14px 0 0;
}
.fields {
  display: grid;
  gap: 14px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.stat {
  display: grid;
  justify-items: center;
  padding: 16px 8px;
}
.stat b {
  font-size: 26px;
  font-weight: 800;
}
.stat span {
  color: var(--text-3);
  font-size: 12px;
}
.strip {
  display: grid;
  grid-template-columns: repeat(30, 1fr);
  gap: 4px;
  align-items: end;
  height: 96px;
}
.day {
  display: flex;
  align-items: flex-end;
  height: 100%;
}
.bar {
  width: 100%;
  border-radius: 4px;
  background: var(--sunken);
  transition: height 0.4s;
}
.m1 { background: #8b8fa3; }
.m2 { background: #9fb3d1; }
.m3 { background: var(--border-strong); }
.m4 { background: var(--gold-2); }
.m5 { background: var(--gold); }
.strip-axis {
  margin-top: 6px;
}
.achs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.ach {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  box-shadow: none;
  opacity: 0.55;
}
.ach .ai {
  font-size: 24px;
  filter: grayscale(1);
}
.ach.on {
  opacity: 1;
  border-color: color-mix(in srgb, var(--gold) 45%, transparent);
  background: linear-gradient(135deg, var(--gold-soft), var(--surface) 75%);
}
.ach.on .ai {
  filter: none;
}
@media (max-width: 860px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .id {
    gap: 16px;
  }
}
</style>
