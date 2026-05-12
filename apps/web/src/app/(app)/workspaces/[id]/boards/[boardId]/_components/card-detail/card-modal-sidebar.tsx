'use client';

import { useMemo, useState } from 'react';
import { PaperclipIcon } from 'lucide-react';
import { EmptyState, Tabs, TabsContent, TabsList, TabsTrigger } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { CardDetailActivity } from './card-detail-activity';
import { CardCommentComposer, CardDetailComments, type CommentView } from './card-detail-comments';
import type { CardActivityEvent } from './activity-summary';

type CardModalSidebarProps = {
  comments: CommentView[];
  activity: CardActivityEvent[];
  activityPending: boolean;
  activityError: string | null;
  /** Resolve a user id to a display name. */
  nameOf: (userId: string) => string | null | undefined;
  viewerUserId: string;
  viewerName: string | null;
  isBoardAdmin: boolean;
  /** Board `member+` and board active — may add / edit / delete own comments. */
  canComment: boolean;
  onCreateComment: (body: string) => void;
  onEditComment: (input: { commentId: string; body: string }) => void;
  onDeleteComment: (commentId: string) => void;
  commentPending: boolean;
  commentError: string | null;
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
 * / Ekler / Tümü, each with a count) + the always-visible comment composer, then
 * the scrolling tab content. Comments newest-first; activity newest-first; Ekler
 * is an empty placeholder (attachments — Faz 8); Tümü merges comments + activity
 * by `createdAt` (descending). Presentational — the dialog wires the mutations.
 */
export function CardModalSidebar({
  comments,
  activity,
  activityPending,
  activityError,
  nameOf,
  viewerUserId,
  viewerName,
  isBoardAdmin,
  canComment,
  onCreateComment,
  onEditComment,
  onDeleteComment,
  commentPending,
  commentError,
}: CardModalSidebarProps) {
  const copy = strings.card.detail;
  const [tab, setTab] = useState<'comments' | 'activity' | 'attachments' | 'all'>('comments');

  const visibleCommentCount = useMemo(() => comments.filter((c) => c.deletedAt == null).length, [comments]);
  const activityCount = activity.length;
  const attachmentCount = 0;
  const allCount = comments.length + activityCount;

  // Newest-first ordering for the lists.
  const commentsNewestFirst = useMemo(
    () => [...comments].sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt)),
    [comments],
  );
  const allItems = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [
      ...comments.map((comment) => ({ kind: 'comment' as const, at: timeOf(comment.createdAt), comment })),
      ...activity.map((event) => ({ kind: 'activity' as const, at: timeOf(event.createdAt), event })),
    ];
    return items.sort((a, b) => b.at - a.at);
  }, [comments, activity]);

  const commentsList = (
    <CardDetailComments
      comments={commentsNewestFirst}
      nameOf={nameOf}
      viewerUserId={viewerUserId}
      isBoardAdmin={isBoardAdmin}
      canComment={canComment}
      onEdit={onEditComment}
      onDelete={onDeleteComment}
      pending={commentPending}
      error={commentError}
    />
  );
  const activityList = (
    <CardDetailActivity events={activity} pending={activityPending} error={activityError} />
  );

  return (
    <aside
      data-slot="card-modal-sidebar"
      className="bg-muted/40 flex flex-col overflow-hidden border-t backdrop-blur md:border-t-0 md:border-l"
    >
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="bg-muted/40 sticky top-0 z-10 shrink-0 space-y-3 border-b px-4 py-2.5 backdrop-blur">
          <TabsList className="w-full">
            <TabsTrigger value="comments">
              {copy.tabs.comments} {visibleCommentCount}
            </TabsTrigger>
            <TabsTrigger value="activity">
              {copy.tabs.activity} {activityCount}
            </TabsTrigger>
            <TabsTrigger value="attachments">
              {copy.tabs.attachments} {attachmentCount}
            </TabsTrigger>
            <TabsTrigger value="all">
              {copy.tabs.all} {allCount}
            </TabsTrigger>
          </TabsList>

          {canComment && (
            <CardCommentComposer
              viewerName={viewerName}
              onSubmit={onCreateComment}
              pending={commentPending}
              error={commentError}
            />
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <TabsContent value="comments">{commentsList}</TabsContent>
          <TabsContent value="activity">{activityList}</TabsContent>
          <TabsContent value="attachments">
            <EmptyState icon={<PaperclipIcon className="size-8" />} message={copy.attachments.empty} />
          </TabsContent>
          <TabsContent value="all">
            {allItems.length === 0 ? (
              <EmptyState icon={<PaperclipIcon className="size-8" />} message={strings.card.activity.empty} />
            ) : (
              <div className="space-y-3">
                {allItems.map((item) =>
                  item.kind === 'comment' ? (
                    <CardDetailComments
                      key={`c-${item.comment.id}`}
                      comments={[item.comment]}
                      nameOf={nameOf}
                      viewerUserId={viewerUserId}
                      isBoardAdmin={isBoardAdmin}
                      canComment={canComment}
                      onEdit={onEditComment}
                      onDelete={onDeleteComment}
                      pending={commentPending}
                      error={null}
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
