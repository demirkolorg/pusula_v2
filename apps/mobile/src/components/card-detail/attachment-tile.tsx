import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { RouterOutputs } from '@pusula/api';
import { ATTACHMENT_DESCRIPTION_MAX_LEN } from '@pusula/domain';
import { AppSpinner } from '@/components/app-spinner';
import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { RemoteImage } from '@/components/remote-image';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { TextArea } from '@/components/text-area';
import { attachmentIconName, formatBytes } from '@/lib/attachment-format';
import { formatTimestamp } from '@/lib/format-date';
import { useScrollHighlightTarget } from '@/components/card-detail/scroll-highlight';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

type Attachment = RouterOutputs['attachment']['list'][number];

type AttachmentTileProps = {
  attachment: Attachment;
  /** Çağıran bu eki silebilir mi (uploader veya board admin). */
  canDelete: boolean;
  /** Çağıran açıklamayı düzenleyebilir mi (uploader veya board admin). */
  canEditDescription: boolean;
  /** Çağıran kapak yapabilir mi (board member+). Yalnız resim ekleri anlamlı. */
  canSetCover: boolean;
  /** Bu ek şu an indiriliyor mu — aksiyon ikonu spinner'a döner. */
  downloading: boolean;
  /** Bu ek üzerinde açıklama/kapak mutation'ı uçuşta mı — menü işlemleri kilitli. */
  busy: boolean;
  /**
   * Ek önizleme dispatcher'ı — çağıran tarafça gating yapılır (resim lightbox,
   * PDF in-app browser vb.). Önizlenemeyen ekler için `undefined` geçilir.
   * Stabil callback: argüman olarak `attachment` alır (DEM-226 #2).
   */
  onPreview?: (attachment: Attachment) => void;
  /** Stabil callback: argüman olarak `attachment` alır (DEM-226 #2). */
  onDownload: (attachment: Attachment) => void;
  /** Stabil callback: argüman olarak `attachment` alır (DEM-226 #2). */
  onDelete: (attachment: Attachment) => void;
  /**
   * Açıklamayı kaydeder (boş değer → `undefined` = açıklama silme).
   * Stabil callback: argüman olarak `attachmentId` + `description` alır (DEM-226 #2).
   */
  onSaveDescription: (attachmentId: string, description: string | undefined) => void;
  /**
   * Kapak yap / kaldır — yön `attachment.isCover`'a göre.
   * Stabil callback: argüman olarak `attachment` alır (DEM-226 #2).
   */
  onToggleCover: (attachment: Attachment) => void;
  /** Bildirim deep-link'iyle gelinince bu tile flash vurgulanır (bir kez). */
  highlighted?: boolean;
};

/** Kebab menüsündeki tek aksiyon satırı. */
function MenuRow({
  icon,
  label,
  destructive,
  color,
  onPress,
}: {
  icon: IconName;
  label: string;
  destructive?: boolean;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-lg px-2 py-3 active:bg-muted"
    >
      <Icon name={icon} size={20} color={color} />
      <Text className={`text-base ${destructive ? 'text-destructive' : 'text-foreground'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Tek satırlık ek tile'ı (Faz 7J; açıklama düzenleme + kapak + kebab: Faz 7P).
 * kind ikonu + ad/meta/açıklama + "Kapak" rozeti; sağda önizleme (resim) +
 * indir ikonları ve bir kebab menüsü. Kebab Sheet'i ikincil işlemleri
 * gruplar — açıklamayı düzenle, kapak yap/kaldır, sil — mobilde dar satıra
 * beş ikon sığdırmak yerine (web §8.1.14 `MoreHorizontal` deseni). Açıklama
 * düzenleme satır-içi açılır; mutation çağıran tarafta optimistic + rollback.
 */
function AttachmentTileImpl({
  attachment,
  canDelete,
  canEditDescription,
  canSetCover,
  downloading,
  busy,
  onPreview,
  onDownload,
  onDelete,
  onSaveDescription,
  onToggleCover,
  highlighted = false,
}: AttachmentTileProps) {
  const theme = useTheme();
  const flashOpacity = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 8,
    backgroundColor: `rgba(16,185,129,${flashOpacity.value * 0.18})`,
    pointerEvents: 'none',
  }));
  // Flash bir kez oynasın — geri/ileri navigasyon veya re-render'da `highlighted`
  // hâlâ true iken (aynı deep-link param'ı) tekrar tetiklenmesin.
  const flashedRef = useRef(false);
  useEffect(() => {
    if (highlighted && !flashedRef.current) {
      flashedRef.current = true;
      flashOpacity.value = withSequence(
        withTiming(1, { duration: 250 }),
        withDelay(700, withTiming(0, { duration: 500 })),
      );
    }
  }, [highlighted, flashOpacity]);
  // Vurgu hedefiyse ölç + (provider üzerinden) bir kez scroll-to.
  const scrollHighlight = useScrollHighlightTarget(attachment.id, highlighted);
  const isImage = attachment.kind === 'image';
  const uploaderName = attachment.uploader.name ?? strings.cardDetail.unknownUser;
  // committedAt her zaman dolu (`list` yalnız commit edilmiş ekleri döndürür);
  // yine de tip null'a izin verdiği için createdAt'e düşülür.
  const meta = `${formatBytes(attachment.size)} · ${uploaderName} · ${formatTimestamp(
    attachment.committedAt ?? attachment.createdAt,
  )}`;

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  // Kapak işlemi yalnız resim ekleri için (backend de image-only zorlar).
  const showCoverAction = canSetCover && isImage;
  const hasMenu = canEditDescription || showCoverAction || canDelete;

  // İç useCallback sarmalayıcılar — çağırandan gelen stabil prop callback'leri
  // bu tile'ın `attachment`'ına bağlar. CommentRow/CardRow deseni (DEM-226 #2).
  const handlePreview = useCallback(() => {
    onPreview?.(attachment);
  }, [onPreview, attachment]);

  const handleDownload = useCallback(() => {
    onDownload(attachment);
  }, [onDownload, attachment]);

  const handleDelete = useCallback(() => {
    setMenuOpen(false);
    onDelete(attachment);
  }, [onDelete, attachment]);

  const handleToggleCover = useCallback(() => {
    setMenuOpen(false);
    onToggleCover(attachment);
  }, [onToggleCover, attachment]);

  const startEditing = () => {
    setMenuOpen(false);
    setDraft(attachment.description ?? '');
    setEditing(true);
  };

  const handleSaveDescription = () => {
    const trimmed = draft.trim();
    // Anlamca değişiklik yoksa mutation atma — boş ↔ null eşdeğer.
    if (trimmed === (attachment.description ?? '')) {
      setEditing(false);
      return;
    }
    onSaveDescription(attachment.id, trimmed.length > 0 ? trimmed : undefined);
    setEditing(false);
  };

  return (
    <View
      ref={scrollHighlight.ref}
      onLayout={scrollHighlight.onLayout}
      className="rounded-lg border border-border bg-card p-3"
      style={{ position: 'relative' }}
    >
      <Animated.View style={flashStyle} />
      <View className="flex-row items-center gap-3">
        {/* Resim ekleri için liste thumbnail'ı (presigned `thumbnailUrl`, TTL 1
            saat; URL bayatlar/yoksa ikona düşülür). Thumbnail'a dokunmak da
            önizlemeyi (lightbox) açar — eye ikonuyla aynı `handlePreview`. */}
        {isImage && attachment.thumbnailUrl ? (
          <Pressable
            accessibilityRole={onPreview ? 'button' : undefined}
            accessibilityLabel={onPreview ? strings.attachments.actionPreview : undefined}
            disabled={!onPreview || downloading}
            onPress={onPreview ? handlePreview : undefined}
            className="h-11 w-11 overflow-hidden rounded-md bg-muted active:opacity-80"
          >
            <RemoteImage
              uri={attachment.thumbnailUrl}
              accessibilityLabel={attachment.fileName}
              resizeMode="cover"
              className="h-full w-full"
              spinnerSize="xs"
            />
          </Pressable>
        ) : (
          <View className="h-11 w-11 items-center justify-center rounded-md bg-muted">
            <Icon
              name={attachmentIconName(attachment.kind)}
              size={20}
              color={theme.mutedForeground}
            />
          </View>
        )}

        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <Text weight="medium" className="flex-1 text-sm text-foreground" numberOfLines={1}>
              {attachment.fileName}
            </Text>
            {attachment.isCover ? (
              <View className="rounded-full bg-primary/15 px-1.5 py-0.5">
                <Text weight="medium" className="text-[10px] text-primary">
                  {strings.attachments.coverBadge}
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {meta}
          </Text>
          {attachment.description && !editing ? (
            <Text className="text-xs italic text-muted-foreground" numberOfLines={2}>
              {attachment.description}
            </Text>
          ) : null}
        </View>

        <View className="flex-row items-center gap-1">
          {/* Eye ikonu önizlenebilir tüm ekler için gösterilir (resim + PDF).
              Gating çağıran tarafta — `onPreview` yalnız önizlenebilen eklere
              geçilir (DEM-240 2. tur: önceki turda gating `isImage` kontrolüyle
              kısıtlıydı, PDF dispatch çalışsa da ikon hiç çizilmiyordu). */}
          {onPreview ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.attachments.actionPreview}
              hitSlop={6}
              disabled={downloading}
              onPress={handlePreview}
              className="h-10 w-10 items-center justify-center rounded-md active:bg-muted"
            >
              <Icon name="eye" size={17} color={theme.mutedForeground} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.attachments.actionDownload}
            hitSlop={6}
            disabled={downloading}
            onPress={handleDownload}
            className="h-10 w-10 items-center justify-center rounded-md active:bg-muted"
          >
            {downloading ? (
              <AppSpinner size="sm" color={theme.mutedForeground} />
            ) : (
              <Icon name="download" size={17} color={theme.mutedForeground} />
            )}
          </Pressable>
          {hasMenu ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.attachments.actionMore}
              hitSlop={6}
              disabled={downloading || busy}
              onPress={() => setMenuOpen(true)}
              className={`h-10 w-10 items-center justify-center rounded-md active:bg-muted ${
                busy ? 'opacity-50' : ''
              }`}
            >
              {busy ? (
                <AppSpinner size="sm" color={theme.mutedForeground} />
              ) : (
                <Icon name="more-vertical" size={17} color={theme.mutedForeground} />
              )}
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Satır-içi açıklama düzenleme (Faz 7P). */}
      {editing ? (
        <View className="mt-3 gap-2">
          <TextArea
            value={draft}
            onChangeText={setDraft}
            placeholder={strings.attachments.descriptionEditPlaceholder}
            maxLength={ATTACHMENT_DESCRIPTION_MAX_LEN}
            editable={!busy}
            autoFocus
          />
          <Text className="self-end text-[10px] text-muted-foreground">
            {draft.length}/{ATTACHMENT_DESCRIPTION_MAX_LEN}
          </Text>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                label={strings.common.cancel}
                variant="ghost"
                onPress={() => setEditing(false)}
                disabled={busy}
              />
            </View>
            <View className="flex-1">
              <Button
                label={strings.common.save}
                onPress={handleSaveDescription}
                disabled={busy}
              />
            </View>
          </View>
        </View>
      ) : null}

      <Sheet
        visible={menuOpen}
        title={strings.attachments.actionsSheetTitle}
        onClose={() => setMenuOpen(false)}
      >
        <View className="gap-1">
          {canEditDescription ? (
            <MenuRow
              icon="edit-3"
              label={strings.attachments.actionEditDescription}
              color={theme.foreground}
              onPress={startEditing}
            />
          ) : null}
          {showCoverAction ? (
            <MenuRow
              icon="image"
              label={
                attachment.isCover
                  ? strings.attachments.actionRemoveCover
                  : strings.attachments.actionMakeCover
              }
              color={theme.foreground}
              onPress={handleToggleCover}
            />
          ) : null}
          {canDelete ? (
            <MenuRow
              icon="trash-2"
              label={strings.attachments.actionDelete}
              destructive
              color={theme.destructive}
              onPress={handleDelete}
            />
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

/**
 * Ek tile'ı — `React.memo` ile sarılı (DEM-226 #2). Çağıran ek listesinde
 * `attachment` referansı değişmeyen ve callback'leri stabil olan satırlar,
 * liste yeniden render olsa bile yeniden çizilmez.
 */
export const AttachmentTile = memo(AttachmentTileImpl);
