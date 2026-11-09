/**
 * Character portraits for the card. A profile's `portrait` is one of:
 *   - "preset:<key>"           one of the built-in drawings below
 *   - "data:image/jpeg;base64…" a photo/drawing the user uploaded (resized on device)
 *   - "data:image/svg+xml…"     an SVG, e.g. drawn by an AI assistant over MCP
 * Images are always shown through <img>, so an SVG can't run scripts.
 */
import type { Attr } from './types'

interface Preset {
  key: string
  name: string
  attr: Attr
  svg: string
}

// One shared figure, dressed differently per class. 320×420, bust facing forward.
const figure = (o: { bg1: string; bg2: string; skin: string; hair: string; cloth: string; trim: string; hairPath: string; extra: string; back?: string }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 420">
<defs>
<radialGradient id="g" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="${o.bg1}"/><stop offset="1" stop-color="${o.bg2}"/></radialGradient>
<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.cloth}"/><stop offset="1" stop-color="${o.bg2}"/></linearGradient>
</defs>
<rect width="320" height="420" fill="url(#g)"/>
<circle cx="160" cy="150" r="118" fill="none" stroke="${o.trim}" stroke-opacity=".35" stroke-width="1.5"/>
${o.back ?? ''}
<path d="M40 420c6-82 52-128 120-128s114 46 120 128z" fill="url(#c)"/>
<path d="M132 262h56v40c0 14-12 24-28 24s-28-10-28-24z" fill="${o.skin}"/>
<path d="M132 292c8 10 18 15 28 15s20-5 28-15" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="6"/>
<ellipse cx="160" cy="200" rx="60" ry="72" fill="${o.skin}"/>
<path d="${o.hairPath}" fill="${o.hair}"/>
<ellipse cx="138" cy="210" rx="5" ry="6.5" fill="#2a2320"/>
<ellipse cx="182" cy="210" rx="5" ry="6.5" fill="#2a2320"/>
<path d="M148 244q12 8 24 0" fill="none" stroke="#7a4a3a" stroke-width="3" stroke-linecap="round"/>
<ellipse cx="128" cy="232" rx="9" ry="5" fill="#e88" fill-opacity=".25"/>
<ellipse cx="192" cy="232" rx="9" ry="5" fill="#e88" fill-opacity=".25"/>
${o.extra}
</svg>`

const SHORT = 'M98 196c-4-58 26-96 62-96s68 38 62 96c-10-30-30-46-62-46s-52 16-62 46z'
const LONG = 'M96 200c-6-62 24-102 64-102s70 40 64 102l6 110c-14-8-22-30-24-58-6-34-18-64-46-74-28 10-40 40-46 74-2 28-10 50-24 58z'
const BUN = 'M98 196c-4-58 26-96 62-96s68 38 62 96c-10-30-30-46-62-46s-52 16-62 46zM140 92a20 20 0 1 1 40 0a20 20 0 1 1-40 0z'

export const PRESETS: Preset[] = [
  {
    key: 'scholar',
    name: '学者',
    attr: 'mind',
    svg: figure({
      bg1: '#dbe6fb', bg2: '#5b7fc8', skin: '#f3d6c2', hair: '#2b2a3a', cloth: '#3f5f9e', trim: '#ffffff', hairPath: SHORT,
      extra: '<g fill="none" stroke="#1f2b44" stroke-width="3.5"><circle cx="138" cy="210" r="15"/><circle cx="182" cy="210" r="15"/><path d="M153 210h14"/></g><rect x="200" y="330" width="70" height="52" rx="4" fill="#f5efe0" stroke="#1f2b44" stroke-width="3"/><path d="M235 330v52" stroke="#1f2b44" stroke-width="3"/>',
    }),
  },
  {
    key: 'warrior',
    name: '战士',
    attr: 'body',
    svg: figure({
      bg1: '#d6f2e6', bg2: '#2f8a68', skin: '#e9c2a3', hair: '#3a2418', cloth: '#245c48', trim: '#ffffff', hairPath: SHORT,
      extra: '<path d="M100 170q60-22 120 0v14q-60-20-120 0z" fill="#c0392b"/><path d="M220 176l26 14-24 4z" fill="#c0392b"/><path d="M70 420l20-90h40l-14 90z" fill="#5d6b74"/><path d="M200 420l14-90h40l20 90z" fill="#5d6b74"/>',
    }),
  },
  {
    key: 'artisan',
    name: '工匠',
    attr: 'craft',
    svg: figure({
      bg1: '#fde3cf', bg2: '#c8661f', skin: '#f1cfb4', hair: '#6b3a1e', cloth: '#9a4c16', trim: '#ffffff', hairPath: LONG,
      extra: '<ellipse cx="160" cy="128" rx="74" ry="22" fill="#2d2a33"/><circle cx="160" cy="108" r="8" fill="#2d2a33"/><path d="M236 300l40-80" stroke="#7a5230" stroke-width="7" stroke-linecap="round"/><path d="M272 212l12-18 6 26z" fill="#e2b04a"/>',
    }),
  },
  {
    key: 'envoy',
    name: '使者',
    attr: 'social',
    svg: figure({
      bg1: '#fbdbe9', bg2: '#c2457f', skin: '#f5d9c8', hair: '#4a2a3a', cloth: '#8e2f5c', trim: '#ffffff', hairPath: LONG,
      extra: '<path d="M110 300q50 34 100 0l8 26q-58 34-116 0z" fill="#f2c14e"/><path d="M196 318l18 54-22-8-8 22-8-58z" fill="#f2c14e"/>',
    }),
  },
  {
    key: 'merchant',
    name: '商人',
    attr: 'career',
    svg: figure({
      bg1: '#e6defb', bg2: '#7655c8', skin: '#efcfb6', hair: '#1f1b2a', cloth: '#2f2a44', trim: '#ffffff', hairPath: SHORT,
      extra: '<path d="M140 300l20 22 20-22 6 120h-52z" fill="#f4f1ea"/><path d="M154 318h12l6 40-12 16-12-16z" fill="#c9a227"/><circle cx="246" cy="350" r="22" fill="#e2b04a" stroke="#8a6420" stroke-width="3"/><path d="M246 338v24M238 344h14a6 6 0 0 1 0 12h-12" fill="none" stroke="#8a6420" stroke-width="3"/>',
    }),
  },
  {
    key: 'hermit',
    name: '隐士',
    attr: 'spirit',
    svg: figure({
      bg1: '#d2f0f4', bg2: '#1d8aa0', skin: '#f2d8c4', hair: '#3b4a52', cloth: '#1d5e6e', trim: '#ffffff', hairPath: BUN,
      back: '<path d="M78 420c0-130 22-270 82-300 60 30 82 170 82 300z" fill="#174c59"/>',
      extra: '<path d="M226 120q30 10 28 44-30-6-28-44z" fill="#7bc47f"/><path d="M226 120q14 22 26 42" stroke="#3f7f45" stroke-width="2" fill="none"/>',
    }),
  },
]

const toDataUrl = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)

/** The image URL to show for a profile, falling back to the preset for the character's strongest attribute. */
export function portraitSrc(portrait: string | undefined, topAttr: Attr): string {
  if (portrait?.startsWith('data:image/')) return portrait
  const key = portrait?.startsWith('preset:') ? portrait.slice(7) : undefined
  const p = PRESETS.find((x) => x.key === key) ?? PRESETS.find((x) => x.attr === topAttr) ?? PRESETS[0]
  return toDataUrl(p.svg)
}
export const presetSrc = (key: string) => toDataUrl(PRESETS.find((p) => p.key === key)!.svg)

/** Card rarity by rank, like a collectible card. */
export function rarity(level: number): { label: string; tone: 'n' | 'r' | 'sr' | 'ssr' | 'ur' } {
  if (level >= 40) return { label: 'UR', tone: 'ur' }
  if (level >= 30) return { label: 'SSR', tone: 'ssr' }
  if (level >= 15) return { label: 'SR', tone: 'sr' }
  if (level >= 5) return { label: 'R', tone: 'r' }
  return { label: 'N', tone: 'n' }
}

/** Resizes an uploaded image on the device (max 720px tall, JPEG) so it stays small enough to sync. */
export async function resizeImage(file: File, maxH = 720): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, maxH / img.naturalHeight, (maxH * 0.8) / img.naturalWidth)
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.86)
  } finally {
    URL.revokeObjectURL(url)
  }
}
