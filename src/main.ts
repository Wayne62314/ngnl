import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './styles.css'

try {
  const t = localStorage.getItem('ngnl-theme')
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t
} catch {}

createApp(App).use(createPinia()).use(router).mount('#app')

// Offline support and "install as app". Dev builds skip it so hot reload isn't cached.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}))
}
