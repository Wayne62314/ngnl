import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/** The event Chrome/Edge/Android fire when the app can be installed. Not in TS's DOM types yet. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type Platform =
  | 'installed' // already running as an installed app
  | 'prompt' // Chrome / Edge / Android: one-click install
  | 'ios-safari' // iPhone/iPad: Share → Add to Home Screen
  | 'ios-other' // iOS browser that may not support adding (old iOS, Firefox…)
  | 'in-app' // WeChat / QQ / Weibo etc. built-in browser
  | 'mac-safari' // Safari on macOS: File → Add to Dock
  | 'unsupported' // e.g. Firefox desktop

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
const inApp = /MicroMessenger|QQ\/|Weibo|DingTalk|AlipayClient|Lark|FBAN|FBAV|Instagram|Line\//i.test(ua)
const iosVersion = Number(ua.match(/OS (\d+)_/)?.[1] ?? 0)
const iosSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
const macSafari = !isIOS && /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)

const standalone = () =>
  (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) ||
  (typeof navigator !== 'undefined' && (navigator as { standalone?: boolean }).standalone === true)

// Capture the prompt as early as possible: it can fire before any component mounts.
let early: InstallPromptEvent | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // we show our own button instead of the browser's mini-infobar
    early = e as InstallPromptEvent
    try {
      useInstall().deferred = early
    } catch {
      /* pinia not ready yet; picked up in the store */
    }
  })
}

export const useInstall = defineStore('install', () => {
  const deferred = ref<InstallPromptEvent | null>(early)
  const installed = ref(standalone())

  if (typeof window !== 'undefined') {
    window.addEventListener('appinstalled', () => {
      installed.value = true
      deferred.value = null
    })
    matchMedia('(display-mode: standalone)').addEventListener?.('change', (e) => (installed.value = e.matches))
  }

  const platform = computed<Platform>(() => {
    if (installed.value) return 'installed'
    if (inApp) return 'in-app'
    if (deferred.value) return 'prompt'
    // iOS 16.4+ lets any browser add to the Home Screen from its share menu.
    if (isIOS) return iosSafari || iosVersion >= 17 ? 'ios-safari' : 'ios-other'
    if (macSafari) return 'mac-safari'
    return 'unsupported'
  })

  /** Shows the browser's install dialog (Chrome / Edge / Android). */
  async function install(): Promise<boolean> {
    const e = deferred.value
    if (!e) return false
    await e.prompt()
    const { outcome } = await e.userChoice
    deferred.value = null
    if (outcome === 'accepted') installed.value = true
    return outcome === 'accepted'
  }

  return { deferred, installed, platform, install, isIOS, iosSafari }
})
