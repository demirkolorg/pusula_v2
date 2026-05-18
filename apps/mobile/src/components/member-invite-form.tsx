import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/button';
import { FormMessage } from '@/components/form-message';
import { RoleSelect } from '@/components/role-select';
import { TextField } from '@/components/text-field';
import { strings } from '@/lib/strings';

type RoleOption<T extends string> = {
  value: T;
  label: string;
};

type MemberInviteFormProps<T extends string> = {
  roleOptions: readonly RoleOption<T>[];
  /** Başlangıç rolü (workspace `member`, board `member`). */
  defaultRole: T;
  /** `(email, role)` ile davet mutasyonunu tetikler. Promise reject → form hatası. */
  onInvite: (email: string, role: T) => Promise<void>;
  pending: boolean;
};

/** `@` içeren ve nokta ayraçlı, basit istemci-tarafı e-posta ön kontrolü. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Üye davet etme satır-içi formu — workspace ve board üye ekranlarında ortak.
 * E-posta `TextField` + rol `RoleSelect` + gönder `Button`. Asıl doğrulama
 * backend'de (`emailSchema`); buradaki kontrol yalnız erken geri bildirim.
 * Başarı/akış mesajları ekran tarafından `successMessage` ile gösterilir.
 */
export function MemberInviteForm<T extends string>({
  roleOptions,
  defaultRole,
  onInvite,
  pending,
}: MemberInviteFormProps<T>) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<T>(defaultRole);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = email.trim();
    setFormError(null);
    if (!trimmed) {
      setFieldError(strings.members.inviteEmailRequired);
      return;
    }
    if (!looksLikeEmail(trimmed)) {
      setFieldError(strings.members.inviteEmailInvalid);
      return;
    }
    setFieldError(null);
    try {
      await onInvite(trimmed, role);
      // Başarı: alanı temizle, rolü başlangıca döndür.
      setEmail('');
      setRole(defaultRole);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : strings.invitations.actionError);
    }
  };

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-3">
      <TextField
        label={strings.members.inviteEmailLabel}
        placeholder={strings.members.inviteEmailPlaceholder}
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (fieldError) setFieldError(null);
        }}
        error={fieldError ?? undefined}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        editable={!pending}
        returnKeyType="send"
        onSubmitEditing={handleSubmit}
      />
      <RoleSelect
        label={strings.members.inviteRoleLabel}
        options={roleOptions}
        value={role}
        onChange={setRole}
        disabled={pending}
      />
      {formError ? <FormMessage>{formError}</FormMessage> : null}
      <Button
        label={pending ? strings.members.inviteSubmitting : strings.members.inviteSubmit}
        onPress={handleSubmit}
        pending={pending}
      />
    </View>
  );
}
