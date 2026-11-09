<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { BookOpenText, CalendarDays, History, Lightbulb, Network, Repeat, Search, Settings, Swords, UserRound, Users } from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import Avatar from '@/components/Avatar.vue'
import XpBar from '@/components/XpBar.vue'
import ItemDrawer from '@/components/ItemDrawer.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import Toasts from '@/components/Toasts.vue'

const data = useData()
const ui = useUi()

const nav = [
  { to: '/', label: '今日', icon: CalendarDays },
  { to: '/character', label: '角色', icon: UserRound },
  { to: '/tasks', label: '任务', icon: Swords },
  { to: '/habits', label: '习惯', icon: Repeat },
  { to: '/goals', label: '愿景树', icon: Network },
  { to: '/people', label: '人物', icon: Users },
  { to: '/timeline', label: '经历', icon: History },
  { to: '/notes', label: '灵感与情报', icon: Lightbulb },
]

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    ui.paletteOpen = !ui.paletteOpen
  }
}
onMounted(() => {
  data.init()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="shell">
    <aside class="side">
      <RouterLink to="/" class="brand">
        <svg viewBox="0 0 64 64" class="brand-mark" aria-hidden="true">
          <path d="M32 6l22 12.7v26.6L32 58 10 45.3V18.7z" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linejoin="round" />
          <path d="M32 21l9.5 5.5v11L32 43l-9.5-5.5v-11z" fill="currentColor" />
        </svg>
        <span>NoGameNoLife</span>
      </RouterLink>

      <RouterLink to="/character" class="me">
        <Avatar :name="data.profile.name" :size="40" />
        <div class="grow">
          <div class="row" style="justify-content: space-between">
            <b class="ellipsis">{{ data.profile.name || '无名旅人' }}</b>
            <span class="lv num">Lv.{{ data.level.level }}</span>
          </div>
          <XpBar :into="data.level.into" :need="data.level.need" :height="5" />
        </div>
      </RouterLink>

      <button class="search" @click="ui.paletteOpen = true">
        <Search :size="15" />
        <span class="grow">搜索或新建</span>
        <kbd>Ctrl K</kbd>
      </button>

      <nav class="nav">
        <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="nav-item">
          <component :is="n.icon" :size="18" />
          <span>{{ n.label }}</span>
        </RouterLink>
      </nav>

      <div class="side-foot">
        <RouterLink to="/settings" class="nav-item">
          <Settings :size="18" />
          <span>设置与备份</span>
        </RouterLink>
      </div>
    </aside>

    <main class="main">
      <div v-if="data.loadError" class="page">
        <div class="card card-pad offline">
          <BookOpenText :size="28" />
          <div>
            <b>无法读取本地数据</b>
            <p class="muted">{{ data.loadError }}。如果开着隐私/无痕窗口，请换成普通窗口；也可能是浏览器禁用了网站存储。</p>
            <button class="btn" @click="data.load()">重试</button>
          </div>
        </div>
      </div>
      <RouterView v-else-if="data.loaded" v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>

    <nav class="tabbar">
      <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="tab">
        <component :is="n.icon" :size="20" />
        <span>{{ n.label }}</span>
      </RouterLink>
      <RouterLink to="/settings" class="tab">
        <Settings :size="20" />
        <span>设置</span>
      </RouterLink>
    </nav>

    <ItemDrawer />
    <CommandPalette />
    <Toasts />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
}
.side {
  position: sticky;
  top: 0;
  height: 100vh;
  width: 236px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 14px;
  border-right: 1px solid var(--border);
  background: var(--surface-2);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 8px;
  text-decoration: none;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.02em;
}
.brand-mark {
  width: 24px;
  height: 24px;
  color: var(--gold);
}
.me {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
  text-decoration: none;
  transition: border-color 0.15s;
}
.me:hover {
  border-color: var(--border-strong);
}
.me b {
  font-size: 14px;
}
.lv {
  font-size: 12px;
  font-weight: 700;
  color: var(--gold);
}
.me .row {
  margin-bottom: 6px;
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-3);
  cursor: pointer;
  text-align: left;
}
.search:hover {
  border-color: var(--border-strong);
  color: var(--text-2);
}
kbd {
  font-family: inherit;
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: var(--surface-2);
}
.nav {
  display: grid;
  gap: 2px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  text-decoration: none;
  color: var(--text-2);
  font-weight: 500;
  transition: background 0.12s, color 0.12s;
}
.nav-item:hover {
  background: var(--hover);
  color: var(--text);
}
.nav-item.router-link-exact-active {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
.nav-item.router-link-exact-active svg {
  color: var(--gold);
}
.side-foot {
  margin-top: auto;
}
.main {
  flex: 1;
  min-width: 0;
}
.offline {
  display: flex;
  gap: 16px;
  color: var(--text-2);
}
.offline b {
  color: var(--text);
  font-size: 16px;
}
.tabbar {
  display: none;
}

.page-enter-active,
.page-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.page-leave-to {
  opacity: 0;
}

@media (max-width: 760px) {
  .side {
    display: none;
  }
  .tabbar {
    display: flex;
    position: fixed;
    inset: auto 0 0 0;
    z-index: 30;
    overflow-x: auto;
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
    scrollbar-width: none;
  }
  .tab {
    flex: none;
    min-width: 64px;
    display: grid;
    justify-items: center;
    gap: 2px;
    font-size: 11px;
    color: var(--text-3);
    text-decoration: none;
    padding: 4px 6px;
  }
  .tab.router-link-exact-active {
    color: var(--gold);
  }
}
</style>
