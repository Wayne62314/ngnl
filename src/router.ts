import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('./views/TodayView.vue'), meta: { title: '今日' } },
    { path: '/character', component: () => import('./views/CharacterView.vue'), meta: { title: '角色' } },
    { path: '/tasks', component: () => import('./views/TasksView.vue'), meta: { title: '任务' } },
    { path: '/habits', component: () => import('./views/HabitsView.vue'), meta: { title: '习惯' } },
    { path: '/goals', component: () => import('./views/GoalsView.vue'), meta: { title: '愿景树' } },
    { path: '/people', component: () => import('./views/PeopleView.vue'), meta: { title: '人物' } },
    { path: '/assets', component: () => import('./views/AssetsView.vue'), meta: { title: '资产' } },
    { path: '/simulate/:id?', component: () => import('./views/SimulateView.vue'), meta: { title: '推演' } },
    { path: '/graph', component: () => import('./views/GraphView.vue'), meta: { title: '星图' } },
    { path: '/trajectory', component: () => import('./views/TrajectoryView.vue'), meta: { title: '轨迹' } },
    { path: '/timeline', component: () => import('./views/TimelineView.vue'), meta: { title: '经历' } },
    { path: '/notes', component: () => import('./views/NotesView.vue'), meta: { title: '灵感与情报' } },
    { path: '/settings', component: () => import('./views/SettingsView.vue'), meta: { title: '设置' } },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
  // Links like /settings#install scroll to that section (after the page transition).
  scrollBehavior: (to) =>
    to.hash ? new Promise((resolve) => setTimeout(() => resolve({ el: to.hash, top: 16, behavior: 'smooth' }), 260)) : { top: 0 },
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · NoGameNoLife` : 'NoGameNoLife'
})
