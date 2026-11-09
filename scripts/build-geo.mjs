// Builds the offline map data from Natural Earth (public domain):
//   node scripts/build-geo.mjs <ne_10m_populated_places.geojson> <world-atlas countries-50m.json>
// Writes src/assets/geo/cities.json  ([name, lat, lng, region][])
//    and src/assets/geo/countries-50m.json (copied as is).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const [placesPath, countriesPath] = process.argv.slice(2)
if (!placesPath || !countriesPath) throw new Error('usage: node scripts/build-geo.mjs <places.geojson> <countries-50m.json>')

const PROVINCES = {
  Anhui: '安徽', Beijing: '北京', Chongqing: '重庆', Fujian: '福建', Gansu: '甘肃', Guangdong: '广东', Guangxi: '广西', Guizhou: '贵州',
  Hainan: '海南', Hebei: '河北', Heilongjiang: '黑龙江', Henan: '河南', Hubei: '湖北', Hunan: '湖南', 'Inner Mongol': '内蒙古', Jiangsu: '江苏',
  Jiangxi: '江西', Jilin: '吉林', Liaoning: '辽宁', 'Ningxia Hui': '宁夏', Qinghai: '青海', Shaanxi: '陕西', Shandong: '山东', Shanghai: '上海',
  Shanxi: '山西', Sichuan: '四川', Tianjin: '天津', Xinjiang: '新疆', Xizang: '西藏', Yunnan: '云南', Zhejiang: '浙江',
}
const COUNTRIES = {
  'United States of America': '美国', Japan: '日本', 'South Korea': '韩国', 'North Korea': '朝鲜', 'United Kingdom': '英国', France: '法国',
  Germany: '德国', Italy: '意大利', Spain: '西班牙', Russia: '俄罗斯', Canada: '加拿大', Australia: '澳大利亚', 'New Zealand': '新西兰',
  Singapore: '新加坡', Malaysia: '马来西亚', Thailand: '泰国', Vietnam: '越南', Indonesia: '印度尼西亚', Philippines: '菲律宾', India: '印度',
  Pakistan: '巴基斯坦', Bangladesh: '孟加拉国', 'Sri Lanka': '斯里兰卡', Nepal: '尼泊尔', Mongolia: '蒙古', Kazakhstan: '哈萨克斯坦',
  Turkey: '土耳其', Iran: '伊朗', Iraq: '伊拉克', 'Saudi Arabia': '沙特阿拉伯', 'United Arab Emirates': '阿联酋', Israel: '以色列', Egypt: '埃及',
  'South Africa': '南非', Nigeria: '尼日利亚', Kenya: '肯尼亚', Ethiopia: '埃塞俄比亚', Brazil: '巴西', Argentina: '阿根廷', Chile: '智利',
  Peru: '秘鲁', Colombia: '哥伦比亚', Mexico: '墨西哥', Netherlands: '荷兰', Belgium: '比利时', Switzerland: '瑞士', Austria: '奥地利',
  Sweden: '瑞典', Norway: '挪威', Denmark: '丹麦', Finland: '芬兰', Poland: '波兰', Portugal: '葡萄牙', Greece: '希腊', Ireland: '爱尔兰',
  'Czech Republic': '捷克', Czechia: '捷克', Hungary: '匈牙利', Ukraine: '乌克兰', Myanmar: '缅甸', Cambodia: '柬埔寨', Laos: '老挝',
  Taiwan: '中国台湾', 'Hong Kong S.A.R.': '中国香港', 'Macao S.A.R': '中国澳门',
}

const places = JSON.parse(readFileSync(placesPath, 'utf8')).features.map((f) => f.properties)
const out = []
const seen = new Set()
for (const p of places) {
  const china = p.ADM0_A3 === 'CHN'
  const greaterChina = ['TWN', 'HKG', 'MAC'].includes(p.ADM0_A3)
  if (!china && !greaterChina && (p.POP_MAX ?? 0) < 300_000) continue
  const name = (p.NAME_ZH || p.NAME || '').replace(/市$/, '')
  if (!name) continue
  const region = china ? PROVINCES[p.ADM1NAME] ?? '中国' : COUNTRIES[p.ADM0NAME] ?? p.ADM0NAME
  const key = `${name}|${region}`
  if (seen.has(key)) continue
  seen.add(key)
  out.push([name, Math.round(p.LATITUDE * 1000) / 1000, Math.round(p.LONGITUDE * 1000) / 1000, region, p.POP_MAX ?? 0])
}
// Bigger places first, so search suggestions put them on top.
out.sort((a, b) => b[4] - a[4])
mkdirSync('src/assets/geo', { recursive: true })
writeFileSync('src/assets/geo/cities.json', JSON.stringify(out.map(([n, la, lo, r]) => [n, la, lo, r])))
copyFileSync(countriesPath, 'src/assets/geo/countries-50m.json')
console.log(`cities: ${out.length} (China ${out.filter((c) => PROVINCES[Object.keys(PROVINCES).find((k) => PROVINCES[k] === c[3])] || c[3] === '中国').length})`)
