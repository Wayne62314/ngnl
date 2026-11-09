<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, Swords } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { today } from '@/lib/dates'
import { taskBucket, type TaskBucket } from '@/lib/game'
import { ATTRS, type Attr, type Task } from '@/lib/types'
import Seg from '@/components/Seg.vue'
import TaskRow from '@/components/TaskRow.vue'
import Empty from '@/components/Empty.vue'

const data = useData()
const ui = useUi()
const t = today()

const view = ref<'open' | 'done' | 'dropped'>('open')
const attr = ref<Attr | 'all'>('all')

const filtered = computed(() => data.tasks.filter((x) => attr.value === 'all' || x.attr === attr.value))

const GROUPS: { key: TaskBucket; label: string }[] = [
  { key: 'overdue', label: '逾期' },
  { key: 'today', label: '今天' },
  { key: 'doing', label: '进行中' },
  { key: 'upcoming', label: '即将到来' },
  { key: 'someday', label: '以后再说' },
]
const groups = computed(() => {
  const m = new Map<TaskBucket, Task[]>()
  for (const x of filtered.value) {
    const b = taskBucket(x, t)
    if (b !== 'closed') (m.get(b) ?? m.set(b, []).get(b)!).push(x)
  }
  for (const list of m.values()) list.sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9') || a.createdAt.localeCompare(b.createdAt))
  return GROUPS.map((g) => ({ ...g, tasks: m.get(g.key) ?? [] })).filter((g) => g.tasks.length)
})
const closed = computed(() =>
  filtered.value
    .filter((x) => x.status === view.value)
    .sort((a, b) => (b.doneAt ?? b.updatedAt).localeCompare(a.doneAt ?? a.updatedAt)),
)
const counts = computed(() => ({
  open: data.tasks.filter((x) => x.status === 'todo' || x.status === 'doing').length,
  done: data.tasks.filter((x) => x.status === 'done').length,
  dropped: data.tasks.filter((x) => x.status === 'dropped').length,
}))

async function add() {
  const x = await data.create('task', attr.value === 'all' ? {} : { attr: attr.value })
  if (x) ui.open(x.id)
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">任务</h1>
        <div class="page-sub">每件做完的事，都会变成角色的经验。</div>
      </div>
      <button class="btn primary" @click="add"><Plus />新任务</button>
    </header>

    <div class="toolbar">
      <Seg
        v-model="view"
        :options="[
          { value: 'open', label: `未完成 ${counts.open}` },
          { value: 'done', label: `已完成 ${counts.done}` },
          { value: 'dropped', label: `已放下 ${counts.dropped}` },
        ]"
      />
      <Seg v-model="attr" size="sm" :options="[{ value: 'all', label: '全部' }, ...ATTRS.map((a) => ({ value: a.key, label: a.label, color: a.color }))]" />
    </div>

    <template v-if="view === 'open'">
      <section v-for="g in groups" :key="g.key" class="group">
        <h2 class="section-title" :class="{ warn: g.key === 'overdue' }">{{ g.label }} <span class="count">{{ g.tasks.length }}</span></h2>
        <div class="card list">
          <TaskRow v-for="x in g.tasks" :key="x.id" :task="x" />
        </div>
      </section>
      <div v-if="!groups.length" class="card">
        <Empty :icon="Swords" title="没有待办任务" text="把想做的事拆成一个个小任务。给它选一个属性，完成后就能看到角色成长。">
          <button class="btn primary" @click="add"><Plus />添加任务</button>
        </Empty>
      </div>
    </template>

    <div v-else class="card list">
      <TaskRow v-for="x in closed" :key="x.id" :task="x" />
      <div v-if="!closed.length" class="faint none">这里还是空的</div>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 22px;
}
.group {
  margin-bottom: 22px;
}
.warn {
  color: var(--danger);
}
.none {
  padding: 24px;
  text-align: center;
}
</style>
