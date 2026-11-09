<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Backpack, Eye, EyeOff, Gift, Plus, Sparkles, Wallet } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { today as todayKey } from '@/lib/dates'
import { catOf, CATEGORIES, lastMonths, monthFlow, netWorth, STATUS_LABEL, treemap, yuan } from '@/lib/assets'
import { fieldsOf, formatValue, isNumeric } from '@/lib/fields'
import { titleOf } from '@/lib/itemView'
import type { Asset, AssetCategory, LedgerEntry } from '@/lib/types'
import LinkChips from '@/components/LinkChips.vue'
import Empty from '@/components/Empty.vue'

const data = useData()
const ui = useUi()
const t = todayKey()
const ym = t.slice(0, 7)

const tab = ref<'overview' | 'bag' | 'wish' | 'ledger'>('overview')

// ---- privacy: amounts hidden until you ask (remembered on this device) ----
const hidden = ref((() => {
  try {
    return localStorage.getItem('ngnl-privacy') !== '0'
  } catch {
    return true
  }
})())
watch(hidden, (v) => {
  try {
    localStorage.setItem('ngnl-privacy', v ? '1' : '0')
  } catch {}
})
const money = (n: number | undefined) => yuan(n, hidden.value)

// ---- totals ----
const owned = computed(() => data.assets.filter((a) => a.status === 'owned'))
const nw = computed(() => netWorth(data.assets))
const flow = computed(() => monthFlow(data.ledger, ym))
const months = computed(() => lastMonths(ym, 6).map((m) => monthFlow(data.ledger, m)))
const maxFlow = computed(() => Math.max(1, ...months.value.flatMap((m) => [m.income, m.expense])))

/** Net worth is recorded once a month, so the trend line has history to draw. */
function record() {
  if (!data.assets.length) return
  const cur = data.profile.netWorth?.[ym]
  if (cur === nw.value.net) return
  data.saveProfile({ ...data.profile, netWorth: { ...(data.profile.netWorth ?? {}), [ym]: nw.value.net } })
}
onMounted(record)
let recTimer: ReturnType<typeof setTimeout> | undefined
watch(() => nw.value.net, () => (clearTimeout(recTimer), (recTimer = setTimeout(record, 1500))))

const trend = computed(() => {
  const entries = Object.entries({ ...(data.profile.netWorth ?? {}), [ym]: nw.value.net }).sort(([a], [b]) => a.localeCompare(b)).slice(-24)
  if (entries.length < 2) return null
  const vals = entries.map(([, v]) => v)
  const lo = Math.min(0, ...vals)
  const hi = Math.max(...vals, lo + 1)
  const W = 800
  const H = 150
  const pts = entries.map(([k, v], i) => [(i / (entries.length - 1)) * W, H - ((v - lo) / (hi - lo)) * (H - 10) - 5, k] as const)
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return { line, area: `M0,${H} L${line.split(' ').join(' L')} L${W},${H} Z`, first: entries[0][0], last: entries.at(-1)![0], change: vals.at(-1)! - vals[0] }
})

// ---- treemap of priced things ----
const tiles = computed(() => {
  const list = owned.value
    .filter((a) => a.category !== 'debt' && a.value && catOf(a.category).priced)
    .map((a) => ({ value: a.value!, a }))
  return treemap(list, { x: 0, y: 0, w: 100, h: 100 })
})
const debts = computed(() => owned.value.filter((a) => a.category === 'debt' && a.value))

// ---- badges: what can't be priced ----
const badges = computed(() => data.assets.filter((a) => !catOf(a.category).priced && (a.status === 'owned' || a.status === 'wanted')))

// ---- inventory ----
const cat = ref<AssetCategory | 'all'>('all')
const showGone = ref(false)
const sortField = ref('')
const filterField = ref('')
const bag = computed(() => {
  let list = data.assets.filter((a) => a.status !== 'wanted' && (showGone.value || a.status === 'owned') && (cat.value === 'all' || a.category === cat.value))
  if (filterField.value) list = list.filter((a) => a.fields && filterField.value in a.fields)
  if (sortField.value) {
    const v = (a: Asset) => {
      const x = a.fields?.[sortField.value]
      return typeof x === 'number' ? x : x === undefined || x === '' ? -Infinity : Number(x) || -Infinity
    }
    list = [...list].sort((a, b) => v(b) - v(a))
  } else list = [...list].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  return list
})
const counts = computed(() => Object.fromEntries(CATEGORIES.map((c) => [c.key, data.assets.filter((a) => a.category === c.key && a.status === 'owned').length])))
const numericFields = computed(() => data.fieldDefs.filter((d) => isNumeric(d.kind)))

// ---- wishlist ----
const wishes = computed(() => data.assets.filter((a) => a.status === 'wanted'))
async function gotIt(a: Asset) {
  const ok = await ui.confirm({ title: `得到「${titleOf(a)}」了？`, message: '它会从愿望单移到行囊，记下今天为获得日期。', confirmText: '得到了！' })
  if (!ok) return
  await data.update<Asset>(a.id, { status: 'owned', acquired: t })
  ui.toast(`🎉 获得「${titleOf(a)}」`, 'level')
}

// ---- ledger ----
const recurring = computed(() => data.ledger.filter((e) => e.repeat !== 'none' && (!e.until || e.until >= t)))
const oneOffs = computed(() => data.ledger.filter((e) => e.repeat === 'none').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40))
const REPEAT = { none: '一次', week: '每周', month: '每月', year: '每年' } as const

async function addAsset(status: 'owned' | 'wanted' = 'owned') {
  const a = await data.create('asset', { status, category: cat.value === 'all' ? 'item' : cat.value, ...(status === 'owned' ? { acquired: t } : {}) })
  if (a) ui.open(a.id)
}
async function addLedger(flowKind: LedgerEntry['flow'], repeat: LedgerEntry['repeat'] = 'none') {
  const e = await data.create('ledger', { flow: flowKind, repeat, date: t })
  if (e) ui.open(e.id)
}
const pctOf = (a: Asset) => (a.value ? Math.min(100, Math.round(((a.saved ?? 0) / a.value) * 100)) : 0)
</script>

<template>
  <div class="page wide">
    <header class="page-head">
      <div>
        <h1 class="page-title">资产</h1>
        <div class="page-sub">你拥有的、想要的，以及钱从哪来、到哪去。</div>
      </div>
      <div class="head-actions">
        <div class="tabs" role="tablist">
          <button role="tab" :aria-selected="tab === 'overview'" :class="{ on: tab === 'overview' }" @click="tab = 'overview'">概览</button>
          <button role="tab" :aria-selected="tab === 'bag'" :class="{ on: tab === 'bag' }" @click="tab = 'bag'">行囊</button>
          <button role="tab" :aria-selected="tab === 'wish'" :class="{ on: tab === 'wish' }" @click="tab = 'wish'">愿望单</button>
          <button role="tab" :aria-selected="tab === 'ledger'" :class="{ on: tab === 'ledger' }" @click="tab = 'ledger'">账本</button>
        </div>
        <button class="btn ghost" :aria-pressed="!hidden" :title="hidden ? '显示金额' : '隐藏金额'" @click="hidden = !hidden">
          <component :is="hidden ? Eye : EyeOff" />{{ hidden ? '显示金额' : '隐藏金额' }}
        </button>
      </div>
    </header>

    <!-- wealth strip -->
    <section class="strip">
      <div class="tile dark">
        <span>金币 · 净资产</span>
        <b class="num">{{ money(nw.net) }}</b>
        <small>资产 {{ money(nw.own) }} − 负债 {{ money(nw.debt) }}</small>
      </div>
      <div class="tile">
        <span>本月收入</span>
        <b class="num ok">{{ money(flow.income) }}</b>
        <small>{{ data.ledger.filter((e) => e.flow === 'income').length }} 项收入来源</small>
      </div>
      <div class="tile">
        <span>本月支出</span>
        <b class="num bad">{{ money(flow.expense) }}</b>
        <small>{{ recurring.filter((e) => e.flow === 'expense').length }} 项固定支出</small>
      </div>
      <div class="tile">
        <span>储蓄率</span>
        <b class="num">{{ flow.rate === null ? '—' : Math.round(flow.rate * 100) + '%' }}</b>
        <small>（收入 − 支出）÷ 收入</small>
      </div>
    </section>

    <!-- OVERVIEW -->
    <template v-if="tab === 'overview'">
      <div v-if="!data.assets.length && !data.ledger.length" class="card">
        <Empty :icon="Backpack" title="整理你的行囊" text="记下你拥有的东西：存款、电脑、证书、作品……有价的会画进资产图；也可以记下想要的东西和每月的固定收支。">
          <button class="btn primary" @click="(tab = 'bag'), addAsset()"><Plus />添加第一件资产</button>
        </Empty>
      </div>
      <div v-else class="ov">
        <div class="ov-main">
          <section class="card card-pad">
            <div class="sec-head">
              <b>钱都在哪 <span class="faint small">面积 = 估值</span></b>
            </div>
            <div v-if="tiles.length" class="tm-wrap">
              <div class="treemap">
                <button
                  v-for="x in tiles"
                  :key="x.a.id"
                  class="tile-tm"
                  :style="{ left: x.rect.x + '%', top: x.rect.y + '%', width: x.rect.w + '%', height: x.rect.h + '%', '--c': catOf(x.a.category).color }"
                  :title="`${titleOf(x.a)} · ${money(x.a.value)}`"
                  @click="ui.open(x.a.id)"
                >
                  <span class="tm-cat">{{ catOf(x.a.category).label }}</span>
                  <b class="ellipsis">{{ titleOf(x.a) }}</b>
                  <span class="num">{{ money(x.a.value) }} · {{ Math.round((x.a.value! / nw.own) * 100) }}%</span>
                </button>
              </div>
              <div v-if="debts.length" class="debts">
                <span class="faint small">负债</span>
                <button v-for="d in debts" :key="d.id" class="debt" @click="ui.open(d.id)">{{ titleOf(d) }} <b class="num">−{{ money(d.value).replace('¥', '¥') }}</b></button>
              </div>
            </div>
            <p v-else class="faint small">给资产填上估值，这里就会画出「钱都在哪」。</p>
          </section>

          <section class="card card-pad">
            <div class="sec-head">
              <b>净资产走势 <span class="faint small">每月自动记一次</span></b>
              <span v-if="trend" class="small" :class="trend.change >= 0 ? 'ok' : 'bad'">{{ trend.change >= 0 ? '+' : '' }}{{ money(trend.change) }}</span>
            </div>
            <svg v-if="trend" viewBox="0 0 800 150" class="trend" preserveAspectRatio="none" role="img" aria-label="净资产走势">
              <path :d="trend.area" class="area" />
              <polyline :points="trend.line" class="line" vector-effect="non-scaling-stroke" />
            </svg>
            <div v-if="trend" class="row faint small between"><span>{{ trend.first }}</span><span>{{ trend.last }}</span></div>
            <p v-else class="faint small">从这个月开始记录，下个月起就能看到走势。</p>
          </section>
        </div>

        <aside class="badges">
          <div class="serif bh">没法标价的</div>
          <div class="faint-l small">资历 · 名望 · 作品 · 收藏</div>
          <div v-if="badges.length" class="bgrid">
            <button v-for="b in badges" :key="b.id" class="badge" :class="{ want: b.status === 'wanted' }" :style="{ '--c': catOf(b.category).color }" @click="ui.open(b.id)">
              <svg viewBox="0 0 64 70" aria-hidden="true"><path d="M32 2l29 16v34L32 68 3 52V18z" /></svg>
              <i>{{ titleOf(b).slice(0, 1) }}</i>
              <span class="ellipsis">{{ titleOf(b) }}</span>
            </button>
          </div>
          <p v-else class="faint-l small">把学位、证书、作品、荣誉记成「资历」或「名望」，会在这里点亮成徽章。</p>
          <p class="faint-l small foot">虚线徽章 = 愿望单里还没得到的。</p>
        </aside>
      </div>
    </template>

    <!-- INVENTORY -->
    <template v-else-if="tab === 'bag'">
      <div class="filters">
        <button class="fchip" :class="{ on: cat === 'all' }" @click="cat = 'all'">全部 <span class="num">{{ owned.length }}</span></button>
        <button v-for="c in CATEGORIES" :key="c.key" class="fchip" :class="{ on: cat === c.key }" :style="{ '--c': c.color }" @click="cat = cat === c.key ? 'all' : c.key">
          <span class="sw" />{{ c.label }} <span class="num">{{ counts[c.key] }}</span>
        </button>
        <span class="grow" />
        <select v-if="data.fieldDefs.length" v-model="filterField" class="input sel" aria-label="按字段筛选">
          <option value="">不按字段筛选</option>
          <option v-for="d in data.fieldDefs" :key="d.id" :value="d.id">只看有「{{ d.title }}」的</option>
        </select>
        <select v-if="numericFields.length" v-model="sortField" class="input sel" aria-label="按字段排序">
          <option value="">按估值排序</option>
          <option v-for="d in numericFields" :key="d.id" :value="d.id">按「{{ d.title }}」排序</option>
        </select>
        <label class="row small"><input v-model="showGone" type="checkbox" />显示已失去 / 卖出</label>
        <button class="btn primary sm" @click="addAsset()"><Plus />添加</button>
      </div>
      <div v-if="bag.length" class="cards">
        <article v-for="a in bag" :key="a.id" class="card acard" :class="[a.category, a.status]" :style="{ '--c': catOf(a.category).color }" @click="ui.open(a.id)">
          <div class="row between">
            <span class="cat">{{ catOf(a.category).label }}<template v-if="a.status !== 'owned'"> · {{ STATUS_LABEL[a.status] }}</template></span>
            <span v-if="a.value" class="num faint small">{{ a.category === 'debt' ? '−' : '' }}{{ money(a.value) }}</span>
          </div>
          <b class="serif at">{{ titleOf(a) }}</b>
          <div v-if="a.acquired" class="faint small">{{ a.acquired.slice(0, 7).replace('-', '.') }} 获得</div>
          <div v-if="fieldsOf(a, data.fieldDefs).length" class="fvals">
            <span v-for="f in fieldsOf(a, data.fieldDefs).slice(0, 3)" :key="f.def.id" class="fv">{{ f.def.title }} <b>{{ formatValue(f.def, f.value, data.byId) }}</b></span>
          </div>
          <LinkChips :id="a.id" :max="3" />
        </article>
      </div>
      <div v-else class="card card-pad faint">这个分类里还没有东西。</div>
    </template>

    <!-- WISHLIST -->
    <template v-else-if="tab === 'wish'">
      <div class="row between wish-head">
        <span class="faint small">想要的东西，可以挂到愿景树的目标上；「已攒」可以随时更新，或用推演算出来。</span>
        <button class="btn primary sm" @click="addAsset('wanted')"><Plus />想要的东西</button>
      </div>
      <div v-if="wishes.length" class="wishes">
        <article v-for="w in wishes" :key="w.id" class="card wish" @click="ui.open(w.id)">
          <div class="row between">
            <b class="serif">{{ titleOf(w) }}</b>
            <span class="faint small">{{ catOf(w.category).label }}</span>
          </div>
          <template v-if="w.value">
            <div class="bar"><div :style="{ width: pctOf(w) + '%' }" /></div>
            <div class="row between small">
              <span class="faint">已攒 {{ money(w.saved ?? 0) }} / {{ money(w.value) }}</span>
              <b>{{ pctOf(w) }}%</b>
            </div>
          </template>
          <div class="row between">
            <LinkChips :id="w.id" :max="3" />
            <button class="btn sm" @click.stop="gotIt(w)"><Gift />得到了</button>
          </div>
        </article>
      </div>
      <div v-else class="card">
        <Empty :icon="Sparkles" title="许个愿" text="想买的东西、想考的证书、想拿到的荣誉都可以写下来。填上价格，就能看到攒到了多少，也能拿去推演「什么时候能实现」。">
          <button class="btn primary" @click="addAsset('wanted')"><Plus />写下一个愿望</button>
        </Empty>
      </div>
    </template>

    <!-- LEDGER -->
    <template v-else>
      <div class="ledger">
        <section class="card card-pad">
          <div class="sec-head"><b>近 6 个月</b><span class="faint small">绿 = 收入 · 红 = 支出</span></div>
          <div class="bars">
            <div v-for="m in months" :key="m.ym" class="bm">
              <div class="pair">
                <i class="in" :style="{ height: (m.income / maxFlow) * 100 + '%' }" :title="`收入 ${money(m.income)}`" />
                <i class="out" :style="{ height: (m.expense / maxFlow) * 100 + '%' }" :title="`支出 ${money(m.expense)}`" />
              </div>
              <span class="faint small num">{{ Number(m.ym.slice(5)) }}月</span>
            </div>
          </div>
        </section>
        <section class="card card-pad">
          <div class="sec-head">
            <b>固定收支</b>
            <span class="row">
              <button class="btn ghost sm" @click="addLedger('income', 'month')"><Plus />每月收入</button>
              <button class="btn ghost sm" @click="addLedger('expense', 'month')"><Plus />每月支出</button>
            </span>
          </div>
          <div v-if="recurring.length" class="lrows">
            <div v-for="e in recurring" :key="e.id" class="lrow" @click="ui.open(e.id)">
              <span class="grow ellipsis">{{ titleOf(e) }}<span v-if="e.category" class="faint small"> · {{ e.category }}</span></span>
              <span class="faint small">{{ REPEAT[e.repeat] }}</span>
              <b class="num" :class="e.flow === 'income' ? 'ok' : 'bad'">{{ e.flow === 'income' ? '+' : '−' }}{{ money(e.amount) }}</b>
            </div>
          </div>
          <p v-else class="faint small">把工资、房租、订阅这些每月固定的收支记一次，每个月就会自动算进去。</p>
        </section>
        <section class="card card-pad">
          <div class="sec-head">
            <b>单笔记录</b>
            <span class="row">
              <button class="btn ghost sm" @click="addLedger('income')"><Plus />收入</button>
              <button class="btn ghost sm" @click="addLedger('expense')"><Plus />支出</button>
            </span>
          </div>
          <div v-if="oneOffs.length" class="lrows">
            <div v-for="e in oneOffs" :key="e.id" class="lrow" @click="ui.open(e.id)">
              <span class="faint small num">{{ e.date.slice(5) }}</span>
              <span class="grow ellipsis">{{ titleOf(e) }}</span>
              <b class="num" :class="e.flow === 'income' ? 'ok' : 'bad'">{{ e.flow === 'income' ? '+' : '−' }}{{ money(e.amount) }}</b>
            </div>
          </div>
          <p v-else class="faint small"><Wallet :size="14" /> 不用每笔都记。偶尔的大额收支、或者每月一个总数就够了。</p>
        </section>
      </div>
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
.strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
.tile {
  display: grid;
  gap: 2px;
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
}
.tile span {
  font-size: 12px;
  color: var(--text-2);
}
.tile b {
  font-size: 24px;
  font-weight: 800;
}
.tile small {
  font-size: 12px;
  color: var(--text-3);
}
.tile.dark {
  background: #1d1a24;
  border-color: #1d1a24;
  color: #f2eee6;
}
.tile.dark span {
  color: #f0c869;
}
.tile.dark small {
  color: rgba(242, 238, 230, 0.6);
}
.ok {
  color: var(--ok);
}
.bad {
  color: var(--danger);
}
.small {
  font-size: 12px;
}
.between {
  justify-content: space-between;
}
.ov {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}
.ov-main {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.sec-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.tm-wrap {
  display: flex;
  gap: 8px;
}
.treemap {
  position: relative;
  flex: 1;
  height: 300px;
}
.tile-tm {
  position: absolute;
  box-sizing: border-box;
  border: 3px solid var(--surface);
  border-radius: 12px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--c) 85%, #000 0%);
  color: #fff;
  font: inherit;
  text-align: left;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  cursor: pointer;
}
.tile-tm:nth-child(even) {
  background: color-mix(in srgb, var(--c) 70%, var(--surface));
}
.tile-tm:hover {
  filter: brightness(1.07);
}
.tm-cat {
  font-size: 11px;
  opacity: 0.8;
}
.tile-tm b {
  font-size: 15px;
}
.tile-tm .num {
  font-size: 13px;
}
.debts {
  width: 110px;
  display: grid;
  align-content: start;
  gap: 6px;
}
.debt {
  padding: 8px;
  border-radius: 10px;
  border: none;
  background: color-mix(in srgb, var(--danger) 15%, var(--surface));
  color: var(--danger);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.trend {
  display: block;
  width: 100%;
  height: 150px;
}
.trend .area {
  fill: color-mix(in srgb, var(--ok) 18%, transparent);
}
.trend .line {
  fill: none;
  stroke: var(--ok);
  stroke-width: 2.5;
}
.badges {
  padding: 18px 20px;
  border-radius: 18px;
  background: #1d1a24;
  color: #f2eee6;
  display: grid;
  gap: 10px;
}
.bh {
  font-size: 20px;
  font-weight: 900;
  color: #f0c869;
}
.faint-l {
  color: rgba(242, 238, 230, 0.55);
  margin: 0;
}
.bgrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.badge {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 4px;
  border: none;
  background: none;
  color: #f2eee6;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  min-width: 0;
}
.badge svg {
  width: 60px;
  height: 66px;
}
.badge path {
  fill: var(--c);
  stroke: #f0c869;
  stroke-width: 2;
}
.badge i {
  position: absolute;
  top: 18px;
  font-style: normal;
  font-weight: 700;
  font-size: 18px;
  color: #fff;
}
.badge.want path {
  fill: none;
  stroke: rgba(240, 200, 105, 0.45);
  stroke-dasharray: 4 4;
}
.badge.want {
  color: rgba(242, 238, 230, 0.5);
}
.badge.want i {
  color: rgba(242, 238, 230, 0.5);
}
.badge span {
  max-width: 100%;
}
.foot {
  margin-top: 4px;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
}
.fchip {
  --c: var(--text-2);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.fchip.on {
  border-color: var(--c);
  background: color-mix(in srgb, var(--c) 12%, var(--surface));
}
.sw {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c);
}
.sel {
  height: 34px;
  width: auto;
  font-size: 13px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.acard {
  padding: 14px;
  display: grid;
  gap: 6px;
  cursor: pointer;
  border-top: 3px solid var(--c);
}
.acard.debt {
  background: color-mix(in srgb, var(--danger) 5%, var(--surface));
}
.acard.lost,
.acard.sold {
  opacity: 0.6;
}
.cat {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--c) 14%, var(--surface));
  color: color-mix(in srgb, var(--c) 75%, var(--text));
}
.at {
  font-size: 17px;
  font-weight: 900;
}
.fvals {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 12px;
  color: var(--text-2);
}
.wish-head {
  margin-bottom: 12px;
  gap: 12px;
  flex-wrap: wrap;
}
.wishes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}
.wish {
  padding: 16px;
  display: grid;
  gap: 8px;
  cursor: pointer;
  border: 1.5px dashed var(--border-strong);
}
.bar {
  height: 6px;
  border-radius: 3px;
  background: var(--sunken);
  overflow: hidden;
}
.bar div {
  height: 100%;
  background: var(--gold-2);
}
.ledger {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.ledger > :first-child {
  grid-column: span 2;
}
.bars {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  height: 160px;
  align-items: end;
}
.bm {
  display: grid;
  justify-items: center;
  gap: 6px;
  height: 100%;
  grid-template-rows: 1fr auto;
}
.pair {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 100%;
}
.pair i {
  width: 18px;
  border-radius: 4px 4px 0 0;
  min-height: 2px;
}
.pair .in {
  background: var(--ok);
}
.pair .out {
  background: color-mix(in srgb, var(--danger) 55%, var(--surface));
}
.lrows {
  display: grid;
}
.lrow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 4px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.lrow:last-child {
  border-bottom: none;
}
.lrow:hover {
  background: var(--hover);
}
@media (max-width: 1080px) {
  .ov {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 760px) {
  .strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .tile b {
    font-size: 19px;
  }
  .ledger {
    grid-template-columns: minmax(0, 1fr);
  }
  .ledger > :first-child {
    grid-column: auto;
  }
  .treemap {
    height: 240px;
  }
}
</style>
