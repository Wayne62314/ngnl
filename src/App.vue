<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import {
  BookOpenText,
  CalendarDays,
  Cloud,
  CloudOff,
  Download,
  Ellipsis,
  History,
  Lightbulb,
  Network,
  RefreshCw,
  Repeat,
  Search,
  Settings,
  Swords,
  UserRound,
  Users,
  X,
} from 'lucide-vue-next'
import { useData } from '@/stores/data'
import { useUi } from '@/stores/ui'
import { useMcp } from '@/stores/mcp'
import { useSync } from '@/stores/sync'
import { useInstall } from '@/stores/install'
import ItemDrawer from '@/components/ItemDrawer.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import Toasts from '@/components/Toasts.vue'
import Floaters from '@/components/Floaters.vue'
import LevelUp from '@/components/LevelUp.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const data = useData()
const ui = useUi()
const sync = useSync()
const inst = useInstall()
const route = useRoute()

/** Everything in the dock, in order. `phone` marks the four that stay on the phone tab bar (the rest go under 更多). */
const nav = [
  { to: '/', label: '今日', icon: CalendarDays, phone: true },
  { to: '/character', label: '角色', icon: UserRound },
  { to: '/tasks', label: '任务', icon: Swords, phone: true },
  { to: '/habits', label: '习惯', icon: Repeat, phone: true },
  { to: '/goals', label: '愿景树', icon: Network },
  { to: '/people', label: '人物', icon: Users, phone: true },
  { to: '/timeline', label: '经历', icon: History },
  { to: '/notes', label: '灵感', icon: Lightbulb },
]
const more = computed(() => [...nav.filter((n) => !n.phone), { to: '/settings', label: '设置与备份', icon: Settings }])
const moreActive = computed(() => more.value.some((n) => n.to === route.path))
const moreOpen = ref(false)
watch(() => route.fullPath, () => (moreOpen.value = false))

const syncLabel = computed(() => ({ idle: '已同步', syncing: '同步中…', offline: '离线', error: '同步出错', off: '' })[sync.state])

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    ui.paletteOpen = !ui.paletteOpen
  }
  if (e.key === 'Escape') moreOpen.value = false
}
onMounted(() => {
  data.init().then(() => {
    useMcp().start()
    void useSync().init()
  })
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="shell">
    <header class="top">
      <RouterLink to="/" class="brand">
        <svg viewBox="0 0 64 64" class="brand-mark" aria-hidden="true">
          <path d="M32 6l22 12.7v26.6L32 58 10 45.3V18.7z" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" />
          <path d="M32 21l9.5 5.5v11L32 43l-9.5-5.5v-11z" fill="currentColor" />
        </svg>
        <span class="serif">人生面板</span>
      </RouterLink>
      <div class="top-right">
        <RouterLink v-if="sync.enabled" to="/settings#sync" class="sync-pill" :class="sync.state" :title="sync.error || '多设备同步'">
          <component :is="sync.state === 'offline' || sync.state === 'error' ? CloudOff : sync.state === 'syncing' ? RefreshCw : Cloud" :size="14" />
          <span>{{ syncLabel }}</span>
        </RouterLink>
        <button v-if="inst.platform === 'prompt'" class="pill install" @click="inst.install()"><Download :size="15" /><span>安装为应用</span></button>
        <button class="pill search" aria-label="搜索或新建" @click="ui.paletteOpen = true">
          <Search :size="15" />
          <span class="label">搜索或新建</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>
    </header>

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

    <!-- Desktop: floating dock with every section -->
    <nav class="dock" aria-label="主菜单">
      <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="dock-item">
        <component :is="n.icon" :size="19" />
        <span>{{ n.label }}</span>
      </RouterLink>
      <span class="dock-sep" aria-hidden="true" />
      <RouterLink to="/settings" class="dock-item icon-only" aria-label="设置与备份" title="设置与备份">
        <Settings :size="19" />
      </RouterLink>
    </nav>

    <!-- Phone: four main tabs + 更多 -->
    <nav class="tabbar" aria-label="主菜单">
      <RouterLink v-for="n in nav.filter((x) => x.phone)" :key="n.to" :to="n.to" class="tab">
        <component :is="n.icon" :size="21" />
        <span>{{ n.label }}</span>
      </RouterLink>
      <button class="tab" :class="{ 'router-link-exact-active': moreActive }" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen">
        <Ellipsis :size="21" />
        <span>更多</span>
      </button>
    </nav>
    <Transition name="sheet">
      <div v-if="moreOpen" class="more-scrim" @click.self="moreOpen = false">
        <div class="more-sheet" role="dialog" aria-label="更多">
          <div class="more-head">
            <b class="serif">更多</b>
            <button class="btn ghost sm icon" aria-label="关闭" @click="moreOpen = false"><X /></button>
          </div>
          <div class="more-grid">
            <RouterLink v-for="n in more" :key="n.to" :to="n.to" class="more-item">
              <component :is="n.icon" :size="22" />
              <span>{{ n.label }}</span>
            </RouterLink>
            <button class="more-item" @click="(moreOpen = false), (ui.paletteOpen = true)">
              <Search :size="22" />
              <span>搜索</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <ItemDrawer />
    <CommandPalette />
    <Toasts />
    <Floaters />
    <LevelUp />
    <ConfirmDialog />
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
}
.top {
  max-width: 1120px;
  margin: 0 auto;
  padding: 18px 48px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  font-weight: 900;
  font-size: 18px;
  letter-spacing: 0.06em;
}
.brand-mark {
  width: 26px;
  height: 26px;
  color: var(--gold);
}
.top-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pill {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-2);
  cursor: pointer;
  font-size: 13px;
}
.pill:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.search {
  min-width: 220px;
}
.search .label {
  flex: 1;
  text-align: left;
}
.search kbd {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
  color: var(--text-3);
}
.install {
  color: var(--gold);
  border-color: color-mix(in srgb, var(--gold) 45%, transparent);
  background: var(--gold-soft);
  font-weight: 600;
}
.sync-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ok);
  text-decoration: none;
  padding: 0 4px;
}
.sync-pill.syncing,
.sync-pill.offline {
  color: var(--text-3);
}
.sync-pill.syncing svg {
  animation: spin 1s linear infinite;
}
.sync-pill.error {
  color: var(--danger);
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.offline {
  display: flex;
  gap: 16px;
  color: var(--text-2);
}
.offline b {
  color: var(--text);
}

/* ---- floating dock ---- */
.dock {
  position: fixed;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 7px;
  border-radius: 22px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(14px) saturate(1.2);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
}
.dock-item {
  height: 44px;
  padding: 0 14px;
  border-radius: 15px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-2);
  text-decoration: none;
  font-size: 14px;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}
.dock-item:hover {
  background: var(--hover);
  color: var(--text);
}
.dock-item.router-link-exact-active {
  background: var(--ink);
  color: var(--on-ink);
  font-weight: 700;
}
.dock-item.icon-only {
  width: 44px;
  padding: 0;
  justify-content: center;
}
.dock-sep {
  width: 1px;
  height: 26px;
  margin: 0 4px;
  background: var(--border);
}

.tabbar,
.more-scrim {
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

/* Medium screens: labels go, icons stay. */
@media (max-width: 1080px) {
  .dock-item {
    padding: 0 12px;
  }
  .dock-item span {
    display: none;
  }
  .dock-item.router-link-exact-active span {
    display: inline;
  }
}

/* ---- phone ---- */
@media (max-width: 760px) {
  .top {
    padding: 12px 16px 0;
  }
  .search {
    min-width: 0;
    width: 38px;
    padding: 0;
    justify-content: center;
  }
  .search .label,
  .search kbd,
  .install span {
    display: none;
  }
  .dock {
    display: none;
  }
  .tabbar {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    position: fixed;
    inset: auto 0 0 0;
    z-index: 30;
    background: color-mix(in srgb, var(--surface) 94%, transparent);
    backdrop-filter: blur(14px);
    border-top: 1px solid var(--border);
    padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
  }
  .tab {
    display: grid;
    justify-items: center;
    gap: 2px;
    min-height: 48px;
    align-content: center;
    font-size: 11px;
    color: var(--text-3);
    text-decoration: none;
    border: none;
    background: none;
    cursor: pointer;
    padding: 0;
  }
  .tab.router-link-exact-active {
    color: var(--gold);
    font-weight: 700;
  }
  .more-scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(20, 15, 8, 0.35);
  }
  .more-sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 14px 16px calc(18px + env(safe-area-inset-bottom));
    border-radius: 22px 22px 0 0;
    background: var(--surface);
    box-shadow: var(--shadow-lg);
  }
  .more-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    font-size: 17px;
  }
  .more-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .more-item {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 14px 4px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--text);
    text-decoration: none;
    font-size: 13px;
    cursor: pointer;
  }
  .more-item.router-link-exact-active {
    border-color: var(--gold);
    color: var(--gold);
  }
  .sheet-enter-active,
  .sheet-leave-active {
    transition: opacity 0.2s;
  }
  .sheet-enter-active .more-sheet,
  .sheet-leave-active .more-sheet {
    transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .sheet-enter-from,
  .sheet-leave-to {
    opacity: 0;
  }
  .sheet-enter-from .more-sheet,
  .sheet-leave-to .more-sheet {
    transform: translateY(100%);
  }
}
</style>
