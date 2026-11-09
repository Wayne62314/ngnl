<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { geoMercator, geoPath, type GeoProjection } from 'd3-geo'
import { feature } from 'topojson-client'
import type { FeatureCollection, Geometry } from 'geojson'
import { Crosshair, Minus, Plus } from 'lucide-vue-next'
import type { Place } from '@/lib/types'
import type { RouteStop } from '@/lib/trajectory'

/**
 * Offline map (Natural Earth borders bundled with the app): the route of your
 * life, your position at the scrubbed date, and every place you've been.
 * Wheel to zoom, drag to pan. In pick mode a click reports the coordinates.
 */
const props = defineProps<{ route: RouteStop[]; current?: Place; places: { place: Place; count: number }[]; pickMode?: boolean }>()
const emit = defineEmits<{ pick: [p: { lat: number; lng: number }]; select: [name: string] }>()

const W = 900
const H = 560
const countries = shallowRef<FeatureCollection<Geometry> | null>(null)
const failed = ref(false)
onMounted(async () => {
  try {
    const topo = (await import('@/assets/geo/countries-50m.json')).default as unknown as Parameters<typeof feature>[0]
    countries.value = feature(topo, (topo as unknown as { objects: { countries: Parameters<typeof feature>[1] } }).objects.countries) as unknown as FeatureCollection<Geometry>
  } catch {
    failed.value = true
  }
})

/** Fit the view to the places you've been (or to China when there are none yet). */
const projection = computed<GeoProjection>(() => {
  const pts = props.places.map((p) => [p.place.lng, p.place.lat] as [number, number])
  if (props.current) pts.push([props.current.lng, props.current.lat])
  const p = geoMercator()
  if (pts.length >= 2) {
    const lngs = pts.map((x) => x[0])
    const lats = pts.map((x) => x[1])
    const pad = 6
    p.fitExtent(
      [
        [60, 60],
        [W - 60, H - 60],
      ],
      {
        type: 'MultiPoint',
        coordinates: [
          [Math.min(...lngs) - pad, Math.min(...lats) - pad / 2],
          [Math.max(...lngs) + pad, Math.max(...lats) + pad / 2],
        ],
      },
    )
  } else {
    const c = pts[0] ?? [104, 35]
    p.fitExtent(
      [
        [40, 40],
        [W - 40, H - 40],
      ],
      { type: 'MultiPoint', coordinates: [[c[0] - 30, c[1] - 18], [c[0] + 30, c[1] + 18]] },
    )
  }
  return p
})
const path = computed(() => geoPath(projection.value))
const borders = computed(() => (countries.value ? countries.value.features.map((f, i) => ({ k: i, d: path.value(f) ?? '' })) : []))
const xy = (p: Place) => projection.value([p.lng, p.lat]) ?? [0, 0]

const legs = computed(() =>
  props.route.slice(1).map((s, i) => {
    const [x1, y1] = xy(props.route[i].place)
    const [x2, y2] = xy(s.place)
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    const dx = x2 - x1
    const dy = y2 - y1
    // Bow each leg slightly so back-and-forth moves don't overlap.
    const cx = mx - dy * 0.18
    const cy = my + dx * 0.18
    return { key: i, d: `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`, planned: s.planned }
  }),
)

// ---- zoom & pan ----
const k = ref(1)
const tx = ref(0)
const ty = ref(0)
watch(projection, () => ((k.value = 1), (tx.value = 0), (ty.value = 0)))
const svg = ref<SVGSVGElement>()
function toLocal(e: { clientX: number; clientY: number }) {
  const r = svg.value!.getBoundingClientRect()
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]
}
function zoomAt(f: number, cx = W / 2, cy = H / 2) {
  const nk = Math.min(40, Math.max(0.6, k.value * f))
  tx.value = cx - ((cx - tx.value) * nk) / k.value
  ty.value = cy - ((cy - ty.value) * nk) / k.value
  k.value = nk
}
function wheel(e: WheelEvent) {
  e.preventDefault()
  const [x, y] = toLocal(e)
  zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, x, y)
}
let drag: { x: number; y: number; tx: number; ty: number; moved: boolean } | null = null
function down(e: PointerEvent) {
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  const [x, y] = toLocal(e)
  drag = { x, y, tx: tx.value, ty: ty.value, moved: false }
}
function move(e: PointerEvent) {
  if (!drag) return
  const [x, y] = toLocal(e)
  if (Math.abs(x - drag.x) + Math.abs(y - drag.y) > 4) drag.moved = true
  tx.value = drag.tx + (x - drag.x)
  ty.value = drag.ty + (y - drag.y)
}
function up(e: PointerEvent) {
  if (drag && !drag.moved && props.pickMode) {
    const [x, y] = toLocal(e)
    const ll = projection.value.invert?.([(x - tx.value) / k.value, (y - ty.value) / k.value])
    if (ll) emit('pick', { lng: Math.round(ll[0] * 1000) / 1000, lat: Math.round(ll[1] * 1000) / 1000 })
  }
  drag = null
}
const cur = computed(() => (props.current ? xy(props.current) : null))
</script>

<template>
  <div class="mapbox" :class="{ picking: pickMode }">
    <svg
      ref="svg"
      :viewBox="`0 0 ${W} ${H}`"
      role="img"
      aria-label="离线地图：人生轨迹路线"
      @wheel="wheel"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="drag = null"
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--attr-mind)" />
        </marker>
      </defs>
      <rect :width="W" :height="H" class="sea" />
      <g :transform="`translate(${tx},${ty}) scale(${k})`">
        <path v-for="b in borders" :key="b.k" :d="b.d" class="land" vector-effect="non-scaling-stroke" />
        <path
          v-for="l in legs"
          :key="l.key"
          :d="l.d"
          class="leg"
          :class="{ planned: l.planned }"
          vector-effect="non-scaling-stroke"
          marker-end="url(#arrow)"
        />
        <g v-for="p in places" :key="p.place.name" class="city" @click.stop="emit('select', p.place.name)">
          <circle :cx="xy(p.place)[0]" :cy="xy(p.place)[1]" :r="(4 + Math.min(4, p.count)) / k" />
          <text :x="xy(p.place)[0] + 9 / k" :y="xy(p.place)[1] + 4 / k" :font-size="12 / k">{{ p.place.name }}</text>
        </g>
        <g v-if="cur" class="me" :style="{ transform: `translate(${cur[0]}px, ${cur[1]}px)` }">
          <circle class="halo" :r="18 / k" />
          <circle class="dot" :r="8 / k" :stroke-width="3 / k" />
        </g>
      </g>
    </svg>
    <div v-if="!countries && !failed" class="loading faint">正在加载离线地图…</div>
    <div class="ctrl">
      <button class="btn ghost sm icon" aria-label="放大" @click="zoomAt(1.4)"><Plus /></button>
      <button class="btn ghost sm icon" aria-label="缩小" @click="zoomAt(1 / 1.4)"><Minus /></button>
      <button class="btn ghost sm icon" aria-label="回到全部地点" @click="(k = 1), (tx = 0), (ty = 0)"><Crosshair /></button>
    </div>
  </div>
</template>

<style scoped>
.mapbox {
  position: relative;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: #dfe8ee;
}
svg {
  display: block;
  width: 100%;
  height: auto;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
svg:active {
  cursor: grabbing;
}
.picking svg {
  cursor: crosshair;
}
.sea {
  fill: color-mix(in srgb, var(--attr-mind) 10%, var(--surface));
}
.land {
  fill: var(--surface-2);
  stroke: var(--border-strong);
  stroke-width: 0.8;
}
.leg {
  fill: none;
  stroke: var(--attr-mind);
  stroke-width: 2.5;
  stroke-linecap: round;
}
.leg.planned {
  stroke-dasharray: 7 6;
  opacity: 0.8;
}
.city {
  cursor: pointer;
}
.city circle {
  fill: var(--surface);
  stroke: var(--attr-mind);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
.city text {
  fill: var(--text);
  font-weight: 600;
  paint-order: stroke;
  stroke: var(--surface);
  stroke-width: 3px;
  stroke-linejoin: round;
}
.me {
  transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
  pointer-events: none;
}
.halo {
  fill: var(--gold-2);
  opacity: 0.3;
  animation: pulse 1.8s ease-out infinite;
}
.dot {
  fill: var(--gold-2);
  stroke: var(--surface);
}
@keyframes pulse {
  from {
    opacity: 0.45;
  }
  to {
    opacity: 0.05;
  }
}
.loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 13px;
}
.ctrl {
  position: absolute;
  right: 12px;
  top: 12px;
  display: grid;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border: 1px solid var(--border);
}
@media (prefers-reduced-motion: reduce) {
  .halo {
    animation: none;
  }
  .me {
    transition: none;
  }
}
</style>
