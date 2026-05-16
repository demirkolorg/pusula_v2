'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ATTACHMENT_DESCRIPTION_MAX_LEN,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_TYPES,
} from '@pusula/domain';
import {
  AttachmentPreviewDialog,
  AttachmentTile,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Dropzone,
  EmptyState,
  Textarea,
  toast,
  type AttachmentPreviewKind,
} from '@pusula/ui';
import { PaperclipIcon } from 'lucide-react';
import { formatBytes, formatRelativeTime } from '@/lib/format';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { uploadWithProgress, UploadAbortedError } from '@/lib/upload-with-progress';

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
};

type CardDetailAttachmentsProps = {
  cardId: string;
  /** Board `member+` and board active — may upload / edit / delete. */
  canEdit: boolean;
  /** Board `admin` — may edit / delete any attachment + set cover. */
  isBoardAdmin: boolean;
  /** The viewer's own user id — gates per-attachment edit / delete. */
  viewerUserId: string;
};

/**
 * Card modal "Ekler" tab — the real attachment manager (Faz 11D / DEM-150).
 *
 * Top: a {@link Dropzone} + optional description, driving the two-phase upload
 * (`initiate` → presigned PUT with progress → `commit`). Uploads are **not**
 * optimistic — the new tile lands from the `commit` response. Below: the
 * chronological list of {@link AttachmentTile}s. Description edits + deletes
 * are optimistic with rollback. Previews/downloads fetch a presigned URL
 * lazily.
 *
 * Spec: `docs/architecture/13-ui-tasarim-dili.md` §13.10,
 * `docs/architecture/08-web-ve-mobil.md` §8.1.14.
 */
export function CardDetailAttachments({
  cardId,
  canEdit,
  isBoardAdmin,
  viewerUserId,
}: CardDetailAttachmentsProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const copy = strings.attachment;

  const listFilter = useMemo(() => trpc.attachment.list.queryFilter({ cardId }), [trpc, cardId]);
  const listQuery = useQuery(trpc.attachment.list.queryOptions({ cardId }));
  const attachments = (listQuery.data ?? []) as AttachmentView[];

  /**
   * Bump the board card's `attachmentCount` meta chip by `delta`. The
   * `attachment.added`/`removed` realtime handler does this too, but the
   * uploader's own event is filtered out by `clientMutationId`, so without
   * this optimistic patch the paperclip counter would lag until `board.get`
   * refetches. Matches any cached `board.get` (no `boardId` to hand).
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

  // --- Upload state --------------------------------------------------------
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  /** Aborter for the in-flight presigned PUT — used by cancel + unmount. */
  const uploadAbortRef = useRef<(() => void) | null>(null);
  /** Cleared on unmount so post-unmount `setState` is skipped. */
  const mountedRef = useRef(true);

  const initiate = useMutation(trpc.attachment.initiate.mutationOptions());
  const commit = useMutation(trpc.attachment.commit.mutationOptions());

  const resetUpload = useCallback(() => {
    setPendingFile(null);
    setDescription('');
    setUploading(false);
    setProgress(0);
    uploadAbortRef.current = null;
  }, []);

  // Abort an in-flight upload when the tab unmounts (modal close / card swap).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      uploadAbortRef.current?.();
    };
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      if (file.size > ATTACHMENT_MAX_BYTES) {
        toast.error(copy.dropzone.error.tooLarge);
        return;
      }
      if (!(ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
        toast.error(copy.dropzone.error.mimeRejected);
        return;
      }
      setPendingFile(file);
      setProgress(0);
    },
    [copy.dropzone.error.mimeRejected, copy.dropzone.error.tooLarge],
  );

  const handleUpload = useCallback(async () => {
    if (!pendingFile) return;
    setUploading(true);
    setProgress(0);
    // Track the phase locally — mutation hook state (`isSuccess`/`isPending`)
    // updates asynchronously and is unreliable inside `catch`.
    let phase: 'initiate' | 'upload' | 'commit' = 'initiate';
    try {
      const initiated = await initiate.mutateAsync({
        cardId,
        fileName: pendingFile.name,
        mimeType: pendingFile.type as (typeof ATTACHMENT_MIME_TYPES)[number],
        size: pendingFile.size,
        description: description.trim() ? description.trim() : undefined,
        clientMutationId: cmid(),
      });
      phase = 'upload';
      const handle = uploadWithProgress(
        initiated.upload.url,
        initiated.upload.headers,
        pendingFile,
        setProgress,
      );
      uploadAbortRef.current = handle.abort;
      await handle.promise;
      uploadAbortRef.current = null;
      phase = 'commit';
      const committed = (await commit.mutateAsync({
        attachmentId: initiated.attachmentId,
        clientMutationId: cmid(),
      })) as AttachmentView;
      if (!mountedRef.current) return;
      // Not optimistic — append the committed row + invalidate so order /
      // `isCover` stay authoritative.
      queryClient.setQueryData<AttachmentView[]>(listFilter.queryKey, (prev) =>
        prev ? [committed, ...prev.filter((row) => row.id !== committed.id)] : [committed],
      );
      // Keep the board's paperclip counter in sync even though our own
      // `attachment.added` realtime echo is filtered out.
      bumpBoardAttachmentCount(1);
      void queryClient.invalidateQueries(listFilter);
      resetUpload();
    } catch (error) {
      if (!mountedRef.current) return;
      // User-initiated cancel — silent, just reset.
      if (error instanceof UploadAbortedError) {
        resetUpload();
        return;
      }
      setUploading(false);
      uploadAbortRef.current = null;
      toast.error(phase === 'commit' ? copy.error.commitFailed : copy.error.uploadFailed);
    }
  }, [
    pendingFile,
    description,
    cardId,
    initiate,
    commit,
    queryClient,
    listFilter,
    resetUpload,
    bumpBoardAttachmentCount,
    copy.error.commitFailed,
    copy.error.uploadFailed,
  ]);

  const cancelUpload = useCallback(() => {
    // Abort the in-flight PUT; the `catch` UploadAbortedError branch resets.
    uploadAbortRef.current?.();
  }, []);

  // --- Description edit (optimistic) --------------------------------------
  const update = useMutation(
    trpc.attachment.update.mutationOptions({
      onMutate: async (vars: { attachmentId: string; description?: string | null }) => {
        await queryClient.cancelQueries(listFilter);
        const snapshot = queryClient.getQueryData<AttachmentView[]>(listFilter.queryKey);
        queryClient.setQueryData<AttachmentView[]>(listFilter.queryKey, (prev) =>
          prev?.map((row) =>
            row.id === vars.attachmentId
              ? { ...row, description: vars.description ?? null }
              : row,
          ),
        );
        return { snapshot };
      },
      onError: (_error, _vars, context) => {
        const ctx = context as { snapshot?: AttachmentView[] } | undefined;
        if (ctx?.snapshot) queryClient.setQueryData(listFilter.queryKey, ctx.snapshot);
        toast.error(copy.error.updateFailed);
      },
      onSettled: () => void queryClient.invalidateQueries(listFilter),
    }),
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
      onSettled: () => void queryClient.invalidateQueries(listFilter),
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

  const tileLabels = useMemo(
    () => ({
      preview: copy.actions.preview,
      download: copy.actions.download,
      editDescription: copy.actions.edit,
      moreActions: copy.actions.moreActions,
      makeCover: copy.actions.makeCover,
      removeCover: copy.actions.removeCover,
      delete: copy.actions.delete,
      coverBadge: copy.cover.badge,
      descriptionPlaceholder: copy.description.placeholder,
      editSave: copy.actions.save,
      editCancel: copy.actions.cancel,
      descriptionCounter: copy.description.counter,
    }),
    [copy],
  );

  const descriptionOverLimit = description.length > ATTACHMENT_DESCRIPTION_MAX_LEN;

  return (
    <section className="flex flex-col gap-3" data-slot="card-detail-attachments">
      {/* Upload area -------------------------------------------------------- */}
      <Dropzone
        accept={ATTACHMENT_MIME_TYPES.join(',')}
        maxBytes={ATTACHMENT_MAX_BYTES}
        disabled={!canEdit}
        uploading={uploading}
        progress={progress}
        onFile={handleFile}
        labels={{
          idle: copy.dropzone.idle,
          hint: copy.dropzone.hint,
          active: copy.dropzone.active,
          uploading: copy.dropzone.uploading,
          ariaLabel: copy.dropzone.ariaLabel,
          disabledHint: copy.dropzone.disabledHint,
        }}
      />

      {/* Cancel an in-flight upload. */}
      {uploading && (
        <div className="flex justify-center">
          <Button type="button" size="sm" variant="ghost" onClick={cancelUpload}>
            {copy.actions.cancelUpload}
          </Button>
        </div>
      )}

      {pendingFile && !uploading && (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
          <p className="truncate text-sm font-medium" title={pendingFile.name}>
            {pendingFile.name}{' '}
            <span className="text-muted-foreground">({formatBytes(pendingFile.size)})</span>
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {copy.description.label}
            </span>
            <Textarea
              rows={2}
              value={description}
              placeholder={copy.description.placeholder}
              maxLength={ATTACHMENT_DESCRIPTION_MAX_LEN}
              aria-invalid={descriptionOverLimit}
              onChange={(event) => setDescription(event.target.value)}
              className="text-sm"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground" aria-live="polite">
              {copy.description.counter(description.length, ATTACHMENT_DESCRIPTION_MAX_LEN)}
            </span>
            <div className="flex gap-1.5">
              <Button type="button" size="sm" variant="ghost" onClick={resetUpload}>
                {copy.actions.cancel}
              </Button>
              <Button type="button" size="sm" onClick={() => void handleUpload()}>
                {copy.upload.action}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* List --------------------------------------------------------------- */}
      {attachments.length === 0 ? (
        <EmptyState
          icon={<PaperclipIcon className="size-8" />}
          message={copy.empty.title}
          action={<span className="text-xs text-muted-foreground">{copy.empty.description}</span>}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {attachments.map((row) => {
            const isUploader = row.uploader.id === viewerUserId;
            const canManage = (isUploader && canEdit) || isBoardAdmin;
            const canPreview = row.kind === 'image' || row.kind === 'pdf';
            return (
              <AttachmentTile
                key={row.id}
                fileName={row.fileName}
                kind={row.kind}
                mimeType={row.mimeType}
                sizeLabel={formatBytes(row.size)}
                uploaderName={row.uploader.name?.trim() || strings.share.guest.deletedUserLabel}
                timeLabel={formatRelativeTime(row.committedAt ?? row.createdAt)}
                description={row.description}
                isCover={row.isCover}
                descriptionMaxLength={ATTACHMENT_DESCRIPTION_MAX_LEN}
                canEdit={canManage}
                canDelete={canManage}
                canSetCover={canEdit}
                canPreview={canPreview}
                onPreview={
                  canPreview
                    ? () =>
                        setPreview({
                          row,
                          kind: row.kind === 'pdf' ? 'pdf' : 'image',
                        })
                    : undefined
                }
                onDownload={() => void handleDownload(row)}
                onSaveDescription={
                  canManage
                    ? (next) =>
                        update.mutate({
                          attachmentId: row.id,
                          description: next ? next : undefined,
                          clientMutationId: cmid(),
                        })
                    : undefined
                }
                onToggleCover={
                  canEdit && row.kind === 'image'
                    ? () =>
                        setCover.mutate({
                          cardId,
                          coverImageAttachmentId: row.isCover ? null : row.id,
                          clientMutationId: cmid(),
                        })
                    : undefined
                }
                onDelete={canManage ? () => setConfirmDelete(row) : undefined}
                labels={tileLabels}
              />
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
          }}
        />
      )}
    </section>
  );
}
