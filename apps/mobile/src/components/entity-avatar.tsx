import { memo } from 'react';
import { View } from 'react-native';
import { Icon } from '@/components/icon';
import { RemoteImage } from '@/components/remote-image';
import { Text } from '@/components/text';
import { avatarColor, avatarInitial } from '@/lib/avatar-color';
import { featherForEntityName } from '@/lib/entity-icon';

type EntityAvatarProps = {
  /** Renk + baş harf bu addan deterministik türetilir. */
  name: string;
  size?: number;
  /** Verilirse profil görseli render edilir; yoksa baş-harf / ikon avatarı. */
  image?: string | null;
  /**
   * Workspace / board ikonu (domain `EntityIcon` adı). Verilirse baş harf
   * yerine entity ikonu çizilir; tanınmayan değer güvenli fallback'e düşer.
   */
  icon?: string | null;
};

/**
 * `image` olmadığında (veya görsel yüklenirken/hatasında) gösterilen avatar:
 * addan deterministik renk + entity ikonu ya da baş harf. `flex-1` ile
 * kapsayıcısını doldurur — hem tek başına hem `RemoteImage` placeholder'ı olarak.
 */
function FallbackAvatar({ name, size, icon }: { name: string; size: number; icon?: string | null }) {
  return (
    <View
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: avatarColor(name) }}
    >
      {icon ? (
        <Icon name={featherForEntityName(icon)} size={Math.round(size * 0.5)} color="#ffffff" />
      ) : (
        <Text weight="semibold" className="text-white" style={{ fontSize: Math.round(size * 0.4) }}>
          {avatarInitial(name)}
        </Text>
      )}
    </View>
  );
}

/**
 * Yuvarlatılmış kare avatar. Öncelik: `image` (profil görseli) → `icon`
 * (workspace/board entity ikonu) → addan deterministik renk + baş harf.
 *
 * `image` verildiğinde görsel `RemoteImage` ile yüklenir: foto inene kadar
 * baş-harf/ikon avatarı placeholder olarak görünür, foto inince yumuşakça
 * belirir (boş kare beklemesi olmaz); yükleme hata verirse placeholder kalıcı
 * kalır (DEM-217).
 */
function EntityAvatarImpl({ name, size = 44, image, icon }: EntityAvatarProps) {
  const fallback = <FallbackAvatar name={name} size={size} icon={icon} />;

  if (image) {
    return (
      <RemoteImage
        uri={image}
        accessibilityLabel={name}
        className="rounded-xl"
        style={{ width: size, height: size }}
        placeholder={fallback}
      />
    );
  }

  return (
    <View className="overflow-hidden rounded-xl" style={{ width: size, height: size }}>
      {fallback}
    </View>
  );
}

/**
 * `React.memo` ile sarılı (DEM-226 #2) — tüm prop'ları primitif (`name`,
 * `size`, `image`, `icon`); kart yüzü / liste satırı yeniden render olsa bile
 * prop'lar aynıysa avatar yeniden çizilmez.
 */
export const EntityAvatar = memo(EntityAvatarImpl);
