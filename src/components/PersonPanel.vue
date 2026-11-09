<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Cake, Handshake, MessageCircle, PenLine, Plus, Sparkles, Trash2, X } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { friendly, today } from '@/lib/dates'
import { CONTACT_INTERVAL, contactOverdue, lastContact } from '@/lib/game'
import { birthdayLabel, contactLog, daysToBirthday, groupMeta, groupOf, turningAge } from '@/lib/people'
import { titleOf } from '@/lib/itemView'
import type { Person } from '@/lib/types'
import ItemPicker from './ItemPicker.vue'
import RelatedGroups from './RelatedGroups.vue'
import LinkSuggestions from './LinkSuggestions.vue'

const props = defineProps<{ person: Person }>()
const data = useData()
const ui = useUi()
const t = today()

const p = computed(() => props.person)
const group = computed(() => groupMeta(groupOf(p.value)))
const over = computed(() => contactOverdue(p.value, t))
const last = computed(() => lastContact(p.value))
const bday = computed(() => daysToBirthday(p.value, t))
const age = computed(() => turningAge(p.value, t))

const log = computed(() => contactLog(p.value))
const showAll = ref(false)
const shownLog = computed(() => (showAll.value ? log.value : log.value.slice(0, 5)))

const linked = computed(() => data.linked(p.value.id))
const knows = computed(() => linked.value.filter((x): x is Person => x.type === 'person'))
const related = computed(() => linked.value.filter((x) => x.type !== 'person'))

// ---- record a contact ----
const note = ref('')
const date = ref(t)
watch(
  () => p.value.id,
  () => {
    note.value = ''
    date.value = t
    showAll.value = false
    picking.value = false
  },
)
async function record() {
  await data.logContact(p.value.id, date.value || t, note.value)
  note.value = ''
  date.value = t
}

async function removeEntry(date: string, note: string) {
  const ok = await ui.confirm({
    title: `删除 ${date} 的往来记录？`,
    message: note ? `「${note}」\n删除后对应的 5 点社交经验也会扣除。` : '删除后对应的 5 点社交经验也会扣除。',
    confirmText: '删除',
    danger: true,
  })
  if (ok) await data.removeContact(p.value.id, date)
}

const picking = ref(false)
function pickKnown(id: string) {
  data.link(p.value.id, id)
  picking.value = false
}

const emit = defineEmits<{ select: [id: string] }>()
</script>

<template>
  <div class="panel" :style="{ '--g': group.color }">
    <header class="head">
      <div class="bubble">{{ titleOf(p).slice(0, 1) }}</div>
      <div class="grow">
        <div class="name ellipsis">{{ titleOf(p) }}</div>
        <div class="sub">
          <span class="chip tag">{{ p.relation || group.label }}</span>
          <span class="hearts" role="radiogroup" aria-label="亲密度">
            <button v-for="n in 5" :key="n" :class="{ on: n <= p.closeness }" :title="`亲密度 ${n} / 5`" @click="data.update<Person>(p.id, { closeness: n })">♥</button>
          </span>
        </div>
      </div>
      <button class="btn ghost sm" title="编辑全部信息" @click="ui.open(p.id)"><PenLine />编辑</button>
    </header>

    <dl class="facts">
      <div>
        <dt><Cake :size="14" />生日</dt>
        <dd v-if="p.birthday">
          {{ birthdayLabel(p.birthday) }}
          <span v-if="bday === 0" class="chip gold">就是今天！</span>
          <span v-else-if="bday !== null && bday <= 30" class="chip gold">{{ bday }} 天后<template v-if="age"> · {{ age }} 岁</template></span>
        </dd>
        <dd v-else class="empty" @click="ui.open(p.id)">未填写</dd>
      </div>
      <div>
        <dt><Handshake :size="14" />怎么认识</dt>
        <dd v-if="p.met">{{ p.met }}</dd>
        <dd v-else class="empty" @click="ui.open(p.id)">未填写</dd>
      </div>
      <div>
        <dt><Sparkles :size="14" />印象</dt>
        <dd v-if="p.traits">{{ p.traits }}</dd>
        <dd v-else class="empty" @click="ui.open(p.id)">未填写</dd>
      </div>
    </dl>

    <section class="block">
      <div class="block-title">
        <MessageCircle :size="14" />往来
        <span class="grow" />
        <span v-if="over !== null" class="chip warn">该联系了</span>
        <span v-else-if="last" class="faint small">上次 {{ friendly(last) }}</span>
      </div>
      <div class="faint small hint">
        <template v-if="CONTACT_INTERVAL[p.closeness]">按亲密度，建议每 {{ CONTACT_INTERVAL[p.closeness] }} 天联系一次。</template>
        <template v-else>亲密度 1 不做提醒。</template>
        每记录一次 +5 社交。
      </div>
      <form class="record" @submit.prevent="record">
        <textarea v-model="note" class="textarea" rows="2" placeholder="聊了什么？见面还是消息？（可以不写）" @keydown.ctrl.enter="record" />
        <div class="row">
          <input v-model="date" type="date" class="input date" :max="t" />
          <span class="grow" />
          <button class="btn primary sm" type="submit"><Plus />记录一次联系</button>
        </div>
      </form>
      <ol v-if="log.length" class="log">
        <li v-for="e in shownLog" :key="e.date">
          <span class="dot" />
          <div class="grow">
            <div class="when">{{ friendly(e.date) }}<span v-if="friendly(e.date) !== e.date" class="faint"> · {{ e.date }}</span></div>
            <div v-if="e.note" class="what">{{ e.note }}</div>
          </div>
          <button class="btn ghost sm icon del" title="删除这条记录" @click="removeEntry(e.date, e.note)"><Trash2 /></button>
        </li>
      </ol>
      <button v-if="log.length > 5" class="btn ghost sm more" @click="showAll = !showAll">
        {{ showAll ? '收起' : `显示全部 ${log.length} 条` }}
      </button>
      <div v-if="!log.length" class="faint small none">还没有记录。联系之后在这里写一句，以后翻起来就是你们的交往史。</div>
    </section>

    <section class="block">
      <div class="block-title">认识的人 <span class="faint">{{ knows.length || '' }}</span></div>
      <div class="people">
        <button v-for="k in knows" :key="k.id" class="pchip" :style="{ '--g': groupMeta(groupOf(k)).color }" @click="emit('select', k.id)">
          <span class="mini">{{ titleOf(k).slice(0, 1) }}</span>{{ titleOf(k) }}
          <X :size="12" class="x" title="取消" @click.stop="data.unlink(p.id, k.id)" />
        </button>
        <button v-if="!picking && data.people.length > 1" class="btn ghost sm" @click="picking = true"><Plus />添加</button>
      </div>
      <ItemPicker
        v-if="picking"
        :types="['person']"
        :exclude="[p.id, ...knows.map((k) => k.id)]"
        placeholder="TA 认识谁？"
        @pick="pickKnown"
        @close="picking = false"
      />
      <div v-if="data.people.length < 2" class="faint small none">再添加几个人，就能连出你的社交网络。</div>
    </section>

    <section v-if="related.length" class="block">
      <div class="block-title">相关 <span class="faint">{{ related.length }}</span></div>
      <RelatedGroups :id="p.id" :hide="['person']" />
      <LinkSuggestions :id="p.id" />
    </section>
  </div>
</template>

<style scoped>
.panel {
  display: grid;
  gap: 18px;
}
.head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.bubble {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  flex: none;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 700;
  color: var(--g);
  background: color-mix(in srgb, var(--g) 12%, var(--surface));
  border: 2.5px solid var(--g);
}
.name {
  font-size: 20px;
  font-weight: 700;
}
.sub {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.tag {
  color: var(--g);
  background: color-mix(in srgb, var(--g) 12%, transparent);
}
.hearts {
  display: flex;
}
.hearts button {
  border: none;
  background: none;
  padding: 0 1px;
  font-size: 14px;
  cursor: pointer;
  color: var(--border-strong);
  transition: transform 0.1s;
}
.hearts button.on {
  color: var(--attr-social);
}
.hearts button:hover {
  transform: scale(1.25);
}
.facts {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--surface-2);
}
.facts > div {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 8px;
  align-items: baseline;
}
.facts dt {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-3);
  font-size: 13px;
}
.facts dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  overflow-wrap: anywhere;
}
.facts dd.empty {
  color: var(--text-3);
  cursor: pointer;
}
.facts dd.empty:hover {
  color: var(--text-2);
  text-decoration: underline;
}
.block {
  display: grid;
  gap: 10px;
}
.block-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 14px;
}
.hint {
  margin-top: -6px;
}
.small {
  font-size: 12px;
}
.record {
  display: grid;
  gap: 8px;
}
.record .textarea {
  min-height: 0;
  resize: vertical;
}
.date {
  width: 150px;
}
.log {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}
.log li {
  display: flex;
  gap: 10px;
  padding: 6px 0;
  position: relative;
}
.log li:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 18px;
  bottom: -6px;
  width: 2px;
  background: var(--border);
}
.log .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-top: 5px;
  flex: none;
  background: var(--g);
}
.when {
  font-size: 13px;
  font-weight: 600;
}
.what {
  color: var(--text-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.log .del {
  opacity: 0;
}
.log li:hover .del,
.log .del:focus-visible {
  opacity: 1;
}
@media (hover: none) {
  .log .del {
    opacity: 0.6;
  }
}
.more {
  justify-self: start;
}
.none {
  padding: 2px 0;
}
.people {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pchip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px 3px 3px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  color: var(--text);
}
.pchip:hover {
  border-color: var(--g);
}
.mini {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--g);
  background: color-mix(in srgb, var(--g) 14%, transparent);
}
.pchip .x {
  color: var(--text-3);
  opacity: 0;
}
.pchip:hover .x {
  opacity: 1;
}
.pchip .x:hover {
  color: var(--danger);
}
.refs {
  display: grid;
  gap: 2px;
}
.ref {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.ref:hover {
  background: var(--hover);
}
</style>
