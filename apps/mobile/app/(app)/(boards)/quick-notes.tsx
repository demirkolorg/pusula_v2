import { useCallback, useRef, useState } from 'react';
import type { ListRenderItem } from 'react-native';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { Text } from '@/components/text';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { InlineComposer } from '@/components/inline-composer';
import { QuickNoteRow } from '@/components/quick-note-row';
import { ScreenHeader } from '@/components/screen-header';
import { Sheet } from '@/components/sheet';
import { LocationPicker, useLocationPicker } from '@/components/location-picker';
import { Button } from '@/components/button';
import { useQuickNoteMutations, type QuickNote } from '@/lib/use-quick-note-mutations';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

/**
 * Hızlı Notlar ekranı — DEM-203 WP3/WP4 (merkezi "Ekle" butonuna dokununca açılır).
 *
 * Kişisel hızlı-yakalama ekranı: üstte hep-açık `InlineComposer` ile art arda
 * not eklenir, altında notlar yeniden-eskiye `FlatList`'le listelenir. Her satır
 * (`QuickNoteRow`) satır-içi düzenleme, onaylı silme ve "Panoya taşı" sunar.
 *
 * Not→kart dönüşümü (WP4): "Panoya taşı" `LocationPicker`'ı (`depth='list'`) bir
 * `Sheet` içinde açar; workspace→pano→liste seçimi tamamlanınca `convertToCard`
 * tetiklenir, başarılıysa kullanıcı oluşan kartın detayına yönlendirilir. Aynı
 * anda yalnız bir not için picker açıktır — `convertNoteId` state'i tutar.
 *
 * Hızlı Not kişiseldir — rol / `canEdit` gate'i yok; mutation'lar optimistic +
 * rollback (`useQuickNoteMutations`).
 */
export default function QuickNotesScreen() {
  const trpc = useTRPC();
  const theme = useTheme();
  const notesQuery = useQuery(trpc.quickNote.list.queryOptions());
  const mutations = useQuickNoteMutations();
  const { createNote, convertToCard, convertPending } = mutations;
  // `useQuickNoteMutations` her render'da yeni nesne döndürür — satır
  // callback'lerini stabil tutmak için ref üzerinden okuruz (DEM-226 #3).
  const mutationsRef = useRef(mutations);
  mutationsRef.current = mutations;

  // Hangi notun "Panoya taşı" picker'ı açık — aynı anda yalnız bir tane.
  const [convertNoteId, setConvertNoteId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Picker seçimi `depth='list'`'e ulaşınca dönüşümü tetikler. Tüketici picker
  // state'ini doğrudan `LocationPicker`'a geçirir.
  const picker = useLocationPicker('list');

  const closeConvert = useCallback(() => {
    setConvertNoteId(null);
    picker.reset();
  }, [picker]);

  const handleConfirmConvert = useCallback(() => {
    if (!convertNoteId || !picker.selection?.listId || convertPending) return;
    convertToCard(convertNoteId, picker.selection.listId, (card) => {
      closeConvert();
      router.push({ pathname: '/cards/[cardId]', params: { cardId: card.id, title: card.title } });
    });
  }, [convertNoteId, picker.selection, convertPending, convertToCard, closeConvert]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await notesQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [notesQuery]);

  // Not satırı render'ı — `useCallback` ile stabil (DEM-226 #3). Mutation'lar
  // ref'ten okunur; `setConvertNoteId` zaten stabildir.
  const renderNote = useCallback<ListRenderItem<QuickNote>>(
    ({ item }) => (
      <QuickNoteRow
        note={item}
        onUpdate={(content) => mutationsRef.current.updateNote(item.id, content)}
        onDelete={() => mutationsRef.current.deleteNote(item.id)}
        onConvert={() => setConvertNoteId(item.id)}
      />
    ),
    [],
  );

  const screen = <ScreenHeader title={strings.quickNotes.title} />;

  if (notesQuery.isPending) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        {screen}
        <LoadingScreen />
      </SafeAreaView>
    );
  }

  if (notesQuery.isError) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        {screen}
        <EmptyState
          icon="alert-triangle"
          title={strings.common.errorTitle}
          description={strings.quickNotes.loadError}
        >
          <Button label={strings.common.retry} onPress={() => void notesQuery.refetch()} />
        </EmptyState>
      </SafeAreaView>
    );
  }

  const notes = notesQuery.data;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {screen}
      <View className="flex-1">
        {/* Hızlı-ekleme — gönder sonrası açık kalır, art arda not eklenir. */}
        <View className="border-b border-border p-4">
          <InlineComposer
            placeholder={strings.quickNotes.addPlaceholder}
            submitLabel={strings.quickNotes.addSubmit}
            onSubmit={createNote}
            // Hep-açık hızlı-ekleme — kapatılamaz, Vazgeç/x butonu gizlenir.
            hideCancel
            onCancel={() => {}}
          />
        </View>

        <FlatList
          data={notes}
          keyExtractor={(note) => note.id}
          contentContainerClassName="gap-3 p-4"
          // Satır-içi not düzenleme (QuickNoteRow input) klavyenin altında
          // kalmasın — iOS otomatik content-inset (kart detayı [cardId].tsx:320
          // ile aynı desen). Üstteki InlineComposer zaten klavye üstünde.
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={notes.length === 0 ? { flex: 1 } : undefined}
          renderItem={renderNote}
          ListEmptyComponent={
            <EmptyState
              icon="edit-3"
              title={strings.quickNotes.emptyTitle}
              description={strings.quickNotes.emptyDescription}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.mutedForeground}
            />
          }
        />
      </View>

      {/* Not → kart dönüşümü — workspace→pano→liste seçimi. */}
      <Sheet
        visible={convertNoteId !== null}
        title={strings.quickNotes.convertSheetTitle}
        onClose={closeConvert}
      >
        <View className="gap-3">
          <Text className="text-sm text-muted-foreground">
            {strings.quickNotes.convertDescription}
          </Text>
          <LocationPicker {...picker} />
          <Button
            label={strings.quickNotes.convertSubmit}
            onPress={handleConfirmConvert}
            pending={convertPending}
            disabled={!picker.isComplete}
          />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}
