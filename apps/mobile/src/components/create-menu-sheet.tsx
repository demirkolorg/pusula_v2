import { Pressable, View, useColorScheme } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type CreateMenuSheetProps = {
  visible: boolean;
  onClose: () => void;
};

type CreateMenuItem = {
  icon: IconName;
  label: string;
  href: Href;
};

/**
 * Oluşturma menüsü bottom sheet — DEM-203. Merkezi "Ekle" butonuna uzun
 * basınca `CreateTabButton` bunu açar. Dört satır: kart / liste / pano /
 * workspace oluşturma akışları (her biri `(boards)` stack'inde bir route).
 *
 * Mevcut `Sheet` (RN `Modal`) tabanlı — yeni native bağımlılık yok (7G-2
 * deseni). Bir satıra dokununca sheet kapanır ve ilgili create route'una
 * `router.push` yapılır.
 */
export function CreateMenuSheet({ visible, onClose }: CreateMenuSheetProps) {
  const router = useRouter();
  const theme = themeFor(useColorScheme());

  const items: readonly CreateMenuItem[] = [
    { icon: 'plus-square', label: strings.create.menuCard, href: '/(app)/(boards)/create-card' },
    { icon: 'list', label: strings.create.menuList, href: '/(app)/(boards)/create-list' },
    { icon: 'trello', label: strings.create.menuBoard, href: '/(app)/(boards)/create-board' },
    {
      icon: 'grid',
      label: strings.create.menuWorkspace,
      href: '/(app)/(boards)/create-workspace',
    },
  ];

  const handleSelect = (href: Href) => {
    // Önce kapat, sonra yönlendir — sheet kapanma animasyonu push ile çakışmaz.
    onClose();
    router.push(href);
  };

  return (
    <Sheet visible={visible} title={strings.create.menuTitle} onClose={onClose}>
      <View className="gap-2">
        {items.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => handleSelect(item.href)}
            className="flex-row items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 active:opacity-70"
          >
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Icon name={item.icon} size={18} color={theme.primary} />
            </View>
            <Text weight="medium" className="flex-1 text-base text-foreground">
              {item.label}
            </Text>
            <Icon name="chevron-right" size={18} color={theme.mutedForeground} />
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
