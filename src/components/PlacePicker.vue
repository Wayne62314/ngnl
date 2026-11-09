<script setup lang="ts">
import { ref, watch } from 'vue'
import { MapPin, X } from 'lucide-vue-next'
import { searchCities } from '@/lib/geo'
import type { Place } from '@/lib/types'

/** Pick a city from the offline list. A place picked on the map arrives with its own name and coordinates. */
const props = defineProps<{ modelValue?: Place }>()
const emit = defineEmits<{ 'update:modelValue': [p: Place | undefined] }>()

const q = ref('')
const open = ref(false)
const results = ref<(Place & { region: string })[]>([])
const active = ref(0)
watch(q, async (v) => {
  results.value = await searchCities(v)
  active.value = 0
})
function pick(p: Place & { region?: string }) {
  emit('update:modelValue', { name: p.name, lat: p.lat, lng: p.lng })
  q.value = ''
  open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') (e.preventDefault(), (active.value = Math.min(results.value.length - 1, active.value + 1)))
  else if (e.key === 'ArrowUp') (e.preventDefault(), (active.value = Math.max(0, active.value - 1)))
  else if (e.key === 'Enter' && results.value[active.value]) (e.preventDefault(), pick(results.value[active.value]))
  else if (e.key === 'Escape') (e.stopPropagation(), (open.value = false))
}
</script>

<template>
  <div class="pp">
    <div v-if="props.modelValue && !open" class="chosen">
      <MapPin :size="15" />
      <button class="name" title="换一个地点" @click="open = true">{{ props.modelValue.name }}</button>
      <button class="btn ghost sm icon" aria-label="清除地点" @click="emit('update:modelValue', undefined)"><X /></button>
    </div>
    <div v-else class="search">
      <input
        v-model="q"
        class="input"
        placeholder="输入城市，比如 深圳"
        aria-label="搜索城市"
        @focus="open = true"
        @keydown="onKey"
      />
      <div v-if="open && results.length" class="list" role="listbox">
        <button
          v-for="(r, i) in results"
          :key="r.name + r.region"
          class="opt"
          :class="{ on: i === active }"
          role="option"
          :aria-selected="i === active"
          @mousedown.prevent="pick(r)"
        >
          <b>{{ r.name }}</b><span class="faint">{{ r.region }}</span>
        </button>
      </div>
      <div v-else-if="open && q.trim()" class="list empty faint">离线城市库里没找到，可以在「轨迹 → 地图」上直接点选位置</div>
    </div>
  </div>
</template>

<style scoped>
.pp {
  position: relative;
}
.chosen {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--attr-mind);
}
.name {
  border: none;
  background: none;
  font: inherit;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
}
.name:hover {
  background: var(--hover);
}
.list {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  z-index: 5;
  display: grid;
  padding: 4px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
}
.opt {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.opt.on,
.opt:hover {
  background: var(--hover);
}
.empty {
  padding: 10px 12px;
  font-size: 12px;
}
</style>
