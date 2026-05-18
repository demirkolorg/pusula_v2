import { Pressable, View, useColorScheme } from 'react-native';
import type { RouterOutputs } from '@pusula/api';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { themeFor } from '@/theme/tokens';

/** `search.query` çıktısındaki tek sonuç (router sözleşmesinden türetilir). */
export type SearchResultItem = RouterOutputs['search']['query']['items'][number];

type SearchScope = 'global' | 'board';

type SearchResultRowProps = {
  result: SearchResultItem;
  /** Global aramada bağlam workspace+board taşır; board içi aramada sadeleşir. */
  scope: SearchScope;
  onPress: () => void;
};

/** Entity tipi → Feather ikonu (web `lucide-react` ile görsel dil tutarlı). */
const ENTITY_ICON: Record<SearchResultItem['entityType'], IconName> = {
  board: 'trello',
  list: 'list',
  card: 'credit-card',
  comment: 'message-square',
  attachment: 'paperclip',
  label: 'tag',
};

/**
 * Sonuç satırı bağlam metni — sonucun nerede olduğunu gösterir.
 *
 * Global aramada workspace + board adı görünür (domain `06-arama-kapsami.md`:
 * "global aramada workspace bağlamı görünür olmalı"). Board içi aramada board
 * adı tekrarlanmaz; yalnız yorum/ek için bağlı kart adı gösterilir.
 */
function resultContext(result: SearchResultItem, scope: SearchScope): string {
  const onCard = result.entityType === 'comment' || result.entityType === 'attachment';
  // Board içi aramada board adı tekrarlanmaz; yalnız yorum/ek bağlı kartı taşır.
  if (scope === 'board') {
    return onCard ? (result.cardTitle ?? '') : '';
  }
  return [result.workspaceTitle, result.boardTitle, onCard ? result.cardTitle : null]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

/**
 * Arama sonucu satırı — entity ikonu + başlık + düz-metin snippet + bağlam.
 * Snippet API'den düz metin gelir (HTML yok — domain `06-arama-kapsami.md`).
 */
export function SearchResultRow({ result, scope, onPress }: SearchResultRowProps) {
  const theme = themeFor(useColorScheme());
  const snippet = result.snippet.trim();
  const context = resultContext(result, scope);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 active:opacity-70"
    >
      <View className="mt-0.5 h-8 w-8 items-center justify-center rounded-lg bg-muted">
        <Icon name={ENTITY_ICON[result.entityType]} size={15} color={theme.mutedForeground} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text weight="semibold" className="text-sm text-foreground" numberOfLines={1}>
          {result.title}
        </Text>
        {snippet ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={2}>
            {snippet}
          </Text>
        ) : null}
        {context ? (
          <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
            {context}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-right" size={18} color={theme.mutedForeground} />
    </Pressable>
  );
}
