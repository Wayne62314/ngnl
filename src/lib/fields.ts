import { friendly } from './dates'
import type { FieldDef, FieldKind, FieldValue, Item } from './types'

export const FIELD_KINDS: { kind: FieldKind; label: string; hint: string; unit?: string }[] = [
  { kind: 'number', label: '数字', hint: '比如 使用年限、次数' },
  { kind: 'money', label: '金额', hint: '比如 购入价格、每次省下', unit: '¥' },
  { kind: 'date', label: '日期', hint: '比如 购入日期、到期日' },
  { kind: 'duration', label: '时长', hint: '比如 每次用时', unit: '小时' },
  { kind: 'percent', label: '百分比', hint: '比如 成功率', unit: '%' },
  { kind: 'text', label: '文字', hint: '比如 型号、备注' },
  { kind: 'select', label: '选项', hint: '比如 成色：全新 / 九成新 / 旧' },
  { kind: 'bool', label: '是 / 否', hint: '比如 是否在保修期' },
  { kind: 'item', label: '条目', hint: '指向另一个条目，比如 谁送的' },
]
export const kindLabel = (k: FieldKind) => FIELD_KINDS.find((x) => x.kind === k)?.label ?? k
export const isNumeric = (k: FieldKind) => k === 'number' || k === 'money' || k === 'duration' || k === 'percent'

const money = (n: number) => '¥' + n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })

/** How a value reads in the UI: "¥15,000", "70 年", "80%", "是"… */
export function formatValue(def: FieldDef, v: FieldValue | undefined, byId?: Map<string, Item>): string {
  if (v === undefined || v === '') return '—'
  switch (def.kind) {
    case 'money':
      return typeof v === 'number' ? money(v) : String(v)
    case 'percent':
      return `${v}%`
    case 'number':
    case 'duration':
      return def.unit ? `${v} ${def.unit}` : String(v)
    case 'date':
      return typeof v === 'string' ? `${v}（${friendly(v)}）` : String(v)
    case 'bool':
      return v ? '是' : '否'
    case 'item': {
      const it = typeof v === 'string' ? byId?.get(v) : undefined
      return it ? it.title || '未命名' : '（已删除的条目）'
    }
    default:
      return String(v)
  }
}

/** Turns what was typed into the stored value; returns undefined to clear it. */
export function parseValue(def: FieldDef, raw: string | boolean): FieldValue | undefined {
  if (typeof raw === 'boolean') return raw
  const s = raw.trim()
  if (!s) return undefined
  if (isNumeric(def.kind)) {
    const n = Number(s.replace(/[,，¥%\s]/g, ''))
    return Number.isFinite(n) ? n : undefined
  }
  return s
}

/** How many items use a field. */
export const usageOf = (defId: string, items: Item[]) => items.filter((i) => i.fields && defId in i.fields).length

/** The fields on an item, in the field library's order, skipping values whose definition was deleted. */
export function fieldsOf(it: Item, defs: FieldDef[]): { def: FieldDef; value: FieldValue }[] {
  if (!it.fields) return []
  return defs.filter((d) => d.id in it.fields!).map((d) => ({ def: d, value: it.fields![d.id] }))
}
