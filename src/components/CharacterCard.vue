<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Camera, RotateCcw } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { attrLevel, rankOf } from '@/lib/game'
import { ATTRS } from '@/lib/types'
import { ATTR_ICON } from '@/lib/attrIcons'
import { portraitSrc, rarity } from '@/lib/portraits'
import PortraitPicker from './PortraitPicker.vue'

withDefaults(defineProps<{ width?: number }>(), { width: 340 })
const data = useData()

const flipped = ref(false)
const picking = ref(false)

const attrs = computed(() => ATTRS.map((a) => ({ ...a, level: attrLevel(data.totals[a.key]).level })))
const top = computed(() => [...ATTRS].sort((a, b) => data.totals[b.key] - data.totals[a.key])[0].key)
const src = computed(() => portraitSrc(data.profile.portrait, top.value))
const rank = computed(() => rankOf(data.level.level))
const rare = computed(() => rarity(data.level.level))
const pct = computed(() => Math.round((data.level.into / data.level.need) * 100))

const profileLines = computed(() =>
  [
    ['背景', data.profile.background],
    ['特长', data.profile.strengths],
    ['弱点', data.profile.weaknesses],
    ['兴趣', data.profile.interests],
  ].filter((x): x is [string, string] => !!x[1]?.trim()),
)
</script>

<template>
  <div class="card-wrap" :style="{ '--w': `${width}px` }">
    <div class="flipper" :class="{ flipped }">
      <!-- FRONT -->
      <div class="face front" :class="rare.tone">
        <div class="inner">
          <div class="badges">
            <span class="lv num">Lv.{{ data.level.level }}</span>
            <span class="rare">{{ rank.title.replace('冒险者', '') }} · {{ rare.label }}</span>
          </div>
          <figure class="art">
            <img :src="src" :alt="`${data.profile.name || '角色'}的立绘`" draggable="false" />
            <button class="change" aria-label="更换立绘" title="更换立绘" @click.stop="picking = true"><Camera :size="16" /></button>
          </figure>
          <div class="body">
            <div class="name-row">
              <span class="name serif">{{ data.profile.name || '无名旅人' }}</span>
              <span class="title ellipsis">{{ data.profile.title || rank.title }}</span>
            </div>
            <div class="attrs">
              <span v-for="a in attrs" :key="a.key" class="attr" :style="{ '--c': a.color }" :title="a.hint">
                <component :is="ATTR_ICON[a.key]" :size="13" />
                <span>{{ a.label }}</span>
                <b class="num">{{ a.level }}</b>
              </span>
            </div>
            <div class="xp" role="progressbar" :aria-valuenow="pct" aria-valuemin="0" aria-valuemax="100" :aria-label="`本级经验 ${pct}%`">
              <div :style="{ width: `${pct}%` }" />
            </div>
          </div>
        </div>
      </div>

      <!-- BACK -->
      <div class="face back">
        <div class="inner">
          <div class="back-head">
            <span class="serif">{{ data.profile.name || '无名旅人' }}的档案</span>
          </div>
          <dl v-if="profileLines.length" class="profile">
            <div v-for="[k, v] in profileLines" :key="k">
              <dt>{{ k }}</dt>
              <dd>{{ v }}</dd>
            </div>
          </dl>
          <p v-else class="empty">还没有写角色档案。</p>
          <div class="stats">
            <div><b class="num">{{ data.totalXp.toLocaleString() }}</b><span>累计经验</span></div>
            <div><b class="num">{{ data.tasks.filter((t) => t.status === 'done').length }}</b><span>完成任务</span></div>
            <div><b class="num">{{ data.checkins.length }}</b><span>习惯打卡</span></div>
          </div>
          <RouterLink to="/character" class="btn sm edit" @click.stop>编辑档案 · 看成就</RouterLink>
        </div>
      </div>
    </div>
    <button class="flip-btn" @click="flipped = !flipped"><RotateCcw :size="13" />{{ flipped ? '看正面' : '翻到背面：档案' }}</button>
    <PortraitPicker v-if="picking" @close="picking = false" />
  </div>
</template>

<style scoped>
.card-wrap {
  container-type: inline-size;
  width: var(--w);
  max-width: 100%;
  display: grid;
  justify-items: center;
  gap: 12px;
}
.flipper {
  position: relative;
  width: 100%;
  aspect-ratio: 19 / 32;
  transform-style: preserve-3d;
  transition: transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.flipper.flipped {
  transform: rotateY(180deg);
}
.face {
  position: absolute;
  inset: 0;
  padding: 6px;
  border-radius: 26px;
  background: var(--foil);
  box-shadow: 0 26px 56px rgba(60, 40, 10, 0.28), 0 2px 6px rgba(60, 40, 10, 0.12);
  backface-visibility: hidden;
}
/* Higher rarity, fancier foil. */
.face.ssr {
  background: linear-gradient(135deg, #f7d98d, #e88fb5 30%, #8fb7f2 55%, #f3d48a 80%, #a87418);
}
.face.ur {
  background: conic-gradient(from 210deg, #f3d48a, #ef8fb8, #8fd0f2, #b49bf5, #f3d48a);
}
.face.n {
  background: linear-gradient(145deg, #d9d2c4, #9b9384 50%, #e2dccf);
}
.back {
  transform: rotateY(180deg);
}
.inner {
  position: relative;
  height: 100%;
  border-radius: 21px;
  overflow: hidden;
  background: #1d1a24;
  color: #f2eee6;
  display: flex;
  flex-direction: column;
}
.badges {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
}
.lv {
  padding: 3px 10px;
  border-radius: 8px;
  font-weight: 800;
  color: #1d1a24;
  background: #f0c869;
}
.rare {
  padding: 3px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  color: #f0c869;
  background: rgba(13, 12, 18, 0.55);
  border: 1px solid rgba(240, 200, 105, 0.6);
}
.art {
  position: relative;
  margin: 0;
  flex: 1;
  min-height: 0;
  background: #2a2434;
}
.art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  user-select: none;
}
.art::after {
  content: '';
  position: absolute;
  inset: auto 0 0 0;
  height: 40%;
  background: linear-gradient(to top, #1d1a24, rgba(29, 26, 36, 0));
  pointer-events: none;
}
.change {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 1;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(240, 200, 105, 0.6);
  background: rgba(13, 12, 18, 0.6);
  color: #f0c869;
  display: grid;
  place-items: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}
.face:hover .change,
.change:focus-visible {
  opacity: 1;
}
@media (hover: none) {
  .change {
    opacity: 0.9;
  }
}
.body {
  padding: 10px 18px 16px;
  display: grid;
  gap: 10px;
}
.name-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.name {
  font-size: 28px;
  font-weight: 900;
  letter-spacing: 0.04em;
  flex: none;
}
.title {
  font-size: 12px;
  color: rgba(242, 238, 230, 0.6);
  min-width: 0;
}
.attrs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px 10px;
  font-size: 12px;
}
.attr {
  display: flex;
  align-items: center;
  gap: 4px;
  color: color-mix(in srgb, var(--c) 55%, #fff);
}
.attr b {
  margin-left: auto;
  color: #f2eee6;
}
.xp {
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.xp div {
  height: 100%;
  background: #f0c869;
  transition: width 0.5s;
}
/* back */
.back .inner {
  padding: 22px 20px 18px;
  gap: 14px;
}
.back-head {
  font-size: 20px;
  font-weight: 900;
  color: #f0c869;
}
.profile {
  margin: 0;
  display: grid;
  gap: 10px;
  font-size: 13px;
  overflow: hidden;
}
.profile dt {
  font-size: 11px;
  color: rgba(242, 238, 230, 0.5);
  letter-spacing: 0.1em;
}
.profile dd {
  margin: 2px 0 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.empty {
  margin: 0;
  color: rgba(242, 238, 230, 0.55);
  font-size: 13px;
}
.stats {
  margin-top: auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  text-align: center;
}
.stats b {
  display: block;
  font-size: 18px;
  color: #f0c869;
}
.stats span {
  font-size: 11px;
  color: rgba(242, 238, 230, 0.55);
}
.edit {
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(240, 200, 105, 0.4);
  color: #f0c869;
  text-decoration: none;
}
.flip-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  color: var(--text-3);
  font-size: 12px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
}
.flip-btn:hover {
  color: var(--text);
  background: var(--hover);
}
/* Narrow cards: attribute icon + number only, smaller name. */
@container (max-width: 280px) {
  .attr > span {
    display: none;
  }
  .attr {
    justify-content: space-between;
  }
  .name {
    font-size: 22px;
  }
  .body {
    padding: 8px 14px 12px;
    gap: 8px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .flipper {
    transition: none;
  }
}
</style>
