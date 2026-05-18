import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { RouterOutputs } from '@pusula/api';
import { EntityAvatar } from '@/components/entity-avatar';
import { Sheet } from '@/components/sheet';
import { MoveToListSheet } from '@/components/move-to-list-sheet';
import { CardMetaChip } from '@/components/card-detail/meta-chip';
import { LabelsSheetBody } from '@/components/card-detail/labels-sheet';
import { DueDateSheetBody } from '@/components/card-detail/due-date-sheet';
import { MembersSheetBody } from '@/components/card-detail/members-sheet';
import { CoverColorSheetBody } from '@/components/card-detail/cover-color-sheet';
import { labelColorHex } from '@/lib/label-color';
import { asCoverColor, coverColorHex } from '@/lib/cover-color';
import { formatDueDate, isOverdue } from '@/lib/format-date';
import { strings } from '@/lib/strings';

type CardLabels = RouterOutputs['card']['labels']['list'];
type CardMembers = RouterOutputs['card']['members']['list'];
type BoardMembers = RouterOutputs['board']['members']['list'];

type ListOption = { id: string; title: string };

type CardMetaBarProps = {
  cardId: string;
  boardId: string;
  labels: CardLabels;
  members: CardMembers;
  /** Kart üyesi aday havuzu — `board.members.list`. */
  boardMembers: BoardMembers;
  dueAt: Date | null;
  completed: boolean;
  /** Kartın kapak rengi (`card.get` -> `card.coverColor`; düz `text`). */
  coverColor: string | null;
  /** "Listeyi değiştir" hedef havuzu — board'un aktif listeleri. */
  lists: readonly ListOption[];
  currentListId: string;
  /** Kartın bulunduğu listenin adı — chip'te gösterilir. */
  currentListTitle: string | null;
  onMoveToList: (listId: string) => void;
  /** Çağıran board `member+` mi — `false` ise salt-okunur. */
  canEdit: boolean;
};

type OpenSheet = 'members' | 'due' | 'labels' | 'cover' | 'list' | null;

/** Üye avatar yığını — chip içinde son ~3 üye, üst üste binmiş. */
function MemberAvatarStack({ members }: { members: CardMembers }) {
  const shown = members.slice(0, 3);
  return (
    <View className="flex-row">
      {shown.map((member, index) => (
        <View
          key={member.userId}
          style={{ marginLeft: index === 0 ? 0 : -6 }}
          className="rounded-xl border-2 border-card"
        >
          <EntityAvatar name={member.name ?? '?'} image={member.image} size={18} />
        </View>
      ))}
    </View>
  );
}

/** Etiket renk noktaları — chip içinde son ~3 etiketin rengi. */
function LabelColorDots({ labels }: { labels: CardLabels }) {
  return (
    <View className="flex-row gap-1">
      {labels.slice(0, 3).map((label) => (
        <View
          key={label.labelId}
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: labelColorHex(label.color) }}
        />
      ))}
    </View>
  );
}

/**
 * Kart detay meta çubuğu (Faz 7G-2) — web kart modalı `CardModalMetaChips`'in
 * mobil karşılığı. Başlık altında kompakt bir chip satırı kartın durumunu özet
 * gösterir (Üyeler / Son tarih / Etiketler / Liste); bir chip'e dokununca ilgili
 * düzenleme alttan açılan bir bottom sheet'te yapılır — kullanıcı kart
 * detayından ayrılmaz. 7G'nin tam-genişlik bölüm editörlerinin yerini alır.
 */
export function CardMetaBar({
  cardId,
  boardId,
  labels,
  members,
  boardMembers,
  dueAt,
  completed,
  coverColor,
  lists,
  currentListId,
  currentListTitle,
  onMoveToList,
  canEdit,
}: CardMetaBarProps) {
  const [open, setOpen] = useState<OpenSheet>(null);
  const close = () => setOpen(null);
  // `coverColor` düz `text` gelir — geçerli 12-renk palet adına daraltılır.
  const cover = asCoverColor(coverColor);

  // Aynı kullanıcı birden çok rolle (assignee + watcher) görünebilir — chip
  // sayısı ve avatar yığını kullanıcı bazında benzersizleştirilir.
  const uniqueMembers = useMemo(() => {
    const seen = new Set<string>();
    return members.filter((member) => {
      if (seen.has(member.userId)) return false;
      seen.add(member.userId);
      return true;
    });
  }, [members]);
  const overdue = dueAt != null && !completed && isOverdue(dueAt);

  return (
    <>
      <View className="flex-row flex-wrap gap-2">
        <CardMetaChip
          icon="users"
          accessory={
            uniqueMembers.length > 0 ? <MemberAvatarStack members={uniqueMembers} /> : undefined
          }
          label={
            uniqueMembers.length > 0
              ? String(uniqueMembers.length)
              : strings.cardDetail.metaMembersEmpty
          }
          muted={uniqueMembers.length === 0}
          onPress={() => setOpen('members')}
          accessibilityLabel={strings.cardDetail.membersTitle}
        />

        <CardMetaChip
          icon="clock"
          label={dueAt != null ? formatDueDate(dueAt) : strings.cardDetail.metaDueEmpty}
          muted={dueAt == null}
          tone={overdue ? 'destructive' : 'default'}
          onPress={() => setOpen('due')}
          accessibilityLabel={strings.cardDetail.dueTitle}
        />

        <CardMetaChip
          icon="tag"
          accessory={labels.length > 0 ? <LabelColorDots labels={labels} /> : undefined}
          label={labels.length > 0 ? String(labels.length) : strings.cardDetail.metaLabelsEmpty}
          muted={labels.length === 0}
          onPress={() => setOpen('labels')}
          accessibilityLabel={strings.cardDetail.labelsTitle}
        />

        <CardMetaChip
          icon="image"
          accessory={
            cover != null ? (
              <View
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: coverColorHex[cover] }}
              />
            ) : undefined
          }
          label={
            cover != null
              ? strings.cardDetail.coverColorNames[cover]
              : strings.cardDetail.metaCoverEmpty
          }
          muted={cover == null}
          onPress={() => setOpen('cover')}
          accessibilityLabel={strings.cardDetail.coverTitle}
        />

        <CardMetaChip
          icon="list"
          label={currentListTitle ?? strings.cardDetail.metaListUnknown}
          muted={currentListTitle == null}
          // Liste taşıma yalnız `member+`; viewer için chip salt-gösterim.
          onPress={canEdit ? () => setOpen('list') : undefined}
          accessibilityLabel={strings.cardDetail.moveAction}
        />
      </View>

      <Sheet visible={open === 'members'} title={strings.cardDetail.membersTitle} onClose={close}>
        {open === 'members' ? (
          <MembersSheetBody
            cardId={cardId}
            members={members}
            boardMembers={boardMembers}
            canEdit={canEdit}
          />
        ) : null}
      </Sheet>

      <Sheet visible={open === 'due'} title={strings.cardDetail.dueTitle} onClose={close}>
        {open === 'due' ? (
          <DueDateSheetBody
            cardId={cardId}
            dueAt={dueAt}
            completed={completed}
            canEdit={canEdit}
          />
        ) : null}
      </Sheet>

      <Sheet visible={open === 'labels'} title={strings.cardDetail.labelsTitle} onClose={close}>
        {open === 'labels' ? (
          <LabelsSheetBody
            cardId={cardId}
            boardId={boardId}
            labels={labels}
            canEdit={canEdit}
          />
        ) : null}
      </Sheet>

      <Sheet visible={open === 'cover'} title={strings.cardDetail.coverTitle} onClose={close}>
        {open === 'cover' ? (
          <CoverColorSheetBody
            cardId={cardId}
            boardId={boardId}
            coverColor={cover}
            canEdit={canEdit}
          />
        ) : null}
      </Sheet>

      <MoveToListSheet
        visible={open === 'list'}
        lists={lists}
        currentListId={currentListId}
        onSelect={(listId) => {
          onMoveToList(listId);
          close();
        }}
        onClose={close}
      />
    </>
  );
}
