import { useEffect } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { LocationPicker, useLocationPicker } from '@/components/location-picker';
import { strings } from '@/lib/strings';

type MoveCardToBoardSheetProps = {
  visible: boolean;
  /** Seçilen hedef liste id'siyle taşımayı tetikler (kaynak kart context'i çağıranda). */
  onConfirm: (toListId: string) => void;
  onClose: () => void;
  /** Taşıma mutation'ı uçuşta — buton spinner + kilit. */
  pending?: boolean;
};

/**
 * Kartı başka bir panoya (cross-workspace dahil) taşıma sheet'i (2026-07-14) —
 * web'deki `MoveCardToBoardDialog`'un mobil karşılığı. `MoveToListSheet` tek
 * board içinde liste seçerken bu, `LocationPicker` (`depth='list'`) ile çalışma
 * alanı → pano → liste kademeli seçer. Backend `card.moveToList` cross-board'ı
 * zaten destekler (etiketler düşer, üyeler korunur); seçim tamamlanınca çağıran
 * `onConfirm(listId)` ile taşımayı tetikler ve kart detayından çıkar.
 */
export function MoveCardToBoardSheet({
  visible,
  onConfirm,
  onClose,
  pending = false,
}: MoveCardToBoardSheetProps) {
  const picker = useLocationPicker('list');

  // Sheet kapanınca seçimi sıfırla — sonraki açılışta bayat seçim kalmasın.
  useEffect(() => {
    if (!visible) picker.reset();
    // picker.reset referansı stabil (useCallback []) — yalnız görünürlük değişiminde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const listId = picker.selection?.listId;
  const canConfirm = picker.isComplete && Boolean(listId) && !pending;

  return (
    <Sheet visible={visible} title={strings.cardDetail.moveToBoardTitle} onClose={onClose}>
      <View className="gap-4">
        <Text className="text-sm text-muted-foreground">
          {strings.cardDetail.moveToBoardDescription}
        </Text>
        <LocationPicker {...picker} />
        <Button
          label={strings.cardDetail.moveToBoardSubmit}
          onPress={() => {
            if (canConfirm && listId) onConfirm(listId);
          }}
          pending={pending}
          disabled={!canConfirm}
        />
      </View>
    </Sheet>
  );
}
