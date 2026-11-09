import type { Place } from './types'

/** [name, lat, lng, region] — built by scripts/build-geo.mjs from Natural Earth (public domain). */
type City = [string, number, number, string]
let cities: City[] | undefined

/** Loads the offline city list on first use (≈65 KB), so pages that don't need it stay light. */
export async function loadCities(): Promise<City[]> {
  cities ??= (await import('@/assets/geo/cities.json')).default as City[]
  return cities
}

/** City suggestions for what was typed; larger cities first. */
export async function searchCities(q: string, limit = 8): Promise<(Place & { region: string })[]> {
  const s = q.trim().replace(/市$/, '')
  if (!s) return []
  const list = await loadCities()
  const starts: City[] = []
  const has: City[] = []
  for (const c of list) {
    if (c[0].startsWith(s)) starts.push(c)
    else if (c[0].includes(s) || c[3].startsWith(s)) has.push(c)
    if (starts.length >= limit) break
  }
  return [...starts, ...has].slice(0, limit).map(([name, lat, lng, region]) => ({ name, lat, lng, region }))
}
