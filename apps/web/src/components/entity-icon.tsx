'use client';

import type { ComponentType, SVGProps } from 'react';
import {
  ArchiveIcon,
  AwardIcon,
  BellIcon,
  BookOpenIcon,
  BookmarkIcon,
  BoxesIcon,
  BriefcaseIcon,
  Building2Icon,
  CalendarIcon,
  CameraIcon,
  ClipboardListIcon,
  ClockIcon,
  CodeIcon,
  CompassIcon,
  CrownIcon,
  DatabaseIcon,
  FactoryIcon,
  FlagIcon,
  FolderIcon,
  FolderOpenIcon,
  GemIcon,
  GlobeIcon,
  GraduationCapIcon,
  HeartIcon,
  HouseIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LayoutGridIcon,
  LayoutListIcon,
  LeafIcon,
  LightbulbIcon,
  MapIcon,
  MegaphoneIcon,
  MusicIcon,
  NetworkIcon,
  PackageIcon,
  PaletteIcon,
  PuzzleIcon,
  RocketIcon,
  ServerIcon,
  ShieldIcon,
  ShoppingCartIcon,
  SparklesIcon,
  StarIcon,
  StoreIcon,
  SunIcon,
  TargetIcon,
  TerminalIcon,
  TrendingUpIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
  ZapIcon,
} from 'lucide-react';
import { DEFAULT_BOARD_ICON, ENTITY_ICONS, type EntityIcon } from '@pusula/domain';
import { Button, cn } from '@pusula/ui';

type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

const ENTITY_ICON_COMPONENTS: Record<EntityIcon, LucideIcon> = {
  'layout-grid': LayoutGridIcon,
  'layout-dashboard': LayoutDashboardIcon,
  'layout-list': LayoutListIcon,
  briefcase: BriefcaseIcon,
  folder: FolderIcon,
  'folder-open': FolderOpenIcon,
  building: Building2Icon,
  factory: FactoryIcon,
  store: StoreIcon,
  home: HouseIcon,
  archive: ArchiveIcon,
  inbox: InboxIcon,
  package: PackageIcon,
  boxes: BoxesIcon,
  users: UsersIcon,
  user: UserIcon,
  network: NetworkIcon,
  target: TargetIcon,
  rocket: RocketIcon,
  flag: FlagIcon,
  trophy: TrophyIcon,
  award: AwardIcon,
  crown: CrownIcon,
  gem: GemIcon,
  zap: ZapIcon,
  'trending-up': TrendingUpIcon,
  star: StarIcon,
  bookmark: BookmarkIcon,
  heart: HeartIcon,
  sparkles: SparklesIcon,
  lightbulb: LightbulbIcon,
  calendar: CalendarIcon,
  clock: ClockIcon,
  map: MapIcon,
  compass: CompassIcon,
  globe: GlobeIcon,
  'book-open': BookOpenIcon,
  'clipboard-list': ClipboardListIcon,
  'graduation-cap': GraduationCapIcon,
  puzzle: PuzzleIcon,
  code: CodeIcon,
  terminal: TerminalIcon,
  database: DatabaseIcon,
  server: ServerIcon,
  palette: PaletteIcon,
  camera: CameraIcon,
  music: MusicIcon,
  leaf: LeafIcon,
  sun: SunIcon,
  shield: ShieldIcon,
  bell: BellIcon,
  megaphone: MegaphoneIcon,
  'shopping-cart': ShoppingCartIcon,
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
  return <Icon data-entity-icon={normalizedIcon} className={cn('size-4', className)} aria-hidden />;
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
    <div
      className={cn(
        'grid max-h-64 grid-cols-6 gap-2 overflow-y-auto p-0.5 sm:grid-cols-9',
        className,
      )}
    >
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
