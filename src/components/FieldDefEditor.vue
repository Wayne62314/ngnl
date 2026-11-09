<script setup lang="ts">
import { computed, ref } from 'vue'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { FIELD_KINDS, formatValue, kindLabel } from '@/lib/fields'
import { titleOf } from '@/lib/itemView'
import type { FieldDef, FieldKind } from '@/lib/types'

/** The drawer body for a field definition: its type, unit, options and where it is used. */
const props = defineProps<{ def: FieldDef }>()
const data = useData()
const ui = useUi()

const users = computed(() => data.items.filter((i) => i.fields && props.def.id in i.fields))
const unit = ref(props.def.unit ?? '')
const options = ref((props.def.options ?? []).join('，'))

async function setKind(kind: FieldKind) {
  if (kind === props.def.kind) return
  if (users.value.length) {
    const ok = await ui.confirm({
      title: `把「${props.def.title}」改成${kindLabel(kind)}类型？`,
      message: `已经有 ${users.value.length} 个条目填了这个字段，旧的值可能显示不正确，需要重新填。`,
      confirmText: '修改类型',
      danger: true,
    })
    if (!ok) return
  }
  data.update<FieldDef>(props.def.id, { kind })
}
const saveUnit = () => data.update<FieldDef>(props.def.id, { unit: unit.value.trim() || null })
const saveOptions = () =>
  data.update<FieldDef>(props.def.id, { options: options.value.split(/[,，、\n]/).map((s) => s.trim()).filter(Boolean) })
</script>

<template>
  <div class="fdef">
    <div class="field">
      <label>类型</label>
      <div class="kinds">
        <button v-for="k in FIELD_KINDS" :key="k.kind" class="chip choice" :class="{ on: def.kind === k.kind }" :title="k.hint" @click="setKind(k.kind)">{{ k.label }}</button>
      </div>
    </div>
    <div v-if="['number', 'duration'].includes(def.kind)" class="field">
      <label>单位</label>
      <input v-model="unit" class="input" placeholder="比如 年、次、公里" maxlength="8" @change="saveUnit" />
    </div>
    <div v-if="def.kind === 'select'" class="field">
      <label>选项</label>
      <input v-model="options" class="input" placeholder="用逗号隔开：全新, 九成新, 旧" @change="saveOptions" />
    </div>
    <div class="field">
      <label>用在 {{ users.length }} 个条目上</label>
      <div v-if="users.length" class="users">
        <div v-for="u in users" :key="u.id" class="user" @click="ui.open(u.id)">
          <span class="grow ellipsis">{{ titleOf(u) }}</span>
          <span class="faint">{{ formatValue(def, u.fields![def.id], data.byId) }}</span>
        </div>
      </div>
      <p v-else class="faint small">还没有条目用它。在任何条目的详情里点「添加字段」就能贴上。</p>
    </div>
  </div>
</template>

<style scoped>
.fdef {
  display: grid;
  gap: 14px;
}
.kinds {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.choice {
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 12px;
}
.choice.on {
  border-color: var(--gold);
  color: var(--gold);
  font-weight: 700;
}
.users {
  display: grid;
  gap: 2px;
}
.user {
  display: flex;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.user:hover {
  background: var(--hover);
}
.small {
  font-size: 12px;
}
</style>
