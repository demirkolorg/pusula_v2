import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import type { AnimatedRef } from 'react-native-reanimated';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import {
  CHECKLIST_MAX_DEPTH,
  buildChecklistTree,
  collectDescendantItemIds,
  positionBetween,
  type ChecklistTreeNode,
} from '@pusula/domain';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { SectionHeader, SectionHeaderAction } from '@/components/card-detail/section';
import { ChecklistItemRow } from '@/components/card-detail/checklist-item-row';
import { ChecklistItemEditSheet } from '@/components/card-detail/checklist-item-edit-sheet';
import { SortableChecklistItems } from '@/components/card-detail/sortable-checklist-items';
import {
  ChecklistItemThreadSheet,
} from '@/components/card-detail/checklist-item-thread-sheet';
import { ChecklistItemAttachmentSheet } from '@/components/card-detail/checklist-item-attachment-sheet';
import type { AuthorResolver } from '@/components/card-detail/comment-list';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { OPTIMISTIC_PREFIX, isOptimisticItemId } from '@/lib/checklist-reorder';
import { strings } from '@/lib/strings';
import { tiptapToPlainText } from '@/lib/tiptap';
import { useTheme } from '@/theme/theme-provider';

type Checklists = RouterOutputs['checklist']['list'];
type ChecklistItem = Checklists[number]['items'][number];

/**
 * Madde yorum thread'i (yapılacaklar maddesine yorum) için ekrandan akan bağlam.
 * Verilirse her madde satırı bir yorum rozeti gösterir ve dokununca thread
 * bottom sheet'i açılır. Yorum yazarı çözümleyici + yetki bilgisi kart yorum
 * bölümüyle aynı kaynaktan gelir (tek `resolveAuthor`).
 */
export type ChecklistCommentContext = {
  resolveAuthor: AuthorResolver;
  currentUserId: string | undefined;
  myBoardRole: 'admin' | 'member' | 'viewer' | undefined;
  /** Yorum yazma yetkisi (board `member+` + board aktif) — viewer salt-okur. */
  canComment: boolean;
};

/**
 * Madde ek bağlamı — verilirse satırlar ek rozeti + ek sheet'i alır (yorum
 * bağlamıyla simetrik). Yükleme yetkisi `ChecklistSection`'ın `canEdit`'inden
 * gelir; burada yalnız ek listesi/silme için gereken kimlik + board bilgisi.
 */
export type ChecklistAttachmentContext = {
  /** Kart sayacı tazelensin diye alt bileşen `board.get` invalidate eder. */
  boardId: string | undefined;
  currentUserId: string | undefined;
  myBoardRole: 'admin' | 'member' | 'viewer' | undefined;
};

type ChecklistSectionProps = {
  cardId: string;
  checklists: Checklists;
  /** Çağıran board `member+` mi — `false` ise salt-okunur. */
  canEdit: boolean;
  /** Madde yorum bağlamı — verilirse satırlar yorum rozeti + thread sheet'i alır. */
  comments?: ChecklistCommentContext;
  /** Madde ek bağlamı — verilirse satırlar ek rozeti + ek sheet'i alır. */
  attachments?: ChecklistAttachmentContext;
  /**
   * Deep-link / bildirimle gelinen madde id'si — yorum bağlamı varsa ve madde
   * yüklenen listede mevcutsa o maddenin thread'i bir kez otomatik açılır.
   */
  initialCommentItemId?: string;
  /**
   * Madde sürükleme (sortable) başlayınca `true`, bitince `false` — üst bileşen
   * (kart detay ekranı) dış `ScrollView`'un dikey scroll'unu kilitler, böylece
   * dikey drag pan'i dış scroll ile çakışmaz.
   */
  onDragActiveChange?: (active: boolean) => void;
  /**
   * Dış scroll'un animated ref'i — `SortableChecklistItems`'a iletilir; madde
   * sürükleme Pan'ı bu ref ile koordine edilir (uzun-bas dikey sürüklemenin
   * native scroll tarafından yutulmaması için).
   */
  scrollRef?: AnimatedRef<Animated.ScrollView>;
  /**
   * Bildirim deep-link'iyle gelinince bu id'li madde flash vurgulanır (bir kez).
   * `initialCommentItemId`'den farklı: thread açmaz, yalnız görsel vurgu yapar.
   */
  highlightItemId?: string;
  /**
   * Tablet yan-yana yerleşiminde kart yüzeyi `flex-1` ile kapsayıcısını dikey
   * doldurur — yandaki "Açıklama" bölümüyle eşit yükseklikte kalsın
   * (`DescriptionChecklistTabs` `items-stretch`). Telefonda (alt-alta) `false`.
   */
  fill?: boolean;
};

/**
 * Kart kontrol listeleri — checklist oluştur/sil + madde işaretle/ekle/sil
 * (Faz 7G + DEM-198). Tüm mutation'lar (`checklist.create` / `.delete`,
 * `checklist.item.toggle` / `.create` / `.delete`) optimistic: `checklist.list`
 * cache'i anında yamanır, hata olursa snapshot'tan geri alınır. `canEdit`
 * `false` ise salt-okunur. Listesi olmayan kart, düzenleyebilen kullanıcıya
 * doğrudan "kontrol listesi ekle" girişini gösterir.
 */
export function ChecklistSection({
  cardId,
  checklists,
  canEdit,
  comments,
  attachments,
  initialCommentItemId,
  onDragActiveChange,
  scrollRef,
  highlightItemId,
  fill = false,
}: ChecklistSectionProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const checklistKey = trpc.checklist.list.queryKey({ cardId });
  // Açık madde yorum thread'i — bir madde id'si tutar; tek sheet tüm satırlar
  // için paylaşılır (her satıra ayrı modal mount edilmez). `null` → kapalı.
  const [openThreadItemId, setOpenThreadItemId] = useState<string | null>(null);
  // Açık madde ek sheet'i — yorum thread'iyle simetrik; tek sheet paylaşılır.
  const [openAttachmentItemId, setOpenAttachmentItemId] = useState<string | null>(null);
  // Açık madde düzenleme sheet'i — hedef madde (checklist + id + mevcut içerik).
  // Tek sheet paylaşılır; `update` mutation `checklistId` istediğinden id'yle
  // birlikte taşınır. `null` → kapalı.
  const [editTarget, setEditTarget] = useState<{
    checklistId: string;
    itemId: string;
    content: string;
  } | null>(null);
  // Deep-link auto-open yalnız bir kez — kullanıcı sheet'i kapatınca tekrar
  // açılmamalı (madde checklist'te göründüğü ilk render'da tetiklenir).
  const autoOpenedRef = useRef(false);
  // "Kontrol listesi ekle" composer'ı açık mı — tetikleyici artık bölüm
  // başlığındaki "+ Ekle" aksiyonunda (2026-06-20); form gövdenin sonunda açılır.
  const [addOpen, setAddOpen] = useState(false);
  // Hangi kontrol listesinin "madde ekle" composer'ı açık (id) — tetikleyici o
  // listenin kendi header'ındaki "+" aksiyonunda; aynı anda tek liste açık.
  const [addItemChecklistId, setAddItemChecklistId] = useState<string | null>(null);
  // DEM-249 — bölüm katlanabilir, default AÇIK (Açıklama bölümüyle aynı desen).
  const [collapsed, setCollapsed] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!comments || !initialCommentItemId) return;
    // Madde gerçekten yüklenen listede var mı? Yoksa (yanlış/eski id) sheet'i
    // açma — boş thread göstermek yerine sessizce yok say.
    const exists = checklists.some((list) =>
      list.items.some((item) => item.id === initialCommentItemId),
    );
    if (!exists) return;
    autoOpenedRef.current = true;
    setOpenThreadItemId(initialCommentItemId);
  }, [comments, initialCommentItemId, checklists]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: checklistKey });
    void queryClient.invalidateQueries(trpc.card.activity.list.queryFilter({ cardId }));
  };

  /** `checklist.list` cache'ini güvenli yamalar (snapshot döner). */
  const patch = async (
    update: (lists: Checklists) => Checklists,
  ): Promise<{ prev: Checklists | undefined }> => {
    await queryClient.cancelQueries({ queryKey: checklistKey });
    const prev = queryClient.getQueryData<Checklists>(checklistKey);
    if (prev) queryClient.setQueryData<Checklists>(checklistKey, update(prev));
    return { prev };
  };

  const rollback = (ctx: { prev: Checklists | undefined } | undefined) => {
    if (ctx?.prev) queryClient.setQueryData(checklistKey, ctx.prev);
    Alert.alert(strings.cardDetail.checklistsTitle, strings.cardDetail.actionError);
  };

  const toggleItem = useMutation(
    trpc.checklist.item.toggle.mutationOptions({
      onMutate: (vars) =>
        patch((lists) =>
          lists.map((list) =>
            list.id === vars.checklistId
              ? {
                  ...list,
                  items: list.items.map((item) =>
                    item.id === vars.itemId ? { ...item, completed: vars.completed } : item,
                  ),
                }
              : list,
          ),
        ),
      onError: (_error, _vars, ctx) => rollback(ctx),
      onSettled: invalidate,
    }),
  );

  const createItem = useMutation(
    trpc.checklist.item.create.mutationOptions({
      onMutate: (vars) =>
        patch((lists) => {
          const now = new Date();
          // İç içe (nested) madde: `parentItemId` verilirse o maddenin altına
          // eklenir; `depth` ebeveynin depth'ine +1 (kök için 0). Ebeveyn cache'te
          // bulunamazsa (yarış) makul varsayılan: kök=0, çocuk=1 — gerçek değer
          // `onSettled` invalidate ile sunucudan gelir.
          const parentItemId = vars.parentItemId ?? null;
          const parent = parentItemId
            ? lists.flatMap((list) => list.items).find((item) => item.id === parentItemId)
            : undefined;
          const depth = parentItemId ? (parent ? parent.depth + 1 : 1) : 0;
          const optimistic: ChecklistItem = {
            id: `${OPTIMISTIC_PREFIX}${vars.clientMutationId ?? newClientMutationId()}`,
            checklistId: vars.checklistId,
            parentItemId,
            depth,
            content: vars.content,
            // Kendi kardeş grubunun sonuna eklenir — `buildChecklistTree` her
            // düzeyi `position`'a göre sıraladığından 'zzzzzz' o grupta en sona
            // düşer. Gerçek pozisyon `onSettled` invalidate ile gelir.
            position: 'zzzzzz',
            completed: false,
            completedAt: null,
            completedBy: null,
            // Yeni madde henüz yorum/ek almadı — optimistic satır 0 ile başlar,
            // gerçek sayılar `onSettled` invalidate ile gelir.
            commentCount: 0,
            attachmentCount: 0,
            createdAt: now,
            updatedAt: now,
          };
          return lists.map((list) =>
            list.id === vars.checklistId
              ? { ...list, items: [...list.items, optimistic] }
              : list,
          );
        }),
      onError: (_error, _vars, ctx) => rollback(ctx),
      onSettled: invalidate,
    }),
  );

  const updateItem = useMutation(
    trpc.checklist.item.update.mutationOptions({
      onMutate: (vars) =>
        patch((lists) =>
          lists.map((list) =>
            list.id === vars.checklistId
              ? {
                  ...list,
                  items: list.items.map((item) =>
                    item.id === vars.itemId ? { ...item, content: vars.content } : item,
                  ),
                }
              : list,
          ),
        ),
      onError: (_error, _vars, ctx) => rollback(ctx),
      onSettled: invalidate,
    }),
  );

  const deleteItem = useMutation(
    trpc.checklist.item.delete.mutationOptions({
      onMutate: (vars) =>
        patch((lists) =>
          lists.map((list) => {
            if (list.id !== vars.checklistId) return list;
            // Silme sunucuda `on delete cascade` ile alt ağacı da götürür; cache'te
            // de maddeyle birlikte tüm torunlarını kaldır — aksi halde çocuklar bir
            // an "orphan" (ebeveyni gitmiş) kalır. `onSettled` invalidate tazeler.
            const descendantIds = new Set(collectDescendantItemIds(list.items, vars.itemId));
            return {
              ...list,
              items: list.items.filter(
                (item) => item.id !== vars.itemId && !descendantIds.has(item.id),
              ),
            };
          }),
        ),
      onError: (_error, _vars, ctx) => rollback(ctx),
      onSettled: invalidate,
    }),
  );

  // Madde sıralama (DEM — manuel reanimated sortable). `reorder` mutation'ı
  // yalnız transport: optimistic cache patch'i + rollback `handleReorder`'da
  // elle yönetilir (input şeması yalnız komşu id'leri taşır; tam sıra cache'te
  // ayrıca düzenlenmeli). `onSettled` invalidate gerçek LexoRank pozisyonlarını
  // getirir. Drag SIRASINDA değil — yalnız `onDragEnd`'de bir kez çağrılır.
  // NOT: Hızlı ardışık drag'lerde (bir mutation uçuştayken yenisi başlarsa)
  // optimistic patch'ler arasında geçici görsel zıplama mümkün; `onSettled`
  // invalidate her seferinde sunucu sırasını yeniden çekerek nihai tutarlılığı
  // sağlar (gözle görülen kayma anlık, kalıcı değil).
  const reorderItem = useMutation(
    trpc.checklist.item.reorder.mutationOptions({ onSettled: invalidate }),
  );

  /**
   * Sürükleme bittiğinde (sortable `onReorder`) — reorder YALNIZ aynı kardeş
   * grubu içindedir (kök seviye; alt maddeler sürüklenmez — bkz. render). Düz
   * `items` dizisini yeniden dizmek yerine (bu, iç içe alt maddeleri düşürürdü)
   * taşınan maddenin `position`'ını yeni komşularının arasına ayarlarız; render
   * `buildChecklistTree` ile her düzeyi `position`'a göre yeniden sıraladığından
   * madde doğru yere oturur ve diğer maddeler/gruplar cache'te korunur (web ile
   * aynı desen). Sonra `reorder` mutation'ı gerçek komşularla atılır. Hata → elle
   * `rollback(snapshot)`; başarı/hata fark etmez `onSettled` invalidate eder.
   */
  const handleReorder = (
    checklistId: string,
    args: {
      itemId: string;
      beforeItemId: string | undefined;
      afterItemId: string | undefined;
      orderedIds: string[];
    },
  ) => {
    // Optimistic pozisyon patch'i — snapshot rollback için saklanır.
    void patch((lists) =>
      lists.map((list) => {
        if (list.id !== checklistId) return list;
        const before = args.beforeItemId
          ? list.items.find((item) => item.id === args.beforeItemId)
          : undefined;
        const after = args.afterItemId
          ? list.items.find((item) => item.id === args.afterItemId)
          : undefined;
        // Komşular aynı kardeş grubunda ardışık olduğundan `before.position <
        // after.position` garanti (sortable optimistic madde varken kapalı →
        // pozisyonlar gerçek LexoRank). `positionBetween(null, x)` / `(x, null)`
        // grup başı/sonu.
        const nextPosition = positionBetween(before?.position ?? null, after?.position ?? null);
        return {
          ...list,
          items: list.items.map((item) =>
            item.id === args.itemId ? { ...item, position: nextPosition } : item,
          ),
        };
      }),
    ).then((ctx) => {
      reorderItem.mutate(
        {
          cardId,
          checklistId,
          itemId: args.itemId,
          beforeItemId: args.beforeItemId,
          afterItemId: args.afterItemId,
          clientMutationId: newClientMutationId(),
        },
        { onError: () => rollback(ctx) },
      );
    });
  };

  const createChecklist = useMutation(
    trpc.checklist.create.mutationOptions({
      onMutate: (vars) => {
        const now = new Date();
        const optimistic: Checklists[number] = {
          id: `${OPTIMISTIC_PREFIX}${vars.clientMutationId ?? newClientMutationId()}`,
          cardId: vars.cardId,
          title: vars.title,
          // Sona eklenir — gerçek pozisyon `onSettled` invalidate ile gelir.
          position: 'zzzzzz',
          // Yeni liste aktif (arşivsiz) doğar.
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
          items: [],
        };
        return patch((lists) => [...lists, optimistic]);
      },
      onError: (_error, _vars, ctx) => rollback(ctx),
      onSettled: invalidate,
    }),
  );

  const deleteChecklist = useMutation(
    trpc.checklist.delete.mutationOptions({
      onMutate: (vars) => patch((lists) => lists.filter((list) => list.id !== vars.checklistId)),
      onError: (_error, _vars, ctx) => rollback(ctx),
      onSettled: invalidate,
    }),
  );

  /** Onaylı kontrol listesi silme — liste + tüm maddeleri kalıcı kaldırır. */
  const confirmDeleteChecklist = (checklist: Checklists[number]) => {
    Alert.alert(
      strings.cardDetail.checklistDeleteConfirmTitle,
      strings.cardDetail.checklistDeleteConfirmBody,
      [
        { text: strings.common.cancel, style: 'cancel' },
        {
          text: strings.cardDetail.checklistDeleteAction,
          style: 'destructive',
          onPress: () =>
            deleteChecklist.mutate({
              cardId,
              checklistId: checklist.id,
              clientMutationId: newClientMutationId(),
            }),
        },
      ],
    );
  };

  return (
    <>
    {/* Kendi kart yüzeyi + başlık (2026-06-20) — Açıklama bölümüyle aynı desen.
        Başlıkta solda "Kontrol listeleri", sağda "+ Ekle" (member+); composer
        gövdenin sonunda açılır. */}
    <View
      className={`gap-3 rounded-xl border border-border bg-card p-3.5 ${fill ? 'flex-1' : ''}`}
    >
      <SectionHeader
        icon="check-square"
        title={strings.cardDetail.checklistsTitle}
        collapsible
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
        actions={
          // Katlıyken "+ Ekle" gizli — composer gövdede açıldığından katlı
          // bölümde anlamsız.
          !collapsed && canEdit && !addOpen ? (
            <SectionHeaderAction
              icon="plus"
              label={strings.cardDetail.checklistAdd}
              onPress={() => setAddOpen(true)}
            />
          ) : undefined
        }
      />

      {collapsed ? null : (
      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(160)}
        className="gap-4"
      >
      {checklists.length === 0 && !addOpen ? (
        <Text className="text-sm text-muted-foreground">
          {strings.cardDetail.checklistsEmpty}
        </Text>
      ) : null}

      {checklists.map((checklist) => {
        const optimisticList = checklist.id.startsWith(OPTIMISTIC_PREFIX);
        const doneCount = checklist.items.filter((item) => item.completed).length;
        return (
          // Her kontrol listesi kendi bordürlü kartında + header'ında (2026-06-20)
          // — bölüm/Açıklama deseninin alt seviyesi. Header: solda başlık + ilerleme,
          // sağda "madde ekle" (+) ve sil. Madde composer'ı header "+"sıyla açılır.
          <View key={checklist.id} className="gap-2 rounded-lg border border-border p-3">
            <View className="min-h-9 flex-row items-center gap-2">
              <Text
                weight="medium"
                className="flex-1 text-sm text-foreground"
                numberOfLines={1}
              >
                {checklist.title}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {doneCount}/{checklist.items.length}
              </Text>
              {canEdit && !optimisticList ? (
                // Sabit 40×40 dokunma kutuları + aralarında boşluk (gap-1.5) —
                // `hitSlop` çakışıp yanlış butona basılmasını önler (kutu sınırı
                // net). "+" madde ekler, çöp sepeti listeyi siler.
                <View className="flex-row items-center gap-1.5">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={strings.cardDetail.checklistItemAdd}
                    onPress={() => setAddItemChecklistId(checklist.id)}
                    className="h-10 w-10 items-center justify-center rounded-md active:bg-muted"
                  >
                    <Icon name="plus" size={18} color={theme.primary} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={strings.cardDetail.checklistDelete}
                    disabled={deleteChecklist.isPending}
                    onPress={() => confirmDeleteChecklist(checklist)}
                    className="h-10 w-10 items-center justify-center rounded-md active:bg-muted"
                  >
                    <Icon name="trash-2" size={16} color={theme.mutedForeground} />
                  </Pressable>
                </View>
              ) : null}
            </View>

            {(() => {
              // Düz madde listesini iç içe (3 seviye — `CHECKLIST_MAX_DEPTH`)
              // ağaca çevir. YALNIZ kök (depth 0) maddeler sürüklenir (aynı-seviye
              // reorder); alt maddeler girintili + sürüklemesiz çizilir (iç içe
              // reanimated sortable'ın gesture çakışması riski nedeniyle — bkz.
              // rapor). Kök sortable'a yalnız kök düğümler beslenir; komşuları hep
              // kök kardeşler olduğundan backend'in aynı-parent kısıtıyla uyumlu.
              const tree = buildChecklistTree(checklist.items);
              if (tree.length === 0) return null;
              const rootNodeById = new Map(tree.map((node) => [node.id, node]));
              // Optimistic madde (kök YA DA çocuk) varken tüm kök sürüklemesini
              // kapat — eski (düz) sortable tüm maddeleri gördüğünden herhangi bir
              // optimistic madde drag'i kapatırdı; kök sortable yalnız kök id'leri
              // gördüğünden bu kontrolü burada elle koru.
              const anyOptimistic = checklist.items.some((item) =>
                isOptimisticItemId(item.id),
              );
              return (
                <SortableChecklistItems
                  items={tree}
                  canDrag={canEdit && !optimisticList && !anyOptimistic}
                  onReorder={(args) => handleReorder(checklist.id, args)}
                  onDragActiveChange={onDragActiveChange}
                  scrollRef={scrollRef}
                  renderItem={(item) => {
                    const node = rootNodeById.get(item.id);
                    if (!node) return null;
                    return (
                      <ChecklistTreeItem
                        node={node}
                        checklistId={checklist.id}
                        editable={canEdit}
                        createPending={createItem.isPending}
                        highlightItemId={highlightItemId}
                        onToggle={(itemId, completed) =>
                          toggleItem.mutate({
                            cardId,
                            checklistId: checklist.id,
                            itemId,
                            completed,
                            clientMutationId: newClientMutationId(),
                          })
                        }
                        onEdit={(itemId, content) =>
                          setEditTarget({ checklistId: checklist.id, itemId, content })
                        }
                        onDelete={(itemId) =>
                          deleteItem.mutate({
                            cardId,
                            checklistId: checklist.id,
                            itemId,
                            clientMutationId: newClientMutationId(),
                          })
                        }
                        onOpenComments={
                          comments ? (itemId) => setOpenThreadItemId(itemId) : undefined
                        }
                        onOpenAttachments={
                          attachments ? (itemId) => setOpenAttachmentItemId(itemId) : undefined
                        }
                        onCreateSubItem={(parentItemId, content) =>
                          createItem.mutate({
                            cardId,
                            checklistId: checklist.id,
                            content,
                            parentItemId,
                            clientMutationId: newClientMutationId(),
                          })
                        }
                      />
                    );
                  }}
                />
              );
            })()}

            {canEdit && !optimisticList ? (
              <ChecklistItemComposer
                open={addItemChecklistId === checklist.id}
                onClose={() => setAddItemChecklistId(null)}
                pending={createItem.isPending}
                onCreate={(content) =>
                  createItem.mutate({
                    cardId,
                    checklistId: checklist.id,
                    content,
                    clientMutationId: newClientMutationId(),
                  })
                }
              />
            ) : null}
          </View>
        );
      })}

      {canEdit ? (
        <ChecklistComposer
          open={addOpen}
          onClose={() => setAddOpen(false)}
          pending={createChecklist.isPending}
          onCreate={(title) =>
            createChecklist.mutate({
              cardId,
              title,
              clientMutationId: newClientMutationId(),
            })
          }
        />
      ) : null}
      </Animated.View>
      )}
    </View>

    {/* Madde yorum thread'i — KOŞULLU mount: yalnız bir madde thread'i açıkken
        Modal mount edilir. Önceden her kart açılışında (visible=false) sürekli
        mount ediliyordu; kart detayındaki diğer sheet'lerle (CardActionsSheet,
        CardMetaBar) üst üste binen her-zaman-mount Modal iOS'ta native crash'e
        yol açıyordu. Diğer sheet'ler gibi koşullu mount → çakışma yok. */}
    {comments && openThreadItemId != null ? (
      <ChecklistItemThreadSheet
        visible
        cardId={cardId}
        checklistItemId={openThreadItemId}
        resolveAuthor={comments.resolveAuthor}
        currentUserId={comments.currentUserId}
        myBoardRole={comments.myBoardRole}
        canComment={comments.canComment}
        onClose={() => setOpenThreadItemId(null)}
      />
    ) : null}

    {/* Madde ek sheet'i — thread sheet'le simetrik KOŞULLU mount (çakışan
        her-zaman-mount Modal'ların iOS crash'ini önler). Yükleme yetkisi
        bölümün `canEdit`'i; salt-okunur (viewer) açıp ekleri görebilir. */}
    {attachments && openAttachmentItemId != null ? (
      <ChecklistItemAttachmentSheet
        visible
        cardId={cardId}
        boardId={attachments.boardId}
        checklistItemId={openAttachmentItemId}
        canEdit={canEdit}
        currentUserId={attachments.currentUserId}
        myBoardRole={attachments.myBoardRole}
        onClose={() => setOpenAttachmentItemId(null)}
      />
    ) : null}

    {/* Madde düzenleme sheet'i — thread sheet gibi KOŞULLU mount (çakışan
        her-zaman-mount Modal'ların iOS crash'ini önler). `key={itemId}` ile her
        madde için taze taslak. `update` optimistic olduğundan kaydetme anında
        sheet kapanır, değişiklik anında görünür. */}
    {editTarget != null ? (
      <ChecklistItemEditSheet
        key={editTarget.itemId}
        visible
        // Web zengin metin (Tiptap JSON) yazmış olabilir — düz metne indirip
        // taslağı tohumla (ham JSON düzenlenmesin). Kullanıcı değiştirmezse
        // resolveChecklistItemRename no-op'lar → JSON içerik korunur.
        initialContent={tiptapToPlainText(editTarget.content)}
        pending={updateItem.isPending}
        onSave={(content) =>
          updateItem.mutate({
            cardId,
            checklistId: editTarget.checklistId,
            itemId: editTarget.itemId,
            content,
            clientMutationId: newClientMutationId(),
          })
        }
        onClose={() => setEditTarget(null)}
      />
    ) : null}
    </>
  );
}

type ChecklistTreeItemProps = {
  node: ChecklistTreeNode<ChecklistItem>;
  checklistId: string;
  /** Board `member+` mi — `false` ise satır salt-okunur (toggle/düzenle/sil/ekle kapalı). */
  editable: boolean;
  /** `createItem` mutation uçuşta mı — alt madde composer'ının submit'ini kilitler. */
  createPending: boolean;
  /** Bildirim deep-link vurgusu için hedef madde id'si. */
  highlightItemId?: string;
  onToggle: (itemId: string, completed: boolean) => void;
  onEdit: (itemId: string, content: string) => void;
  onDelete: (itemId: string) => void;
  /** Yorum bağlamı varsa — madde thread sheet'ini açar. */
  onOpenComments?: (itemId: string) => void;
  /** Ek bağlamı varsa — madde ek sheet'ini açar. */
  onOpenAttachments?: (itemId: string) => void;
  /** Bir maddenin altına alt madde ekler (`parentItemId` = ebeveyn madde id'si). */
  onCreateSubItem: (parentItemId: string, content: string) => void;
};

/**
 * İç içe (nested) bir madde düğümü — kendini alt ağaç için özyineli çağırır
 * (`CHECKLIST_MAX_DEPTH` = 3 seviye). Web `ChecklistItemTreeNode` simetrisi.
 * Her düğüm bir {@link ChecklistItemRow} çizer; çocukları soldan girintili + ince
 * sol sınırlı bir blokta satırın kendi altına (`children` slot'u) yerleştirir.
 * "Alt madde ekle" (+) yalnız derinlik sınırı altındaki (kök + çocuk) maddelerde
 * görünür ve seçilince o düğümün altına girintili bir composer açar.
 *
 * Sürükle-bırak YALNIZ kök seviyededir (üst bileşen kök düğümleri
 * `SortableChecklistItems`'a besler); alt maddeler burada düz (sürüklemesiz)
 * render edilir. Bir kök maddeye uzun basıp sürüklendiğinde alt ağacı da (bu
 * `children` bloğu kök satırın drag alanı içinde olduğundan) blok olarak taşınır.
 */
function ChecklistTreeItem({
  node,
  checklistId,
  editable,
  createPending,
  highlightItemId,
  onToggle,
  onEdit,
  onDelete,
  onOpenComments,
  onOpenAttachments,
  onCreateSubItem,
}: ChecklistTreeItemProps) {
  // "Alt madde ekle" formu açık mı — satırdaki (+) ile açılır; ekleme/vazgeç
  // sonrası kapanır. Bileşen-içi (her düğüm kendi durumunu tutar).
  const [addingSub, setAddingSub] = useState(false);
  const optimistic = isOptimisticItemId(node.id);
  // Derinlik sınırı: torun (depth `CHECKLIST_MAX_DEPTH - 1`) altına eklenemez.
  const canAddSub = editable && !optimistic && node.depth < CHECKLIST_MAX_DEPTH - 1;
  const hasChildren = node.children.length > 0;

  return (
    <ChecklistItemRow
      item={node}
      optimistic={optimistic}
      canEdit={editable}
      onToggle={(completed) => onToggle(node.id, completed)}
      onEdit={() => onEdit(node.id, node.content)}
      onDelete={() => onDelete(node.id)}
      onOpenComments={onOpenComments ? () => onOpenComments(node.id) : undefined}
      onOpenAttachments={onOpenAttachments ? () => onOpenAttachments(node.id) : undefined}
      highlighted={node.id === highlightItemId}
      onAddSubItem={canAddSub ? () => setAddingSub(true) : undefined}
    >
      {hasChildren || (addingSub && editable) ? (
        // Girintili alt ağaç bloğu — soldan ~20px (ml + pl) + ince sol sınır
        // (web `ml-2.5 border-l pl-2.5` simetrisi). Token renk (`border-border`).
        <View className="ml-2.5 mt-1 gap-1 border-l border-border pl-2.5">
          {node.children.map((child) => (
            <ChecklistTreeItem
              key={child.id}
              node={child}
              checklistId={checklistId}
              editable={editable}
              createPending={createPending}
              highlightItemId={highlightItemId}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              onOpenComments={onOpenComments}
              onOpenAttachments={onOpenAttachments}
              onCreateSubItem={onCreateSubItem}
            />
          ))}
          {addingSub && editable ? (
            <ChecklistItemComposer
              open
              onClose={() => setAddingSub(false)}
              pending={createPending}
              label={strings.cardDetail.checklistSubItemAdd}
              placeholder={strings.cardDetail.checklistSubItemPlaceholder}
              onCreate={(content) => onCreateSubItem(node.id, content)}
            />
          ) : null}
        </View>
      ) : null}
    </ChecklistItemRow>
  );
}

/**
 * "Kontrol listesi ekle" satır-içi composer'ı (DEM-198 + DEM-204; 2026-06-20
 * controlled). Tetikleyici artık bölüm başlığındaki "+ Ekle" aksiyonunda —
 * bu bileşen yalnız FORM'u render eder, açık/kapalı durumu üstten (`open`)
 * gelir. Gönderdikten sonra alan temizlenir ama form açık kalır (art arda liste
 * eklemeye izin — Trello deseni); "Vazgeç" `onClose` ile kapatır.
 */
function ChecklistComposer({
  open,
  onClose,
  pending,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  onCreate: (title: string) => void;
}) {
  const [title, setTitle] = useState('');

  const submit = () => {
    const trimmed = title.trim();
    // `checklist.create` idempotent değil — uçuştaki istek varken ya da boş
    // başlıkla yeni liste gönderme (çift liste oluşmasın).
    if (trimmed.length === 0 || pending) return;
    onCreate(trimmed);
    // Optimistic ekleme anında görünür; alanı hemen temizle.
    setTitle('');
  };

  const close = () => {
    setTitle('');
    onClose();
  };

  if (!open) return null;

  return (
    <View className="gap-2">
      <TextField
        label={strings.cardDetail.checklistAdd}
        placeholder={strings.cardDetail.checklistTitlePlaceholder}
        value={title}
        onChangeText={setTitle}
        editable={!pending}
        returnKeyType="done"
        onSubmitEditing={submit}
        autoFocus
      />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            label={strings.cardDetail.cancel}
            variant="ghost"
            onPress={close}
            disabled={pending}
          />
        </View>
        <View className="flex-1">
          <Button
            label={strings.cardDetail.checklistAdd}
            onPress={submit}
            pending={pending}
            disabled={title.trim().length === 0 || pending}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * Tek kontrol listesinin "madde ekle" girişi (DEM-204; 2026-06-20 controlled).
 * Tetikleyici artık o listenin kendi header'ındaki "+" aksiyonunda — bu bileşen
 * yalnız FORM'u render eder, açık/kapalı durumu üstten (`open`) gelir. Gönderim
 * sonrası alan temizlenir, form açık kalır (art arda madde girişi); "Vazgeç"
 * `onClose` ile kapatır.
 */
function ChecklistItemComposer({
  open,
  onClose,
  pending,
  onCreate,
  // Kök madde ekleme varsayılanları; alt madde (nested) composer'ı "Alt madde
  // ekle" etiketi + alt madde placeholder'ıyla çağırır.
  label = strings.cardDetail.checklistItemAdd,
  placeholder = strings.cardDetail.checklistItemPlaceholder,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  onCreate: (content: string) => void;
  label?: string;
  placeholder?: string;
}) {
  const [content, setContent] = useState('');

  const submit = () => {
    const trimmed = content.trim();
    // `checklist.item.create` idempotent değil — uçuştaki istek varken ya da
    // boş içerikle yeni madde gönderme (çift madde oluşmasın).
    if (trimmed.length === 0 || pending) return;
    onCreate(trimmed);
    // Optimistic ekleme anında görünür; alanı hemen temizleyip arka arkaya
    // madde girişine izin ver.
    setContent('');
  };

  const close = () => {
    setContent('');
    onClose();
  };

  if (!open) return null;

  return (
    <View className="mt-1 gap-2">
      <TextField
        label={label}
        placeholder={placeholder}
        value={content}
        onChangeText={setContent}
        editable={!pending}
        returnKeyType="done"
        onSubmitEditing={submit}
        autoFocus
      />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            label={strings.cardDetail.cancel}
            variant="ghost"
            onPress={close}
            disabled={pending}
          />
        </View>
        <View className="flex-1">
          <Button
            label={label}
            onPress={submit}
            pending={pending}
            disabled={content.trim().length === 0 || pending}
          />
        </View>
      </View>
    </View>
  );
}
