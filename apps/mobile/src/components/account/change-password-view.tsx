import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { changePasswordInput } from '@pusula/domain';
import { authClient } from '@/lib/auth-client';
import { authErrorMessage } from '@/lib/auth-errors';
import { Button } from '@/components/button';
import { FormMessage } from '@/components/form-message';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { strings } from '@/lib/strings';

export interface ChangePasswordViewProps {
  /**
   * Başarı ekranındaki "Kapat" eylemiyle çağrılır. Telefonda route sarmalayıcısı
   * `router.back()` verir; tablet hesap detail pane'inde gömülü kullanımda
   * verilmezse "Kapat" başarı durumunu sıfırlayıp formu yeniden gösterir.
   */
  onDone?: () => void;
  /**
   * `SecurityView` içinde gömülü kullanım — dış `ScrollView` + kart padding'i
   * sağlandığından kendi `ScrollView`/arka planını kurmaz, salt form gövdesini
   * döner. Başarı ekranı da ortalama yerine akış içinde kompakt gösterilir.
   */
  embedded?: boolean;
}

/**
 * Şifre değiştir görünümü (DEM-208) — yeni tRPC yok: doğrudan Better Auth
 * `authClient.changePassword` (DEM-55/DEM-68 kararı). Mevcut şifreyi doğrular,
 * `revokeOtherSessions: true` ile diğer cihaz oturumlarını kapatır. Giriş
 * `@pusula/domain` `changePasswordInput` ile doğrulanır (web hesap ekranı
 * sözleşmesiyle aynı kural — mevcut şifre dolu, yeni şifre 8..128 + eskisinden
 * farklı). "Yeni şifre (tekrar)" eşleşmesi şemada yok — istemci-tarafı ek kontrol.
 *
 * Faz 15C tablet master-detail (DEM-303 V2): hem `(account)/change-password`
 * route'unda hem tablet hesap detail pane'inde kullanılır.
 */
export function ChangePasswordView({ onDone, embedded = false }: ChangePasswordViewProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [currentError, setCurrentError] = useState<string | undefined>(undefined);
  const [nextError, setNextError] = useState<string | undefined>(undefined);
  const [confirmError, setConfirmError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const handleSave = async () => {
    setCurrentError(undefined);
    setNextError(undefined);
    setConfirmError(undefined);
    setFormError(null);

    const parsed = changePasswordInput.safeParse({
      currentPassword: current,
      newPassword: next,
    });
    let valid = parsed.success;
    if (!parsed.success) {
      // Şema hatalarını ilgili alana yaz (`currentPassword` / `newPassword`).
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'currentPassword') setCurrentError(issue.message);
        else if (field === 'newPassword') setNextError(issue.message);
      }
    }
    // "Yeni şifre (tekrar)" eşleşmesi domain şemasında yok — istemci-tarafı kontrol.
    if (confirm !== next) {
      setConfirmError(strings.changePassword.mismatch);
      valid = false;
    }
    if (!valid) return;

    setPending(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        // Diğer cihazların oturumları kapatılır — şifre değişiminde güvenli varsayılan.
        revokeOtherSessions: true,
      });
      if (error) {
        setFormError(authErrorMessage(error));
        setPending(false);
        return;
      }
      // Başarı: `pending`'i bırak. Telefonda "Kapat" → router.back ekranı söker;
      // tablet gömülü modda `handleClose` formu sıfırlar ve aynı pane'de yeniden
      // şifre değiştirilebilir — pending takılı kalmamalı (aksi halde buton kilitli).
      setPending(false);
      setDone(true);
    } catch (caught) {
      setFormError(authErrorMessage(caught));
      setPending(false);
    }
  };

  /** Başarı ekranındaki "Kapat" — route'ta geri döner; gömülü kullanımda formu sıfırlar. */
  const handleClose = () => {
    if (onDone) {
      onDone();
      return;
    }
    // Gömülü (tablet) kullanımda geri gidilecek yer yok — formu temiz başa al.
    setDone(false);
    setCurrent('');
    setNext('');
    setConfirm('');
  };

  if (done) {
    // Gömülü modda akış içinde kompakt; route modunda tam ekran ortalı.
    if (embedded) {
      return (
        <View className="gap-4">
          <Text weight="semibold" className="text-base text-foreground">
            {strings.changePassword.success}
          </Text>
          <Button label={strings.common.close} variant="ghost" onPress={handleClose} />
        </View>
      );
    }
    return (
      <View className="flex-1 justify-center gap-5 bg-background p-4">
        <Text weight="semibold" className="text-center text-base text-foreground">
          {strings.changePassword.success}
        </Text>
        <Button label={strings.common.close} variant="ghost" onPress={handleClose} />
      </View>
    );
  }

  const form = (
    <>
      <Text className="text-sm text-muted-foreground">{strings.changePassword.description}</Text>

      <TextField
        label={strings.changePassword.currentLabel}
        value={current}
        onChangeText={setCurrent}
        error={currentError}
        placeholder={strings.changePassword.currentPlaceholder}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
      />
      <TextField
        label={strings.changePassword.newLabel}
        value={next}
        onChangeText={setNext}
        error={nextError}
        placeholder={strings.changePassword.newPlaceholder}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <TextField
        label={strings.changePassword.confirmLabel}
        value={confirm}
        onChangeText={setConfirm}
        error={confirmError}
        placeholder={strings.changePassword.confirmPlaceholder}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={handleSave}
      />

      {formError ? <FormMessage>{formError}</FormMessage> : null}

      <Button
        label={strings.changePassword.save}
        onPress={handleSave}
        pending={pending}
        disabled={pending}
      />
    </>
  );

  if (embedded) {
    return <View className="gap-5">{form}</View>;
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-4">
      {form}
    </ScrollView>
  );
}
