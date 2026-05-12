'use client';

import { useId, useState } from 'react';
import { LABEL_COLORS, type LabelColor } from '@pusula/domain';
import { Alert, AlertDescription, Button, Input, cn } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { LABEL_SWATCH } from '../label-colors';

export type BoardLabel = { id: string; name: string; color: string };
export type CardLabel = { labelId: string; name: string; color: string };

type CardDetailLabelsProps = {
  /** Labels currently on the card (joined with name/colour). */
  cardLabels: CardLabel[];
  /** All labels defined on the board (the picker source). */
  boardLabels: BoardLabel[];
  /** Whether the viewer may attach/detach/create labels (board `member+`, active). */
  canEdit: boolean;
  /** Attach an existing board label to the card. */
  onAdd: (labelId: string) => void;
  /** Detach a label from the card. */
  onRemove: (labelId: string) => void;
  /** Create a new board label (then it's available in the picker). */
  onCreate: (input: { color: LabelColor; name?: string }) => void;
  /** A mutation is in flight (any of add/remove/create). */
  pending?: boolean;
  /** Inline error for the section. */
  error?: string | null;
};

/** Small round colour swatch for a label token. */
function Swatch({ color }: { color: string }) {
  const cls = LABEL_SWATCH[color as LabelColor] ?? 'bg-muted';
  return <span className={cn('inline-block size-3 shrink-0 rounded-full', cls)} aria-hidden />;
}

/**
 * Card labels: shows the card's labels as colour chips; for board `member+`,
 * a "edit" toggle reveals the board label list (toggle attach/detach) plus a
 * "new label" mini-form (colour from the fixed palette + optional name). A
 * colour+name clash surfaces inline via `error`. Presentational — the dialog
 * wires the mutations.
 */
export function CardDetailLabels({
  cardLabels,
  boardLabels,
  canEdit,
  onAdd,
  onRemove,
  onCreate,
  pending = false,
  error,
}: CardDetailLabelsProps) {
  const nameId = useId();
  const copy = strings.card.labels;

  const [editing, setEditing] = useState(false);
  const [newColor, setNewColor] = useState<LabelColor>(LABEL_COLORS[0]);
  const [newName, setNewName] = useState('');

  const cardLabelIds = new Set(cardLabels.map((l) => l.labelId));

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = newName.trim();
    onCreate(trimmed ? { color: newColor, name: trimmed } : { color: newColor });
    setNewName('');
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-muted-foreground text-sm font-medium">{copy.title}</h3>
        {canEdit && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
            {copy.addAction}
          </Button>
        )}
      </div>

      {cardLabels.length === 0 ? (
        <p className="text-muted-foreground text-sm">{copy.empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {cardLabels.map((label) => (
            <li
              key={label.labelId}
              className="bg-muted flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs"
            >
              <Swatch color={label.color} />
              <span>{label.name.trim() || copy.unnamed}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onRemove(label.labelId)}
                  disabled={pending}
                  aria-label={`${copy.remove}: ${label.name.trim() || copy.unnamed}`}
                  className="text-muted-foreground hover:text-foreground ml-0.5 disabled:opacity-50"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {editing && canEdit && (
        <div className="space-y-3 rounded-md border p-3">
          {boardLabels.length === 0 ? null : (
            <ul className="space-y-1">
              {boardLabels.map((label) => {
                const on = cardLabelIds.has(label.id);
                return (
                  <li key={label.id} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm">
                      <Swatch color={label.color} />
                      {label.name.trim() || copy.unnamed}
                    </span>
                    <Button
                      type="button"
                      variant={on ? 'outline' : 'secondary'}
                      size="sm"
                      disabled={pending}
                      onClick={() => (on ? onRemove(label.id) : onAdd(label.id))}
                    >
                      {pending ? copy.working : on ? copy.remove : copy.add}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={handleCreate} className="space-y-2 border-t pt-3">
            <p className="text-muted-foreground text-xs font-medium">{copy.createTitle}</p>
            <div>
              <span className="text-muted-foreground mb-1 block text-xs">{copy.createColorLabel}</span>
              <div className="flex flex-wrap gap-1.5">
                {LABEL_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewColor(color)}
                    aria-label={`${copy.colorOf} ${color}`}
                    aria-pressed={newColor === color}
                    disabled={pending}
                    className={cn(
                      'size-5 rounded-full ring-offset-1 disabled:opacity-50',
                      LABEL_SWATCH[color],
                      newColor === color && 'ring-foreground ring-2',
                    )}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor={nameId} className="text-muted-foreground block text-xs">
                {copy.createNameLabel}
              </label>
              <Input
                id={nameId}
                name="labelName"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={copy.createNamePlaceholder}
                disabled={pending}
                autoComplete="off"
                maxLength={50}
                className="max-w-xs"
              />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? copy.creating : copy.createSubmit}
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}
