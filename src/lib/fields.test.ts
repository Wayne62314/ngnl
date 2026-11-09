import { describe, expect, it } from 'vitest'
import { fieldsOf, formatValue, parseValue, usageOf } from './fields'
import type { FieldDef, Item } from './types'

const def = (x: Partial<FieldDef>): FieldDef => ({ id: 'f', type: 'field', title: 'x', kind: 'number', createdAt: '', updatedAt: '', ...x })

describe('custom fields', () => {
  it('formats values by kind', () => {
    expect(formatValue(def({ kind: 'money' }), 3200000)).toBe('¥3,200,000')
    expect(formatValue(def({ kind: 'number', unit: '年' }), 70)).toBe('70 年')
    expect(formatValue(def({ kind: 'percent' }), 80)).toBe('80%')
    expect(formatValue(def({ kind: 'bool' }), true)).toBe('是')
    expect(formatValue(def({ kind: 'number' }), '')).toBe('—')
    const byId = new Map<string, Item>([['p1', { id: 'p1', type: 'person', title: '林夏', closeness: 5, createdAt: '', updatedAt: '' }]])
    expect(formatValue(def({ kind: 'item' }), 'p1', byId)).toBe('林夏')
  })

  it('parses what people type', () => {
    expect(parseValue(def({ kind: 'money' }), '¥ 15,000')).toBe(15000)
    expect(parseValue(def({ kind: 'percent' }), '80%')).toBe(80)
    expect(parseValue(def({ kind: 'number' }), 'abc')).toBeUndefined()
    expect(parseValue(def({ kind: 'number' }), '  ')).toBeUndefined()
    expect(parseValue(def({ kind: 'text' }), ' 九成新 ')).toBe('九成新')
    expect(parseValue(def({ kind: 'bool' }), false)).toBe(false)
  })

  it('lists fields in library order and counts usage', () => {
    const a = def({ id: 'a', title: '使用年限' })
    const b = def({ id: 'b', title: '购入价格', kind: 'money' })
    const house: Item = { id: 'h', type: 'asset', title: '房子', category: 'item', status: 'owned', createdAt: '', updatedAt: '', fields: { b: 3200000, a: 70, gone: 1 } }
    const pc: Item = { id: 'c', type: 'asset', title: '电脑', category: 'item', status: 'owned', createdAt: '', updatedAt: '', fields: { a: 5 } }
    expect(fieldsOf(house, [a, b]).map((x) => x.def.title)).toEqual(['使用年限', '购入价格'])
    expect(usageOf('a', [house, pc])).toBe(2)
    expect(usageOf('b', [house, pc])).toBe(1)
  })
})
