/**
 * Kontrol listesi maddesi sürükle-bırak veri şekilleri + tip korumaları (DEM —
 * web checklist item reorder). Pragmatic DnD payload'ları düz
 * `Record<string|symbol, unknown>` taşır; bunlar payload'u etiketleyip
 * `monitorForElements`/`canDrop`'ta tip-güvenli ayırmayı sağlar. Sıralama tek
 * checklist içindedir: `checklistId` her payload'da taşınır ve yalnız aynı
 * checklist'in maddeleri birbirine drop hedefi olur (cross-checklist taşıma
 * kapsam dışı).
 */
import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';

/** `getInitialData` payload — sürüklenebilir bir checklist maddesi. */
export type ChecklistItemDragData = {
  type: 'checklist-item';
  checklistId: string;
  itemId: string;
  position: string;
  /**
   * İç içe madde ebeveyni (kök için `null`). Reorder yalnız AYNI seviyede
   * (aynı `parentItemId`) — sürükleme ebeveyni/derinliği değiştirmez; farklı
   * seviyedeki maddeler drop hedefi olmaz.
   */
  parentItemId: string | null;
};

/** `getData` payload — bir checklist maddesi drop hedefi (maddelerin kendisi). */
export type ChecklistItemDropData = {
  type: 'checklist-item';
  checklistId: string;
  itemId: string;
  position: string;
  /** Bkz. {@link ChecklistItemDragData.parentItemId} — aynı-seviye drop kısıtı. */
  parentItemId: string | null;
};

export function isChecklistItemDragData(
  data: Record<string | symbol, unknown>,
): data is ChecklistItemDragData {
  return (
    data.type === 'checklist-item' &&
    typeof data.checklistId === 'string' &&
    typeof data.itemId === 'string'
  );
}

export function isChecklistItemDropData(
  data: Record<string | symbol, unknown>,
): data is ChecklistItemDropData {
  return (
    data.type === 'checklist-item' &&
    typeof data.checklistId === 'string' &&
    typeof data.itemId === 'string'
  );
}

export type { Edge };
