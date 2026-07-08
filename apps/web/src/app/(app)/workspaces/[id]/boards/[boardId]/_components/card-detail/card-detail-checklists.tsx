'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArchiveIcon, CheckSquareIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { buildChecklistTree, type ChecklistTreeNode } from '@pusula/domain';
import { Alert, AlertDescription, EmptyState, Progress, SectionHeader } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { AddChecklistFormPanel, AddChecklistTrigger } from './checklist-add-forms';
import { ChecklistBlock } from './checklist-block';
import { ChecklistBulkImportDialog } from './checklist-bulk-import-dialog';
import { ChecklistItemDetail } from './checklist-item-detail';
import type {
  ChecklistAttachmentContext,
  ChecklistCommentContext,
  ChecklistHandlers,
  ChecklistItemDetailTab,
  ChecklistItemView,
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
  /** Per-item comment-thread context — forwarded down to the detail panel. */
  comments?: ChecklistCommentContext;
  /** Per-item attachment context — forwarded down to the detail panel. */
  attachments?: ChecklistAttachmentContext;
  pending?: boolean;
  error?: string | null;
  bulkImportPending?: boolean;
  bulkImportError?: string | null;
  /**
   * Bir madde detay panelinde açık mı — dialog bu sinyalle açıklama panelini
   * gizleyip kontrol listesini tam genişliğe yayar ("odaklanınca genişlet").
   */
  onFocusedChange?: (focused: boolean) => void;
};

/** Recursively locate a tree node by id (selected item lives at any depth). */
function findNode(
  nodes: Array<ChecklistTreeNode<ChecklistItemView>>,
  id: string,
): ChecklistTreeNode<ChecklistItemView> | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * Card checklists section — **detay paneli** düzeni. Header (overall progress +
 * "add checklist") üstte sabit; gövde bir madde seçilene kadar tek kolon gruplu
 * liste kartları gösterir. Bir madde seçilince gövde iki kolona ayrılır: solda
 * gruplu liste (seçili satır vurgulu), sağda {@link ChecklistItemDetail} —
 * seçili maddenin alt maddeleri / ekleri / yorumları sekmelere ayrılmış olarak.
 * Bu "üst üste yığılma" olmadan derinlemesine içerik sağlar; `onFocusedChange`
 * ile dialog açıklamayı gizleyip paneli tam genişliğe yayar.
 *
 * Presentational — the dialog wires the mutations; one shared `pending`/`error`
 * covers all checklist mutations.
 */
export function CardDetailChecklists({
  checklists,
  canEdit,
  nameOf,
  imageOf,
  comments,
  attachments,
  pending = false,
  error,
  bulkImportPending = false,
  bulkImportError,
  onFocusedChange,
  ...handlers
}: CardDetailChecklistsProps) {
  const copy = strings.card.checklist;
  const [addingChecklist, setAddingChecklist] = useState(false);
  // Detay panelinde açık madde + aktif sekme. Kart kapanınca (unmount) sıfırlanır.
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<ChecklistItemDetailTab>('subItems');

  // Aktif ve arşivli checklist'leri ayır (invariant 23). Üst ilerleme ve normal
  // liste yalnız aktifleri kapsar; arşivliler en altta katlanabilir bölümde.
  const active = useMemo(() => checklists.filter((c) => !c.archivedAt), [checklists]);
  const archived = useMemo(() => checklists.filter((c) => c.archivedAt), [checklists]);

  const total = active.reduce((sum, c) => sum + c.items.length, 0);
  const done = active.reduce((sum, c) => sum + c.items.filter((i) => i.completed).length, 0);

  // Seçili maddeyi tüm listelerin (aktif + arşivli) ağacında çöz — arşivli
  // maddeler detay panelinde salt-görünüm olarak okunabilir; hiç bulunmazsa
  // (silinmiş) `null` döner ve aşağıdaki effect seçimi temizler.
  const selected = useMemo(() => {
    if (!selectedItemId) return null;
    for (const checklist of checklists) {
      const node = findNode(buildChecklistTree(checklist.items), selectedItemId);
      if (node) return { checklist, node };
    }
    return null;
  }, [checklists, selectedItemId]);

  // Arşivli listede detay salt-görünümdür: yükleme / yorum yazma / alt madde
  // ekleme kapalı (invariant 23). Aktif listede board yetkisine (`canEdit`) düşer.
  const detailEditable = selected != null && canEdit && !selected.checklist.archivedAt;
  const focused = selected != null;

  // Seçili madde artık yoksa (silme) seçimi bırak.
  useEffect(() => {
    if (selectedItemId && !selected) setSelectedItemId(null);
  }, [selectedItemId, selected]);

  // Dialog'a odak durumunu bildir (açıklamayı gizle + tam genişlik). Boolean
  // bağımlılık gereksiz tetiklemeyi keser; unmount'ta açıklamayı geri getirir.
  useEffect(() => {
    onFocusedChange?.(focused);
    return () => onFocusedChange?.(false);
  }, [focused, onFocusedChange]);

  const handleSelectItem = useCallback((itemId: string, tab?: ChecklistItemDetailTab) => {
    setSelectedItemId(itemId);
    // Metne tıklama (tab yok) alt maddeler sekmesine döner; sayaç rozetleri
    // doğrudan ilgili sekmeye (yorumlar / ekler) deep-link atar.
    setSelectedTab(tab ?? 'subItems');
  }, []);

  const handleBack = useCallback(() => setSelectedItemId(null), []);

  const listColumn = (
    <>
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
              attachments={attachments}
              selectedItemId={selectedItemId}
              onSelectItem={handleSelectItem}
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
              attachments={attachments}
              selectedItemId={selectedItemId}
              onSelectItem={handleSelectItem}
            />
          )}
        </div>
      )}
    </>
  );

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col">
      <SectionHeader
        icon={<CheckSquareIcon className="size-3.5" aria-hidden />}
        className="mb-0 shrink-0 border-b bg-muted/50 px-4 py-2.5"
        action={
          <div className="flex items-center gap-2">
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
            {canEdit && handlers.onBulkImport && (
              <ChecklistBulkImportDialog
                onImport={handlers.onBulkImport}
                pending={bulkImportPending}
                error={bulkImportError}
                disabled={pending}
              />
            )}
            {canEdit && !addingChecklist && (
              <AddChecklistTrigger onClick={() => setAddingChecklist(true)} disabled={pending} />
            )}
          </div>
        }
      >
        {copy.title}
      </SectionHeader>

      {selected ? (
        // İki eşit kolon: sol gruplu liste (seçili satır vurgulu) + sağ detay.
        // Dialog bu paneli 2/3 genişliğe yaydığından iki kolon her biri ~1/3
        // olur → açıklama (1/3) ile birlikte 3 eşit sütun.
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden">
          <div className="pusula-scrollbar min-h-0 space-y-3 overflow-y-auto border-r p-4 pr-3">
            {listColumn}
          </div>
          <div className="flex min-h-0 flex-col overflow-hidden p-4 pl-4">
            <ChecklistItemDetail
              node={selected.node}
              checklistId={selected.checklist.id}
              checklistTitle={selected.checklist.title}
              tab={selectedTab}
              onTabChange={setSelectedTab}
              onBack={handleBack}
              canEdit={detailEditable}
              pending={pending}
              handlers={handlers}
              nameOf={nameOf}
              imageOf={imageOf}
              comments={comments}
              attachments={attachments}
              onSelectSubItem={(itemId) => handleSelectItem(itemId)}
            />
          </div>
        </div>
      ) : (
        <div className="pusula-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {listColumn}
        </div>
      )}
    </section>
  );
}

/**
 * Arşivlenmiş checklist'lerin en alttaki katlanabilir bölümü (invariant 23).
 * **Varsayılan kapalı**. Açılınca her arşivli liste {@link ChecklistBlock}'ta
 * `archived` bayrağıyla salt-görünüm render edilir. Yalnız `archived.length > 0`
 * iken render edilir. Maddeleri yine seçilebilir (detay paneli okuma amaçlı açar).
 */
function ArchivedChecklistsSection({
  archived,
  canEdit,
  pending,
  handlers,
  nameOf,
  imageOf,
  comments,
  attachments,
  selectedItemId,
  onSelectItem,
}: {
  archived: ChecklistView[];
  canEdit: boolean;
  pending: boolean;
  handlers: ChecklistHandlers;
  nameOf?: NameResolver;
  imageOf?: ImageResolver;
  comments?: ChecklistCommentContext;
  attachments?: ChecklistAttachmentContext;
  selectedItemId: string | null;
  onSelectItem: (itemId: string, tab?: ChecklistItemDetailTab) => void;
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
              attachments={attachments}
              selectedItemId={selectedItemId}
              onSelectItem={onSelectItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}
