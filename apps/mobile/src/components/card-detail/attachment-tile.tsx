import { useState } from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import type { RouterOutputs } from '@pusula/api';
import { ATTACHMENT_DESCRIPTION_MAX_LEN } from '@pusula/domain';
import { AppSpinner } from '@/components/app-spinner';
import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { TextArea } from '@/components/text-area';
import { attachmentIconName, formatBytes } from '@/lib/attachment-format';
import { formatTimestamp } from '@/lib/format-date';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

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
  /** Resim eki önizleme (lightbox) — yalnız `kind === 'image'` için verilir. */
  onPreview?: () => void;
  onDownload: () => void;
  onDelete: () => void;
  /** Açıklamayı kaydeder (boş değer → `undefined` = açıklama silme). */
  onSaveDescription: (description: string | undefined) => void;
  /** Kapak yap / kaldır — yön `attachment.isCover`'a göre. */
  onToggleCover: () => void;
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
export function AttachmentTile({
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
}: AttachmentTileProps) {
  const theme = themeFor(useColorScheme());
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
    onSaveDescription(trimmed.length > 0 ? trimmed : undefined);
    setEditing(false);
  };

  return (
    <View className="rounded-lg border border-border bg-card p-3">
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-md bg-muted">
          <Icon name={attachmentIconName(attachment.kind)} size={20} color={theme.mutedForeground} />
        </View>

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
          {isImage && onPreview ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.attachments.actionPreview}
              hitSlop={6}
              disabled={downloading}
              onPress={onPreview}
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
            onPress={onDownload}
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
              onPress={() => {
                setMenuOpen(false);
                onToggleCover();
              }}
            />
          ) : null}
          {canDelete ? (
            <MenuRow
              icon="trash-2"
              label={strings.attachments.actionDelete}
              destructive
              color={theme.destructive}
              onPress={() => {
                setMenuOpen(false);
                onDelete();
              }}
            />
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}
