import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

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
 * Oluşturma menüsü bottom sheet. Merkezi "Ekle" butonuna **tek dokunuş** ile
 * `CreateTabButton` bunu açar. Beş satır: hızlı not / kart / liste / pano /
 * workspace. Hızlı not kendi sekmesine (`/(app)/quick-notes`) yönlendirir;
 * diğerleri `(boards)` stack'indeki ilgili oluşturma route'una gider.
 *
 * Mevcut `Sheet` (RN `Modal`) tabanlı — yeni native bağımlılık yok. Bir satıra
 * dokununca sheet kapanır ve hedef route'a `router.push` yapılır.
 */
export function CreateMenuSheet({ visible, onClose }: CreateMenuSheetProps) {
  const router = useRouter();
  const theme = useTheme();

  const items: readonly CreateMenuItem[] = [
    // Hızlı not — hızlı yakalama kısayolu (menünün ilk öğesi). Oluşturma akışı
    // değil, doğrudan Hızlı Notlar sekmesine gider; orada composer hep açık.
    { icon: 'edit-3', label: strings.create.menuQuickNote, href: '/(app)/quick-notes' },
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
