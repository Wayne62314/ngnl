<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useUi } from '@/stores/ui'

const ui = useUi()
let timer: ReturnType<typeof setTimeout> | undefined

// Confetti pieces: fixed pseudo-random spread so the burst looks the same every time.
const COLORS = ['var(--gold-2)', 'var(--gold)', 'var(--attr-mind)', 'var(--attr-body)', 'var(--attr-craft)', 'var(--attr-social)', 'var(--attr-career)', 'var(--attr-spirit)']
const bits = Array.from({ length: 36 }, (_, i) => {
  const a = (i / 36) * Math.PI * 2 + (i % 3) * 0.17
  const dist = 140 + ((i * 53) % 120)
  return {
    x: Math.cos(a) * dist,
    y: Math.sin(a) * dist - 40,
    r: (i * 47) % 360,
    c: COLORS[i % COLORS.length],
    d: (i % 5) * 0.03,
    w: i % 2 ? 8 : 6,
    h: i % 2 ? 4 : 10,
  }
})

function close() {
  ui.levelUp = null
}
watch(
  () => ui.levelUp,
  (v) => {
    clearTimeout(timer)
    if (v) timer = setTimeout(close, 3200)
  },
)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Transition name="lvl">
    <div v-if="ui.levelUp" class="overlay" role="status" aria-live="assertive" @click="close">
      <div class="burst">
        <div class="rays" />
        <span v-for="(b, i) in bits" :key="i" class="bit" :style="{ '--x': `${b.x}px`, '--y': `${b.y}px`, '--r': `${b.r}deg`, '--c': b.c, '--d': `${b.d}s`, width: `${b.w}px`, height: `${b.h}px` }" />
        <svg viewBox="0 0 100 100" class="badge" aria-hidden="true">
          <defs>
            <linearGradient id="lvl-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="var(--gold-2)" />
              <stop offset="1" stop-color="var(--gold)" />
            </linearGradient>
          </defs>
          <path d="M50 3l40.7 23.5v47L50 97 9.3 73.5v-47z" fill="url(#lvl-g)" />
          <path d="M50 12l32.9 19v38L50 88 17.1 69V31z" fill="#1c1a24" />
        </svg>
        <div class="num">{{ ui.levelUp.level }}</div>
      </div>
      <div class="text">
        <div class="kicker">LEVEL UP</div>
        <div class="title">升到 Lv.{{ ui.levelUp.level }}</div>
        <div v-if="ui.levelUp.rank" class="rank">获得称号「{{ ui.levelUp.rank }}」</div>
        <div class="hint">点击任意处继续</div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 18px;
  background: radial-gradient(circle at 50% 42%, rgba(28, 26, 36, 0.55), rgba(10, 9, 14, 0.82));
  backdrop-filter: blur(3px);
  cursor: pointer;
}
.burst {
  position: relative;
  width: 150px;
  height: 150px;
  display: grid;
  place-items: center;
}
.rays {
  position: absolute;
  inset: -110px;
  border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--gold-2) 30%, transparent) 0 8deg, transparent 8deg 22deg);
  mask: radial-gradient(circle, #000 20%, transparent 68%);
  animation: spin 9s linear infinite;
}
.badge {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 0 28px color-mix(in srgb, var(--gold-2) 60%, transparent));
  animation: pop 0.6s cubic-bezier(0.2, 1.4, 0.4, 1) both;
}
.num {
  position: relative;
  font-size: 56px;
  font-weight: 900;
  color: var(--gold-2);
  font-variant-numeric: tabular-nums;
  animation: pop 0.6s 0.1s cubic-bezier(0.2, 1.4, 0.4, 1) both;
}
.bit {
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 2px;
  background: var(--c);
  opacity: 0;
  animation: fly 1.4s var(--d) cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
}
.text {
  text-align: center;
  color: #fff;
}
.kicker {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.4em;
  color: var(--gold-2);
  animation: up 0.5s 0.25s both;
}
.title {
  font-size: 30px;
  font-weight: 800;
  margin-top: 4px;
  animation: up 0.5s 0.32s both;
}
.rank {
  margin-top: 8px;
  display: inline-block;
  padding: 5px 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--gold-2), var(--gold));
  color: #1c1a24;
  font-weight: 700;
  animation: up 0.5s 0.45s both;
}
.hint {
  margin-top: 18px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  animation: up 0.5s 0.8s both;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes pop {
  from {
    transform: scale(0.2) rotate(-30deg);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
@keyframes up {
  from {
    transform: translateY(12px);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
@keyframes fly {
  0% {
    transform: translate(-50%, -50%) rotate(0);
    opacity: 1;
  }
  100% {
    transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y) + 60px)) rotate(var(--r));
    opacity: 0;
  }
}
.lvl-enter-active,
.lvl-leave-active {
  transition: opacity 0.3s;
}
.lvl-enter-from,
.lvl-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .rays,
  .bit {
    animation: none;
    display: none;
  }
  .badge,
  .num,
  .kicker,
  .title,
  .rank,
  .hint {
    animation-duration: 0.01s;
  }
}
</style>
