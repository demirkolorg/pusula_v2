'use client';

import {
  ArchiveIcon,
  BookmarkIcon,
  BriefcaseIcon,
  CalendarIcon,
  CheckIcon,
  CircleIcon,
  ClockIcon,
  FlagIcon,
  InboxIcon,
  RocketIcon,
  StarIcon,
  TagIcon,
  TargetIcon,
  UserIcon,
  UsersIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react';
import { LIST_ICON_COLORS, LIST_ICONS, type ListIcon, type ListIconColor } from '@pusula/domain';

const LIST_ICON_SET = new Set<string>(LIST_ICONS);
const LIST_ICON_COLOR_SET = new Set<string>(LIST_ICON_COLORS);

export const LIST_ICON_COMPONENTS: Record<ListIcon, LucideIcon> = {
  circle: CircleIcon,
  check: CheckIcon,
  star: StarIcon,
  flag: FlagIcon,
  bookmark: BookmarkIcon,
  tag: TagIcon,
  clock: ClockIcon,
  calendar: CalendarIcon,
  user: UserIcon,
  users: UsersIcon,
  briefcase: BriefcaseIcon,
  zap: ZapIcon,
  target: TargetIcon,
  rocket: RocketIcon,
  inbox: InboxIcon,
  archive: ArchiveIcon,
};

export const LIST_ICON_FG: Record<ListIconColor, string> = {
  kirmizi: 'text-palet-kirmizi',
  turuncu: 'text-palet-turuncu',
  sari: 'text-palet-sari',
  lime: 'text-palet-lime',
  yesil: 'text-palet-yesil',
  sky: 'text-palet-sky',
  mavi: 'text-palet-mavi',
  indigo: 'text-palet-indigo',
  mor: 'text-palet-mor',
  pembe: 'text-palet-pembe',
  gri: 'text-palet-gri',
  siyah: 'text-palet-siyah',
};

export const LIST_ICON_SWATCH_BG: Record<ListIconColor, string> = {
  kirmizi: 'bg-palet-kirmizi',
  turuncu: 'bg-palet-turuncu',
  sari: 'bg-palet-sari',
  lime: 'bg-palet-lime',
  yesil: 'bg-palet-yesil',
  sky: 'bg-palet-sky',
  mavi: 'bg-palet-mavi',
  indigo: 'bg-palet-indigo',
  mor: 'bg-palet-mor',
  pembe: 'bg-palet-pembe',
  gri: 'bg-palet-gri',
  siyah: 'bg-palet-siyah',
};

export const LIST_ICON_CHECK_FG: Record<ListIconColor, string> = {
  kirmizi: 'text-palet-kirmizi-foreground',
  turuncu: 'text-palet-turuncu-foreground',
  sari: 'text-palet-sari-foreground',
  lime: 'text-palet-lime-foreground',
  yesil: 'text-palet-yesil-foreground',
  sky: 'text-palet-sky-foreground',
  mavi: 'text-palet-mavi-foreground',
  indigo: 'text-palet-indigo-foreground',
  mor: 'text-palet-mor-foreground',
  pembe: 'text-palet-pembe-foreground',
  gri: 'text-palet-gri-foreground',
  siyah: 'text-palet-siyah-foreground',
};

export function asListIcon(icon: string | null): ListIcon | null {
  return icon != null && LIST_ICON_SET.has(icon) ? (icon as ListIcon) : null;
}

export function asListIconColor(color: string | null): ListIconColor | null {
  return color != null && LIST_ICON_COLOR_SET.has(color) ? (color as ListIconColor) : null;
}
