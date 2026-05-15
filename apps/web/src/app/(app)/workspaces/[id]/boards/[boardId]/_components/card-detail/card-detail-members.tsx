'use client';

import { useId, useState } from 'react';
import { CARD_ROLES, type CardRole } from '@pusula/domain';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pusula/ui';
import { InfoTooltipButton } from '@/components/info-tooltip-button';
import { cardRoleLabels, strings } from '@/lib/strings';

export type CardMember = { userId: string; role: CardRole; name: string | null };
export type BoardMemberOption = { userId: string; name: string | null };

type CardDetailMembersProps = {
  /** The card's members (`assignee` / `watcher` rows). */
  members: CardMember[];
  /** Board members available to add (the picker source). */
  boardMembers: BoardMemberOption[];
  /** The viewer's own user id (for the self-watch affordance + "you" badge). */
  viewerUserId: string;
  /** Board `member+` and board/list/card active — may add/remove anyone. */
  canEdit: boolean;
  /** Add `(userId, role)` as a card member. */
  onAdd: (input: { userId: string; role: CardRole }) => void;
  /** Remove `(userId, role)` from the card. */
  onRemove: (input: { userId: string; role: CardRole }) => void;
  pending?: boolean;
  error?: string | null;
};

/**
 * Card members: lists `assignee` / `watcher` rows (name + role badge). Board
 * `member+` gets an "add member" mini-form (board member + role) and a "remove"
 * per row; a board `viewer` only gets a "watch this card" / "unwatch" toggle for
 * themselves (their own `watcher` row). Presentational — the dialog wires the
 * mutations.
 */
export function CardDetailMembers({
  members,
  boardMembers,
  viewerUserId,
  canEdit,
  onAdd,
  onRemove,
  pending = false,
  error,
}: CardDetailMembersProps) {
  const memberSelectId = useId();
  const roleSelectId = useId();
  const copy = strings.card.members;

  const [adding, setAdding] = useState(false);
  const [pickUserId, setPickUserId] = useState('');
  const [pickRole, setPickRole] = useState<CardRole>('assignee');

  const isWatchingSelf = members.some((m) => m.userId === viewerUserId && m.role === 'watcher');

  // Board members who don't already hold the chosen role aren't filtered here —
  // the server is idempotent; we just offer the full list (minus nobody) for
  // simplicity, the picker resets after a submit.
  const addableBoardMembers = boardMembers;

  const handleAdd = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pickUserId) return;
    onAdd({ userId: pickUserId, role: pickRole });
    setPickUserId('');
    setPickRole('assignee');
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-muted-foreground text-sm font-medium">{copy.title}</h3>
          <InfoTooltipButton label={copy.infoLabel} content={copy.info} />
        </div>
        <div className="flex gap-2">
          {!canEdit && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                isWatchingSelf
                  ? onRemove({ userId: viewerUserId, role: 'watcher' })
                  : onAdd({ userId: viewerUserId, role: 'watcher' })
              }
            >
              {pending ? copy.watching : isWatchingSelf ? copy.unwatchSelf : copy.watchSelf}
            </Button>
          )}
          {canEdit && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding((v) => !v)}>
              {copy.addAction}
            </Button>
          )}
        </div>
      </div>

      {members.length === 0 ? (
        <p className="text-muted-foreground text-sm">{copy.empty}</p>
      ) : (
        <ul className="space-y-1">
          {members.map((member) => (
            <li
              key={`${member.userId}:${member.role}`}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className="break-words">{member.name?.trim() || member.userId}</span>
                <Badge variant="secondary">{cardRoleLabels[member.role]}</Badge>
                {member.userId === viewerUserId && (
                  <Badge variant="outline">{strings.members.youBadge}</Badge>
                )}
              </span>
              {(canEdit || (member.userId === viewerUserId && member.role === 'watcher')) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => onRemove({ userId: member.userId, role: member.role })}
                >
                  {pending ? copy.removing : copy.remove}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {adding && canEdit && (
        <form onSubmit={handleAdd} className="space-y-2 rounded-md border p-3">
          {addableBoardMembers.length === 0 ? (
            <p className="text-muted-foreground text-sm">{copy.noBoardMembers}</p>
          ) : (
            <>
              <div className="space-y-1">
                <label htmlFor={memberSelectId} className="text-muted-foreground block text-xs">
                  {copy.memberLabel}
                </label>
                <Select value={pickUserId} onValueChange={setPickUserId}>
                  <SelectTrigger
                    id={memberSelectId}
                    aria-label={copy.memberLabel}
                    disabled={pending}
                  >
                    <SelectValue placeholder={copy.memberLabel} />
                  </SelectTrigger>
                  <SelectContent>
                    {addableBoardMembers.map((bm) => (
                      <SelectItem key={bm.userId} value={bm.userId}>
                        {bm.name?.trim() || bm.userId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label htmlFor={roleSelectId} className="text-muted-foreground block text-xs">
                  {copy.roleLabel}
                </label>
                <Select value={pickRole} onValueChange={(v) => setPickRole(v as CardRole)}>
                  <SelectTrigger id={roleSelectId} aria-label={copy.roleLabel} disabled={pending}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {cardRoleLabels[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" size="sm" disabled={pending || !pickUserId}>
                {pending ? copy.adding : copy.addSubmit}
              </Button>
            </>
          )}
        </form>
      )}
    </section>
  );
}
