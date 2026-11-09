import type { InjectionKey, Ref } from 'vue'
import type { Evaluation, Ports } from '@/lib/simulate'
import type { SimNode } from '@/lib/types'

/** What the canvas page hands down to every node and wire. */
export interface SimCanvas {
  node: (id: string) => SimNode | undefined
  ports: (id: string) => Ports
  ev: Ref<Evaluation>
  /** Edge id → label shown on the wire. */
  edgeLabel: (id: string) => { text: string; type: string } | undefined
  /** The value arriving at an input, formatted with the unit of where it comes from. */
  inputLabel: (nodeId: string, port: string) => string | undefined
  setData: (id: string, patch: Record<string, unknown>) => void
  toggleOff: (id: string) => void
  remove: (id: string) => void
  openItem: (itemId: string) => void
  hidden: Ref<boolean>
}
export const SIM_CANVAS: InjectionKey<SimCanvas> = Symbol('sim-canvas')
