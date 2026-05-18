import { View } from 'react-native';
import { Text } from '@/components/text';
import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { usePushTokenRegistration } from '@/lib/use-push-token-registration';
import { strings } from '@/lib/strings';

/**
 * Faz 7L — push izni priming (pre-prompt) Sheet'i.
 *
 * 7K'da push izni login sonrası **doğrudan** OS dialog'uyla isteniyordu; 7L bunu
 * cilalı bir ön-istem ekranıyla değiştirir. İzin `undetermined` + `canAskAgain`
 * ise `usePushTokenRegistration` `showPrimer` döndürür ve bu Sheet açılır:
 * bildirimin ne işe yaradığını (atama / yorum / mention / son tarih) anlatır.
 *
 * - "İzin ver" → OS `requestPermissionsAsync` tetiklenir, izin verilirse token
 *   kaydı koşar (7K akışı).
 * - "Şimdi değil" → Sheet kapanır, OS dialog'u hiç açılmaz (oturum başına bir kez).
 *
 * `AppShell`'de mount edilir; izin zaten verilmiş/`denied` ise hiç görünmez.
 */
export function PushPermissionPrimer() {
  const { showPrimer, onPrimerAllow, onPrimerDismiss } = usePushTokenRegistration();

  return (
    <Sheet visible={showPrimer} title={strings.push.primerTitle} onClose={onPrimerDismiss}>
      <Text className="text-sm text-muted-foreground">{strings.push.primerBody}</Text>
      <View className="gap-2 pt-1">
        <Button label={strings.push.primerAllow} onPress={onPrimerAllow} />
        <Button label={strings.push.primerDismiss} variant="ghost" onPress={onPrimerDismiss} />
      </View>
    </Sheet>
  );
}
