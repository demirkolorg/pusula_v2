import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { authClient } from '@/lib/auth-client';
import { Text } from '@/components/text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { CardCoverImage } from '@/components/card-cover-image';
import { Icon } from '@/components/icon';
import { InlineComposer } from '@/components/inline-composer';
import { LoadingScreen } from '@/components/loading-screen';
import { ScreenHeader } from '@/components/screen-header';
import { isPendingId } from '@/lib/client-mutation-id';
import { useCardMutations } from '@/lib/use-card-mutations';
import { useFloatingNavInset } from '@/lib/use-floating-nav-inset';
import { useIsTablet } from '@/lib/use-device-class';
import { asCoverColor, coverColorHex } from '@/lib/cover-color';
import { DetailSection, SectionBadge } from '@/components/card-detail/section';
import { DescriptionChecklistTabs } from '@/components/card-detail/description-checklist-tabs';
import { CardMetaBar } from '@/components/card-detail/meta-bar';
import { CardCompleteToggle } from '@/components/card-detail/complete-toggle';
import { CardActionsSheet } from '@/components/card-detail/card-actions-sheet';
import { MoveCardToBoardSheet } from '@/components/card-detail/move-to-board-sheet';
import { CardDetailHeaderTitle } from '@/components/card-detail/header-title';
import { AttachmentsSection } from '@/components/card-detail/attachments-section';
import { CommentList, type AuthorResolver } from '@/components/card-detail/comment-list';
import { CommentComposer } from '@/components/card-detail/comment-composer';
import { ActivityList } from '@/components/card-detail/activity-list';
import { ScrollHighlightProvider } from '@/components/card-detail/scroll-highlight';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

/**
 * Kart detay ekranı (Faz 7G — tam etkileşim). Faz 7F salt-okunur görünümünü
 * düzenleme aksiyonlarıyla genişletir: açıklama düz-metin düzenleme, etiket /
 * üye / son tarih ekle-çıkar, checklist madde işaretle/ekle/sil, yorum yazma.
 * Tüm yazma işlemleri collaborative mutation — optimistic UI + rollback +
 * `clientMutationId` (alt bileşenlerde). Düzenleme yetkisi (`canEdit`) board
 * `member+` rolüne bağlı; rol `board.members.list`'ten çözümlenir (web kart
 * modalı simetrisi — çözülene dek `viewer` varsayılır, salt-okunur).
 *
 * Faz 7H başlık düzenlemeyi (`card.update`) ve "move to list" picker'ı
 * (`card.moveToList`) ekler — `useCardMutations` ile optimistic + rollback.
 *
 * Faz 7G-2 etiket / son tarih / üye düzenleyicilerini ekranı uzatan tam-genişlik
 * bölümlerden başlık altındaki kompakt `CardMetaBar`'a taşır — her chip durumu
 * özetler, dokununca düzenleme bottom sheet'te yapılır. "Listeyi değiştir"
 * butonu da meta çubuğundaki "Liste" chip'i olur.
 *
 * DEM-196 başlık yanı ⋮ menüsünü (`CardActionsSheet`) ekler — kartı onayla
 * arşivleme; arşivleme sonrası board ekranına geri navigasyon.
 *
 * DEM-204 düz akan bölümleri `bg-muted` zemin üzerine oturan `bg-card` bölüm
 * kartlarına dönüştürür: başlık + meta çubuğu tek bir "header card"ta toplanır,
 * her bölüm (`DetailSection`) kart yüzeyinde + başlığında özet rozeti taşır.
 */
export default function CardDetailScreen() {
  const params = useLocalSearchParams<{
    cardId: string;
    title?: string;
    // Madde yorum thread'ini açar (comment-on-checklist-item bildirimleri).
    checklistItemId?: string;
    // Checklist maddesini scroll + flash vurgular (toggle/add bildirimleri).
    highlightItemId?: string;
    // Yorum listesinde o yorumu scroll + flash vurgular.
    commentId?: string;
    // Ekler listesinde o dosyayı scroll + flash vurgular.
    attachmentId?: string;
  }>();
  const cardId = params.cardId;
  const trpc = useTRPC();
  const theme = useTheme();
  // Tablet floating pill nav son içeriği (yorum composer'ı, aktivite, +ekle)
  // örtmesin → scroll içeriğine alt boşluk (phone'da 0 → taban 16 korunur).
  const navInset = useFloatingNavInset();
  // Tablet'te Yorumlar + Aktivite yan-yana 2 sütun; telefonda alt-alta.
  const isTablet = useIsTablet();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user.id;
  const enabled = Boolean(cardId);

  const cardQuery = useQuery(trpc.card.get.queryOptions({ cardId }, { enabled }));
  const labelsQuery = useQuery(trpc.card.labels.list.queryOptions({ cardId }, { enabled }));
  const membersQuery = useQuery(trpc.card.members.list.queryOptions({ cardId }, { enabled }));
  const checklistsQuery = useQuery(trpc.checklist.list.queryOptions({ cardId }, { enabled }));
  const commentsQuery = useQuery(trpc.comment.list.queryOptions({ cardId }, { enabled }));
  const activityQuery = useQuery(trpc.card.activity.list.queryOptions({ cardId }, { enabled }));

  // Pano üye listesi — hem kart üyesi aday havuzu hem çağıranın board rolü
  // (düzenleme yetkisi). `boardId` ancak kart yüklenince bilinir.
  const boardId = cardQuery.data?.card.boardId;
  const boardMembersQuery = useQuery(
    trpc.board.members.list.queryOptions(
      { boardId: boardId ?? '' },
      { enabled: Boolean(boardId) },
    ),
  );
  // Board verisi — "move to list" picker'ı için aktif liste havuzu (Faz 7H).
  const boardQuery = useQuery(
    trpc.board.get.queryOptions({ boardId: boardId ?? '' }, { enabled: Boolean(boardId) }),
  );

  // Faz 7H — başlık düzenleme + "move to list" mutation'ları.
  const cardMutations = useCardMutations(cardId, boardId ?? '');
  const [editingTitle, setEditingTitle] = useState(false);
  // DEM-196 — başlık yanı ⋮ "Kart işlemleri" bottom sheet'i.
  const [actionsOpen, setActionsOpen] = useState(false);
  // Kartı başka panoya taşıma sheet'i (2026-07-14).
  const [moveToBoardOpen, setMoveToBoardOpen] = useState(false);

  // DEM-196 — kartı arşivle: `Alert` ile onayla, optimistic mutation tetikle,
  // board ekranına geri dön (arşivlenen kart board görünümünde görünmez).
  function handleArchive() {
    setActionsOpen(false);
    Alert.alert(strings.cardDetail.archiveConfirmTitle, strings.cardDetail.archiveConfirmBody, [
      { text: strings.common.cancel, style: 'cancel' },
      {
        text: strings.cardDetail.archiveConfirmAction,
        style: 'destructive',
        onPress: () => {
          cardMutations.archive();
          router.back();
        },
      },
    ]);
  }

  // Kartı başka panoya taşı (2026-07-14) — `card.moveToList` cross-board
  // destekli; optimistic mutation tetiklenir ve board ekranına dönülür (kart
  // artık kaynak panoda değil; `onSettled` board invalidate'i tazeler).
  function handleMoveToBoard(toListId: string) {
    setMoveToBoardOpen(false);
    cardMutations.moveToList(toListId);
    router.back();
  }

  // Faz 7G-3 — collapsing nav başlığı: gövdedeki büyük kart başlığı yukarı
  // kayınca nav bar liste adından kart başlığına geçer (üst nav ↔ gövde metin
  // tekrarını giderir). `titleThreshold` gövde başlık bloğunun ölçülen alt
  // kenarı; scroll bu eşiği geçince `collapsed` 1 kez döner — scroll boyunca
  // ekran yeniden render olmaz.
  //
  // DEM-228 — scroll dinleme `useAnimatedScrollHandler` ile UI-thread'inde
  // yapılır (eski JS `onScroll` yerine; her scroll frame'inde JS köprüsü
  // geçilmez). Eşik geçişi UI-thread'inde tespit edilir, yalnız değer
  // değişince `runOnJS` ile `setCollapsed` çağrılır — React render'ı yine
  // yalnız 1 kez tetiklenir.
  const [titleThreshold, setTitleThreshold] = useState(96);
  // Checklist madde sürükleme (sortable) aktifken dış scroll kilitlenir —
  // dikey drag pan'i dış `ScrollView` scroll'uyla çakışmasın.
  const [checklistDragging, setChecklistDragging] = useState(false);
  // Dış scroll'un animated ref'i — sortable'ın dikey uzun-bas Pan'ı bu ref ile
  // `simultaneousWithExternalGesture` üzerinden koordine edilir. Bu olmadan
  // native dikey scroll, long-press Pan'ın aktivasyonunu yutuyordu (madde hiç
  // kalkmıyordu); ref ile Pan + scroll aynı anda tanınır, long-press eşiği
  // geçilince `checklistDragging` scroll'u kilitler.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // Reduced-motion (Reanimated / OS erişilebilirlik) — deep-link scroll'u
  // `animated:false` ile anında konumlanır (§20.11; flash bileşen-bazında zaten
  // kısar). Provider'a iletilir.
  const reduceMotion = useReducedMotion();
  // Bildirim deep-link'iyle gelinen TEK vurgu hedefi (scroll + flash). Bir
  // bildirim tipine göre bu param'lardan yalnız biri set olur; öncelik sırası
  // çok-param savunması (normalde tek gelir). `checklistItemId` thread'i de açar
  // ama maddenin görünür olması için yine scroll edilir.
  const highlightTargetId =
    params.commentId ??
    params.highlightItemId ??
    params.checklistItemId ??
    params.attachmentId ??
    null;

  // Collapsing başlığı (DEM-228; 2026-06-20 shared-value refactor): 0 = liste
  // adı, 1 = kart başlığı. Reanimated shared value — eşik geçişi UI-thread'inde
  // yapılır, React state'i DEĞİŞMEZ ve `runOnJS`/`setState` yoktur → scroll
  // boyunca ekran yeniden render olmaz, başlık şeridi (`CardDetailHeaderTitle`)
  // shared value'yu doğrudan okur. (2026-06-21: native stack header kaldırıldı,
  // başlık ekran-içi sabit şeritte; collapse mantığı aynı shared value ile çalışır.)
  const collapseProgress = useSharedValue(0);

  function handleTitleLayout(event: LayoutChangeEvent) {
    const { y, height } = event.nativeEvent.layout;
    setTitleThreshold(Math.max(y + height - 16, 0));
  }

  const scrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        'worklet';
        const next = event.contentOffset.y > titleThreshold ? 1 : 0;
        // Yalnız eşik durumu değişince çapraz-geçişi başlat (her frame değil).
        if (collapseProgress.value !== next) {
          collapseProgress.value = withTiming(next, { duration: 180 });
        }
      },
    },
    [titleThreshold],
  );

  // Faz 7M — pull-to-refresh: kart detayının tüm sorgularını yeniden çeker
  // (7.0 kararı: mobilde realtime yok, yenileme elle tetiklenir). `refreshing`
  // herhangi bir sorgu uçuştayken spinner gösterir.
  const refreshing =
    cardQuery.isFetching ||
    labelsQuery.isFetching ||
    membersQuery.isFetching ||
    checklistsQuery.isFetching ||
    commentsQuery.isFetching ||
    activityQuery.isFetching ||
    boardMembersQuery.isFetching ||
    boardQuery.isFetching;

  function handleRefresh() {
    void cardQuery.refetch();
    void labelsQuery.refetch();
    void membersQuery.refetch();
    void checklistsQuery.refetch();
    void commentsQuery.refetch();
    void activityQuery.refetch();
    void boardMembersQuery.refetch();
    void boardQuery.refetch();
  }

  const labels = labelsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  // Arşivlenen checklist'ler mobilde gizlenir — web'de tam arşiv görünümü var,
  // mobilde yok (invariant 23; sadece-web kararı). Backend `checklist.list` aktif
  // + arşivli hepsini döndürür, ayrım burada.
  const checklists = (checklistsQuery.data ?? []).filter((c) => !c.archivedAt);
  const comments = commentsQuery.data ?? [];
  const activity = activityQuery.data ?? [];
  const boardMembers = boardMembersQuery.data ?? [];

  // Çağıranın board rolü → düzenleme yetkisi (board `member+`). Üye listesinde
  // bulunamazsa `viewer` varsayılır (salt-okunur) — web kart modalı simetrisi.
  const myBoardRole = boardMembers.find((m) => m.userId === currentUserId)?.role;
  const canEdit = myBoardRole === 'admin' || myBoardRole === 'member';

  // Yorum yazarı çözümleyici: `comment.list` yalnız `authorId` döndürür —
  // ad/görsel kart üyelerinden + aktivite aktörlerinden toplanır.
  const resolveAuthor = useMemo<AuthorResolver>(() => {
    const map = new Map<string, { name: string | null; image: string | null }>();
    for (const member of members) {
      map.set(member.userId, { name: member.name, image: member.image });
    }
    // `actorId` kullanıcı silinince `null` olabilir; `null` aktörleri atla.
    for (const event of activity) {
      if (event.actorId && !map.has(event.actorId)) {
        map.set(event.actorId, { name: event.actorName, image: event.actorImage });
      }
    }
    // Optimistic yorum yazarı çağıranın kendisi olabilir; kart üyesi/aktör
    // değilse haritada yer almaz — oturum bilgisinden ekle, aksi halde yeni
    // yorum kısa süreliğine "Bir kullanıcı" görünür.
    if (currentUserId && !map.has(currentUserId)) {
      map.set(currentUserId, {
        name: session?.user.name ?? null,
        image: session?.user.image ?? null,
      });
    }
    const empty = { name: null, image: null };
    return (userId) => (userId ? (map.get(userId) ?? empty) : empty);
  }, [members, activity, currentUserId, session?.user.name, session?.user.image]);

  // Erken dönüş başlığı — ekran-içi sade başlık (kart yüklenmeden collapsing yok).
  const fallbackTitle = params.title ?? strings.cardDetail.fallbackTitle;

  if (!cardId) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-muted">
        <ScreenHeader title={fallbackTitle} />
        <EmptyState
          icon="alert-triangle"
          title={strings.cardDetail.loadError}
          description={strings.common.unknownError}
        />
      </SafeAreaView>
    );
  }

  if (cardQuery.isPending) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-muted">
        <ScreenHeader title={fallbackTitle} />
        <LoadingScreen />
      </SafeAreaView>
    );
  }

  if (cardQuery.isError) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-muted">
        <ScreenHeader title={fallbackTitle} />
        <EmptyState
          icon="alert-triangle"
          title={strings.cardDetail.loadError}
          description={strings.common.unknownError}
        >
          <View className="w-40">
            <Button
              label={strings.common.retry}
              variant="ghost"
              onPress={() => cardQuery.refetch()}
            />
          </View>
        </EmptyState>
      </SafeAreaView>
    );
  }

  const card = cardQuery.data.card;
  // Kapak rengi (DEM-218) — `card.coverColor` düz `text`; geçerli 12-renk palet
  // adına daraltılır. Kapak görseli yoksa header card üstünde renk kartı çizilir.
  const detailCoverColor = asCoverColor(card.coverColor);
  // "Listeyi değiştir" hedef havuzu — board'un aktif, kalıcı listeleri (Faz 7H).
  const boardLists = (boardQuery.data?.lists ?? []).filter(
    (list) => list.archivedAt == null && !isPendingId(list.id),
  );
  // Kartın bulunduğu listenin adı — meta çubuğundaki "Liste" chip'inde gösterilir.
  const currentListTitle =
    boardQuery.data?.lists.find((list) => list.id === card.listId)?.title ?? null;

  // Yorumlar + Aktivite bölümleri değişkende — tablet'te 2 sütun, telefonda
  // alt-alta render edilir (aşağıda `isTablet` ile konumlandırılır).
  const commentsSection = (
    <DetailSection
      icon="message-square"
      title={strings.cardDetail.commentsTitle}
      collapsible
      defaultCollapsed
      forceExpand={!!params.commentId}
      trailing={comments.length > 0 ? <SectionBadge label={String(comments.length)} /> : undefined}
    >
      <View className="gap-4">
        {commentsQuery.isError ? (
          <Text className="text-sm text-destructive">{strings.cardDetail.sectionError}</Text>
        ) : comments.length > 0 ? (
          <CommentList
            cardId={card.id}
            comments={comments}
            resolveAuthor={resolveAuthor}
            currentUserId={currentUserId}
            myBoardRole={myBoardRole}
            canEdit={canEdit}
            highlightCommentId={params.commentId}
          />
        ) : (
          <Text className="text-sm text-muted-foreground">{strings.cardDetail.noComments}</Text>
        )}
        {canEdit ? <CommentComposer cardId={card.id} /> : null}
      </View>
    </DetailSection>
  );

  const activitySection = (
    <DetailSection
      icon="activity"
      title={strings.cardDetail.activityTitle}
      collapsible
      defaultCollapsed
      trailing={activity.length > 0 ? <SectionBadge label={String(activity.length)} /> : undefined}
    >
      {activityQuery.isError ? (
        <Text className="text-sm text-destructive">{strings.cardDetail.sectionError}</Text>
      ) : activity.length > 0 ? (
        <ActivityList events={activity} />
      ) : (
        <Text className="text-sm text-muted-foreground">{strings.cardDetail.noActivity}</Text>
      )}
    </DetailSection>
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-muted">
      {/* Ekran-içi sabit header şeridi (native header yok) — collapsing başlık
          (scroll'la liste adı ↔ kart başlığı çapraz-geçişi, UI-thread) + ⋮. */}
      <View className="flex-row items-center justify-between gap-3 px-4 pb-2 pt-2">
        <View className="flex-1">
          <CardDetailHeaderTitle
            progress={collapseProgress}
            listTitle={currentListTitle}
            cardTitle={card.title}
          />
        </View>
        {/* DEM-196 — ⋮ "Kart işlemleri"; yalnız board member+ ve kart arşivli
            değilken. 44×44 dokunma alanı (Apple HIG) + hitSlop. */}
        {canEdit && card.archivedAt == null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.cardDetail.cardActions}
            hitSlop={8}
            onPress={() => setActionsOpen(true)}
            className="h-11 w-11 items-center justify-center active:opacity-60"
          >
            <Icon name="more-vertical" size={20} color={theme.foreground} />
          </Pressable>
        ) : null}
      </View>
      <ScrollHighlightProvider
        targetId={highlightTargetId}
        scrollRef={scrollRef}
        reduceMotion={reduceMotion}
      >
      <Animated.ScrollView
        ref={scrollRef}
        className="flex-1 bg-muted"
        // İçerik kapsayıcısı stilleri tek yerde (NativeWind `contentContainerClassName`
        // + ayrı `contentContainerStyle` çakışmasını önlemek için inline). `paddingBottom`
        // floating pill nav'ın arkasında kalan içeriği erişilebilir kılar (tablet);
        // `padding`'in bottom'unu ezer (2026-06-20).
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: navInset || 16 }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        // Checklist madde sürüklenirken dış dikey scroll kilitli (drag pan ↔
        // scroll çakışması önlenir); bırakınca tekrar açılır.
        scrollEnabled={!checklistDragging}
        // DEM-238 — yorum composer scroll içeriğin sonunda; aktivite sayısı azsa
        // klavye composer'ı örtüyordu. iOS native otomatik content-inset ile
        // klavye açılınca scroll içeriği klavye yüksekliği kadar yukarı kayar
        // (Android'de zaten `adjustResize` ile pencere yeniden boyutlanır).
        automaticallyAdjustKeyboardInsets
        // Gönder butonuna dokunmak klavyeyi kapatmadan submit'i tetiklesin.
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.mutedForeground}
          />
        }
      >
        {/* Kapak (DEM-217 görsel / DEM-218 renk) — kapak görseli varsa header
            card'ın üstünde kendi yuvarlatılmış kartında (`RemoteImage` ile tembel
            yüklenir, sayfanın render'ını geciktirmez); görsel yoksa kapak rengi
            varsa aynı yerde standalone renk kartı. Görsel önceliklidir — web kart
            modalı / `card-face` kapak şeridi paritesi. */}
        {card.coverImage ? (
          <CardCoverImage
            coverImage={card.coverImage}
            coverImageUrl={card.coverImageUrl ?? null}
            variant="detail"
            cardId={card.id}
          />
        ) : detailCoverColor != null ? (
          <View
            className="h-14 w-full rounded-xl"
            style={{ backgroundColor: coverColorHex[detailCoverColor] }}
          />
        ) : null}

        {/* Header card (DEM-204) — kart kimliği tek `bg-card` yüzeyde: tamamlandı
            rozeti + tamamla/geri al toggle + başlık + meta çubuğu. Başlık board
            `member+` için düzenlenebilir (Faz 7H); tamamla toggle'ı Faz 7G-5
            (DEM-195). `onLayout` collapsing nav başlığının eşiğini ölçer (7G-3). */}
        <View
          className="gap-3 rounded-xl border border-border bg-card p-3.5"
          onLayout={handleTitleLayout}
        >
          {card.completed ? (
            <View className="flex-row items-center gap-1.5 self-start rounded-full bg-success/15 px-2 py-0.5">
              <Icon name="check-circle" size={13} color={theme.success} />
              <Text weight="medium" className="text-xs text-success">
                {strings.cardDetail.completedBadge}
              </Text>
            </View>
          ) : null}
          <View className="flex-row items-start gap-2.5">
            {/* Tamamla/geri al toggle'ı — text-xl başlıkla optik hiza için pt-0.5. */}
            <View className="pt-0.5">
              <CardCompleteToggle
                completed={card.completed}
                canEdit={canEdit}
                pending={cardMutations.completePending}
                onToggle={() => cardMutations.toggleComplete(card.completed)}
              />
            </View>
            {canEdit && editingTitle ? (
              <View className="flex-1">
                <InlineComposer
                  placeholder={strings.cardDetail.titlePlaceholder}
                  submitLabel={strings.common.save}
                  initialValue={card.title}
                  onSubmit={(title) => {
                    cardMutations.updateTitle(title);
                    setEditingTitle(false);
                  }}
                  onCancel={() => setEditingTitle(false)}
                />
              </View>
            ) : (
              <Pressable
                accessibilityRole={canEdit ? 'button' : undefined}
                accessibilityLabel={canEdit ? strings.cardDetail.editTitleLabel : undefined}
                disabled={!canEdit}
                onPress={() => setEditingTitle(true)}
                className={`flex-1 flex-row items-start gap-2 ${canEdit ? 'active:opacity-60' : ''}`}
              >
                <Text
                  weight="semibold"
                  className={`flex-1 text-xl ${
                    card.completed ? 'text-muted-foreground line-through' : 'text-foreground'
                  }`}
                >
                  {card.title}
                </Text>
                {canEdit ? (
                  <Icon name="edit-3" size={16} color={theme.mutedForeground} />
                ) : null}
              </Pressable>
            )}
          </View>

          {/* Faz 7G-2 — kompakt meta çubuğu: üye / son tarih / etiket / kapak /
              liste chip'leri; her chip dokununca ilgili bottom sheet'i açar. */}
          <CardMetaBar
            cardId={card.id}
            boardId={card.boardId}
            labels={labels}
            members={members}
            boardMembers={boardMembers}
            dueAt={card.dueAt}
            completed={card.completed}
            coverColor={card.coverColor}
            lists={boardLists}
            currentListId={card.listId}
            currentListTitle={currentListTitle}
            onMoveToList={(listId) => cardMutations.moveToList(listId)}
            canEdit={canEdit}
          />
        </View>

        <DescriptionChecklistTabs
          cardId={card.id}
          description={card.description}
          canEdit={canEdit}
          checklists={checklists}
          checklistsError={checklistsQuery.isError}
          // Madde yorum thread'i bağlamı — kart yorumlarıyla aynı yazar
          // çözümleyici + yetki. Viewer da thread açıp okuyabilir; yazma
          // `canEdit` (board member+) ister.
          checklistComments={{
            resolveAuthor,
            currentUserId,
            myBoardRole,
            canComment: canEdit,
          }}
          // Deep-link / madde yorum bildirimiyle gelinmişse o maddenin yorum
          // thread'i otomatik açılır (bir kez).
          initialCommentItemId={params.checklistItemId}
          highlightItemId={params.highlightItemId}
          // Madde sürükleme aktifken dış scroll kilitle (drag pan çakışması).
          onDragActiveChange={setChecklistDragging}
          // Dış scroll ref'i — sortable Pan'ı bununla koordine edilir (uzun-bas
          // dikey sürüklemenin native scroll tarafından yutulmaması için).
          scrollRef={scrollRef}
        />

        {/* Faz 7J — kart eki "Ekler" bölümü. Liste tüm rollere açık; yükleme
            `canEdit`, silme uploader/admin (alt bileşende çözülür). */}
        <AttachmentsSection
          cardId={card.id}
          boardId={card.boardId}
          canEdit={canEdit}
          currentUserId={currentUserId}
          myBoardRole={myBoardRole}
          highlightAttachmentId={params.attachmentId}
        />

        {/* Yorumlar + Aktivite — tablet'te yan-yana 2 sütun (eşit `flex-1`,
            `items-start`), telefonda alt-alta. İkisi de katlanabilir bölüm. */}
        {isTablet ? (
          <View className="flex-row items-start gap-3">
            <View className="flex-1">{commentsSection}</View>
            <View className="flex-1">{activitySection}</View>
          </View>
        ) : (
          <>
            {commentsSection}
            {activitySection}
          </>
        )}
      </Animated.ScrollView>
      </ScrollHighlightProvider>

      {/* DEM-196 — başlık yanı ⋮ menüsü: başka panoya taşı + arşivle. */}
      <CardActionsSheet
        visible={actionsOpen}
        onArchive={handleArchive}
        onMoveToBoard={() => {
          setActionsOpen(false);
          setMoveToBoardOpen(true);
        }}
        onClose={() => setActionsOpen(false)}
      />

      {/* Kartı başka panoya taşı (2026-07-14) — çalışma alanı→pano→liste seçici. */}
      <MoveCardToBoardSheet
        visible={moveToBoardOpen}
        onConfirm={handleMoveToBoard}
        onClose={() => setMoveToBoardOpen(false)}
      />
    </SafeAreaView>
  );
}
