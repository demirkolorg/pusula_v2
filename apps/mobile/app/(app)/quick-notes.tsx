import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ListRenderItem } from 'react-native';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { Text } from '@/components/text';
import { EmptyState } from '@/components/empty-state';
import { LoadingScreen } from '@/components/loading-screen';
import { QuickNoteDockView } from '@/components/quick-note-dock-view';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { QuickNoteRow } from '@/components/quick-note-row';
import { ScreenHeader } from '@/components/screen-header';
import { Sheet } from '@/components/sheet';
import { LocationPicker, useLocationPicker } from '@/components/location-picker';
import { Button } from '@/components/button';
import { useQuickNoteMutations, type QuickNote } from '@/lib/use-quick-note-mutations';
import { useIsTablet } from '@/lib/use-device-class';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

/**
 * Hızlı Notlar ekranı — alt-bar sekmesi (`app/(app)/quick-notes.tsx`, `edit-3`
 * ikonu). Önceden `(boards)` grubundaydı ve yalnız merkezi "+" butonundan
 * açılırdı; kendi sekmesine taşındı (kullanıcı kararı). Merkezi "+" menüsünde
 * de "Hızlı not" kısayolu buraya yönlendirir.
 *
 * Kişisel hızlı-yakalama ekranı — WhatsApp benzeri "Saved Messages" düzeni:
 * notlar sohbet baloncuğu olarak listelenir (en eski üstte, **en yeni en
 * altta** — composer'ın hemen üstünde). `notesQuery` yeniden→eskiye döndürür,
 * ekranda eskiden→yeniye göstermek için `ordered` ile ters çevrilir. Yeni not
 * eklenince ve klavye açılınca liste otomatik dibe kayar (`scrollToEnd`). Metin
 * yazma çubuğu (`QuickNoteDockView`) ekranın **dibinde** durur. Her satır
 * (`QuickNoteRow`) baloncuğa dokununca düzenleme, onaylı silme ve "Panoya taşı"
 * sunar.
 *
 * Klavye yönetimi: tüm gövde `KeyboardAvoidingView` içinde — klavye açılınca
 * dipteki yazma çubuğu (ve satır-içi düzenleme alanı) klavyenin üstüne çıkar
 * (tab bar `tabBarHideOnKeyboard:true` ile zaten gizlenir).
 *
 * Tablet (`useIsTablet`): geniş ekranda sohbet sütunu ortalanır (`max-w-2xl`)
 * — baloncuklar/çubuk tüm genişliğe yayılıp seyrelmez. Ayrıca tablet'te tab bar
 * **floating pill** olduğundan (içeriğin üstünde yüzer) dipteki çubuğa pill'i
 * aşacak alt boşluk verilir; klavye açıkken pill gizlendiği için boşluk daralır.
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
  const isTablet = useIsTablet();
  const insets = useSafeAreaInsets();
  const notesQuery = useQuery(trpc.quickNote.list.queryOptions());
  const mutations = useQuickNoteMutations();
  const { createNote, convertToCard, convertPending } = mutations;
  // `useQuickNoteMutations` her render'da yeni nesne döndürür — satır
  // callback'lerini stabil tutmak için ref üzerinden okuruz (DEM-226 #3).
  const mutationsRef = useRef(mutations);
  mutationsRef.current = mutations;

  // Mesajlaşma düzeni: en eski üstte, en yeni en altta. `notesQuery` yeniden→
  // eskiye döner; ekranda eskiden→yeniye göstermek için ters çeviririz.
  const ordered = useMemo<QuickNote[]>(
    () => (notesQuery.data ? [...notesQuery.data].reverse() : []),
    [notesQuery.data],
  );

  // Hangi notun "Panoya taşı" picker'ı açık — aynı anda yalnız bir tane.
  const [convertNoteId, setConvertNoteId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Klavye görünür mü — dipteki çubuğun alt boşluğu (tablet pill payı) klavye
  // açıkken daralır; ayrıca klavye açılınca dibe kaymayı tetikler.
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // Hızlı-ekleme taslağı — anasayfa dock'uyla aynı sunum (`QuickNoteDockView`)
  // kullanıldığı için taslak state'i bu ekran tutar (dock kendi context'inde
  // tutuyordu). Gönder sonrası temizlenir, alan açık kalır.
  const [draft, setDraft] = useState('');

  const handleAddNote = () => {
    const text = draft.trim();
    if (!text) return;
    createNote(text);
    setDraft('');
  };

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

  const listRef = useRef<FlatList<QuickNote>>(null);

  // Bir satır düzenlemede mi — klavye açılınca dibe kaymayı (composer odağı)
  // satır-içi düzenleme odağından ayırmak için. Düzenlemede dibe değil,
  // düzenlenen satıra kaydırılır.
  const editingRef = useRef(false);

  const scrollToBottom = useCallback((animated: boolean) => {
    listRef.current?.scrollToEnd({ animated });
  }, []);

  // Satır-içi düzenleme açılınca düzenlenen satırı görünür alanın ortasına
  // kaydır — `KeyboardAvoidingView` alanı klavye üstüne çıkarır ama listenin
  // ortasındaki bir satır düzenlenirse onu da görünür kılmak gerekir.
  const scrollEditingIntoView = useCallback((index: number) => {
    listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
  }, []);

  // Yeni not eklenince (sayı artınca) ve ilk yüklemede dibe in. Düzenleme/silme
  // (sayı değişmez/azalır) dibe çekmez — kullanıcı geçmişi okurken zıplamasın.
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (ordered.length > prevCountRef.current) {
      const firstLoad = prevCountRef.current === 0;
      requestAnimationFrame(() => scrollToBottom(!firstLoad));
    }
    prevCountRef.current = ordered.length;
  }, [ordered.length, scrollToBottom]);

  // Klavye açılınca: composer'a yazılıyorsa dibe in (en yeni not görünsün).
  // Satır-içi düzenleme açıksa karışma — o akış kendi satırına kaydırır.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
      if (!editingRef.current) requestAnimationFrame(() => scrollToBottom(true));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [scrollToBottom]);

  // Not satırı render'ı — `useCallback` ile stabil (DEM-226 #3). Mutation'lar
  // ref'ten okunur; `setConvertNoteId` zaten stabildir.
  const renderNote = useCallback<ListRenderItem<QuickNote>>(
    ({ item, index }) => (
      <QuickNoteRow
        note={item}
        onUpdate={(content) => mutationsRef.current.updateNote(item.id, content)}
        onDelete={() => mutationsRef.current.deleteNote(item.id)}
        onConvert={() => setConvertNoteId(item.id)}
        onEditingChange={(editing) => {
          editingRef.current = editing;
          if (editing) scrollEditingIntoView(index);
        }}
      />
    ),
    [scrollEditingIntoView],
  );

  const screen = <ScreenHeader title={strings.quickNotes.title} right={<NotificationBell />} />;

  if (notesQuery.isPending) {
    // İlk yükleme — başlık (özet henüz yok) + spinner.
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

  // Dipteki çubuğun alt boşluğu: tablet'te floating pill içeriğin üstünde yüzer
  // (`absolute, bottom: insets.bottom+12`), çubuk onun altında kalmasın diye
  // pill yüksekliği + güvenli alan kadar yukarı itilir. Klavye açıkken pill
  // gizlenir → boşluk küçülür. Phone'da default tab bar zaten yer ayırır.
  const composerPaddingBottom = keyboardVisible ? 8 : isTablet ? insets.bottom + 76 : 8;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {/* Başlık + not sayısı özeti (0 notta özet gizli). */}
      <ScreenHeader
        title={strings.quickNotes.title}
        subtitle={
          ordered.length > 0 ? `${ordered.length} ${strings.quickNotes.countSuffix}` : undefined
        }
        right={<NotificationBell />}
      />
      {/* WhatsApp düzeni: notlar üstte (en yeni en altta), yazma çubuğu dipte.
          `KeyboardAvoidingView` klavye açılınca çubuğu/düzenleme alanını klavye
          üstüne taşır. Tablet'te sohbet sütunu ortalanır (max-w-2xl) — geniş
          ekranda baloncuk/çubuk tüm genişliğe yayılıp seyrelmesin. */}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Tam genişlik — tablette ortalanmış dar sütun iki yanda ölü boşluk
            bırakıyordu (kullanıcı geri bildirimi). Sohbet baloncukları zaten
            sağa yaslı; liste `p-4` / çubuk `px-4` yatay nefesi verir. */}
        <View className="flex-1">
          <FlatList
            ref={listRef}
            data={ordered}
            keyExtractor={(note) => note.id}
            contentContainerClassName="gap-3 p-4"
            // Boş durumda `EmptyState` dikeyde ortalansın diye içerik alanı esner.
            contentContainerStyle={ordered.length === 0 ? { flexGrow: 1 } : undefined}
            keyboardShouldPersistTaps="handled"
            // Virtualization'da hedef satır henüz ölçülmediyse scrollToIndex hata
            // verir; kısa gecikmeyle yeniden dener (düzenlenen satır pratikte
            // görünür olduğundan nadir yol).
            onScrollToIndexFailed={({ index }) => {
              setTimeout(() => {
                listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
              }, 60);
            }}
            renderItem={renderNote}
            ListEmptyComponent={
              <View className="flex-1 justify-center">
                <EmptyState
                  icon="edit-3"
                  tone="primary"
                  title={strings.quickNotes.emptyTitle}
                  description={strings.quickNotes.emptyDescription}
                >
                  <Text className="text-center text-xs text-muted-foreground">
                    {strings.quickNotes.emptyHint}
                  </Text>
                </EmptyState>
              </View>
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={theme.mutedForeground}
              />
            }
          />

          {/* Dipteki yazma çubuğu — anasayfa dock'uyla aynı sunum (tek satır +
              yuvarlak gönder). Üst kenarlık listeden ayırır; gönder sonrası açık
              kalır, art arda not eklenir. */}
          <View
            className="border-t border-border px-4 pt-2"
            style={{ paddingBottom: composerPaddingBottom }}
          >
            <QuickNoteDockView
              value={draft}
              onChangeText={setDraft}
              onSubmit={handleAddNote}
              canSubmit={draft.trim().length > 0}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

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
