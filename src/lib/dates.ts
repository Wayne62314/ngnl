/** Local-time date helpers. Dates are stored as YYYY-MM-DD strings in the user's local time. */

const pad = (n: number) => String(n).padStart(2, '0')

export const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const fromKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const today = () => toKey(new Date())

export const addDays = (k: string, n: number) => {
  const d = fromKey(k)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

/** Whole days from a to b (b - a). */
export const diffDays = (a: string, b: string) =>
  Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86_400_000)

export const weekday = (k: string) => fromKey(k).getDay()

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
export const weekdayLabel = (d: number) => WEEK[d]

export function friendly(k: string, ref = today()) {
  const n = diffDays(ref, k)
  if (n === 0) return '今天'
  if (n === 1) return '明天'
  if (n === -1) return '昨天'
  if (n > 1 && n < 7) return `${n} 天后`
  if (n < -1 && n > -30) return `${-n} 天前`
  const d = fromKey(k)
  const sameYear = d.getFullYear() === fromKey(ref).getFullYear()
  return sameYear ? `${d.getMonth() + 1}月${d.getDate()}日` : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

export function greeting(h = new Date().getHours()) {
  if (h < 5) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 13) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}
