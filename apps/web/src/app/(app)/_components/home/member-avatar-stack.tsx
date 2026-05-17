'use client';

import { Avatar, cn } from '@pusula/ui';
import { strings } from '@/lib/strings';

export type StackMember = {
  userId: string;
  name: string;
  image?: string | null;
};

type MemberAvatarStackProps = {
  members: readonly StackMember[];
  /** Maximum avatars shown before collapsing the rest into a "+N" chip. */
  max?: number;
  className?: string;
};

/**
 * Overlapping avatar stack for board member presence on the landing page
 * (DEM-192). Renders up to `max` avatars, then a "+N" overflow chip. The whole
 * stack carries a single accessible label (the avatars are decorative here) so
 * screen readers announce "N üye" once rather than every member name.
 */
export function MemberAvatarStack({ members, max = 4, className }: MemberAvatarStackProps) {
  if (members.length === 0) return null;

  const shown = members.slice(0, max);
  const overflow = members.length - shown.length;

  return (
    <div
      className={cn('flex items-center', className)}
      role="img"
      aria-label={strings.home.boards.memberStackLabel(members.length)}
    >
      {shown.map((member, index) => (
        <Avatar
          key={member.userId}
          name={member.name}
          image={member.image}
          size="sm"
          ring
          aria-hidden
          className={cn(index > 0 && '-ml-2')}
        />
      ))}
      {overflow > 0 && (
        <span
          className="bg-muted text-muted-foreground ring-card -ml-2 inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold ring-2"
          aria-hidden
        >
          {strings.home.boards.memberOverflow(overflow)}
        </span>
      )}
    </div>
  );
}
