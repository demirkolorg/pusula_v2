'use client';

import { useMemo, useState } from 'react';
export type CardSidebarTab = 'comments' | 'activity' | 'attachments' | 'all';
import { ActivityIcon } from 'lucide-react';
import {
  EmptyState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type MentionSource,
} from '@pusula/ui';
import { strings } from '@/lib/strings';
import { CardDetailActivity } from './card-detail-activity';
import { CardDetailAttachments } from './card-detail-attachments';
import { CardCommentComposer, CardDetailComments, type CommentView } from './card-detail-comments';
import type { CardActivityEvent } from './activity-summary';

/** A tab label + its count, with the count rendered as a muted suffix. */
function TabLabel({ label, count }: { label: string; count: number }) {
  return (
    <>
      {label} <span className="text-muted-foreground">{count}</span>
    </>
  );
}

type CardModalSidebarProps = {
  /** Card id — drives the attachments tab queries (Faz 11D). */
  cardId: string;
  comments: CommentView[];
  activity: CardActivityEvent[];
  activityPending: boolean;
  activityError: string | null;
  /** Committed-attachment count — drives the "Ekler" tab counter. */
  attachmentCount: number;
  /** Resolve a user id to a display name. */
  nameOf: (userId: string) => string | null | undefined;
  /** Resolve a user id to an avatar URL (`null` when unset). */
  imageOf: (userId: string) => string | null;
  viewerUserId: string;
  viewerName: string | null;
  /** The viewer's avatar URL (`null` when unset) — for the comment composer. */
  viewerImage: string | null;
  isBoardAdmin: boolean;
  /** Board `member+` and board active — may add / edit / delete own comments. */
  canComment: boolean;
  onCreateComment: (body: string) => void;
  onEditComment: (input: { commentId: string; body: string }) => void;
  onDeleteComment: (commentId: string) => void;
  commentPending: boolean;
  commentError: string | null;
  /** Optional @-mention picker source (board members) for composer + inline edit. */
  mentions?: MentionSource;
  /**
   * Optional controlled tab — when set, the parent owns the active tab (used
   * by the "Ek" meta chip to jump to the attachments tab). Falls back to
   * internal state when omitted.
   */
  tab?: CardSidebarTab;
  onTabChange?: (tab: CardSidebarTab) => void;
};

type FeedItem =
  | { kind: 'comment'; at: number; comment: CommentView }
  | { kind: 'activity'; at: number; event: CardActivityEvent };

function timeOf(value: Date | string): number {
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Card modal right panel: a sticky header with the tab strip (Yorumlar / Aktivite
 * / Ekler / Tümü, each with a count), then the scrolling tab content. The comment
 * composer lives inside the Yorumlar tab only (mirroring how the upload dropzone
 * lives inside the Ekler tab). Comments newest-first; activity newest-first; Ekler
 * is an empty placeholder (attachments — Faz 8); Tümü merges comments + activity
 * by `createdAt` (descending). Presentational — the dialog wires the mutations.
 */
export function CardModalSidebar({
  cardId,
  comments,
  activity,
  activityPending,
  activityError,
  attachmentCount,
  nameOf,
  imageOf,
  viewerUserId,
  viewerName,
  viewerImage,
  isBoardAdmin,
  canComment,
  onCreateComment,
  onEditComment,
  onDeleteComment,
  commentPending,
  commentError,
  mentions,
  tab: controlledTab,
  onTabChange,
}: CardModalSidebarProps) {
  const copy = strings.card.detail;
  const [internalTab, setInternalTab] = useState<CardSidebarTab>('comments');
  const tab = controlledTab ?? internalTab;
  const setTab = (next: CardSidebarTab) => {
    if (controlledTab === undefined) setInternalTab(next);
    onTabChange?.(next);
  };

  const visibleCommentCount = useMemo(
    () => comments.filter((c) => c.deletedAt == null).length,
    [comments],
  );
  const activityCount = activity.length;
  const allCount = comments.length + activityCount;

  // Newest-first ordering for the lists.
  const commentsNewestFirst = useMemo(
    () => [...comments].sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt)),
    [comments],
  );
  const allItems = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [
      ...comments.map((comment) => ({
        kind: 'comment' as const,
        at: timeOf(comment.createdAt),
        comment,
      })),
      ...activity.map((event) => ({
        kind: 'activity' as const,
        at: timeOf(event.createdAt),
        event,
      })),
    ];
    return items.sort((a, b) => b.at - a.at);
  }, [comments, activity]);

  const commentsList = (
    <CardDetailComments
      comments={commentsNewestFirst}
      nameOf={nameOf}
      imageOf={imageOf}
      viewerUserId={viewerUserId}
      isBoardAdmin={isBoardAdmin}
      canComment={canComment}
      onEdit={onEditComment}
      onDelete={onDeleteComment}
      pending={commentPending}
      error={commentError}
      mentions={mentions}
    />
  );
  const activityList = (
    <CardDetailActivity events={activity} pending={activityPending} error={activityError} />
  );

  return (
    <aside
      data-slot="card-modal-sidebar"
      className="relative flex flex-col overflow-hidden border-t bg-muted/40 backdrop-blur md:border-t-0 md:border-l"
    >
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as CardSidebarTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="sticky top-0 z-10 shrink-0 bg-muted/40 px-4 pt-3 pb-2.5 backdrop-blur sm:px-[18px]">
          <TabsList>
            <TabsTrigger value="comments" className="px-2 py-[3px] text-[11.5px]">
              <TabLabel label={copy.tabs.comments} count={visibleCommentCount} />
            </TabsTrigger>
            <TabsTrigger value="activity" className="px-2 py-[3px] text-[11.5px]">
              <TabLabel label={copy.tabs.activity} count={activityCount} />
            </TabsTrigger>
            <TabsTrigger value="attachments" className="px-2 py-[3px] text-[11.5px]">
              <TabLabel label={copy.tabs.attachments} count={attachmentCount} />
            </TabsTrigger>
            <TabsTrigger value="all" className="px-2 py-[3px] text-[11.5px]">
              <TabLabel label={copy.tabs.all} count={allCount} />
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="pusula-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-4 sm:px-[18px] sm:pb-[18px]">
          <TabsContent value="comments" className="space-y-3">
            {canComment && (
              <CardCommentComposer
                viewerName={viewerName}
                viewerImage={viewerImage}
                onSubmit={onCreateComment}
                pending={commentPending}
                error={commentError}
                mentions={mentions}
              />
            )}
            {commentsList}
          </TabsContent>
          <TabsContent value="activity">{activityList}</TabsContent>
          <TabsContent value="attachments">
            <CardDetailAttachments
              cardId={cardId}
              canEdit={canComment}
              isBoardAdmin={isBoardAdmin}
              viewerUserId={viewerUserId}
            />
          </TabsContent>
          <TabsContent value="all">
            {allItems.length === 0 ? (
              <EmptyState
                icon={<ActivityIcon className="size-8" />}
                message={strings.card.activity.empty}
              />
            ) : (
              <div className="space-y-3">
                {allItems.map((item) =>
                  item.kind === 'comment' ? (
                    <CardDetailComments
                      key={`c-${item.comment.id}`}
                      comments={[item.comment]}
                      nameOf={nameOf}
                      imageOf={imageOf}
                      viewerUserId={viewerUserId}
                      isBoardAdmin={isBoardAdmin}
                      canComment={canComment}
                      onEdit={onEditComment}
                      onDelete={onDeleteComment}
                      pending={commentPending}
                      error={null}
                      mentions={mentions}
                    />
                  ) : (
                    <CardDetailActivity
                      key={`a-${item.event.id}`}
                      events={[item.event]}
                      pending={false}
                      error={null}
                    />
                  ),
                )}
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}
