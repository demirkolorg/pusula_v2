'use client';

import { useEffect, useId, useState } from 'react';
import { LABEL_COLORS, type LabelColor } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  cn,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { LABEL_SWATCH } from '../label-colors';

export type BoardLabelRowLabel = { id: string; name: string; color: string };

type BoardLabelRowProps = {
  label: BoardLabelRowLabel;
  /** Whether the viewer may edit/delete labels (board `member+`, board active). */
  canEdit: boolean;
  /** Any board-label mutation is in flight (possibly on another row) — race guard. */
  disabled?: boolean;
  /** A mutation for *this* row is in flight — shows the inline "…ediliyor…" text. */
  pending?: boolean;
  /** Inline error for this row's last mutation (CONFLICT — same colour+name …). */
  error?: string | null;
  /** Save a name/colour patch for this label. */
  onUpdate?: (patch: { color?: LabelColor; name?: string }) => void;
  /** Delete this label (it's removed from all cards too). */
  onDelete?: () => void;
};

/** Small round colour swatch for a label token. */
function Swatch({ color }: { color: string }) {
  const cls = LABEL_SWATCH[color as LabelColor] ?? 'bg-muted';
  return <span className={cn('inline-block size-4 shrink-0 rounded-full', cls)} aria-hidden />;
}

/**
 * Presentational board-label row: colour swatch + name, plus an inline edit
 * form (colour palette + name) and a confirmed delete, gated by `canEdit`. No
 * tRPC dependency — the section container wires the mutations and passes
 * `pending`/`error` per row.
 */
export function BoardLabelRow({
  label,
  canEdit,
  disabled = false,
  pending = false,
  error,
  onUpdate,
  onDelete,
}: BoardLabelRowProps) {
  const nameId = useId();
  const copy = strings.board.settings;
  const controlsDisabled = disabled || pending;

  const [editing, setEditing] = useState(false);
  const [editColor, setEditColor] = useState<LabelColor>((label.color as LabelColor) ?? LABEL_COLORS[0]);
  const [editName, setEditName] = useState(label.name);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    setEditColor((label.color as LabelColor) ?? LABEL_COLORS[0]);
    setEditName(label.name);
  }, [label.color, label.name]);

  const startEditing = () => {
    setEditColor((label.color as LabelColor) ?? LABEL_COLORS[0]);
    setEditName(label.name);
    setEditing(true);
  };

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = editName.trim();
    const patch: { color?: LabelColor; name?: string } = {};
    if (editColor !== label.color) patch.color = editColor;
    if (trimmedName !== label.name) patch.name = trimmedName;
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    onUpdate?.(patch);
    setEditing(false);
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Swatch color={label.color} />
          <span className="truncate text-sm">{label.name.trim() || copy.labelUnnamed}</span>
        </span>
        {canEdit && !editing && (
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={controlsDisabled} onClick={startEditing}>
              {pending ? copy.labelSaving : copy.labelEdit}
            </Button>
            <Dialog
              open={deleteOpen}
              onOpenChange={(next) => {
                if (controlsDisabled) return;
                setDeleteOpen(next);
              }}
            >
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={controlsDisabled}>
                  {pending ? copy.labelDeleting : copy.labelDelete}
                </Button>
              </DialogTrigger>
              <DialogContent closeLabel={strings.common.close}>
                <DialogHeader>
                  <DialogTitle>{copy.labelDeleteConfirmTitle}</DialogTitle>
                  <DialogDescription>{copy.labelDeleteConfirmDescription}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={controlsDisabled}>
                      {strings.common.cancel}
                    </Button>
                  </DialogClose>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={controlsDisabled}
                    onClick={() => {
                      onDelete?.();
                      setDeleteOpen(false);
                    }}
                  >
                    {copy.labelDeleteConfirm}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {editing && canEdit && (
        <form onSubmit={handleSave} className="space-y-2 border-t pt-2">
          <div>
            <span className="text-muted-foreground mb-1 block text-xs">{copy.labelColorLabel}</span>
            <div className="flex flex-wrap gap-1.5">
              {LABEL_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setEditColor(color)}
                  aria-label={`${copy.labelColorOf} ${color}`}
                  aria-pressed={editColor === color}
                  disabled={controlsDisabled}
                  className={cn(
                    'size-5 rounded-full ring-offset-1 outline-none disabled:opacity-50',
                    'focus-visible:ring-ring/60 focus-visible:ring-2',
                    LABEL_SWATCH[color],
                    editColor === color && 'ring-foreground ring-2',
                  )}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor={nameId} className="text-muted-foreground block text-xs">
              {copy.labelNameLabel}
            </label>
            <Input
              id={nameId}
              name="labelName"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              placeholder={copy.labelNamePlaceholder}
              disabled={controlsDisabled}
              autoComplete="off"
              maxLength={50}
              className="max-w-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={controlsDisabled}>
              {pending ? copy.labelSaving : copy.labelSave}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={controlsDisabled}
              onClick={() => setEditing(false)}
            >
              {strings.common.cancel}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
