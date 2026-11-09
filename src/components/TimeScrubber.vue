<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Pause, Play } from 'lucide-vue-next'
import { dateAt, frac, type TimePoint } from '@/lib/trajectory'

/**
 * The shared time axis: drag the handle, click a dot to jump to that record,
 * or press play to walk through the whole span.
 */
const props = defineProps<{ modelValue: string; span: { from: string; to: string }; points: TimePoint[]; today: string }>()
const emit = defineEmits<{ 'update:modelValue': [d: string] }>()

const track = ref<HTMLElement>()
const pct = (d: string) => `${(frac(d, props.span) * 100).toFixed(3)}%`
const label = computed(() => {
  const [y, m] = props.modelValue.split('-')
  return `${y}.${Number(m)}`
})
const years = computed(() => {
  const a = Number(props.span.from.slice(0, 4))
  const b = Number(props.span.to.slice(0, 4))
  const step = b - a > 24 ? 5 : b - a > 10 ? 2 : 1
  const out: number[] = []
  for (let y = Math.ceil(a / step) * step; y <= b; y += step) out.push(y)
  return out
})

function fromPointer(e: PointerEvent) {
  const r = track.value!.getBoundingClientRect()
  emit('update:modelValue', dateAt((e.clientX - r.left) / r.width, props.span))
}
let dragging = false
function down(e: PointerEvent) {
  stop()
  dragging = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  fromPointer(e)
}
const move = (e: PointerEvent) => dragging && fromPointer(e)
const up = () => (dragging = false)
function onKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 365 : 30
  const d = new Date(props.modelValue + 'T00:00:00')
  if (e.key === 'ArrowRight') d.setDate(d.getDate() + step)
  else if (e.key === 'ArrowLeft') d.setDate(d.getDate() - step)
  else return
  e.preventDefault()
  const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  emit('update:modelValue', k < props.span.from ? props.span.from : k > props.span.to ? props.span.to : k)
}

// ---- play: walk from the start to the end over ~14 seconds ----
const playing = ref(false)
let timer: ReturnType<typeof setInterval> | undefined
function play() {
  if (playing.value) return stop()
  playing.value = true
  let f = frac(props.modelValue, props.span)
  if (f >= 0.999) f = 0
  timer = setInterval(() => {
    f += 1 / (14 * 30)
    if (f >= 1) {
      f = 1
      stop()
    }
    emit('update:modelValue', dateAt(f, props.span))
  }, 1000 / 30)
}
function stop() {
  playing.value = false
  clearInterval(timer)
}
onBeforeUnmount(stop)
</script>

<template>
  <div class="scrubber">
    <button class="playbtn" :aria-label="playing ? '暂停' : '播放人生路线'" @click="play">
      <component :is="playing ? Pause : Play" :size="18" />
    </button>
    <div
      ref="track"
      class="track"
      role="slider"
      tabindex="0"
      aria-label="时间轴"
      :aria-valuetext="label"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @keydown="onKey"
    >
      <div class="rail" />
      <div class="past" :style="{ width: pct(modelValue) }" />
      <div class="future" :style="{ left: pct(today) }" />
      <span class="now" :style="{ left: pct(today) }" title="现在" />
      <button
        v-for="p in points"
        :key="p.id + p.kind + p.date"
        class="pt"
        :class="[p.kind, { plan: p.date > today }]"
        :style="{ left: pct(p.date), '--c': p.color }"
        :title="`${p.date}  ${p.label}`"
        :aria-label="`跳到 ${p.date}：${p.label}`"
        @pointerdown.stop
        @click.stop="(stop(), emit('update:modelValue', p.date))"
      />
      <span class="handle" :style="{ left: pct(modelValue) }"><i class="tip num">{{ label }}</i></span>
      <div class="years">
        <span v-for="y in years" :key="y" class="num" :style="{ left: pct(`${y}-01-01`) }">{{ y }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrubber {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px 26px;
  border-radius: 18px;
  background: var(--surface);
  border: 1px solid var(--border);
}
.playbtn {
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 50%;
  border: none;
  background: var(--ink);
  color: var(--on-ink);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.track {
  position: relative;
  flex: 1;
  height: 32px;
  cursor: pointer;
  touch-action: none;
  outline: none;
}
.track:focus-visible .handle {
  box-shadow: 0 0 0 3px var(--gold-soft), 0 4px 12px rgba(60, 40, 10, 0.3);
}
.rail,
.past,
.future {
  position: absolute;
  top: 14px;
  height: 4px;
  border-radius: 2px;
}
.rail {
  left: 0;
  right: 0;
  background: var(--sunken);
}
.past {
  left: 0;
  background: var(--gold-2);
  opacity: 0.7;
}
.future {
  right: 0;
  background: repeating-linear-gradient(90deg, var(--border-strong) 0 6px, transparent 6px 10px);
}
.now {
  position: absolute;
  top: 4px;
  width: 2px;
  height: 24px;
  margin-left: -1px;
  background: var(--gold);
}
.pt {
  position: absolute;
  top: 10px;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid var(--surface);
  background: var(--c);
  cursor: pointer;
  transition: transform 0.12s;
}
.pt:hover {
  transform: scale(1.4);
  z-index: 1;
}
.pt.end {
  opacity: 0.55;
}
.pt.decision {
  border-radius: 2px;
  transform: rotate(45deg);
}
.pt.decision:hover {
  transform: rotate(45deg) scale(1.4);
}
.pt.plan {
  background: var(--surface);
  border: 2px dashed var(--c);
}
.handle {
  position: absolute;
  top: 3px;
  width: 26px;
  height: 26px;
  margin-left: -13px;
  border-radius: 50%;
  background: var(--gold-2);
  border: 3px solid var(--surface);
  box-shadow: 0 4px 12px rgba(60, 40, 10, 0.3);
  pointer-events: none;
  z-index: 2;
}
.tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--ink);
  color: var(--on-ink);
  font-size: 11px;
  font-style: normal;
  white-space: nowrap;
}
.years {
  position: absolute;
  left: 0;
  right: 0;
  top: 32px;
  font-size: 11px;
  color: var(--text-3);
}
.years span {
  position: absolute;
  transform: translateX(-50%);
}
</style>
