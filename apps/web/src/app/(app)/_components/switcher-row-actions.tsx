'use client';

import type { ReactNode } from 'react';
import { Settings2Icon, UsersIcon } from 'lucide-react';
import {
  DropdownMenuItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@pusula/ui';

type SwitcherRowActionsProps = {
  settingsLabel: string;
  membersLabel: string;
  onSettings: () => void;
  onMembers: () => void;
};

/**
 * Hover/focus-revealed "Ayarlar" + "Üyeler" action items for a single
 * workspace/board row inside a switcher dropdown. Rendered as an
 * absolutely-positioned overlay on the row's right edge so it never disturbs
 * the row's own select target.
 *
 * The two actions are real {@link DropdownMenuItem}s, so they stay in the
 * dropdown's roving keyboard navigation: arrowing onto one focuses it, which
 * trips `group-focus-within/row` and reveals the overlay. For mouse users the
 * overlay reveals on `group-hover/row`. `DropdownMenuItem.onSelect` closes the
 * menu itself, so callers only need to navigate / open their dialog.
 *
 * Must be rendered inside a `DropdownMenuContent`, and the parent row element
 * must carry the `group/row relative` classes.
 */
export function SwitcherRowActions({
  settingsLabel,
  membersLabel,
  onSettings,
  onMembers,
}: SwitcherRowActionsProps) {
  return (
    <div
      className={cn(
        'bg-popover absolute inset-y-1 right-1 flex items-center gap-0.5 rounded-md pl-1',
        // Hidden + click-through until the row is hovered or an action is
        // keyboard-focused; opacity-0 elements still take keyboard focus, so
        // arrowing onto an action reveals it via `group-focus-within`.
        'pointer-events-none opacity-0 transition-opacity',
        'group-hover/row:pointer-events-auto group-hover/row:opacity-100',
        'group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100',
      )}
    >
      <ActionItem label={settingsLabel} onSelect={onSettings}>
        <Settings2Icon className="size-3.5" aria-hidden />
      </ActionItem>
      <ActionItem label={membersLabel} onSelect={onMembers}>
        <UsersIcon className="size-3.5" aria-hidden />
      </ActionItem>
    </div>
  );
}

function ActionItem({
  label,
  onSelect,
  children,
}: {
  label: string;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuItem
          aria-label={label}
          onSelect={onSelect}
          className="text-muted-foreground focus:text-foreground size-7 justify-center p-0"
        >
          {children}
        </DropdownMenuItem>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
