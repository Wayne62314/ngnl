<script setup lang="ts">
import { computed, ref } from 'vue'
import { ExternalLink, Lightbulb, Newspaper, Plus, Shuffle } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { friendly } from '@/lib/dates'
import { titleOf } from '@/lib/itemView'
import type { IdeaStatus, Note } from '@/lib/types'
import Seg from '@/components/Seg.vue'
import Empty from '@/components/Empty.vue'
import LinkChips from '@/components/LinkChips.vue'

const data = useData()
const ui = useUi()
const tab = ref<'idea' | 'intel'>('idea')
const tag = ref<string | null>(null)

const ideas = computed(() => data.notes.filter((n) => n.kind === 'idea'))
const intel = computed(() => data.notes.filter((n) => n.kind === 'intel'))

const COLS: { key: IdeaStatus; label: string; hint: string }[] = [
  { key: 'seed', label: '萌芽', hint: '刚冒出来的念头' },
  { key: 'growing', label: '发展中', hint: '正在想、正在试' },
  { key: 'done', label: '已转化', hint: '变成了任务或目标' },
]
const col = (s: IdeaStatus) =>
  ideas.value.filter((n) => (n.status ?? 'seed') === s).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
const dropped = computed(() => col('dropped'))
const showDropped = ref(false)

const tags = computed(() => {
  const m = new Map<string, number>()
  for (const n of intel.value) for (const t of n.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
})
const intelList = computed(() =>
  intel.value.filter((n) => !tag.value || n.tags?.includes(tag.value)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
)
const host = (u?: string) => {
  try {
    return u && /^https?:\/\//.test(u) ? new URL(u).hostname.replace(/^www\./, '') : u
  } catch {
    return u
  }
}
const excerpt = (n: Note) => n.notes?.trim().split('\n')[0]

function shuffle() {
  const pool = ideas.value.filter((n) => n.status === 'seed' || n.status === 'growing' || !n.status)
  if (!pool.length) return ui.toast('还没有可以抽的灵感')
  ui.open(pool[Math.floor(Math.random() * pool.length)].id)
}
async function add() {
  const n = await data.create('note', tab.value === 'idea' ? { kind: 'idea', status: 'seed' } : { kind: 'intel' })
  if (n) ui.open(n.id)
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div>
        <h1 class="page-title">灵感与情报</h1>
        <div class="page-sub">灵感是你自己的想法，情报是你收集来的资料。都可以关联到任何地方。</div>
      </div>
      <div class="row">
        <button v-if="tab === 'idea'" class="btn" title="随机翻出一条灵感" @click="shuffle"><Shuffle />抽一条</button>
        <button class="btn primary" @click="add"><Plus />{{ tab === 'idea' ? '新灵感' : '新情报' }}</button>
      </div>
    </header>

    <Seg
      v-model="tab"
      class="tabs"
      :options="[
        { value: 'idea', label: `灵感 ${ideas.length}` },
        { value: 'intel', label: `情报 ${intel.length}` },
      ]"
    />

    <template v-if="tab === 'idea'">
      <div v-if="ideas.length" class="board">
        <section v-for="c in COLS" :key="c.key" class="column">
          <h2 class="section-title">{{ c.label }} <span class="count">{{ col(c.key).length }}</span></h2>
          <div class="cards">
            <article v-for="n in col(c.key)" :key="n.id" class="card idea" :class="c.key" @click="ui.open(n.id)">
              <b>{{ titleOf(n) }}</b>
              <p v-if="excerpt(n)" class="muted">{{ excerpt(n) }}</p>
              <div class="faint small">{{ friendly(n.createdAt.slice(0, 10)) }}</div>
              <LinkChips :id="n.id" :max="3" />
            </article>
            <div v-if="!col(c.key).length" class="faint hint">{{ c.hint }}</div>
          </div>
        </section>
      </div>
      <div v-else class="card">
        <Empty :icon="Lightbulb" title="灵感仓库是空的" text="突然冒出的想法先存在这里，不用马上做。有一天它可能变成一个任务，甚至一个目标。">
          <button class="btn primary" @click="add"><Plus />记一条灵感</button>
        </Empty>
      </div>
      <div v-if="dropped.length" class="dropped">
        <button class="btn ghost sm" @click="showDropped = !showDropped">{{ showDropped ? '收起' : '查看' }}已放弃的 {{ dropped.length }} 条</button>
        <div v-if="showDropped" class="card list">
          <div v-for="n in dropped" :key="n.id" class="list-row faint" @click="ui.open(n.id)">{{ titleOf(n) }}</div>
        </div>
      </div>
    </template>

    <template v-else>
      <div v-if="tags.length" class="tagbar">
        <button class="chip tagbtn" :class="{ on: !tag }" @click="tag = null">全部</button>
        <button v-for="[t, n] in tags" :key="t" class="chip tagbtn" :class="{ on: tag === t }" @click="tag = tag === t ? null : t"># {{ t }} <span class="faint">{{ n }}</span></button>
      </div>
      <div v-if="intelList.length" class="card list">
        <div v-for="n in intelList" :key="n.id" class="list-row intel" @click="ui.open(n.id)">
          <Newspaper :size="16" class="faint" />
          <div class="grow">
            <div class="ellipsis"><b>{{ titleOf(n) }}</b></div>
            <div class="faint small ellipsis">{{ excerpt(n) || host(n.source) || '—' }}</div>
            <LinkChips :id="n.id" :max="3" class="intel-links" />
          </div>
          <span v-for="t in (n.tags ?? []).slice(0, 3)" :key="t" class="chip">#{{ t }}</span>
          <a v-if="/^https?:\/\//.test(n.source ?? '')" :href="n.source" target="_blank" rel="noopener" class="btn ghost sm icon" title="打开来源" @click.stop><ExternalLink /></a>
        </div>
      </div>
      <div v-else class="card">
        <Empty :icon="Newspaper" title="还没有情报" text="有用的文章、教程链接、听来的消息、某个人的联系方式……贴上来源，打上标签，需要时一搜就有。">
          <button class="btn primary" @click="add"><Plus />存一条情报</button>
        </Empty>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tabs {
  margin-bottom: 22px;
}
.board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  align-items: start;
}
.column {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
}
.cards {
  display: grid;
  gap: 10px;
}
.idea {
  padding: 12px 14px;
  cursor: pointer;
  box-shadow: none;
  transition: border-color 0.15s, transform 0.15s;
}
.idea:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
}
.idea.seed {
  border-left: 3px solid var(--attr-body);
}
.idea.growing {
  border-left: 3px solid var(--gold);
}
.idea.done {
  border-left: 3px solid var(--attr-career);
}
.idea p {
  margin: 4px 0;
  font-size: 13px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.small {
  font-size: 12px;
}
.hint {
  font-size: 13px;
  padding: 8px 4px;
}
.dropped {
  margin-top: 20px;
  display: grid;
  gap: 8px;
  justify-items: start;
}
.dropped .card {
  width: 100%;
}
.tagbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}
.tagbtn {
  border: 1px solid transparent;
  cursor: pointer;
}
.tagbtn.on {
  background: var(--ink);
  color: var(--on-ink);
}
.tagbtn.on .faint {
  color: inherit;
  opacity: 0.6;
}
@media (max-width: 860px) {
  .board {
    grid-template-columns: 1fr;
  }
}
.intel-links {
  margin-top: 4px;
}
.idea :deep(.links) {
  margin-top: 8px;
}
</style>
