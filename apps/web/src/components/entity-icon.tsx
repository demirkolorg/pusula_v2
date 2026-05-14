'use client';

import type { ComponentType, SVGProps } from 'react';
import {
  ArchiveIcon,
  BookmarkIcon,
  BriefcaseIcon,
  Building2Icon,
  CalendarIcon,
  ClockIcon,
  CompassIcon,
  FlagIcon,
  FolderIcon,
  InboxIcon,
  LayoutGridIcon,
  MapIcon,
  RocketIcon,
  StarIcon,
  TargetIcon,
  UsersIcon,
  ZapIcon,
} from 'lucide-react';
import { DEFAULT_BOARD_ICON, ENTITY_ICONS, type EntityIcon } from '@pusula/domain';
import { Button, cn } from '@pusula/ui';

type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

const ENTITY_ICON_COMPONENTS: Record<EntityIcon, LucideIcon> = {
  'layout-grid': LayoutGridIcon,
  briefcase: BriefcaseIcon,
  folder: FolderIcon,
  building: Building2Icon,
  users: UsersIcon,
  target: TargetIcon,
  rocket: RocketIcon,
  flag: FlagIcon,
  star: StarIcon,
  bookmark: BookmarkIcon,
  calendar: CalendarIcon,
  clock: ClockIcon,
  map: MapIcon,
  compass: CompassIcon,
  inbox: InboxIcon,
  zap: ZapIcon,
  archive: ArchiveIcon,
};

type EntityIconGlyphProps = {
  icon: EntityIcon | string;
  className?: string;
};

export function EntityIconGlyph({ icon, className }: EntityIconGlyphProps) {
  const normalizedIcon = ENTITY_ICONS.includes(icon as EntityIcon)
    ? (icon as EntityIcon)
    : DEFAULT_BOARD_ICON;
  const Icon = ENTITY_ICON_COMPONENTS[normalizedIcon];
  return (
    <Icon
      data-entity-icon={normalizedIcon}
      className={cn('size-4', className)}
      aria-hidden
    />
  );
}

type EntityIconBadgeProps = {
  icon: EntityIcon | string;
  className?: string;
  glyphClassName?: string;
};

export function EntityIconBadge({ icon, className, glyphClassName }: EntityIconBadgeProps) {
  return (
    <span
      className={cn(
        'bg-muted text-muted-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-md',
        className,
      )}
      aria-hidden
    >
      <EntityIconGlyph icon={icon} className={cn('size-3.5', glyphClassName)} />
    </span>
  );
}

type EntityIconPickerProps = {
  value: EntityIcon;
  onValueChange: (icon: EntityIcon) => void;
  labels: Record<EntityIcon, string>;
  disabled?: boolean;
  className?: string;
};

export function EntityIconPicker({
  value,
  onValueChange,
  labels,
  disabled = false,
  className,
}: EntityIconPickerProps) {
  return (
    <div className={cn('grid grid-cols-6 gap-2 sm:grid-cols-9', className)}>
      {ENTITY_ICONS.map((icon) => {
        const selected = icon === value;
        return (
          <Button
            key={icon}
            type="button"
            size="icon"
            variant={selected ? 'default' : 'outline'}
            aria-label={labels[icon]}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onValueChange(icon)}
            className={cn('size-9 shrink-0', selected && 'shadow-card')}
          >
            <EntityIconGlyph icon={icon} />
          </Button>
        );
      })}
    </div>
  );
}
