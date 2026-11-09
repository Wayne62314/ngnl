<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useData } from '@/stores/data'
import { itemIcon, search, titleOf } from '@/lib/itemView'
import { typeLabel, type ItemType } from '@/lib/types'

const props = defineProps<{ types?: ItemType[]; exclude?: string[]; placeholder?: string }>()
const emit = defineEmits<{ pick: [id: string]; close: [] }>()

const data = useData()
const q = ref('')
const active = ref(0)
const input = ref<HTMLInputElement>()
onMounted(() => input.value?.focus())

const results = computed(() => {
  const ex = new Set(props.exclude ?? [])
  const pool = data.items.filter((i) => !ex.has(i.id) && (props.types ? props.types.includes(i.type) : i.type !== 'field'))
  return search(pool, q.value, 8)
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = Math.min(results.value.length - 1, active.value + 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = Math.max(0, active.value - 1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const r = results.value[active.value]
    if (r) emit('pick', r.id)
  } else if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
}
</script>

<template>
  <div class="picker">
    <input ref="input" v-model="q" class="input" :placeholder="placeholder ?? '搜索要关联的条目…'" @keydown="onKey" @input="active = 0" />
    <div class="list">
      <button
        v-for="(r, i) in results"
        :key="r.id"
        class="opt"
        :class="{ on: i === active }"
        @mousemove="active = i"
        @click="emit('pick', r.id)"
      >
        <component :is="itemIcon(r)" :size="15" class="faint" />
        <span class="grow ellipsis">{{ titleOf(r) }}</span>
        <span class="chip">{{ typeLabel(r) }}</span>
      </button>
      <div v-if="!results.length" class="faint none">没有找到</div>
    </div>
  </div>
</template>

<style scoped>
.picker {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  padding: 8px;
  box-shadow: var(--shadow);
}
.list {
  margin-top: 6px;
  max-height: 240px;
  overflow-y: auto;
}
.opt {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
}
.opt.on {
  background: var(--hover);
}
.none {
  padding: 8px;
  font-size: 13px;
}
</style>
