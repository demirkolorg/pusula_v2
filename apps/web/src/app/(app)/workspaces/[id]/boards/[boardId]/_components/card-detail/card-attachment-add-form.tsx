'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ATTACHMENT_DESCRIPTION_MAX_LEN,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_TYPES,
} from '@pusula/domain';
import { Button, Dropzone, Textarea, toast } from '@pusula/ui';
import { formatBytes } from '@/lib/format';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import { uploadWithProgress, UploadAbortedError } from '@/lib/upload-with-progress';

const cmid = () => crypto.randomUUID();

type CardAttachmentAddFormProps = {
  cardId: string;
  canEdit: boolean;
  /**
   * Checklist maddesine ek yükleniyorsa o maddenin id'si. Verilirse ek karta
   * değil maddeye bağlanır (`initiate` `checklistItemId` taşır) ve başarıdan
   * sonra hem madde ek listesi hem `checklist.list` (rozet sayacı) tazelenir.
   * Yoksa kart eki (mevcut davranış).
   */
  checklistItemId?: string;
  /** Yükleme başarıyla biterse popover'ı kapatmak için. */
  onSuccess?: () => void;
};

/**
 * "+ Ekle → Ek" popover view'ı için inline upload formu — dropzone + opsiyonel
 * açıklama + yükle. Liste ve dosya yönetimi modal'ın "Ekler" sekmesinde kalır;
 * bu form sadece yeni bir dosya commit'lemek için. Başarıdan sonra
 * `attachment.list` cache'i invalidate edilir ve board.get içindeki kart
 * `attachmentCount` chip'i optimistic olarak +1 ilerletilir.
 *
 * `checklistItemId` verilerek checklist maddesine ek yüklemek için de yeniden
 * kullanılır (madde-yorum composer'ıyla simetrik): o durumda liste filtresi
 * `{ cardId, checklistItemId }`'e daralır ve başarıda madde rozeti için
 * `checklist.list` da invalidate edilir. Board kart chip'i (toplam ek sayısı)
 * her iki durumda da +1 ilerletilir.
 */
export function CardAttachmentAddForm({
  cardId,
  canEdit,
  checklistItemId,
  onSuccess,
}: CardAttachmentAddFormProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const copy = strings.attachment;

  const listFilter = useMemo(
    () =>
      trpc.attachment.list.queryFilter(
        checklistItemId ? { cardId, checklistItemId } : { cardId },
      ),
    [trpc, cardId, checklistItemId],
  );

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const uploadAbortRef = useRef<(() => void) | null>(null);
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      uploadAbortRef.current?.();
    };
  }, []);

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
    let phase: 'initiate' | 'upload' | 'commit' = 'initiate';
    try {
      const initiated = await initiate.mutateAsync({
        cardId,
        checklistItemId,
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
      await commit.mutateAsync({
        attachmentId: initiated.attachmentId,
        clientMutationId: cmid(),
      });
      if (!mountedRef.current) return;
      bumpBoardAttachmentCount(1);
      void queryClient.invalidateQueries(listFilter);
      // Madde eki: rozet sayacı `checklist.list`'ten türer — o maddenin
      // `attachmentCount`'u tazelensin (yorum composer'ıyla simetrik).
      if (checklistItemId) {
        void queryClient.invalidateQueries(trpc.checklist.list.queryFilter({ cardId }));
      }
      resetUpload();
      onSuccess?.();
    } catch (error) {
      if (!mountedRef.current) return;
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
    checklistItemId,
    trpc,
    initiate,
    commit,
    queryClient,
    listFilter,
    bumpBoardAttachmentCount,
    resetUpload,
    onSuccess,
    copy.error.commitFailed,
    copy.error.uploadFailed,
  ]);

  const cancelUpload = useCallback(() => {
    uploadAbortRef.current?.();
  }, []);

  const descriptionOverLimit = description.length > ATTACHMENT_DESCRIPTION_MAX_LEN;

  return (
    <div className="flex flex-col gap-3" data-slot="card-attachment-add-form">
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
    </div>
  );
}
