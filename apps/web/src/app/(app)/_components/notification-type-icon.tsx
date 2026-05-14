import {
  ArchiveIcon,
  AtSignIcon,
  CheckCircleIcon,
  ClockIcon,
  MailIcon,
  MessageSquareIcon,
  UserPlusIcon,
} from 'lucide-react';
import { cn } from '@pusula/ui';

export function notificationTypeIcon(type: string, className?: string) {
  const iconClass = cn('size-4 shrink-0', className);

  switch (type) {
    case 'card_assigned':
    case 'card.member_added':
      return <UserPlusIcon className={cn(iconClass, 'text-blue-500')} aria-hidden />;
    case 'mention':
    case 'comment.mentioned':
      return <AtSignIcon className={cn(iconClass, 'text-amber-500')} aria-hidden />;
    case 'comment_reply':
    case 'comment.created':
      return <MessageSquareIcon className={cn(iconClass, 'text-muted-foreground')} aria-hidden />;
    case 'due_approaching':
    case 'due_reminder_1d':
    case 'due_reminder_1h':
      return <ClockIcon className={cn(iconClass, 'text-orange-500')} aria-hidden />;
    case 'due_overdue':
      return <ClockIcon className={cn(iconClass, 'text-red-500')} aria-hidden />;
    case 'board_invitation':
    case 'board.member_invited':
    case 'workspace_invitation':
    case 'workspace.member_invited':
      return <MailIcon className={cn(iconClass, 'text-blue-500')} aria-hidden />;
    case 'card.archived':
      return <ArchiveIcon className={cn(iconClass, 'text-muted-foreground')} aria-hidden />;
    case 'watched_activity':
      return <MessageSquareIcon className={cn(iconClass, 'text-muted-foreground')} aria-hidden />;
    case 'checklist_item_completed':
    case 'card.completed':
      return <CheckCircleIcon className={cn(iconClass, 'text-green-500')} aria-hidden />;
    default:
      return <MessageSquareIcon className={cn(iconClass, 'text-muted-foreground')} aria-hidden />;
  }
}
