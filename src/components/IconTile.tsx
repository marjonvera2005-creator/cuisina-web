import type { Icon } from '@phosphor-icons/react'
import {
  Baby, Briefcase, Cake, CalendarCheck, CheckCircle, ClockCounterClockwise, Confetti, Cross, Flag, Flower, ForkKnife,
  GraduationCap, Heart, MagnifyingGlass, Package, PlusCircle, Star, Storefront, Tag, Tray, UsersThree,
} from '@phosphor-icons/react'

/**
 * Cuisina's icon rules (website and app):
 *   sizes    14 (inside small text), 16 (buttons), 20 (navigation, tiles), 26 (stat cards, empty pages)
 *   regular  normal items      fill  the selected or active item
 *   duotone  inside a colored tile      bold  arrows and small button icons
 *   tones    gold = bookings and money, green = done, red = problems, blue = changes, gray = neutral
 */
export type IconTone = 'gold' | 'green' | 'red' | 'blue' | 'gray'

/** A two-tone icon on a soft rounded tile. Decoration only: the text next to it says what it means. */
export function IconTile({ icon: Glyph, tone = 'gold', size = 'md' }: { icon: Icon; tone?: IconTone; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`icon-tile ${tone} ${size}`} aria-hidden="true"><Glyph size={size === 'lg' ? 26 : 20} weight="duotone" /></span>
}

/** Each event type has its own icon and color (same list as the app's eventStyle). */
export function eventIcon(name: string): { icon: Icon; tone: IconTone } {
  const text = name.toLowerCase()
  if (/wedding|kasal|anniversary|engagement/.test(text)) return { icon: Heart, tone: 'red' }
  if (/birthday|debut/.test(text)) return { icon: Cake, tone: 'gold' }
  if (/corporate|company|business|seminar|meeting/.test(text)) return { icon: Briefcase, tone: 'blue' }
  if (/baptism|christening|binyag|baby|gender/.test(text)) return { icon: Baby, tone: 'blue' }
  if (/graduation|school/.test(text)) return { icon: GraduationCap, tone: 'green' }
  if (/funeral|memorial|burial/.test(text)) return { icon: Flower, tone: 'gray' }
  if (/fiesta|party|reunion|celebration/.test(text)) return { icon: Confetti, tone: 'gold' }
  if (/church|communion|thanksgiving/.test(text)) return { icon: Cross, tone: 'green' }
  return { icon: ForkKnife, tone: 'green' }
}

/** The icon of an empty page, picked from its title. */
export function emptyIcon(title: string): { icon: Icon; tone: IconTone } {
  const text = title.toLowerCase()
  if (/match|found/.test(text)) return { icon: MagnifyingGlass, tone: 'gray' }
  if (/caught up|unread|clear|waiting/.test(text)) return { icon: CheckCircle, tone: 'green' }
  if (/review/.test(text)) return { icon: Star, tone: 'gold' }
  if (/add-on/.test(text)) return { icon: PlusCircle, tone: 'gold' }
  if (/package/.test(text)) return { icon: Package, tone: 'gold' }
  if (/report|complaint/.test(text)) return { icon: Flag, tone: 'red' }
  if (/categor/.test(text)) return { icon: Tag, tone: 'gold' }
  if (/activity/.test(text)) return { icon: ClockCounterClockwise, tone: 'gray' }
  if (/customer/.test(text)) return { icon: UsersThree, tone: 'green' }
  if (/caterer|business|application/.test(text)) return { icon: Storefront, tone: 'gold' }
  if (/booking|event|request/.test(text)) return { icon: CalendarCheck, tone: 'gold' }
  return { icon: Tray, tone: 'gray' }
}
