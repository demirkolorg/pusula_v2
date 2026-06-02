'use client';

import { useState } from 'react';
import { PencilIcon, Trash2Icon } from 'lucide-react';
import { checklistItemContentSchema } from '@pusula/domain';
import {
  Avatar,
  Button,
  Checkbox,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import type { ChecklistItemView, ImageResolver, NameResolver } from './checklist-types';

/**
 * One checklist item: a `Checkbox` + content, with inline edit/delete for board
 * `member+`. A completed item shows the completer's avatar (resolved via
 * `nameOf`, when known). Viewers see a disabled checkbox and no affordances.
 */
export function ChecklistItemRow({
  item,
  canEdit,
  pending,
  nameOf,
  imageOf,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ChecklistItemView;
  canEdit: boolean;
  pending: boolean;
  nameOf?: NameResolver;
  imageOf?: ImageResolver;
  onToggle: (completed: boolean) => void;
  onEdit: (content: string) => void;
  onDelete: () => void;
}) {
  const copy = strings.card.checklist;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.content);
  const [error, setError] = useState<string | null>(null);

  const completerName =
    item.completed && item.completedBy
      ? nameOf?.(item.completedBy)?.toString().trim() || null
      : null;
  const completerImage =
    item.completed && item.completedBy ? (imageOf?.(item.completedBy) ?? null) : null;

  return (
    <li className="group/item flex items-start gap-2 text-sm">
      <Checkbox
        checked={item.completed}
        disabled={!canEdit || pending}
        aria-label={copy.itemToggleLabel}
        onCheckedChange={(checked) => onToggle(checked === true)}
        className="mt-0.5 shrink-0"
      />
      {editing && canEdit ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = checklistItemContentSchema.safeParse(value);
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? strings.common.unknownError);
              return;
            }
            setError(null);
            if (parsed.data !== item.content) onEdit(parsed.data);
            setEditing(false);
          }}
          noValidate
          className="flex-1 space-y-2"
        >
          <Input
            name="itemContent"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label={copy.itemEdit}
            disabled={pending}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
          />
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? copy.itemSaving : copy.itemSave}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setValue(item.content);
                setError(null);
                setEditing(false);
              }}
            >
              {copy.itemCancel}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <span
            className={
              item.completed
                ? 'min-w-0 flex-1 break-words italic text-muted-foreground/70'
                : 'min-w-0 flex-1 break-words'
            }
          >
            {item.content}
          </span>
          {completerName && (
            <Avatar
              name={completerName}
              image={completerImage}
              size="xs"
              className="shrink-0"
            />
          )}
          {canEdit && (
            <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100 touch:opacity-100">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={copy.itemEdit}
                    disabled={pending}
                    // DEM-248 — dokunmatikte ≥44px dokunma hedefi.
                    className="size-7 touch:size-11"
                    onClick={() => {
                      setValue(item.content);
                      setEditing(true);
                    }}
                  >
                    <PencilIcon className="size-3.5" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copy.itemEdit}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={copy.itemDelete}
                    disabled={pending}
                    // DEM-248 — dokunmatikte ≥44px dokunma hedefi.
                    className="text-muted-foreground hover:text-destructive size-7 touch:size-11"
                    onClick={onDelete}
                  >
                    <Trash2Icon className="size-3.5" aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copy.itemDelete}</TooltipContent>
              </Tooltip>
            </span>
          )}
        </>
      )}
    </li>
  );
}
