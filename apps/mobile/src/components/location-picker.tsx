import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text } from '@/components/text';
import { Icon, type IconName } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { AppSpinner } from '@/components/app-spinner';
import { useTRPC } from '@/trpc/provider';
import {
  applyBoard,
  applyList,
  applyWorkspace,
  selectionComplete,
  type LocationPickerDepth,
  type LocationSelection,
} from '@/lib/location-selection';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

/**
 * Kademeli konum seçici — DEM-203 ortak bileşeni.
 *
 * Workspace → Pano → Liste seçimini tek bir yüzeyde toplar; kart oluştur,
 * liste oluştur, pano oluştur ve not→kart dönüşümü akışlarında yeniden
 * kullanılır. Her akış `depth` ile ihtiyaç duyduğu derinliğe kadar seçim
 * ister (liste oluştur `'board'`'ta durur, pano oluştur `'workspace'`'te).
 *
 * `MoveToListSheet`'ten farkı: o tek board içinde liste seçer; bu workspace
 * düzeyinden başlayan tam kademeli seçicidir.
 *
 * Kullanım — `useLocationPicker` hook + `LocationPicker` bileşeni:
 *
 *   const picker = useLocationPicker('list');
 *   <LocationPicker {...picker} />
 *   // picker.selection → { workspaceId, boardId?, listId? } | null
 *   // picker.isComplete → seçim `depth`'e ulaştı mı
 *
 * Tüketici, seçim tamamlanınca `picker.selection`'ı okur; ayrı bir
 * `onComplete` callback'i istenirse `useLocationPicker(depth, onComplete)`.
 *
 * Saf state mantığı (`selectionComplete` + `apply*` geçişleri) `lib/location-selection`
 * modülünden gelir — birim testleri orada.
 */

export type { LocationPickerDepth, LocationSelection } from '@/lib/location-selection';

type LocationPickerState = {
  depth: LocationPickerDepth;
  selection: LocationSelection | null;
  /** Seçim `depth`'in gerektirdiği tüm seviyeleri kapsıyor mu. */
  isComplete: boolean;
  /** Adım seçimlerini uygulayan iç handler'lar (bileşene geçirilir). */
  setWorkspace: (workspace: { id: string; name: string }) => void;
  setBoard: (board: { id: string; title: string }) => void;
  setList: (list: { id: string; title: string }) => void;
  /** Seçimi tamamen sıfırla. */
  reset: () => void;
};

/**
 * Konum seçici state hook'u. `depth` hangi seviyeye kadar seçim isteneceğini
 * belirler. İsteğe bağlı `onComplete`, seçim `depth`'e ulaştığında çağrılır.
 *
 * Üst seviye değişince alt seviyeler temizlenir (workspace değişirse board +
 * list düşer) — tutarsız `{ workspaceId, boardId }` çiftleri oluşmaz.
 */
export function useLocationPicker(
  depth: LocationPickerDepth,
  onComplete?: (selection: LocationSelection) => void,
): LocationPickerState {
  const [selection, setSelection] = useState<LocationSelection | null>(null);

  const emitIfComplete = useCallback(
    (next: LocationSelection | null) => {
      if (next && selectionComplete(depth, next)) onComplete?.(next);
    },
    [depth, onComplete],
  );

  const setWorkspace = useCallback(
    (workspace: { id: string; name: string }) => {
      // Workspace değişti → board + list seçimleri geçersiz, sıfırlanır.
      const next = applyWorkspace(workspace);
      setSelection(next);
      emitIfComplete(next);
    },
    [emitIfComplete],
  );

  const setBoard = useCallback(
    (board: { id: string; title: string }) => {
      setSelection((current) => {
        // Board değişti → list seçimi geçersiz, sıfırlanır.
        const next = applyBoard(current, board);
        emitIfComplete(next);
        return next;
      });
    },
    [emitIfComplete],
  );

  const setList = useCallback(
    (list: { id: string; title: string }) => {
      setSelection((current) => {
        const next = applyList(current, list);
        emitIfComplete(next);
        return next;
      });
    },
    [emitIfComplete],
  );

  const reset = useCallback(() => setSelection(null), []);

  return {
    depth,
    selection,
    isComplete: selectionComplete(depth, selection),
    setWorkspace,
    setBoard,
    setList,
    reset,
  };
}

/** Tek bir tetikleyici satır — etiket + seçili değer; dokununca adım sheet'i açar. */
function PickerRow({
  icon,
  label,
  value,
  locked,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: string | undefined;
  locked: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const display = value ?? label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: locked }}
      disabled={locked}
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 ${
        locked ? 'opacity-50' : 'active:opacity-70'
      }`}
    >
      <Icon name={icon} size={18} color={value ? theme.primary : theme.mutedForeground} />
      <Text
        weight={value ? 'medium' : 'regular'}
        numberOfLines={1}
        className={`flex-1 text-sm ${value ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {display}
      </Text>
      {!locked ? <Icon name="chevron-right" size={18} color={theme.mutedForeground} /> : null}
    </Pressable>
  );
}

/** Bir adım sheet'inin ortak gövdesi — yükleniyor / boş / hata / liste. */
function StepList<T extends { id: string }>({
  isPending,
  isError,
  items,
  emptyLabel,
  selectedId,
  renderTitle,
  onSelect,
  onRetry,
}: {
  isPending: boolean;
  isError: boolean;
  items: readonly T[];
  emptyLabel: string;
  selectedId: string | undefined;
  renderTitle: (item: T) => string;
  onSelect: (item: T) => void;
  onRetry: () => void;
}) {
  const theme = useTheme();

  if (isPending) {
    return (
      <View className="items-center py-6">
        <AppSpinner size="sm" />
      </View>
    );
  }

  if (isError) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        className="flex-row items-center justify-center gap-2 py-4 active:opacity-70"
      >
        <Icon name="alert-triangle" size={16} color={theme.destructive} />
        <Text className="text-sm text-destructive">{strings.locationPicker.loadError}</Text>
      </Pressable>
    );
  }

  if (items.length === 0) {
    return <Text className="py-4 text-sm text-muted-foreground">{emptyLabel}</Text>;
  }

  return (
    <ScrollView className="max-h-80" contentContainerClassName="gap-2">
      {items.map((item) => {
        const isSelected = item.id === selectedId;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(item)}
            className={`flex-row items-center gap-3 rounded-lg border px-3 py-3 ${
              isSelected
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card active:opacity-70'
            }`}
          >
            <Icon
              name={isSelected ? 'check-circle' : 'circle'}
              size={18}
              color={isSelected ? theme.primary : theme.mutedForeground}
            />
            <Text
              weight={isSelected ? 'semibold' : 'regular'}
              numberOfLines={1}
              className={`flex-1 text-sm ${isSelected ? 'text-primary' : 'text-foreground'}`}
            >
              {renderTitle(item)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

type ActiveStep = 'workspace' | 'board' | 'list' | null;

type LocationPickerProps = LocationPickerState;

/**
 * Konum seçici görsel bileşeni — `useLocationPicker`'ın döndürdüğü state'i
 * doğrudan alır (`<LocationPicker {...picker} />`). `depth`'e göre 1-3
 * tetikleyici satır gösterir; satıra dokununca ilgili adım `Sheet`'i açılır.
 *
 * Veri çekimi: `workspace.list` (kök), `board.list` (seçili workspace ile),
 * `board.get` (seçili pano → aktif listeler). Arşivli pano/liste elenir;
 * board.get arşivli listeleri de döndürdüğü için liste adımında
 * `archivedAt === null` filtresi uygulanır.
 */
export function LocationPicker({
  depth,
  selection,
  setWorkspace,
  setBoard,
  setList,
}: LocationPickerProps) {
  const trpc = useTRPC();
  const [activeStep, setActiveStep] = useState<ActiveStep>(null);

  const showBoardRow = depth === 'board' || depth === 'list';
  const showListRow = depth === 'list';

  // --- Veri çekimi — her adım yalnız sheet açıkken etkin -----------------
  const workspacesQuery = useQuery({
    ...trpc.workspace.list.queryOptions(),
    enabled: activeStep === 'workspace',
  });

  const boardsQuery = useQuery({
    ...trpc.board.list.queryOptions(
      { workspaceId: selection?.workspaceId ?? '' },
      // `enabled` workspace seçili + board adımı açıkken — boş string çağrı yapmaz.
    ),
    enabled: activeStep === 'board' && Boolean(selection?.workspaceId),
  });

  const boardQuery = useQuery({
    ...trpc.board.get.queryOptions(
      { boardId: selection?.boardId ?? '' },
    ),
    enabled: activeStep === 'list' && Boolean(selection?.boardId),
  });

  // board.list arşivli panoları da döndürür — yeni içerik oluşturma için elenir.
  const activeBoards = (boardsQuery.data ?? []).filter((board) => board.archivedAt === null);
  // board.get arşivli listeleri de döndürür — aktif liste hedef olabilir.
  const activeLists = (boardQuery.data?.lists ?? []).filter((list) => list.archivedAt === null);

  return (
    <View className="gap-2">
      <PickerRow
        icon="grid"
        label={strings.locationPicker.workspaceEmpty}
        value={selection?.workspaceName}
        locked={false}
        onPress={() => setActiveStep('workspace')}
      />

      {showBoardRow ? (
        <PickerRow
          icon="trello"
          label={
            selection?.workspaceId
              ? strings.locationPicker.boardEmpty
              : strings.locationPicker.boardLocked
          }
          value={selection?.boardTitle}
          locked={!selection?.workspaceId}
          onPress={() => setActiveStep('board')}
        />
      ) : null}

      {showListRow ? (
        <PickerRow
          icon="list"
          label={
            selection?.boardId
              ? strings.locationPicker.listEmpty
              : strings.locationPicker.listLocked
          }
          value={selection?.listTitle}
          locked={!selection?.boardId}
          onPress={() => setActiveStep('list')}
        />
      ) : null}

      {/* Adım 1 — çalışma alanı seçimi. */}
      <Sheet
        visible={activeStep === 'workspace'}
        title={strings.locationPicker.workspaceTitle}
        onClose={() => setActiveStep(null)}
      >
        <StepList
          isPending={workspacesQuery.isPending}
          isError={workspacesQuery.isError}
          items={workspacesQuery.data ?? []}
          emptyLabel={strings.locationPicker.workspaceEmptyList}
          selectedId={selection?.workspaceId}
          renderTitle={(workspace) => workspace.name}
          onRetry={() => workspacesQuery.refetch()}
          onSelect={(workspace) => {
            setWorkspace({ id: workspace.id, name: workspace.name });
            setActiveStep(null);
          }}
        />
      </Sheet>

      {/* Adım 2 — pano seçimi (arşivli panolar elenir). */}
      <Sheet
        visible={activeStep === 'board'}
        title={strings.locationPicker.boardTitle}
        onClose={() => setActiveStep(null)}
      >
        <StepList
          isPending={boardsQuery.isPending}
          isError={boardsQuery.isError}
          items={activeBoards}
          emptyLabel={strings.locationPicker.boardEmptyList}
          selectedId={selection?.boardId}
          renderTitle={(board) => board.title}
          onRetry={() => boardsQuery.refetch()}
          onSelect={(board) => {
            setBoard({ id: board.id, title: board.title });
            setActiveStep(null);
          }}
        />
      </Sheet>

      {/* Adım 3 — liste seçimi (panonun aktif listeleri). */}
      <Sheet
        visible={activeStep === 'list'}
        title={strings.locationPicker.listTitle}
        onClose={() => setActiveStep(null)}
      >
        <StepList
          isPending={boardQuery.isPending}
          isError={boardQuery.isError}
          items={activeLists}
          emptyLabel={strings.locationPicker.listEmptyList}
          selectedId={selection?.listId}
          renderTitle={(list) => list.title}
          onRetry={() => boardQuery.refetch()}
          onSelect={(list) => {
            setList({ id: list.id, title: list.title });
            setActiveStep(null);
          }}
        />
      </Sheet>
    </View>
  );
}
