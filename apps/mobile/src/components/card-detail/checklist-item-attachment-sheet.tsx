import { Sheet } from '@/components/sheet';
import { AttachmentsSection } from '@/components/card-detail/attachments-section';
import { strings } from '@/lib/strings';

type ChecklistItemAttachmentSheetProps = {
  visible: boolean;
  cardId: string;
  /** Kart sayacı tazelensin diye alt bileşen `board.get` invalidate eder. */
  boardId: string | undefined;
  /** Açık olan maddenin id'si; `null` ise sheet kapalı (içerik render edilmez). */
  checklistItemId: string | null;
  /** Çağıran board `member+` mi — `false` ise yalnız liste + indirme/önizleme. */
  canEdit: boolean;
  /** Oturum kullanıcısı — kendi yüklediği eki silebilir/düzenleyebilir. */
  currentUserId: string | undefined;
  /** Çağıranın board rolü — `admin` tüm ekleri silebilir/düzenleyebilir. */
  myBoardRole: 'admin' | 'member' | 'viewer' | undefined;
  /** Bildirim deep-link'iyle gelinince bu id'li ek tile'ı flash vurgulanır. */
  highlightAttachmentId?: string;
  onClose: () => void;
};

/**
 * Bir kontrol listesi (yapılacaklar) maddesinin ekleri — web
 * `checklist-item-attachments.tsx`'in mobil karşılığı ve mobil madde yorum
 * thread'i (`checklist-item-thread-sheet.tsx`) ile simetrik. Web'de sağ detay
 * panelinin "Ekler" sekmesi, mobilde **bottom sheet**; satır ek rozetine
 * dokununca açılır.
 *
 * Gövde `AttachmentsSection`'ı `checklistItemId` scope'u + `chromeless` ile
 * yeniden kullanır — kart eki galerisi/yükleyicisiyle birebir aynı akış (kamera/
 * galeri/dosya seçici, iki-fazlı yükleme, önizleme, silme), yalnız kapak yap/
 * kaldır gizli (madde eki kart kapağı olamaz). Backend `attachment.*`
 * `checklistItemId` opsiyonel parametresini zaten destekler — yeni backend yok.
 *
 * Sheet koşullu mount edilir (üst bileşen yalnız bir madde eki açıkken mount
 * eder); `checklistItemId` daima dolu gelir, `null` yalnız kapanış frame'inde
 * savunmacı olarak ele alınır.
 */
export function ChecklistItemAttachmentSheet({
  visible,
  cardId,
  boardId,
  checklistItemId,
  canEdit,
  currentUserId,
  myBoardRole,
  highlightAttachmentId,
  onClose,
}: ChecklistItemAttachmentSheetProps) {
  return (
    <Sheet visible={visible} title={strings.cardDetail.itemAttachmentsTitle} onClose={onClose}>
      {checklistItemId == null ? null : (
        <AttachmentsSection
          chromeless
          cardId={cardId}
          boardId={boardId}
          checklistItemId={checklistItemId}
          canEdit={canEdit}
          currentUserId={currentUserId}
          myBoardRole={myBoardRole}
          highlightAttachmentId={highlightAttachmentId}
        />
      )}
    </Sheet>
  );
}
