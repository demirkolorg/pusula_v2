import { describe, expect, it } from 'vitest';
import { resolveNotificationLink } from './notification-link';
import type { NotificationRow } from './notification-types';

/**
 * Build a notification row with a given type + payload. Top-level
 * `workspaceId`/`boardId`/`cardId` mirror the payload so `notificationPayload`'s
 * fallback (top-level → payload) doesn't mask the focus-param assertions.
 */
function row(type: string, payload: Record<string, unknown>): NotificationRow {
  return {
    id: 'n1',
    recipientId: 'user_1',
    actorId: 'actor_1',
    type,
    workspaceId: (payload.workspaceId as string) ?? null,
    boardId: (payload.boardId as string) ?? null,
    cardId: (payload.cardId as string) ?? null,
    payload,
    readAt: null,
    createdAt: new Date('2026-06-20T10:00:00.000Z'),
  } as NotificationRow;
}

const cardBase = { workspaceId: 'ws1', boardId: 'b1', cardId: 'c1' };

describe('resolveNotificationLink', () => {
  it('builds a plain card deep-link when there is no in-card focus target', () => {
    const link = resolveNotificationLink(row('card_assigned', cardBase));
    expect(link).toBe('/workspaces/ws1/boards/b1?card=c1');
  });

  it('appends ?comment + tab=comments for a comment target', () => {
    const link = resolveNotificationLink(
      row('mention', { ...cardBase, commentId: 'cm1' }),
    );
    const params = new URLSearchParams(link!.split('?')[1]);
    expect(params.get('card')).toBe('c1');
    expect(params.get('comment')).toBe('cm1');
    expect(params.get('tab')).toBe('comments');
  });

  it('appends ?checklistItem for a checklist-item target (checklistItemId)', () => {
    const link = resolveNotificationLink(
      row('checklist_item_assigned', { ...cardBase, checklistItemId: 'ci1' }),
    );
    const params = new URLSearchParams(link!.split('?')[1]);
    expect(params.get('checklistItem')).toBe('ci1');
    // Checklist target sits in the left column — no sidebar tab forced.
    expect(params.get('tab')).toBeNull();
  });

  it('falls back to payload.itemId for the checklist-item id', () => {
    const link = resolveNotificationLink(
      row('checklist_item_completed', { ...cardBase, itemId: 'ci2' }),
    );
    const params = new URLSearchParams(link!.split('?')[1]);
    expect(params.get('checklistItem')).toBe('ci2');
  });

  it('appends ?attachment + tab=attachments for an attachment target', () => {
    const link = resolveNotificationLink(
      row('attachment_added', { ...cardBase, attachmentId: 'at1' }),
    );
    const params = new URLSearchParams(link!.split('?')[1]);
    expect(params.get('attachment')).toBe('at1');
    expect(params.get('tab')).toBe('attachments');
  });

  it('prioritises the comment target when several focus ids coexist', () => {
    const link = resolveNotificationLink(
      row('mention', {
        ...cardBase,
        commentId: 'cm1',
        checklistItemId: 'ci1',
        attachmentId: 'at1',
      }),
    );
    const params = new URLSearchParams(link!.split('?')[1]);
    expect(params.get('comment')).toBe('cm1');
    expect(params.get('checklistItem')).toBeNull();
    expect(params.get('attachment')).toBeNull();
  });

  it('honours a trusted absolute linkTo verbatim (open-redirect guard intact)', () => {
    const link = resolveNotificationLink(
      row('mention', { ...cardBase, commentId: 'cm1', linkTo: '/workspaces/ws1/boards/b1?card=c1&comment=cm1&tab=comments' }),
    );
    expect(link).toBe('/workspaces/ws1/boards/b1?card=c1&comment=cm1&tab=comments');
  });

  it('rejects a protocol-relative linkTo (falls back to derived card link)', () => {
    const link = resolveNotificationLink(
      row('mention', { ...cardBase, commentId: 'cm1', linkTo: '//evil.com/x' }),
    );
    // Derived link wins; the malicious linkTo is ignored.
    expect(link?.startsWith('/workspaces/ws1/boards/b1?')).toBe(true);
    expect(link).toContain('comment=cm1');
  });
});
