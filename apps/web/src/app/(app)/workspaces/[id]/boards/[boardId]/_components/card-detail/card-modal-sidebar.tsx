'use client';

import { useMemo, useState } from 'react';
export type CardSidebarTab = 'comments' | 'activity';
import { Tabs, TabsContent, TabsList, TabsTrigger, type MentionSource } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { CardDetailActivity } from './card-detail-activity';
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
  comments: CommentView[];
  activity: CardActivityEvent[];
  activityPending: boolean;
  activityError: string | null;
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
   * Optional controlled tab — when set, the parent owns the active tab. Falls
   * back to internal state when omitted.
   */
  tab?: CardSidebarTab;
  onTabChange?: (tab: CardSidebarTab) => void;
};

function timeOf(value: Date | string): number {
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Card modal right panel: a sticky header with the tab strip (Yorumlar /
 * Aktivite, each with a count), then the scrolling tab content. The comment
 * composer lives inside the Yorumlar tab only. Comments newest-first; activity
 * newest-first. Attachments are no longer a tab here (2026-07-05) — ek yönetimi
 * sol kolon altındaki collapsible galeride (`CardDetailAttachments`).
 * Presentational — the dialog wires the mutations.
 */
export function CardModalSidebar({
  comments,
  activity,
  activityPending,
  activityError,
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

  // Newest-first ordering for the comment list.
  const commentsNewestFirst = useMemo(
    () => [...comments].sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt)),
    [comments],
  );

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
        </div>
      </Tabs>
    </aside>
  );
}
