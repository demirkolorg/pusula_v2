'use client';

import { Alert, AlertDescription } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { AddChecklistForm } from './checklist-add-forms';
import { ChecklistBlock } from './checklist-block';
import type { ChecklistHandlers, ChecklistView } from './checklist-types';

export type { ChecklistItemView, ChecklistView } from './checklist-types';

type CardDetailChecklistsProps = ChecklistHandlers & {
  checklists: ChecklistView[];
  /** Board `member+` and board/list/card active. */
  canEdit: boolean;
  pending?: boolean;
  error?: string | null;
};

/**
 * Card checklists section: a list of bordered {@link ChecklistBlock}s — each
 * with a `done/total` progress line, its items (native checkbox + content,
 * inline edit/delete), and an "add item" form; board `member+` can also add a
 * checklist, rename it, or delete it (confirmed). Reorder is out of scope this
 * phase (no drag-and-drop — Phase 3). Presentational — the dialog wires the
 * mutations; one shared `pending`/`error` covers all checklist mutations.
 */
export function CardDetailChecklists({
  checklists,
  canEdit,
  pending = false,
  error,
  ...handlers
}: CardDetailChecklistsProps) {
  const copy = strings.card.checklist;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-muted-foreground text-sm font-medium">{copy.title}</h3>
        {canEdit && <AddChecklistForm onSubmit={handlers.onCreateChecklist} pending={pending} />}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {checklists.length === 0 ? (
        <p className="text-muted-foreground text-sm">{copy.empty}</p>
      ) : (
        <div className="space-y-3">
          {checklists.map((checklist) => (
            <ChecklistBlock
              key={checklist.id}
              checklist={checklist}
              canEdit={canEdit}
              pending={pending}
              handlers={handlers}
            />
          ))}
        </div>
      )}
    </section>
  );
}
