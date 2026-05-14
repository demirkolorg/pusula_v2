/**
 * Faz 6C realtime outbox integration coverage. These tests pin the mutation
 * families that were intentionally left out of Faz 5B: comments, checklists,
 * labels, card members, board members, and board invitations.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as dbMod from '@pusula/db';
import {
  activityEvents,
  boardInvitations,
  realtimeEvents,
  users,
  workspaceMembers,
  workspaces,
} from '@pusula/db';
import { createContext, type EnqueueRealtimePublish } from '../context';
import { appRouter } from '../root';
import { createCallerFactory } from '../trpc';

let probe: ReturnType<typeof dbMod.createDb> | undefined;
try {
  probe = dbMod.createDb();
  await probe.db.execute(dbMod.sql`select 1`);
} catch {
  await probe?.pool.end();
  probe = undefined;
}
const dbAvailable = probe !== undefined;

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
const newSlug = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 12)}`;

const ownerId = newId('u-rt6c-owner');
const memberId = newId('u-rt6c-member');
const bobId = newId('u-rt6c-bob');
const cardMemberId = newId('u-rt6c-card-member');
const directBoardMemberId = newId('u-rt6c-direct-board-member');
const createdUserIds = [ownerId, memberId, bobId, cardMemberId, directBoardMemberId];

const session = (id: string) => ({ user: { id, email: `${id}@example.test`, name: id } });

function callerFor(userId: string, enqueueRealtimePublish: EnqueueRealtimePublish = vi.fn<EnqueueRealtimePublish>()) {
  if (!probe) throw new Error('db not initialised');
  const create = createCallerFactory(appRouter);
  return create(createContext({ session: session(userId), db: probe.db, enqueueRealtimePublish }));
}

function dataOf<T>(row: { payload: unknown }): T {
  return (row.payload as { data: T }).data;
}

describe.runIf(dbAvailable)('Faz 6C realtime outbox (integration)', () => {
  const db = () => probe!.db;
  const enqueue = vi.fn<EnqueueRealtimePublish>();
  let workspaceId: string;
  let boardId: string;
  let cardId: string;
  const createdWorkspaceIds: string[] = [];

  beforeAll(async () => {
    await db()
      .insert(users)
      .values(createdUserIds.map((id) => ({ id, name: id, email: `${id}@example.test` })));

    const ws = await callerFor(ownerId).workspace.create({
      name: 'RT 6C Co',
      slug: newSlug('rt-6c-co'),
      clientMutationId: crypto.randomUUID(),
    });
    workspaceId = ws.id;
    createdWorkspaceIds.push(ws.id);
    await db()
      .insert(workspaceMembers)
      .values([
        { workspaceId, userId: memberId, role: 'member' },
        { workspaceId, userId: bobId, role: 'member' },
        { workspaceId, userId: cardMemberId, role: 'member' },
        { workspaceId, userId: directBoardMemberId, role: 'guest' },
      ]);

    const board = await callerFor(ownerId).board.create({
      workspaceId,
      title: 'RT 6C Board',
      clientMutationId: crypto.randomUUID(),
    });
    boardId = board.id;
    const list = await callerFor(ownerId).list.create({
      boardId,
      title: 'Backlog',
      clientMutationId: crypto.randomUUID(),
    });
    const card = await callerFor(ownerId).card.create({
      listId: list.id,
      title: '6C card',
      clientMutationId: crypto.randomUUID(),
    });
    cardId = card.id;
  });

  afterAll(async () => {
    for (const id of createdWorkspaceIds) {
      await db().delete(workspaces).where(dbMod.eq(workspaces.id, id));
    }
    await db().delete(users).where(dbMod.inArray(users.id, createdUserIds));
  });

  const rtByMutation = async (clientMutationId: string) =>
    db().select().from(realtimeEvents).where(dbMod.eq(realtimeEvents.clientMutationId, clientMutationId));

  const mentionActivitiesFor = (commentId: string) =>
    db()
      .select()
      .from(activityEvents)
      .where(dbMod.eq(activityEvents.cardId, cardId))
      .then((rows) =>
        rows.filter(
          (row) =>
            row.type === 'comment.mentioned' &&
            (row.payload as { commentId?: string }).commentId === commentId,
        ),
      );

  it('comment.create/update/delete write realtime events; create also emits comment.mentioned activity + realtime', async () => {
    const createCmid = crypto.randomUUID();
    const created = await callerFor(memberId, enqueue).comment.create({
      cardId,
      body: `Merhaba @${bobId}`,
      clientMutationId: createCmid,
    });

    const createEvents = await rtByMutation(createCmid);
    expect(createEvents.map((event) => event.type).sort()).toEqual(['comment.created', 'comment.mentioned']);
    const createdData = dataOf<{ commentId: string; mentionedUserIds: string[] }>(
      createEvents.find((event) => event.type === 'comment.created')!,
    );
    expect(createdData.commentId).toBe(created.id);
    expect(createdData.mentionedUserIds).toEqual([bobId]);
    expect(await mentionActivitiesFor(created.id)).toHaveLength(1);

    const updateCmid = crypto.randomUUID();
    await callerFor(memberId, enqueue).comment.update({
      cardId,
      commentId: created.id,
      body: 'edited comment',
      clientMutationId: updateCmid,
    });
    expect((await rtByMutation(updateCmid)).map((event) => event.type)).toEqual(['comment.updated']);

    const deleteCmid = crypto.randomUUID();
    await callerFor(memberId, enqueue).comment.delete({
      cardId,
      commentId: created.id,
      clientMutationId: deleteCmid,
    });
    expect((await rtByMutation(deleteCmid)).map((event) => event.type)).toEqual(['comment.deleted']);
  });

  it('checklist and checklist.item mutations write realtime events', async () => {
    const createChecklistCmid = crypto.randomUUID();
    const checklist = await callerFor(memberId, enqueue).checklist.create({
      cardId,
      title: 'Tasks',
      clientMutationId: createChecklistCmid,
    });
    expect((await rtByMutation(createChecklistCmid)).map((event) => event.type)).toEqual(['checklist.created']);

    const updateChecklistCmid = crypto.randomUUID();
    await callerFor(memberId, enqueue).checklist.update({
      cardId,
      checklistId: checklist.id,
      title: 'Renamed tasks',
      clientMutationId: updateChecklistCmid,
    });
    expect((await rtByMutation(updateChecklistCmid)).map((event) => event.type)).toEqual(['checklist.updated']);

    const addItemCmid = crypto.randomUUID();
    const item = await callerFor(memberId, enqueue).checklist.item.create({
      cardId,
      checklistId: checklist.id,
      content: 'first item',
      clientMutationId: addItemCmid,
    });
    expect((await rtByMutation(addItemCmid)).map((event) => event.type)).toEqual(['checklist.item_added']);

    const updateItemCmid = crypto.randomUUID();
    await callerFor(memberId, enqueue).checklist.item.update({
      cardId,
      checklistId: checklist.id,
      itemId: item.id,
      content: 'edited item',
      clientMutationId: updateItemCmid,
    });
    expect((await rtByMutation(updateItemCmid)).map((event) => event.type)).toEqual(['checklist.item_updated']);

    const toggleItemCmid = crypto.randomUUID();
    await callerFor(memberId, enqueue).checklist.item.toggle({
      cardId,
      checklistId: checklist.id,
      itemId: item.id,
      completed: true,
      clientMutationId: toggleItemCmid,
    });
    expect((await rtByMutation(toggleItemCmid)).map((event) => event.type)).toEqual(['checklist.item_toggled']);

    const deleteItemCmid = crypto.randomUUID();
    await callerFor(memberId, enqueue).checklist.item.delete({
      cardId,
      checklistId: checklist.id,
      itemId: item.id,
      clientMutationId: deleteItemCmid,
    });
    expect((await rtByMutation(deleteItemCmid)).map((event) => event.type)).toEqual(['checklist.item_deleted']);

    const deleteChecklistCmid = crypto.randomUUID();
    await callerFor(memberId, enqueue).checklist.delete({
      cardId,
      checklistId: checklist.id,
      clientMutationId: deleteChecklistCmid,
    });
    expect((await rtByMutation(deleteChecklistCmid)).map((event) => event.type)).toEqual(['checklist.deleted']);
  });

  it('board labels and card label links write realtime events', async () => {
    const createLabelCmid = crypto.randomUUID();
    const label = await callerFor(memberId, enqueue).label.create({
      boardId,
      color: 'green',
      name: `Bug ${createLabelCmid.slice(0, 8)}`,
      clientMutationId: createLabelCmid,
    });
    expect((await rtByMutation(createLabelCmid)).map((event) => event.type)).toEqual(['board.label_created']);

    const addCardLabelCmid = crypto.randomUUID();
    await callerFor(memberId, enqueue).card.labels.add({
      cardId,
      labelId: label.id,
      clientMutationId: addCardLabelCmid,
    });
    expect((await rtByMutation(addCardLabelCmid)).map((event) => event.type)).toEqual(['card.label_added']);

    const removeCardLabelCmid = crypto.randomUUID();
    await callerFor(memberId, enqueue).card.labels.remove({
      cardId,
      labelId: label.id,
      clientMutationId: removeCardLabelCmid,
    });
    expect((await rtByMutation(removeCardLabelCmid)).map((event) => event.type)).toEqual(['card.label_removed']);

    const updateLabelCmid = crypto.randomUUID();
    await callerFor(memberId, enqueue).label.update({
      boardId,
      labelId: label.id,
      color: 'blue',
      name: `Support ${updateLabelCmid.slice(0, 8)}`,
      clientMutationId: updateLabelCmid,
    });
    expect((await rtByMutation(updateLabelCmid)).map((event) => event.type)).toEqual(['board.label_updated']);

    const deleteLabelCmid = crypto.randomUUID();
    await callerFor(memberId, enqueue).label.delete({
      boardId,
      labelId: label.id,
      clientMutationId: deleteLabelCmid,
    });
    expect((await rtByMutation(deleteLabelCmid)).map((event) => event.type)).toEqual(['board.label_deleted']);
  });

  it('card member and board member mutations write realtime events', async () => {
    const addCardMemberCmid = crypto.randomUUID();
    await callerFor(memberId, enqueue).card.members.add({
      cardId,
      userId: cardMemberId,
      role: 'assignee',
      clientMutationId: addCardMemberCmid,
    });
    expect((await rtByMutation(addCardMemberCmid)).map((event) => event.type)).toEqual(['card.member_added']);

    const removeCardMemberCmid = crypto.randomUUID();
    await callerFor(memberId, enqueue).card.members.remove({
      cardId,
      userId: cardMemberId,
      role: 'assignee',
      clientMutationId: removeCardMemberCmid,
    });
    expect((await rtByMutation(removeCardMemberCmid)).map((event) => event.type)).toEqual(['card.member_removed']);

    const addBoardMemberCmid = crypto.randomUUID();
    await callerFor(ownerId, enqueue).board.members.add({
      boardId,
      email: `${directBoardMemberId}@example.test`,
      role: 'member',
      clientMutationId: addBoardMemberCmid,
    });
    expect((await rtByMutation(addBoardMemberCmid)).map((event) => event.type)).toEqual(['board.member_added']);

    const roleCmid = crypto.randomUUID();
    await callerFor(ownerId, enqueue).board.members.updateRole({
      boardId,
      userId: directBoardMemberId,
      role: 'viewer',
      clientMutationId: roleCmid,
    });
    expect((await rtByMutation(roleCmid)).map((event) => event.type)).toEqual(['board.member_role_changed']);

    const removeBoardMemberCmid = crypto.randomUUID();
    await callerFor(ownerId, enqueue).board.members.remove({
      boardId,
      userId: directBoardMemberId,
      clientMutationId: removeBoardMemberCmid,
    });
    expect((await rtByMutation(removeBoardMemberCmid)).map((event) => event.type)).toEqual(['board.member_removed']);
  });

  it('board invitation lifecycle writes realtime events', async () => {
    const inviteCmid = crypto.randomUUID();
    await callerFor(ownerId, enqueue).board.members.add({
      boardId,
      email: `${newId('pending-invite')}@example.test`,
      role: 'viewer',
      clientMutationId: inviteCmid,
    });
    expect((await rtByMutation(inviteCmid)).map((event) => event.type)).toEqual(['board.member_invited']);

    const revokeInvite = await db()
      .select({ id: boardInvitations.id })
      .from(boardInvitations)
      .where(dbMod.eq(boardInvitations.boardId, boardId))
      .then((rows) => rows.at(-1)!);
    const revokeCmid = crypto.randomUUID();
    await callerFor(ownerId, enqueue).board.invitations.revoke({
      boardId,
      invitationId: revokeInvite.id,
      clientMutationId: revokeCmid,
    });
    expect((await rtByMutation(revokeCmid)).map((event) => event.type)).toEqual(['board.invitation_revoked']);

    const acceptUserId = newId('u-rt6c-accept');
    createdUserIds.push(acceptUserId);
    const acceptEmail = `${acceptUserId}@example.test`;
    await callerFor(ownerId, enqueue).board.members.add({
      boardId,
      email: acceptEmail,
      role: 'member',
      clientMutationId: crypto.randomUUID(),
    });
    await db().insert(users).values({ id: acceptUserId, name: acceptUserId, email: acceptEmail });
    const [acceptInvitation] = await callerFor(acceptUserId).board.invitations.mine();
    if (!acceptInvitation) throw new Error('accept invitation fixture was not created');
    const acceptCmid = crypto.randomUUID();
    await callerFor(acceptUserId, enqueue).board.invitations.accept({
      token: acceptInvitation.token,
      clientMutationId: acceptCmid,
    });
    expect((await rtByMutation(acceptCmid)).map((event) => event.type)).toEqual(['board.invitation_accepted']);

    const declineUserId = newId('u-rt6c-decline');
    createdUserIds.push(declineUserId);
    const declineEmail = `${declineUserId}@example.test`;
    await callerFor(ownerId, enqueue).board.members.add({
      boardId,
      email: declineEmail,
      role: 'viewer',
      clientMutationId: crypto.randomUUID(),
    });
    await db().insert(users).values({ id: declineUserId, name: declineUserId, email: declineEmail });
    const [declineInvitation] = await callerFor(declineUserId).board.invitations.mine();
    if (!declineInvitation) throw new Error('decline invitation fixture was not created');
    const declineCmid = crypto.randomUUID();
    await callerFor(declineUserId, enqueue).board.invitations.decline({
      token: declineInvitation.token,
      clientMutationId: declineCmid,
    });
    expect((await rtByMutation(declineCmid)).map((event) => event.type)).toEqual(['board.invitation_declined']);
  });
});

afterAll(async () => {
  await probe?.pool.end();
});
