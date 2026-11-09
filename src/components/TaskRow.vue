<script setup lang="ts">
import { computed } from 'vue'
import { Check, Flag, Lock } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { friendly, today } from '@/lib/dates'
import { isLocked } from '@/lib/game'
import { titleOf } from '@/lib/itemView'
import { attrOf, type Task } from '@/lib/types'
import AttrTag from './AttrTag.vue'
import LinkChips from './LinkChips.vue'

const props = defineProps<{ task: Task; hideGoal?: boolean }>()
const data = useData()
const ui = useUi()

const done = computed(() => props.task.status === 'done')
const locked = computed(() => isLocked(props.task, data.byId))
const goal = computed(() => (props.task.goalId ? data.byId.get(props.task.goalId) : undefined))
const overdue = computed(() => !done.value && props.task.status !== 'dropped' && !!props.task.due && props.task.due < today())

function toggle() {
  data.update<Task>(props.task.id, { status: done.value ? 'todo' : 'done' })
}
</script>

<template>
  <div class="list-row task" :class="{ done, dropped: task.status === 'dropped' }" @click="ui.open(task.id)">
    <button
      class="check round"
      :class="{ on: done }"
      :style="{ '--c': attrOf(task.attr).color }"
      :aria-label="done ? '标记为未完成' : '完成'"
      @click.stop="toggle"
    >
      <Check />
    </button>
    <div class="grow">
      <div class="t ellipsis">
        <Lock v-if="locked" :size="13" class="faint lock" />
        {{ titleOf(task) }}
        <span v-if="task.status === 'doing'" class="chip gold">进行中</span>
      </div>
      <div class="meta">
        <span v-if="task.due && task.due !== today()" class="chip" :class="{ warn: overdue }">{{ friendly(task.due) }}</span>
        <span v-if="goal && !hideGoal" class="chip"><Flag />{{ titleOf(goal) }}</span>
        <LinkChips :id="task.id" :max="3" />
        <slot name="meta" />
      </div>
    </div>
    <slot />
    <AttrTag :attr="task.attr" class="attr" />
  </div>
</template>

<style scoped>
.task .t {
  font-weight: 500;
}
.task > .grow {
  min-width: 0;
}
.task :deep(.chip) {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lock {
  vertical-align: -1px;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}
.meta:empty {
  display: none;
}
.done .t,
.dropped .t {
  color: var(--text-3);
  text-decoration: line-through;
}
.dropped .check {
  opacity: 0.4;
}
@media (max-width: 760px) {
  .attr {
    display: none;
  }
}
</style>
