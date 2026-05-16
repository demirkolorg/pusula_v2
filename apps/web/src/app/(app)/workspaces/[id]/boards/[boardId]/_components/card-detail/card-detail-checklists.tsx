'use client';

import { CheckSquareIcon } from 'lucide-react';
import { Alert, AlertDescription, EmptyState, Progress, SectionHeader } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { AddChecklistForm } from './checklist-add-forms';
import { ChecklistBlock } from './checklist-block';
import type {
  ChecklistHandlers,
  ChecklistView,
  ImageResolver,
  NameResolver,
} from './checklist-types';

export type { ChecklistItemView, ChecklistView } from './checklist-types';

type CardDetailChecklistsProps = ChecklistHandlers & {
  checklists: ChecklistView[];
  /** Board `member+` and board/list/card active. */
  canEdit: boolean;
  /** Resolve a user id to a display name (for the "completed by" avatars). */
  nameOf?: NameResolver;
  /** Resolve a user id to an avatar URL (for the "completed by" avatars). */
  imageOf?: ImageResolver;
  pending?: boolean;
  error?: string | null;
};

/**
 * Card checklists section: a `SectionHeader` (overall `done/total` + mini
 * progress bar + "add checklist") above a list of bordered {@link ChecklistBlock}s
 * — each with its own `done/total` bar, items (`Checkbox` + content, inline
 * edit/delete, completer avatar), and an "add item" form. Board `member+` can
 * add / rename / delete (confirmed) checklists. Reorder is out of scope this
 * phase (no drag-and-drop — Phase 3). Presentational — the dialog wires the
 * mutations; one shared `pending`/`error` covers all checklist mutations.
 */
export function CardDetailChecklists({
  checklists,
  canEdit,
  nameOf,
  imageOf,
  pending = false,
  error,
  ...handlers
}: CardDetailChecklistsProps) {
  const copy = strings.card.checklist;

  const total = checklists.reduce((sum, c) => sum + c.items.length, 0);
  const done = checklists.reduce((sum, c) => sum + c.items.filter((i) => i.completed).length, 0);

  return (
    <section className="space-y-3">
      <SectionHeader
        icon={<CheckSquareIcon className="size-3.5" aria-hidden />}
        action={
          <>
            {total > 0 && (
              <span className="flex items-center gap-1.5">
                <Progress
                  value={done}
                  max={total}
                  complete={done === total}
                  className="h-1 w-20"
                  aria-label={copy.overallProgressLabel}
                />
                <span className="text-primary text-[11px] font-semibold tabular-nums">
                  {done}/{total}
                </span>
              </span>
            )}
            {canEdit && (
              <AddChecklistForm onSubmit={handlers.onCreateChecklist} pending={pending} />
            )}
          </>
        }
      >
        {copy.title}
      </SectionHeader>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {checklists.length === 0 ? (
        <EmptyState icon={<CheckSquareIcon className="size-8" />} message={copy.empty} />
      ) : (
        <div className="space-y-3">
          {checklists.map((checklist) => (
            <ChecklistBlock
              key={checklist.id}
              checklist={checklist}
              canEdit={canEdit}
              pending={pending}
              handlers={handlers}
              nameOf={nameOf}
              imageOf={imageOf}
            />
          ))}
        </div>
      )}
    </section>
  );
}
