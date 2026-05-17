import { Image, Text, View } from 'react-native';
import { avatarColor, avatarInitial } from '@/lib/avatar-color';

type EntityAvatarProps = {
  /** Renk + baş harf bu addan deterministik türetilir. */
  name: string;
  size?: number;
  /** Verilirse profil görseli render edilir; yoksa baş-harf avatarı. */
  image?: string | null;
};

/**
 * Yuvarlatılmış kare avatar. `image` verilirse profil görseli, yoksa addan
 * deterministik renk + baş harf. Workspace/board (görselsiz) ve kart/board
 * üyeleri (görselli) için ortak.
 */
export function EntityAvatar({ name, size = 44, image }: EntityAvatarProps) {
  if (image) {
    return (
      <Image
        source={{ uri: image }}
        accessibilityLabel={name}
        className="rounded-xl"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <View
      className="items-center justify-center rounded-xl"
      style={{ width: size, height: size, backgroundColor: avatarColor(name) }}
    >
      <Text className="font-semibold text-white" style={{ fontSize: Math.round(size * 0.4) }}>
        {avatarInitial(name)}
      </Text>
    </View>
  );
}
