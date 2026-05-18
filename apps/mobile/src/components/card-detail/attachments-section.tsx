import { useState } from 'react';
import { Alert, Pressable, View, useColorScheme } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { ATTACHMENT_DESCRIPTION_MAX_LEN } from '@pusula/domain';
import { AppSpinner } from '@/components/app-spinner';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { TextArea } from '@/components/text-area';
import { DetailSection } from '@/components/card-detail/section';
import { AttachmentImageViewer } from '@/components/card-detail/attachment-image-viewer';
import { AttachmentTile } from '@/components/card-detail/attachment-tile';
import { safeCacheFileName } from '@/lib/attachment-format';
import { setCardCoverImageInCache, type BoardData } from '@/lib/board-cache';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';
import { useAttachmentUpload, type AttachmentUploadSource } from '@/lib/use-attachment-upload';
import { useTRPC } from '@/trpc/provider';
import { themeFor } from '@/theme/tokens';

type Attachments = RouterOutputs['attachment']['list'];
type Attachment = Attachments[number];

type AttachmentsSectionProps = {
  cardId: string;
  /** Kart sayacı tazelensin diye yükleme/silmede `board.get` invalidate edilir. */
  boardId: string | undefined;
  /** Çağıran board `member+` mi — `false` ise yalnız liste + indirme/önizleme. */
  canEdit: boolean;
  /** Oturum kullanıcısı — kendi yüklediği eki silebilir/düzenleyebilir. */
  currentUserId: string | undefined;
  /** Çağıranın board rolü — `admin` tüm ekleri silebilir/düzenleyebilir. */
  myBoardRole: 'admin' | 'member' | 'viewer' | undefined;
};

/** Yükleme kaynağı seçenekleri — bottom sheet satırları. */
const UPLOAD_SOURCES: ReadonlyArray<{
  source: AttachmentUploadSource;
  icon: 'camera' | 'image' | 'file';
  labelKey: 'sourceCamera' | 'sourceGallery' | 'sourceFiles';
}> = [
  { source: 'camera', icon: 'camera', labelKey: 'sourceCamera' },
  { source: 'gallery', icon: 'image', labelKey: 'sourceGallery' },
  { source: 'files', icon: 'file', labelKey: 'sourceFiles' },
];

/**
 * Kart detayı "Ekler" bölümü (Faz 7J; açıklama + kapak + yükleme yüzdesi: Faz
 * 7P — web §8.1.14 paritesi). Committed ek listesi + önizleme (resim lightbox,
 * PDF/Office indir-paylaş), kamera/galeri/dosya seçiciden iki-fazlı yükleme
 * (opsiyonel açıklamayla), ek silme, satır-içi açıklama düzenleme, kapak
 * görseli yap/kaldır. Faz 11 `attachment.*` + `card.update` tRPC procedure'leri
 * tüketilir — yeni backend yok. Silme/açıklama/kapak optimistic + rollback;
 * yükleme `clientMutationId` taşır. Liste tüm rollere açık; yükleme/kapak
 * `canEdit`, silme/açıklama uploader veya board admin'e bağlı (backend her
 * procedure'de doğrular).
 */
export function AttachmentsSection({
  cardId,
  boardId,
  canEdit,
  currentUserId,
  myBoardRole,
}: AttachmentsSectionProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const theme = themeFor(useColorScheme());
  const listKey = trpc.attachment.list.queryKey({ cardId });
  const boardKey = boardId ? trpc.board.get.queryKey({ boardId }) : null;

  const attachmentsQuery = useQuery(trpc.attachment.list.queryOptions({ cardId }));
  const upload = useAttachmentUpload({ cardId, boardId });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [previewing, setPreviewing] = useState<Attachment | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // Üzerinde açıklama/kapak mutation'ı uçuşan ek — o tile'ın menüsü kilitlenir.
  const [busyAttachmentId, setBusyAttachmentId] = useState<string | null>(null);
  // Yükleme öncesi opsiyonel açıklama girişi (Faz 7P).
  const [descriptionDraft, setDescriptionDraft] = useState('');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: listKey });
    void queryClient.invalidateQueries(trpc.card.activity.list.queryFilter({ cardId }));
    if (boardId) {
      void queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
    }
  };

  const deleteAttachment = useMutation(
    trpc.attachment.delete.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const prev = queryClient.getQueryData<Attachments>(listKey);
        if (prev) {
          queryClient.setQueryData<Attachments>(
            listKey,
            prev.filter((a) => a.id !== vars.attachmentId),
          );
        }
        return { prev };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(listKey, ctx.prev);
        Alert.alert(strings.attachments.title, strings.attachments.deleteError);
      },
      onSettled: invalidate,
    }),
  );

  // Açıklama düzenleme — `attachment.update` optimistic + rollback. Activity /
  // realtime üretmez (backend low-noise edit); yalnız `attachment.list` yamanır.
  const updateDescription = useMutation(
    trpc.attachment.update.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const prev = queryClient.getQueryData<Attachments>(listKey);
        if (prev) {
          queryClient.setQueryData<Attachments>(
            listKey,
            prev.map((a) =>
              a.id === vars.attachmentId ? { ...a, description: vars.description ?? null } : a,
            ),
          );
        }
        return { prev };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.prev) queryClient.setQueryData(listKey, ctx.prev);
        Alert.alert(strings.attachments.title, strings.attachments.descriptionEditError);
      },
      onSettled: (_data, _error, vars) => {
        // Yalnız bu ek için kilidi aç — eşzamanlı başka tile mutation'ı varsa
        // (kapak/açıklama) onun `busyAttachmentId`'sini erkenden düşürme.
        setBusyAttachmentId((cur) => (cur === vars.attachmentId ? null : cur));
        void queryClient.invalidateQueries({ queryKey: listKey });
      },
    }),
  );

  // Kapak görseli yap/kaldır — `card.update({ coverImageAttachmentId })`.
  // `attachment.list` (`isCover` bayrağı) + `board.get` (kart yüzü şeridi)
  // birlikte iyimser güncellenir; hata olursa ikisi de geri sarılır.
  const updateCover = useMutation(
    trpc.card.update.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        if (boardKey) await queryClient.cancelQueries({ queryKey: boardKey });
        // `onSettled` `card.get`'i invalidate ettiği için uçuştaki bir
        // `card.get` refetch'ini de durdur (kapak `card.get` üzerinden de döner).
        await queryClient.cancelQueries(trpc.card.get.queryFilter({ cardId }));
        const prevList = queryClient.getQueryData<Attachments>(listKey);
        const prevBoard = boardKey
          ? queryClient.getQueryData<BoardData>(boardKey)
          : undefined;
        const coverId = vars.coverImageAttachmentId ?? null;
        // Kilidi açacak ek id'si: kapak yapılıyorsa hedef ek, kaldırılıyorsa
        // mevcut kapak eki — `onSettled` bununla yalnız ilgili tile'ı çözer.
        const busyId = coverId ?? prevList?.find((a) => a.isCover)?.id ?? null;
        if (prevList) {
          queryClient.setQueryData<Attachments>(
            listKey,
            prevList.map((a) => ({ ...a, isCover: a.id === coverId })),
          );
        }
        if (boardKey && prevBoard) {
          const target = coverId ? prevList?.find((a) => a.id === coverId) : null;
          const coverImage = target
            ? {
                attachmentId: target.id,
                fileName: target.fileName,
                mimeType: target.mimeType,
                size: target.size,
              }
            : null;
          queryClient.setQueryData<BoardData>(
            boardKey,
            setCardCoverImageInCache(prevBoard, cardId, coverImage),
          );
        }
        return { prevList, prevBoard, busyId };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.prevList) queryClient.setQueryData(listKey, ctx.prevList);
        if (boardKey && ctx?.prevBoard) queryClient.setQueryData(boardKey, ctx.prevBoard);
        Alert.alert(strings.attachments.title, strings.attachments.coverError);
      },
      onSettled: (_data, _error, _vars, ctx) => {
        // Yalnız bu ekin kilidini aç (eşzamanlı açıklama mutation'ını ezme).
        setBusyAttachmentId((cur) => (cur === ctx?.busyId ? null : cur));
        void queryClient.invalidateQueries({ queryKey: listKey });
        void queryClient.invalidateQueries(trpc.card.get.queryFilter({ cardId }));
        if (boardId) {
          void queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
        }
      },
    }),
  );

  const attachments = attachmentsQuery.data ?? [];

  const handlePickSource = (source: AttachmentUploadSource) => {
    setSheetOpen(false);
    upload.pick(source);
  };

  const handleConfirmUpload = () => {
    upload.confirmUpload(descriptionDraft);
    setDescriptionDraft('');
  };

  const handleCancelUpload = () => {
    upload.cancelUpload();
    setDescriptionDraft('');
  };

  const confirmDelete = (attachment: Attachment) => {
    Alert.alert(
      strings.attachments.confirmDeleteTitle,
      `"${attachment.fileName}" ${strings.attachments.confirmDeleteBody}`,
      [
        { text: strings.common.cancel, style: 'cancel' },
        {
          text: strings.attachments.actionDelete,
          style: 'destructive',
          onPress: () =>
            deleteAttachment.mutate({
              attachmentId: attachment.id,
              clientMutationId: newClientMutationId(),
            }),
        },
      ],
    );
  };

  const handleSaveDescription = (attachmentId: string, description: string | undefined) => {
    setBusyAttachmentId(attachmentId);
    updateDescription.mutate({
      attachmentId,
      description,
      clientMutationId: newClientMutationId(),
    });
  };

  const handleToggleCover = (attachment: Attachment) => {
    setBusyAttachmentId(attachment.id);
    updateCover.mutate({
      cardId,
      coverImageAttachmentId: attachment.isCover ? null : attachment.id,
      clientMutationId: newClientMutationId(),
    });
  };

  // PDF/Office (ve istenirse resim) — presigned GET ile indir, native paylaşım
  // sayfasını aç. Önizleme tarayıcı/iframe mobilde yok; indir-paylaş deseni.
  const handleDownload = async (attachment: Attachment) => {
    if (downloadingId !== null) return;
    setDownloadingId(attachment.id);
    try {
      // `staleTime: 0` — presigned GET URL (TTL 10 dk) her indirmede taze
      // alınır; global 30 sn `staleTime` mirası bayat URL servis etmemeli.
      const { url } = await queryClient.fetchQuery(
        trpc.attachment.getDownloadUrl.queryOptions(
          { attachmentId: attachment.id },
          { staleTime: 0 },
        ),
      );
      // Önbellek hedefi ek id'siyle öneklenir — aynı ada sahip iki ek
      // birbirinin indirilen kopyasını ezmez.
      const target = `${FileSystem.cacheDirectory ?? ''}${attachment.id}-${safeCacheFileName(
        attachment.fileName,
      )}`;
      const downloaded = await FileSystem.downloadAsync(url, target);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloaded.uri, { mimeType: attachment.mimeType });
      }
    } catch {
      Alert.alert(strings.attachments.title, strings.attachments.downloadError);
    } finally {
      setDownloadingId(null);
    }
  };

  const canDelete = (attachment: Attachment): boolean =>
    attachment.uploader.id === currentUserId || myBoardRole === 'admin';

  // Yeni dosya seçimi engellensin — uçuşta yükleme ya da açıklama girişi
  // bekleyen dosya varken "Ek ekle" pasiftir.
  const addDisabled = upload.uploadingName !== null || upload.pendingFileName !== null;

  return (
    <DetailSection icon="paperclip" title={strings.attachments.title}>
      <View className="gap-2">
        {attachmentsQuery.isError ? (
          <Text className="text-sm text-destructive">{strings.attachments.loadError}</Text>
        ) : (
          <>
            {/* Yükleme sürerken bekleyen tile — iki-fazlı upload anlık değil.
                PUT fazında gerçek yüzde, initiate/commit fazında spinner. */}
            {upload.uploadingName ? (
              <View className="gap-2 rounded-lg border border-border bg-card p-3">
                <View className="flex-row items-center gap-3">
                  {upload.uploadProgress === null ? (
                    <AppSpinner size="sm" color={theme.primary} />
                  ) : null}
                  <Text
                    className="flex-1 text-sm text-muted-foreground"
                    numberOfLines={1}
                  >
                    {upload.uploadProgress === null
                      ? `${strings.attachments.uploading} ${upload.uploadingName}`
                      : `${strings.attachments.uploadingProgress} %${upload.uploadProgress} · ${upload.uploadingName}`}
                  </Text>
                </View>
                {upload.uploadProgress !== null ? (
                  <View
                    accessibilityRole="progressbar"
                    accessibilityValue={{ min: 0, max: 100, now: upload.uploadProgress }}
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                  >
                    <View
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${upload.uploadProgress}%` }}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {attachments.map((attachment) => (
              <AttachmentTile
                key={attachment.id}
                attachment={attachment}
                canDelete={canDelete(attachment)}
                canEditDescription={canDelete(attachment)}
                canSetCover={canEdit}
                downloading={downloadingId === attachment.id}
                busy={busyAttachmentId === attachment.id}
                onPreview={
                  attachment.kind === 'image' ? () => setPreviewing(attachment) : undefined
                }
                onDownload={() => void handleDownload(attachment)}
                onDelete={() => confirmDelete(attachment)}
                onSaveDescription={(description) =>
                  handleSaveDescription(attachment.id, description)
                }
                onToggleCover={() => handleToggleCover(attachment)}
              />
            ))}

            {attachments.length === 0 && !upload.uploadingName ? (
              <Text className="text-sm text-muted-foreground">{strings.attachments.empty}</Text>
            ) : null}
          </>
        )}

        {canEdit ? (
          <Pressable
            accessibilityRole="button"
            disabled={addDisabled}
            onPress={() => setSheetOpen(true)}
            className={`mt-1 flex-row items-center gap-1.5 self-start ${
              addDisabled ? 'opacity-50' : 'active:opacity-70'
            }`}
          >
            <Icon name="plus" size={14} color={theme.primary} />
            <Text weight="medium" className="text-sm text-primary">
              {strings.attachments.addAction}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Sheet visible={sheetOpen} title={strings.attachments.sheetTitle} onClose={() => setSheetOpen(false)}>
        <View className="gap-1">
          {UPLOAD_SOURCES.map(({ source, icon, labelKey }) => (
            <Pressable
              key={source}
              accessibilityRole="button"
              onPress={() => handlePickSource(source)}
              className="flex-row items-center gap-3 rounded-lg px-2 py-3 active:bg-muted"
            >
              <Icon name={icon} size={20} color={theme.foreground} />
              <Text className="text-base text-foreground">{strings.attachments[labelKey]}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>

      {/* Yükleme öncesi opsiyonel açıklama girişi (Faz 7P). Backdrop/Kapat =
          iptal — bekleyen dosya yüklenmeden atılır. */}
      <Sheet
        visible={upload.pendingFileName !== null}
        title={strings.attachments.descriptionSheetTitle}
        onClose={handleCancelUpload}
      >
        <View className="gap-3">
          {upload.pendingFileName ? (
            <Text className="text-sm text-muted-foreground" numberOfLines={1}>
              {upload.pendingFileName}
            </Text>
          ) : null}
          <TextArea
            value={descriptionDraft}
            onChangeText={setDescriptionDraft}
            placeholder={strings.attachments.descriptionPlaceholder}
            maxLength={ATTACHMENT_DESCRIPTION_MAX_LEN}
          />
          <Text className="self-end text-[10px] text-muted-foreground">
            {descriptionDraft.length}/{ATTACHMENT_DESCRIPTION_MAX_LEN}
          </Text>
          <Button label={strings.attachments.descriptionUploadAction} onPress={handleConfirmUpload} />
        </View>
      </Sheet>

      <AttachmentImageViewer attachment={previewing} onClose={() => setPreviewing(null)} />
    </DetailSection>
  );
}
