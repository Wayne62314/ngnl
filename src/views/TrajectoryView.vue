<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { History, MapPin, MapPinned, Plus } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { today as todayKey } from '@/lib/dates'
import { characterLevel, rankOf } from '@/lib/game'
import { activeOn, footprints, frac, laneOf, lanesFor, placeOn, routeOf, spanOf, statusOf, timePoints } from '@/lib/trajectory'
import { titleOf } from '@/lib/itemView'
import type { Place, Segment } from '@/lib/types'
import TimeScrubber from '@/components/TimeScrubber.vue'
import LifeMap from '@/components/LifeMap.vue'
import Empty from '@/components/Empty.vue'

const data = useData()
const ui = useUi()
const t = todayKey()

const tab = ref<'lanes' | 'map' | 'places'>('lanes')
const at = ref(t)

const lanes = computed(() => lanesFor(data.profile.lanes, data.segments))
/** How much of your life the axis shows; long histories squeeze recent years otherwise. */
const range = ref<'all' | '10' | '3'>('10')
const span = computed(() => {
  const full = spanOf(data.segments, data.events, t)
  if (range.value === 'all') return full
  const from = String(Number(t.slice(0, 4)) - Number(range.value)) + '-01-01'
  return { from: from > full.from ? from : full.from, to: full.to }
})
const points = computed(() => timePoints(data.segments, data.events, lanes.value))
const pct = (d: string) => `${(frac(d, span.value) * 100).toFixed(3)}%`
/** Segments that start before the visible range are drawn from its left edge. */
const leftPct = (s: Segment) => pct(s.start < span.value.from ? span.value.from : s.start)
/** Open-ended: a current segment runs to today, a plan runs to the end of the axis. */
const widthPct = (s: Segment) => {
  const end = s.end ?? (s.start > t ? span.value.to : t)
  const start = s.start < span.value.from ? span.value.from : s.start
  return `${Math.max(0.6, (frac(end, span.value) - frac(start, span.value)) * 100).toFixed(3)}%`
}
const years = computed(() => {
  const a = Number(span.value.from.slice(0, 4))
  const b = Number(span.value.to.slice(0, 4))
  const step = b - a > 24 ? 5 : b - a > 10 ? 2 : 1
  const out: number[] = []
  for (let y = Math.ceil(a / step) * step; y <= b; y += step) out.push(y)
  return out
})
const visible = (s: Segment) => (s.end ?? '9999') >= span.value.from
const rows = computed(() =>
  lanes.value.map((l) => ({ ...l, segs: data.segments.filter((s) => s.lane === l.key && visible(s)).sort((a, b) => a.start.localeCompare(b.start)) })),
)
const shownEvents = computed(() => data.events.filter((e) => e.date >= span.value.from))
const shownPoints = computed(() => points.value.filter((p) => p.date >= span.value.from))

// ---- snapshot at the scrubbed date ----
const snapshot = computed(() => {
  const d = at.value
  const [y, m] = d.split('-')
  const active = lanes.value
    .map((l) => ({ lane: l, segs: data.segments.filter((s) => s.lane === l.key && activeOn(s, d)) }))
    .filter((x) => x.segs.length)
  const monthEvents = data.events.filter((e) => e.date.slice(0, 7) === d.slice(0, 7))
  const xp = data.xp.filter((e) => e.date <= d).reduce((s, e) => s + e.xp, 0)
  const lv = characterLevel(xp).level
  return { title: `${y} 年 ${Number(m)} 月的你`, place: placeOn(d, data.segments, data.events), active, monthEvents, lv, rank: rankOf(lv).title, future: d > t, xp }
})

// ---- map ----
const route = computed(() => routeOf(data.segments, data.events, t))
const fps = computed(() => footprints(data.segments, data.events, t))
const mapPlaces = computed(() => fps.value.map((f) => ({ place: f.place, count: f.segments.length + f.events.length })))
const picking = ref(false)
const pinned = ref<{ lat: number; lng: number } | null>(null)
const pinName = ref('')
const focusPlace = ref<string | null>(null)
async function savePin() {
  if (!pinned.value || !pinName.value.trim()) return
  const place: Place = { name: pinName.value.trim(), ...pinned.value }
  const s = await data.create('segment', { lane: 'home', title: place.name, start: at.value.slice(0, 7) + '-01', place })
  pinned.value = null
  pinName.value = ''
  picking.value = false
  if (s) ui.open(s.id)
}

async function addSegment(lane = 'home') {
  const s = await data.create('segment', { lane, start: at.value.slice(0, 7) + '-01' })
  if (s) ui.open(s.id)
}
const addingLane = ref(false)
const laneName = ref('')
async function addLane() {
  const name = laneName.value.trim()
  addingLane.value = false
  laneName.value = ''
  if (!name || lanes.value.some((l) => l.label === name || l.key === name)) return
  await data.saveProfile({ ...data.profile, lanes: [...(data.profile.lanes ?? []), name] })
}
const ym = (d?: string) => (d ? `${d.slice(0, 4)}.${Number(d.slice(5, 7))}` : '至今')
</script>

<template>
  <div class="page wide">
    <header class="page-head">
      <div>
        <h1 class="page-title">轨迹</h1>
        <div class="page-sub">你在哪里、做什么、和谁在一起——过去、现在，以及打算去的地方。</div>
      </div>
      <div class="head-actions">
        <div class="tabs" role="tablist">
          <button role="tab" :aria-selected="tab === 'lanes'" :class="{ on: tab === 'lanes' }" @click="tab = 'lanes'">时间线</button>
          <button role="tab" :aria-selected="tab === 'map'" :class="{ on: tab === 'map' }" @click="tab = 'map'">地图</button>
          <button role="tab" :aria-selected="tab === 'places'" :class="{ on: tab === 'places' }" @click="tab = 'places'">足迹</button>
        </div>
        <RouterLink to="/timeline" class="btn ghost"><History />经历列表</RouterLink>
        <button class="btn primary" @click="addSegment()"><Plus />新的处境</button>
      </div>
    </header>

    <div v-if="!data.segments.length && !data.events.length" class="card">
      <Empty :icon="MapPinned" title="画出你的轨迹" text="从现在的处境开始：你住在哪、在做什么工作或学业、感情和健康状况如何。每一段写下开始时间和城市，过去和打算去的地方都可以加。">
        <button class="btn primary" @click="addSegment()"><Plus />写下现在住在哪</button>
      </Empty>
    </div>

    <template v-else>
      <div class="layout">
        <!-- TIMELINE -->
        <section v-if="tab === 'lanes'" class="card board">
          <div class="grid">
            <span />
            <div class="axis">
              <span v-for="y in years" :key="y" class="num" :style="{ left: pct(`${y}-01-01`) }">{{ y }}</span>
            </div>
            <template v-for="r in rows" :key="r.key">
              <button class="lane-label" :style="{ color: r.color }" :title="`在「${r.label}」上加一段`" @click="addSegment(r.key)">{{ r.label }}</button>
              <div class="lane">
                <button
                  v-for="s in r.segs"
                  :key="s.id"
                  class="seg"
                  :class="statusOf(s, t)"
                  :style="{ left: leftPct(s), width: widthPct(s), '--c': r.color }"
                  :title="`${titleOf(s)}  ${ym(s.start)} – ${ym(s.end)}${s.place ? ' · ' + s.place.name : ''}`"
                  @click="ui.open(s.id)"
                >
                  <span class="ellipsis">{{ titleOf(s) }}</span>
                </button>
              </div>
            </template>
            <span class="lane-label ev">经历</span>
            <div class="lane events">
              <button
                v-for="e in shownEvents"
                :key="e.id"
                class="evpt"
                :class="e.kind"
                :style="{ left: pct(e.date) }"
                :title="`${e.date}  ${titleOf(e)}`"
                @click="ui.open(e.id)"
              />
            </div>
            <div class="lines" aria-hidden="true">
              <span class="now" :style="{ left: pct(t) }"><i>现在</i></span>
              <span class="cursor" :style="{ left: pct(at) }" />
            </div>
          </div>
          <div class="board-foot">
            <div class="row range">
              <span class="faint small">显示</span>
              <div class="tabs mini">
                <button :class="{ on: range === '3' }" @click="range = '3'">近 3 年</button>
                <button :class="{ on: range === '10' }" @click="range = '10'">近 10 年</button>
                <button :class="{ on: range === 'all' }" @click="range = 'all'">全部</button>
              </div>
              <span class="faint small">实色 = 过去和现在 · 虚线 = 打算 · ◆ = 抉择 · 点轨道名字可在那一条上加一段</span>
            </div>
            <form v-if="addingLane" class="row" @submit.prevent="addLane">
              <input v-model="laneName" class="input sm-input" placeholder="轨道名，比如 学业、宠物" maxlength="8" />
              <button class="btn sm primary" type="submit">添加</button>
            </form>
            <button v-else class="btn ghost sm" @click="addingLane = true"><Plus />添加轨道</button>
          </div>
        </section>

        <!-- MAP -->
        <section v-else-if="tab === 'map'" class="mapcol">
          <LifeMap :route="route" :current="snapshot.place" :places="mapPlaces" :pick-mode="picking" @pick="(p) => (pinned = p)" @select="(n) => ((focusPlace = n), (tab = 'places'))" />
          <div class="maptools">
            <button class="btn sm" :class="{ primary: picking }" @click="(picking = !picking), (pinned = null)"><MapPin />{{ picking ? '点地图选位置…（再点一次取消）' : '在地图上标点' }}</button>
            <form v-if="pinned" class="row pinform" @submit.prevent="savePin">
              <span class="faint small num">{{ pinned.lat }}, {{ pinned.lng }}</span>
              <input v-model="pinName" class="input sm-input" placeholder="这个地方叫什么" maxlength="20" />
              <button class="btn sm primary" type="submit" :disabled="!pinName.trim()">作为新的居住处境</button>
            </form>
            <span v-else class="faint small">离线地图 · 城市级 · 不联网</span>
          </div>
        </section>

        <!-- FOOTPRINTS -->
        <section v-else class="places">
          <div v-if="!fps.length" class="card card-pad faint">给处境或经历填上城市，这里就会按地点整理你的足迹。</div>
          <article v-for="f in fps" :key="f.place.name" class="card place" :class="{ focus: focusPlace === f.place.name }">
            <div class="ph">
              <MapPin :size="16" />
              <b class="serif">{{ f.place.name }}</b>
              <span class="faint small num">{{ ym(f.from) }} – {{ f.to === t ? '至今' : ym(f.to) }}</span>
            </div>
            <div class="chips">
              <button v-for="s in f.segments" :key="s.id" class="pchip" :style="{ '--c': laneOf(s.lane, lanes).color }" @click="ui.open(s.id)">{{ laneOf(s.lane, lanes).label }} · {{ titleOf(s) }}</button>
              <button v-for="e in f.events" :key="e.id" class="pchip ev" @click="ui.open(e.id)">经历 · {{ titleOf(e) }}</button>
            </div>
          </article>
        </section>

        <!-- SNAPSHOT -->
        <aside class="card card-pad snap">
          <div class="small gold">{{ snapshot.future ? '时间轴停在未来' : '时间轴停在' }}</div>
          <h2 class="serif snap-title">{{ snapshot.title }}</h2>
          <div class="faint">{{ snapshot.place ? snapshot.place.name : '地点未记录' }}</div>
          <ul v-if="snapshot.active.length" class="now-list">
            <li v-for="a in snapshot.active" :key="a.lane.key">
              <span class="ln" :style="{ color: a.lane.color }">{{ a.lane.label }}</span>
              <span class="grow">
                <button v-for="s in a.segs" :key="s.id" class="link" @click="ui.open(s.id)">{{ titleOf(s) }}</button>
              </span>
            </li>
          </ul>
          <p v-else class="faint small">这个时间点还没有记录处境。</p>
          <div v-if="snapshot.monthEvents.length" class="evbox">
            <div class="small">这个月的经历</div>
            <button v-for="e in snapshot.monthEvents" :key="e.id" class="link" @click="ui.open(e.id)">{{ titleOf(e) }}</button>
          </div>
          <div v-if="!snapshot.future" class="faint small">那时的角色：Lv.{{ snapshot.lv }} {{ snapshot.rank }}（累计 {{ snapshot.xp }} XP）</div>
          <button class="btn sm" @click="addSegment()"><Plus />在 {{ ym(at) }} 加一段处境</button>
        </aside>
      </div>

      <TimeScrubber v-if="tab !== 'places'" v-model="at" class="scrub" :span="span" :points="shownPoints" :today="t" />
    </template>
  </div>
</template>

<style scoped>
.wide {
  max-width: 1280px;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tabs {
  display: flex;
  padding: 3px;
  border-radius: 12px;
  background: var(--sunken);
}
.tabs button {
  padding: 6px 14px;
  border: none;
  border-radius: 9px;
  background: none;
  font: inherit;
  font-size: 13px;
  color: var(--text-2);
  cursor: pointer;
}
.tabs button.on {
  background: var(--surface);
  color: var(--text);
  font-weight: 700;
  box-shadow: var(--shadow);
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
  align-items: start;
}
.layout > * {
  min-width: 0;
}
.board {
  padding: 18px 20px 14px;
  overflow-x: auto;
}
.grid {
  position: relative;
  display: grid;
  grid-template-columns: 80px minmax(560px, 1fr);
  row-gap: 12px;
}
.axis {
  position: relative;
  height: 18px;
  font-size: 11px;
  color: var(--text-3);
}
.axis span {
  position: absolute;
  transform: translateX(-50%);
}
.lane-label {
  align-self: center;
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.lane-label.ev {
  color: var(--text-2);
  cursor: default;
}
.lane {
  position: relative;
  height: 34px;
}
.seg {
  position: absolute;
  top: 0;
  bottom: 0;
  min-width: 6px;
  padding: 0 10px;
  border-radius: 9px;
  border: none;
  font: inherit;
  font-size: 12px;
  text-align: left;
  color: #fff;
  background: var(--c);
  cursor: pointer;
  display: flex;
  align-items: center;
  overflow: hidden;
}
.seg.past {
  background: color-mix(in srgb, var(--c) 30%, var(--surface));
  color: var(--text);
}
.seg.planned {
  background: transparent;
  border: 1.5px dashed var(--c);
  color: var(--c);
}
.seg:hover {
  filter: brightness(1.05);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--c) 35%, transparent);
}
.events {
  height: 30px;
  border-top: 1px dashed var(--border-strong);
}
.evpt {
  position: absolute;
  top: 8px;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid var(--surface);
  background: var(--text);
  cursor: pointer;
}
.evpt.decision {
  border-radius: 2px;
  transform: rotate(45deg);
  background: var(--attr-career);
}
.evpt.milestone {
  background: var(--gold);
}
.lines {
  position: absolute;
  left: 80px;
  right: 0;
  top: 0;
  bottom: 0;
  pointer-events: none;
}
.now,
.cursor {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
}
.now {
  background: var(--gold);
}
.now i {
  position: absolute;
  top: -4px;
  left: 50%;
  transform: translateX(-50%);
  padding: 0 7px;
  border-radius: 999px;
  background: var(--gold);
  color: #fff;
  font-size: 11px;
  font-style: normal;
  white-space: nowrap;
}
.cursor {
  background: var(--ink);
  opacity: 0.35;
}
.range {
  gap: 8px;
  flex-wrap: wrap;
}
.tabs.mini button {
  padding: 3px 10px;
  font-size: 12px;
}
.board-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  flex-wrap: wrap;
}
.sm-input {
  height: 32px;
  width: 200px;
}
.small {
  font-size: 12px;
}
.gold {
  color: var(--gold);
  font-weight: 700;
}
.mapcol {
  display: grid;
  gap: 10px;
}
.maptools {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.pinform {
  gap: 8px;
}
.snap {
  display: grid;
  gap: 10px;
  align-content: start;
}
.snap-title {
  margin: 0;
  font-size: 24px;
  font-weight: 900;
}
.now-list {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
  font-size: 13px;
}
.now-list li {
  display: flex;
  gap: 10px;
}
.ln {
  width: 60px;
  flex: none;
  font-weight: 700;
}
.link {
  border: none;
  background: none;
  padding: 0;
  margin-right: 8px;
  font: inherit;
  color: var(--text);
  cursor: pointer;
  text-align: left;
}
.link:hover {
  text-decoration: underline;
}
.evbox {
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--attr-social) 10%, var(--surface));
  font-size: 13px;
}
.evbox .small {
  color: var(--attr-social);
}
.places {
  display: grid;
  gap: 10px;
}
.place {
  padding: 14px 16px;
}
.place.focus {
  box-shadow: 0 0 0 2px var(--attr-mind), var(--shadow);
}
.ph {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--attr-mind);
}
.ph b {
  color: var(--text);
  font-size: 18px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.pchip {
  padding: 3px 10px;
  border-radius: 999px;
  border: none;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  background: color-mix(in srgb, var(--c, var(--text-2)) 14%, var(--surface));
  color: color-mix(in srgb, var(--c, var(--text-2)) 75%, var(--text));
}
.scrub {
  margin-top: 16px;
}
@media (max-width: 1080px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
