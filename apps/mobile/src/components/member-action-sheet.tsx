import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button } from '@/components/button';
import { FormMessage } from '@/components/form-message';
import { RoleSelect } from '@/components/role-select';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';

type RoleOption<T extends string> = {
  value: T;
  label: string;
};

type MemberActionSheetProps<T extends string> = {
  visible: boolean;
  /** Aksiyon menüsü açılan üyenin görünen adı (başlıkta gösterilir). */
  memberName: string;
  /** Atanabilir rol seçenekleri (workspace `admin|member|guest`, board `admin|member|viewer`). */
  roleOptions: readonly RoleOption<T>[];
  /** Üyenin mevcut rolü — rol seçici başlangıç değeri. */
  currentRole: T;
  /** `(role)` ile rol güncelleme mutasyonunu tetikler. Reject → form hatası. */
  onChangeRole: (role: T) => Promise<unknown>;
  /** Üyeyi çıkarma mutasyonunu tetikler. Reject → form hatası. */
  onRemove: () => Promise<unknown>;
  /** Bu üye için herhangi bir mutasyon uçuşta mı (buton kilidi). */
  pending: boolean;
  onClose: () => void;
};

/**
 * DEM-210 — üye satırı aksiyon yüzeyi (`admin+` için). `Sheet` tabanlı bottom
 * sheet: rol seçici + "Rolü güncelle" + "Üyeyi çıkar" (`Alert` onaylı). Rol
 * değiştirme satır-içi `RoleSelect` ile; çıkarma yıkıcı olduğu için native
 * `Alert.alert` ile onaylanır. Mutasyon hatası `FormMessage` ile gösterilir.
 * Devralınan-admin / öz-satır guard'ları çağıran ekranda uygulanır — bu sheet
 * yalnız izinli üyeler için açılır.
 */
export function MemberActionSheet<T extends string>({
  visible,
  memberName,
  roleOptions,
  currentRole,
  onChangeRole,
  onRemove,
  pending,
  onClose,
}: MemberActionSheetProps<T>) {
  const [role, setRole] = useState<T>(currentRole);
  const [formError, setFormError] = useState<string | null>(null);

  // Sheet her açılışta üyenin güncel rolüne sıfırlanır (önceki üyenin seçimi sızmasın).
  useEffect(() => {
    if (visible) {
      setRole(currentRole);
      setFormError(null);
    }
  }, [visible, currentRole]);

  const handleChangeRole = async () => {
    setFormError(null);
    if (role === currentRole) {
      onClose();
      return;
    }
    try {
      await onChangeRole(role);
      onClose();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : strings.members.actionError);
    }
  };

  const handleRemove = () => {
    Alert.alert(
      strings.members.removeConfirmTitle,
      strings.members.removeConfirmMessage,
      [
        { text: strings.invitations.decline, style: 'cancel' },
        {
          text: strings.members.removeConfirm,
          style: 'destructive',
          onPress: () => {
            setFormError(null);
            onRemove()
              .then(() => onClose())
              .catch((caught: unknown) => {
                setFormError(
                  caught instanceof Error ? caught.message : strings.members.actionError,
                );
              });
          },
        },
      ],
      { cancelable: true },
    );
  };

  return (
    <Sheet visible={visible} title={strings.members.actionsSheetTitle} onClose={onClose}>
      <Text weight="semibold" className="text-base text-foreground" numberOfLines={1}>
        {memberName}
      </Text>
      <RoleSelect
        label={strings.members.changeRoleTitle}
        options={roleOptions}
        value={role}
        onChange={setRole}
        disabled={pending}
      />
      {formError ? <FormMessage>{formError}</FormMessage> : null}
      <Button
        label={pending ? strings.members.changeRoleSubmitting : strings.members.changeRoleSubmit}
        onPress={handleChangeRole}
        pending={pending}
      />
      <View className="h-px bg-border" />
      <Button
        label={pending ? strings.members.removing : strings.members.removeMember}
        variant="ghost"
        onPress={handleRemove}
        disabled={pending}
      />
    </Sheet>
  );
}
