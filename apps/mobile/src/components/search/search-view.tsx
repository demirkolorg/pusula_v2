import { useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { Text } from '@/components/text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { SearchResultRow } from '@/components/search/search-result-row';
import { groupSearchResults, searchResultTarget } from '@/lib/search-target';
import { strings } from '@/lib/strings';
import { defaultFontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

/** Minimum sorgu uzunluğu — domain `06-arama-kapsami.md`: 2 karakterden önce API çağrılmaz. */
const MIN_QUERY_LENGTH = 2;
/** Maksimum sorgu uzunluğu — `@pusula/domain` `searchQueryInput.query.max(200)` ile hizalı. */
const MAX_QUERY_LENGTH = 200;
/** Debounce penceresi (ms) — web arama diyaloğu (275ms) ile hizalı. */
const DEBOUNCE_MS = 275;
/**
 * Sayfa başına sonuç. `search.query` `cursor` ile sayfalama destekler; mobil
 * MVP tek sayfa gösterir (load-more yok) — 25'ten fazla eşleşmede sorguyu
 * daraltmak kullanıcıya kalır.
 */
const SEARCH_LIMIT = 25;

/** Bir değeri verilen gecikmeyle geciktirir — her tuş vuruşunda API çağrısını önler. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

type SearchViewProps = {
  /** Verilirse arama bu board ile sınırlanır (board içi arama); yoksa global. */
  boardId?: string;
  /** Native header olmayan ekranlarda (global sekme) gösterilen ekran-içi başlık. */
  title?: string;
  /** Ekran açılır açılmaz girişe odaklan (board içi arama ekranı). */
  autoFocus?: boolean;
};

/**
 * Arama deneyiminin ortak gövdesi (Faz 7I) — global sekme ve board içi arama
 * ekranı bunu paylaşır. Faz 6.5 `search.query` procedure'ünü tüketir; permission
 * filtresi zaten server-side (domain `06-arama-kapsami.md`).
 *
 * Arama girişi sabit kalır, sonuçlar altında kayar. 2 karakter altında API
 * çağrılmaz; her sorgu debounce edilir; sonuçlar entity tipine göre gruplanır.
 * Sorgu değişirken önceki sonuçlar (`keepPreviousData`) ekranda korunur.
 */
export function SearchView({ boardId, title, autoFocus = false }: SearchViewProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const theme = useTheme();
  const scope = boardId ? 'board' : 'global';

  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);

  const tooShort = trimmed.length < MIN_QUERY_LENGTH;
  // Debounce penceresi: kullanıcı yazmayı sürdürüyor, sorgu henüz oturmadı.
  const settling = !tooShort && trimmed !== debounced;
  // `ready` → `debounced === trimmed` ve uzunluk >= MIN_QUERY_LENGTH garantili.
  const ready = !tooShort && !settling;

  const search = useQuery(
    trpc.search.query.queryOptions(
      { query: debounced, boardId, limit: SEARCH_LIMIT },
      { enabled: ready, placeholderData: keepPreviousData },
    ),
  );

  // İlk yüklemede (gösterilecek veri yokken) ya da hata sonrası yeniden
  // denemede yükleniyor durumu; `keepPreviousData` sayesinde sorgu değişirken
  // elde veri varsa önceki sonuçlar korunur, ekran "Aranıyor…"a atlamaz.
  const loading = ready && search.isFetching && !search.data;
  const errored = ready && search.isError && !search.isFetching;
  const items = ready && !search.isError ? (search.data?.items ?? []) : [];
  const groups = groupSearchResults(items);
  const empty = ready && !loading && !errored && items.length === 0;

  /** Sonuç hedefine git; board içi aramada aktif board sonucu ise geri dön. */
  const openResult = (result: (typeof items)[number]) => {
    const target = searchResultTarget(result);
    if (!target) return;
    // Board içi aramada board/list/label sonucu zaten bulunulan board'a işaret
    // eder — aynı board'ı stack'e tekrar itmek yerine ona geri dön.
    if (
      boardId &&
      target.pathname === '/boards/[boardId]' &&
      target.params.boardId === boardId
    ) {
      router.back();
      return;
    }
    router.push(target);
  };

  return (
    <View className="flex-1">
      {title ? (
        <Text weight="semibold" className="px-4 pb-3 pt-2 text-2xl text-foreground">
          {title}
        </Text>
      ) : null}

      {/* Arama girişi — sabit; placeholder/imleç rengi tema token'ından. */}
      <View className="mx-4 mb-3 mt-3 flex-row items-center gap-2 rounded-lg border border-border bg-card px-3">
        <Icon name="search" size={18} color={theme.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          autoFocus={autoFocus}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          maxLength={MAX_QUERY_LENGTH}
          placeholder={
            scope === 'board'
              ? strings.search.inputPlaceholderBoard
              : strings.search.inputPlaceholderGlobal
          }
          placeholderTextColor={theme.mutedForeground}
          selectionColor={theme.primary}
          accessibilityLabel={strings.search.inputAccessibilityLabel}
          style={{ fontFamily: defaultFontFamily }}
          className="h-12 flex-1 text-base text-foreground"
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.search.clear}
            hitSlop={8}
            onPress={() => setQuery('')}
            className="active:opacity-60"
          >
            <Icon name="x" size={18} color={theme.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {tooShort ? (
        <EmptyState
          icon="search"
          title={strings.search.promptTitle}
          description={strings.search.promptBody}
        />
      ) : settling || loading ? (
        <EmptyState
          icon="search"
          title={strings.search.loading}
          description={strings.common.loading}
        />
      ) : errored ? (
        <EmptyState
          icon="alert-triangle"
          title={strings.search.errorTitle}
          description={strings.search.errorBody}
        >
          <View className="w-40">
            <Button
              label={strings.common.retry}
              variant="ghost"
              onPress={() => search.refetch()}
            />
          </View>
        </EmptyState>
      ) : empty ? (
        <EmptyState
          icon="search"
          title={strings.search.emptyTitle}
          description={strings.search.emptyBody}
        />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-5 p-4"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={search.isFetching}
              onRefresh={() => search.refetch()}
              tintColor={theme.mutedForeground}
            />
          }
        >
          {groups.map((group) => (
            <View key={group.entityType} className="gap-2">
              <Text
                weight="semibold"
                className="text-xs uppercase text-muted-foreground"
              >
                {strings.search.entityTypes[group.entityType]}
              </Text>
              <View className="gap-2">
                {group.items.map((result) => (
                  <SearchResultRow
                    key={result.id}
                    result={result}
                    scope={scope}
                    onPress={() => openResult(result)}
                  />
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
