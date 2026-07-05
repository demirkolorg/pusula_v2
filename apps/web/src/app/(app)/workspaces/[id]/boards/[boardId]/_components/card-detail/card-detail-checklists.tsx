'use client';

import { useState } from 'react';
import { ArchiveIcon, CheckSquareIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { Alert, AlertDescription, EmptyState, Progress, SectionHeader } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { AddChecklistFormPanel, AddChecklistTrigger } from './checklist-add-forms';
import { ChecklistBlock } from './checklist-block';
import type {
  ChecklistCommentContext,
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
  /** Per-item comment-thread context — forwarded to each item row's toggle. */
  comments?: ChecklistCommentContext;
  pending?: boolean;
  error?: string | null;
};

/**
 * Card checklists section: a `SectionHeader` (overall `done/total` + mini
 * progress bar + "add checklist") above a list of bordered {@link ChecklistBlock}s
 * — each with its own `done/total` bar, items (`Checkbox` + content, inline
 * edit/delete, completer avatar), and an "add item" form. Board `member+` can
 * add / rename / delete (confirmed) checklists and reorder items within a
 * checklist via drag-and-drop (handled inside {@link ChecklistBlock}).
 * Presentational — the dialog wires the mutations; one shared `pending`/`error`
 * covers all checklist mutations.
 */
export function CardDetailChecklists({
  checklists,
  canEdit,
  nameOf,
  imageOf,
  comments,
  pending = false,
  error,
  ...handlers
}: CardDetailChecklistsProps) {
  const copy = strings.card.checklist;
  // Yeni checklist ekleme formu açık/kapalı durumu — parent'ta tutulur ki
  // `SectionHeader` action slotunun dar alanına sıkışmasın, gövdede tam
  // genişlikte render edilsin (UI tutarlılığı: `ChecklistBlock` shell'i).
  const [addingChecklist, setAddingChecklist] = useState(false);

  // Aktif ve arşivli checklist'leri ayır (invariant 23). Üst ilerleme ve normal
  // liste yalnız aktifleri kapsar; arşivliler en altta katlanabilir bölümde.
  const active = checklists.filter((c) => !c.archivedAt);
  const archived = checklists.filter((c) => c.archivedAt);

  const total = active.reduce((sum, c) => sum + c.items.length, 0);
  const done = active.reduce((sum, c) => sum + c.items.filter((i) => i.completed).length, 0);

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col">
      <SectionHeader
        icon={<CheckSquareIcon className="size-3.5" aria-hidden />}
        // Panel-card'ın sabit üst kabuğu (FE-2026-05-31-002, revize 2026-05-31)
        // — scroll'un dışında; bileşen flex-col, body kendi scroll wrapper'ı
        // içinde. `bg-muted/50 border-b` ile panel-card iç tonundan ayrılır.
        className="mb-0 shrink-0 border-b bg-muted/50 px-4 py-2.5"
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
            {canEdit && !addingChecklist && (
              <AddChecklistTrigger
                onClick={() => setAddingChecklist(true)}
                disabled={pending}
              />
            )}
          </>
        }
      >
        {copy.title}
      </SectionHeader>

      <div className="pusula-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {canEdit && addingChecklist && (
          <AddChecklistFormPanel
            onSubmit={handlers.onCreateChecklist}
            onClose={() => setAddingChecklist(false)}
            pending={pending}
          />
        )}

        {checklists.length === 0 ? (
          !addingChecklist && (
            <EmptyState icon={<CheckSquareIcon className="size-8" />} message={copy.empty} />
          )
        ) : (
          <div className="space-y-3">
            {active.map((checklist) => (
              <ChecklistBlock
                key={checklist.id}
                checklist={checklist}
                canEdit={canEdit}
                pending={pending}
                handlers={handlers}
                nameOf={nameOf}
                imageOf={imageOf}
                comments={comments}
              />
            ))}
            {archived.length > 0 && (
              <ArchivedChecklistsSection
                archived={archived}
                canEdit={canEdit}
                pending={pending}
                handlers={handlers}
                nameOf={nameOf}
                imageOf={imageOf}
                comments={comments}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Arşivlenmiş checklist'lerin en alttaki katlanabilir bölümü (invariant 23).
 * **Varsayılan kapalı** — çok sayıda liste birikince kart karmaşasını azaltmak
 * için. Açılınca her arşivli liste {@link ChecklistBlock}'ta `archived` bayrağıyla
 * salt-görünüm render edilir (maddeler değişmez; menüde yalnız "arşivden çıkar" /
 * "sil"). Yalnız `archived.length > 0` iken render edilir.
 */
function ArchivedChecklistsSection({
  archived,
  canEdit,
  pending,
  handlers,
  nameOf,
  imageOf,
  comments,
}: {
  archived: ChecklistView[];
  canEdit: boolean;
  pending: boolean;
  handlers: ChecklistHandlers;
  nameOf?: NameResolver;
  imageOf?: ImageResolver;
  comments?: ChecklistCommentContext;
}) {
  const copy = strings.card.checklist;
  const [open, setOpen] = useState(false);
  const bodyId = 'checklist-archive-body';

  return (
    <div className="rounded-md border border-dashed">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={copy.archivedSectionLabel}
        className="flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
      >
        {open ? (
          <ChevronDownIcon className="size-4 shrink-0" aria-hidden />
        ) : (
          <ChevronRightIcon className="size-4 shrink-0" aria-hidden />
        )}
        <ArchiveIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">{copy.archivedSectionTitle}</span>
        <span className="shrink-0 text-[11px] font-semibold tabular-nums">{archived.length}</span>
      </button>
      {open && (
        <div id={bodyId} className="space-y-3 p-3 pt-0">
          {archived.map((checklist) => (
            <ChecklistBlock
              key={checklist.id}
              checklist={checklist}
              archived
              canEdit={canEdit}
              pending={pending}
              handlers={handlers}
              nameOf={nameOf}
              imageOf={imageOf}
              comments={comments}
            />
          ))}
        </div>
      )}
    </div>
  );
}
