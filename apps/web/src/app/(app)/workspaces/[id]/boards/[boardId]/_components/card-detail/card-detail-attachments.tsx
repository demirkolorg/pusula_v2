'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AttachmentGalleryCard,
  AttachmentPreviewDialog,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  toast,
  type AttachmentPreviewKind,
} from '@pusula/ui';
import { PaperclipIcon } from 'lucide-react';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

const cmid = () => crypto.randomUUID();

/** A committed attachment row, as returned by `attachment.list`. */
export type AttachmentView = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'pdf' | 'office' | null;
  description: string | null;
  uploader: { id: string; name: string | null; image: string | null };
  createdAt: Date;
  committedAt: Date | null;
  isCover: boolean;
  /** Presigned GET URL for image rows (gallery thumbnail); `null` otherwise. */
  thumbnailUrl: string | null;
};

type CardDetailAttachmentsProps = {
  cardId: string;
  /** Board `member+` and board active — may set cover / delete own. */
  canEdit: boolean;
  /** Board `admin` — may delete any attachment + set cover. */
  isBoardAdmin: boolean;
  /** The viewer's own user id — gates per-attachment delete. */
  viewerUserId: string;
  /**
   * Checklist maddesine ait ekleri göster. Verilirse liste `{ cardId,
   * checklistItemId }`'e daralır (backend madde eklerini döner), silme
   * `onSettled`'da `checklist.list` de (rozet sayacı) invalidate edilir ve
   * kapak yapma otomatik kapanır (madde eki kart kapağı olamaz).
   */
  checklistItemId?: string;
  /**
   * "Kapak yap" eylemini gizle (madde eki bağlamı gibi). `checklistItemId` set
   * ise zaten kapak devre dışıdır; bu bayrak niyet belirtmek için ayrıca da
   * geçilebilir.
   */
  hideCover?: boolean;
};

/**
 * Card modal "Ekler" gallery — the read-first attachment browser (2026-07-05;
 * previously the right-panel "Ekler" tab, Faz 11D / DEM-150).
 *
 * A responsive grid of {@link AttachmentGalleryCard}s (image thumbnails +
 * tinted file-type icons). Preview/download fetch a presigned URL lazily;
 * cover-toggle + delete are wired here (delete is optimistic with rollback).
 * **Uploading lives elsewhere** — the card header "+ Ekle → Ek" popover
 * (`CardAttachmentAddForm`); this gallery does not embed a dropzone.
 *
 * Spec: `docs/architecture/13-ui-tasarim-dili.md` §13.10.9,
 * `docs/architecture/08-web-ve-mobil.md` §8.1.14.
 */
export function CardDetailAttachments({
  cardId,
  canEdit,
  isBoardAdmin,
  viewerUserId,
  checklistItemId,
  hideCover = false,
}: CardDetailAttachmentsProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const copy = strings.attachment;

  // Madde eki bağlamında liste `{ cardId, checklistItemId }`'e daralır; aksi
  // halde kart eklerini (backend `checklist_item_id IS NULL`) döner.
  const listInput = useMemo(
    () => (checklistItemId ? { cardId, checklistItemId } : { cardId }),
    [cardId, checklistItemId],
  );
  const listFilter = useMemo(
    () => trpc.attachment.list.queryFilter(listInput),
    [trpc, listInput],
  );
  const listQuery = useQuery(trpc.attachment.list.queryOptions(listInput));
  const attachments = (listQuery.data ?? []) as AttachmentView[];

  // Madde eki kart kapağı OLAMAZ — `checklistItemId` ya da `hideCover` set ise
  // "kapak yap" hiç gösterilmez (kart galerisiyle simetri korunur, davranış değil).
  const coverDisabled = hideCover || checklistItemId != null;

  /**
   * Bump the board card's `attachmentCount` meta chip by `delta`. The
   * `attachment.removed` realtime handler does this too, but the deleter's own
   * event is filtered out by `clientMutationId`, so without this optimistic
   * patch the paperclip counter would lag until `board.get` refetches. Matches
   * any cached `board.get` (no `boardId` to hand).
   */
  const bumpBoardAttachmentCount = useCallback(
    (delta: number) => {
      queryClient.setQueriesData<{ cards?: Array<Record<string, unknown>> }>(
        trpc.board.get.queryFilter(),
        (data) => {
          if (!data?.cards) return data;
          let changed = false;
          const cards = data.cards.map((card) => {
            if (card.id !== cardId) return card;
            const current = typeof card.attachmentCount === 'number' ? card.attachmentCount : 0;
            const next = Math.max(0, current + delta);
            if (next === current) return card;
            changed = true;
            return { ...card, attachmentCount: next };
          });
          return changed ? { ...data, cards } : data;
        },
      );
    },
    [queryClient, trpc, cardId],
  );

  // --- Delete (optimistic) -------------------------------------------------
  const remove = useMutation(
    trpc.attachment.delete.mutationOptions({
      onMutate: async (vars: { attachmentId: string }) => {
        await queryClient.cancelQueries(listFilter);
        const snapshot = queryClient.getQueryData<AttachmentView[]>(listFilter.queryKey);
        queryClient.setQueryData<AttachmentView[]>(listFilter.queryKey, (prev) =>
          prev?.filter((row) => row.id !== vars.attachmentId),
        );
        // Symmetric to the upload bump — keep the meta chip honest while our
        // own `attachment.removed` echo is filtered out.
        bumpBoardAttachmentCount(-1);
        return { snapshot };
      },
      onError: (_error, _vars, context) => {
        const ctx = context as { snapshot?: AttachmentView[] } | undefined;
        if (ctx?.snapshot) queryClient.setQueryData(listFilter.queryKey, ctx.snapshot);
        bumpBoardAttachmentCount(1);
        toast.error(copy.error.deleteFailed);
      },
      onSettled: () => {
        void queryClient.invalidateQueries(listFilter);
        // Madde eki: silme sonrası o maddenin `attachmentCount` rozeti (checklist.list
        // türevi) tazelensin — yükleme akışıyla simetrik.
        if (checklistItemId) {
          void queryClient.invalidateQueries(trpc.checklist.list.queryFilter({ cardId }));
        }
      },
    }),
  );

  const setCover = useMutation(
    trpc.card.update.mutationOptions({
      onSettled: () => {
        void queryClient.invalidateQueries(listFilter);
        void queryClient.invalidateQueries(trpc.card.get.queryFilter({ cardId }));
        void queryClient.invalidateQueries(trpc.board.get.queryFilter());
      },
    }),
  );

  // --- Delete confirmation + preview state --------------------------------
  const [confirmDelete, setConfirmDelete] = useState<AttachmentView | null>(null);
  const [preview, setPreview] = useState<{ row: AttachmentView; kind: AttachmentPreviewKind } | null>(
    null,
  );
  const previewUrlFilter = useMemo(
    () => trpc.attachment.getDownloadUrl.queryFilter({ attachmentId: preview?.row.id ?? '' }),
    [trpc, preview?.row.id],
  );
  const previewUrlQuery = useQuery({
    ...trpc.attachment.getDownloadUrl.queryOptions({ attachmentId: preview?.row.id ?? '' }),
    enabled: preview != null,
    // Presigned URLs expire (~10 min TTL); never serve a stale one from cache.
    staleTime: 0,
    gcTime: 0,
  });
  const downloadingRef = useRef(false);

  /** Close the preview + drop its presigned URL so a re-open refetches fresh. */
  const closePreview = useCallback(() => {
    void queryClient.removeQueries(previewUrlFilter);
    setPreview(null);
  }, [queryClient, previewUrlFilter]);

  // --- Preview navigation: önizlenebilir ekler (görsel + PDF) arası gezinme --
  const previewable = useMemo(
    () => attachments.filter((row) => row.kind === 'image' || row.kind === 'pdf'),
    [attachments],
  );
  const previewIndex = preview ? previewable.findIndex((row) => row.id === preview.row.id) : -1;
  const openPreview = useCallback(
    (row: AttachmentView) => setPreview({ row, kind: row.kind === 'pdf' ? 'pdf' : 'image' }),
    [],
  );
  const goToPreviewOffset = useCallback(
    (offset: number) => {
      if (previewIndex < 0) return;
      const target = previewable[previewIndex + offset];
      if (target) openPreview(target);
    },
    [previewIndex, previewable, openPreview],
  );

  const handleDownload = useCallback(
    async (row: AttachmentView) => {
      if (downloadingRef.current) return;
      downloadingRef.current = true;
      try {
        const { url } = await queryClient.fetchQuery({
          ...trpc.attachment.getDownloadUrl.queryOptions({ attachmentId: row.id }),
          staleTime: 0,
        });
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = row.fileName;
        anchor.rel = 'noopener';
        anchor.target = '_blank';
        anchor.click();
      } catch {
        toast.error(copy.error.downloadFailed);
      } finally {
        downloadingRef.current = false;
      }
    },
    [queryClient, trpc, copy.error.downloadFailed],
  );

  const cardLabels = useMemo(
    () => ({
      preview: copy.actions.preview,
      download: copy.actions.download,
      moreActions: copy.actions.moreActions,
      makeCover: copy.actions.makeCover,
      removeCover: copy.actions.removeCover,
      delete: copy.actions.delete,
      coverBadge: copy.cover.badge,
    }),
    [copy],
  );

  return (
    <section className="flex flex-col gap-3" data-slot="card-detail-attachments">
      {attachments.length === 0 ? (
        <EmptyState
          icon={<PaperclipIcon className="size-8" />}
          message={copy.empty.title}
          action={<span className="text-xs text-muted-foreground">{copy.empty.description}</span>}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2.5">
          {attachments.map((row) => {
            const isUploader = row.uploader.id === viewerUserId;
            const canManage = (isUploader && canEdit) || isBoardAdmin;
            const canPreview = row.kind === 'image' || row.kind === 'pdf';
            const canSetCover = !coverDisabled && canEdit && row.kind === 'image';
            return (
              // Bildirim deep-link hedefi: `useTargetFlash` bu id ile eki bulup
              // scroll + flash uygular (card-detail-dialog). Kartı saran div id'yi taşır.
              <div key={row.id} data-attachment-id={row.id}>
                <AttachmentGalleryCard
                  fileName={row.fileName}
                  kind={row.kind}
                  mimeType={row.mimeType}
                  thumbnailUrl={row.thumbnailUrl}
                  isCover={row.isCover}
                  canDelete={canManage}
                  canSetCover={canSetCover}
                  canPreview={canPreview}
                  onPreview={canPreview ? () => openPreview(row) : undefined}
                  onDownload={() => void handleDownload(row)}
                  onToggleCover={
                    canSetCover
                      ? () =>
                          setCover.mutate({
                            cardId,
                            coverImageAttachmentId: row.isCover ? null : row.id,
                            clientMutationId: cmid(),
                          })
                      : undefined
                  }
                  onDelete={canManage ? () => setConfirmDelete(row) : undefined}
                  labels={cardLabels}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation ----------------------------------------------- */}
      <Dialog
        open={confirmDelete != null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.confirmDelete.title}</DialogTitle>
            <DialogDescription>
              {copy.confirmDelete.description}
              {confirmDelete ? ` — ${confirmDelete.fileName}` : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {copy.confirmDelete.cancel}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (confirmDelete) {
                  remove.mutate({ attachmentId: confirmDelete.id, clientMutationId: cmid() });
                }
                setConfirmDelete(null);
              }}
            >
              {copy.confirmDelete.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog ----------------------------------------------------- */}
      {preview && (
        <AttachmentPreviewDialog
          open
          onOpenChange={(open) => {
            if (!open) closePreview();
          }}
          fileName={preview.row.fileName}
          kind={preview.kind}
          url={previewUrlQuery.isError ? undefined : (previewUrlQuery.data?.url ?? null)}
          loadingUrl={previewUrlQuery.isPending}
          onDownload={() => void handleDownload(preview.row)}
          onPrev={previewable.length > 1 ? () => goToPreviewOffset(-1) : undefined}
          onNext={previewable.length > 1 ? () => goToPreviewOffset(1) : undefined}
          hasPrev={previewIndex > 0}
          hasNext={previewIndex >= 0 && previewIndex < previewable.length - 1}
          position={{ index: previewIndex + 1, total: previewable.length }}
          labels={{
            download: copy.actions.download,
            openInNewTab: copy.actions.openInNewTab,
            close: strings.common.close,
            zoomIn: copy.preview.zoomIn,
            zoomOut: copy.preview.zoomOut,
            zoomReset: copy.preview.zoomReset,
            zoomArea: copy.preview.zoomArea,
            loading: copy.preview.loading,
            error: copy.preview.error,
            prev: copy.preview.prev,
            next: copy.preview.next,
          }}
        />
      )}
    </section>
  );
}
