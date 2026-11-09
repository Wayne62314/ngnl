<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, Variable, X } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { FIELD_KINDS, fieldsOf, formatValue, isNumeric, parseValue } from '@/lib/fields'
import type { FieldDef, FieldKind, FieldValue, Item } from '@/lib/types'
import ItemPicker from './ItemPicker.vue'

/** Custom fields on one item: edit values, add an existing field, or create a new one on the spot. */
const props = defineProps<{ item: Item }>()
const data = useData()
const ui = useUi()

const applied = computed(() => fieldsOf(props.item, data.fieldDefs))
const available = computed(() => data.fieldDefs.filter((d) => !(props.item.fields && d.id in props.item.fields)))

async function setValue(def: FieldDef, v: FieldValue | undefined | null) {
  const fields = { ...(props.item.fields ?? {}) }
  // Empty stays empty ('') so it is never mistaken for a real 0; yes/no starts as "no".
  fields[def.id] = v === undefined || v === null ? (def.kind === 'bool' ? false : '') : v
  await data.update(props.item.id, { fields })
}
async function removeField(def: FieldDef) {
  const fields = { ...(props.item.fields ?? {}) }
  delete fields[def.id]
  await data.update(props.item.id, { fields: Object.keys(fields).length ? fields : null })
}
function onInput(def: FieldDef, e: Event) {
  const el = e.target as HTMLInputElement
  const v = parseValue(def, el.type === 'checkbox' ? el.checked : el.value)
  setValue(def, v ?? null)
}

// ---- adding ----
const adding = ref(false)
const creating = ref(false)
const draftName = ref('')
const draftKind = ref<FieldKind>('number')
const draftUnit = ref('')
const draftOptions = ref('')
async function addExisting(def: FieldDef) {
  adding.value = false
  await setValue(def, undefined)
}
async function createAndAdd() {
  const name = draftName.value.trim()
  if (!name) return
  if (data.fieldDefs.some((d) => d.title.trim() === name)) {
    ui.toast(`已经有叫「${name}」的字段了，直接选它就行`, 'error')
    return
  }
  const def = await data.create('field', {
    title: name,
    kind: draftKind.value,
    ...(draftUnit.value.trim() ? { unit: draftUnit.value.trim() } : {}),
    ...(draftKind.value === 'select' ? { options: draftOptions.value.split(/[,，、\n]/).map((s) => s.trim()).filter(Boolean) } : {}),
  })
  if (def) await setValue(def, undefined)
  creating.value = adding.value = false
  draftName.value = draftUnit.value = draftOptions.value = ''
}
const pickItem = ref<string | null>(null)
</script>

<template>
  <section class="fields">
    <div class="label row"><Variable :size="13" />字段 <span class="faint">{{ applied.length || '' }}</span></div>

    <div v-for="{ def, value } in applied" :key="def.id" class="frow">
      <span class="fname ellipsis" :title="`${def.title}（${FIELD_KINDS.find((k) => k.kind === def.kind)?.label}）`">{{ def.title }}</span>
      <div class="fval">
        <template v-if="def.kind === 'bool'">
          <label class="switch-mini"><input type="checkbox" :checked="!!value" @change="onInput(def, $event)" />{{ value ? '是' : '否' }}</label>
        </template>
        <select v-else-if="def.kind === 'select'" class="input" :value="value" @change="onInput(def, $event)">
          <option value="">—</option>
          <option v-for="o in def.options ?? []" :key="o" :value="o">{{ o }}</option>
        </select>
        <input v-else-if="def.kind === 'date'" type="date" class="input" :value="value" @change="onInput(def, $event)" />
        <template v-else-if="def.kind === 'item'">
          <button class="btn sm ghost pick" @click="pickItem = pickItem === def.id ? null : def.id">{{ value ? formatValue(def, value, data.byId) : '选择条目…' }}</button>
          <ItemPicker v-if="pickItem === def.id" :exclude="[item.id]" @pick="(id) => (setValue(def, id), (pickItem = null))" @close="pickItem = null" />
        </template>
        <div v-else class="numwrap">
          <span v-if="def.kind === 'money'" class="unit pre">¥</span>
          <input
            class="input"
            :inputmode="isNumeric(def.kind) ? 'decimal' : undefined"
            :value="value"
            :placeholder="isNumeric(def.kind) ? '0' : '…'"
            @change="onInput(def, $event)"
          />
          <span v-if="def.kind === 'percent'" class="unit">%</span>
          <span v-else-if="def.unit && def.kind !== 'money'" class="unit">{{ def.unit }}</span>
        </div>
      </div>
      <button class="btn ghost sm icon rm" :title="`从这个条目移除「${def.title}」`" @click="removeField(def)"><X /></button>
    </div>

    <div v-if="adding" class="adder card-in">
      <template v-if="!creating">
        <div class="faint small">选一个字段</div>
        <div class="choices">
          <button v-for="d in available" :key="d.id" class="chip choice" @click="addExisting(d)">{{ d.title }}<span class="faint">{{ d.unit ?? '' }}</span></button>
          <button class="chip choice new" @click="creating = true"><Plus :size="12" />新建字段</button>
        </div>
      </template>
      <form v-else class="create" @submit.prevent="createAndAdd">
        <input v-model="draftName" class="input" placeholder="字段名，比如 使用年限" maxlength="20" />
        <div class="kinds">
          <button v-for="k in FIELD_KINDS" :key="k.kind" type="button" class="chip choice" :class="{ on: draftKind === k.kind }" :title="k.hint" @click="(draftKind = k.kind), (draftUnit = k.unit && k.kind !== 'money' && k.kind !== 'percent' ? k.unit : '')">
            {{ k.label }}
          </button>
        </div>
        <input v-if="['number', 'duration'].includes(draftKind)" v-model="draftUnit" class="input" placeholder="单位（可选），比如 年" maxlength="8" />
        <input v-if="draftKind === 'select'" v-model="draftOptions" class="input" placeholder="选项，用逗号隔开：全新, 九成新, 旧" />
        <div class="row">
          <button class="btn primary sm" type="submit" :disabled="!draftName.trim()">创建并添加</button>
          <button class="btn ghost sm" type="button" @click="creating = false">返回</button>
        </div>
      </form>
    </div>
    <button v-else class="btn sm ghost add" @click="adding = true"><Plus />添加字段</button>
    <div v-if="!applied.length && !adding" class="faint small hint">字段可以记录任何你想量化的东西，比如「购入价格」「使用年限」「每次省下」。建一次，所有条目都能用。</div>
  </section>
</template>

<style scoped>
.fields {
  display: grid;
  gap: 6px;
}
.label {
  font-size: 12px;
  color: var(--text-3);
  gap: 6px;
}
.frow {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}
.fname {
  font-size: 13px;
  color: var(--text-2);
}
.fval {
  min-width: 0;
}
.fval .input {
  width: 100%;
  height: 34px;
}
.numwrap {
  display: flex;
  align-items: center;
  gap: 6px;
}
.unit {
  font-size: 13px;
  color: var(--text-3);
  flex: none;
}
.pick {
  width: 100%;
  justify-content: flex-start;
}
.rm {
  opacity: 0.4;
}
.frow:hover .rm {
  opacity: 1;
}
.switch-mini {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.adder {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.choices,
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
  gap: 4px;
}
.choice.on,
.choice:hover {
  border-color: var(--gold);
  color: var(--gold);
}
.choice.new {
  color: var(--gold);
}
.create {
  display: grid;
  gap: 8px;
}
.small {
  font-size: 12px;
}
.hint {
  line-height: 1.6;
}
.add {
  justify-self: start;
}
</style>
