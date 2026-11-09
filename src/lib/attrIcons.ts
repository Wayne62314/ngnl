import { Brain, Briefcase, Dumbbell, HeartHandshake, Leaf, Palette } from 'lucide-vue-next'
import type { Attr } from './types'

/** One icon per attribute, used everywhere an attribute appears. */
export const ATTR_ICON: Record<Attr, typeof Brain> = {
  mind: Brain,
  body: Dumbbell,
  craft: Palette,
  social: HeartHandshake,
  career: Briefcase,
  spirit: Leaf,
}
