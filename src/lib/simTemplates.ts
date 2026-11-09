import { addDays } from './dates'
import { newId } from './simulate'
import type { Asset, FieldDef, Habit, Item, LedgerEntry, SimEdge, SimNode } from './types'

export interface Template {
  key: string
  title: string
  hint: string
  build: (items: Item[], today: string) => { title: string; nodes: SimNode[]; edges: SimEdge[] }
}

const mk = (kind: string, x: number, y: number, data: Record<string, unknown> = {}): SimNode => ({ id: newId(), kind, x, y, data })
const wire = (from: SimNode, fromPort: string, to: SimNode, toPort: string): SimEdge => ({ id: newId(), from: from.id, fromPort, to: to.id, toPort })

export const TEMPLATES: Template[] = [
  {
    key: 'wish',
    title: '想买的东西，攒得够吗',
    hint: '愿望单 + 省钱的习惯 + 副业收入 → 能不能在截止前买到',
    build(items, today) {
      const defs = items.filter((i): i is FieldDef => i.type === 'field')
      const moneyDefs = new Set(defs.filter((d) => d.kind === 'money').map((d) => d.id))
      // The wish closest to within reach: least left to save.
      const wish = items
        .filter((i): i is Asset => i.type === 'asset' && i.status === 'wanted' && !!i.value)
        .sort((a, b) => a.value! - (a.saved ?? 0) - (b.value! - (b.saved ?? 0)))[0]
      // A habit that saves money: one with a money field (每次省下…).
      let habitField: string | undefined
      const habit = items.find((i): i is Habit => {
        if (i.type !== 'habit' || i.archived) return false
        habitField = Object.keys(i.fields ?? {}).find((k) => moneyDefs.has(k) && typeof i.fields![k] === 'number')
        return !!habitField
      })
      // A side income: a repeating income other than the biggest one (the salary pays the bills).
      const incomes = items.filter((i): i is LedgerEntry => i.type === 'ledger' && i.flow === 'income' && i.repeat !== 'none' && (!i.until || i.until >= today))
      const side = incomes.length > 1 ? [...incomes].sort((a, b) => a.amount - b.amount)[0] : incomes[0]

      const nodes: SimNode[] = []
      const edges: SimEdge[] = []
      const target = wish ? mk('item', 40, 40, { itemId: wish.id }) : mk('num', 40, 40, { value: 3000, unit: '元' })
      nodes.push(target)

      let perDaySrc: { node: SimNode; port: string }
      const sum = mk('sum', 640, 300)
      nodes.push(sum)
      if (habit && habitField) {
        const h = mk('item', 40, 260, { itemId: habit.id })
        const mul = mk('mul', 340, 260)
        nodes.push(h, mul)
        edges.push(wire(h, 'f:' + habitField, mul, 'a'), wire(h, 'perDay', mul, 'b'), wire(mul, 'out', sum, 'a'))
      } else {
        const n = mk('num', 340, 260, { value: 20, unit: '元' })
        nodes.push(n)
        edges.push(wire(n, 'out', sum, 'a'))
      }
      if (side) {
        const s = mk('item', 340, 470, { itemId: side.id })
        nodes.push(s)
        edges.push(wire(s, 'day', sum, 'b'))
      }
      perDaySrc = { node: sum, port: 'out' }

      const deadline = mk('date', 640, 560, { value: addDays(today, 60) })
      const save = mk('save', 960, 120, { label: wish ? `${wish.title} 买得起吗` : '买得起吗' })
      const chart = mk('chart', 960, 480)
      nodes.push(deadline, save, chart)
      if (wish) edges.push(wire(target, 'value', save, 'target'), wire(target, 'saved', save, 'have'), wire(target, 'saved', chart, 'start'), wire(target, 'value', chart, 'target'))
      else edges.push(wire(target, 'out', save, 'target'), wire(target, 'out', chart, 'target'))
      edges.push(wire(perDaySrc.node, perDaySrc.port, save, 'perDay'), wire(deadline, 'out', save, 'deadline'), wire(perDaySrc.node, perDaySrc.port, chart, 'perDay'))
      return { title: wish ? `攒钱买 ${wish.title}` : '攒钱买东西', nodes, edges }
    },
  },
  {
    key: 'blank',
    title: '空白画布',
    hint: '从零开始，自己拖',
    build: () => ({ title: '新的推演', nodes: [], edges: [] }),
  },
]
