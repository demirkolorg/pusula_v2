import { Text, View } from 'react-native';
import { avatarColor, avatarInitial } from '@/lib/avatar-color';

type EntityAvatarProps = {
  /** Renk + baş harf bu addan deterministik türetilir. */
  name: string;
  size?: number;
};

/** Workspace / board için yuvarlatılmış kare avatar (deterministik renk + baş harf). */
export function EntityAvatar({ name, size = 44 }: EntityAvatarProps) {
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
