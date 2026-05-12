'use client';

import { useState } from 'react';
import { checklistItemContentSchema } from '@pusula/domain';
import { Button, Input } from '@pusula/ui';
import { strings } from '@/lib/strings';
import type { ChecklistItemView } from './checklist-types';

/**
 * One checklist item: native checkbox + content, with inline edit/delete for
 * board `member+`. Viewers see a disabled checkbox and no affordances.
 */
export function ChecklistItemRow({
  item,
  canEdit,
  pending,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ChecklistItemView;
  canEdit: boolean;
  pending: boolean;
  onToggle: (completed: boolean) => void;
  onEdit: (content: string) => void;
  onDelete: () => void;
}) {
  const copy = strings.card.checklist;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.content);
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={item.completed}
        disabled={!canEdit || pending}
        aria-label={copy.itemToggleLabel}
        onChange={(event) => onToggle(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 rounded border"
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
          <span className={item.completed ? 'flex-1 break-words line-through opacity-60' : 'flex-1 break-words'}>
            {item.content}
          </span>
          {canEdit && (
            <span className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setValue(item.content);
                  setEditing(true);
                }}
              >
                {copy.itemEdit}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={onDelete}
              >
                {pending ? copy.itemDeleting : copy.itemDelete}
              </Button>
            </span>
          )}
        </>
      )}
    </li>
  );
}
