import {
  AlignLeftIcon,
  ArchiveIcon,
  ArrowLeftRightIcon,
  AtSignIcon,
  CalendarClockIcon,
  CheckCircleIcon,
  ClockIcon,
  ImageIcon,
  KeyRoundIcon,
  ListChecksIcon,
  ListPlusIcon,
  ListXIcon,
  MailIcon,
  MessageSquareIcon,
  PaperclipIcon,
  PencilIcon,
  TagIcon,
  UserMinusIcon,
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
    // DEM-175 — board'a doğrudan eklenme (davet değil); kart üye eklemeyle
    // aynı "kullanıcı eklendi" ikonu.
    case 'board_member_added':
    case 'board.member_added':
      return <UserPlusIcon className={cn(iconClass, 'text-blue-500')} aria-hidden />;
    // DEM-152 — granular kart-aktivite tipleri. Her tip kendi ikon + rengiyle;
    // activity-type alias'ları (`card.moved` vb.) eski çağrı yollarıyla uyumlu
    // kalmak için aynı case'te tutulur.
    case 'card_moved':
    case 'card.moved':
      return <ArrowLeftRightIcon className={cn(iconClass, 'text-violet-500')} aria-hidden />;
    case 'card_archived':
    case 'card.archived':
      return <ArchiveIcon className={cn(iconClass, 'text-muted-foreground')} aria-hidden />;
    case 'card_completed':
    case 'checklist_item_completed':
    case 'card.completed':
      return <CheckCircleIcon className={cn(iconClass, 'text-green-500')} aria-hidden />;
    case 'card_due_changed':
    case 'card.due_set':
    case 'card.due_cleared':
      return <CalendarClockIcon className={cn(iconClass, 'text-orange-500')} aria-hidden />;
    case 'card_cover_changed':
    case 'card.cover_changed':
    case 'card.cover_image_changed':
      return <ImageIcon className={cn(iconClass, 'text-pink-500')} aria-hidden />;
    case 'card_member_removed':
    case 'card.member_removed':
      return <UserMinusIcon className={cn(iconClass, 'text-rose-500')} aria-hidden />;
    case 'attachment_added':
    case 'attachment.added':
      return <PaperclipIcon className={cn(iconClass, 'text-sky-500')} aria-hidden />;
    // DEM-153 — kartla ilgili kalan granular tipler.
    case 'card_renamed':
    case 'card.renamed':
      return <PencilIcon className={cn(iconClass, 'text-violet-500')} aria-hidden />;
    case 'card_description_changed':
    case 'card.description_changed':
      return <AlignLeftIcon className={cn(iconClass, 'text-violet-500')} aria-hidden />;
    case 'card_label_added':
    case 'card.label_added':
      return <TagIcon className={cn(iconClass, 'text-emerald-500')} aria-hidden />;
    case 'card_label_removed':
    case 'card.label_removed':
      return <TagIcon className={cn(iconClass, 'text-muted-foreground')} aria-hidden />;
    case 'comment_updated':
    case 'comment.updated':
    case 'comment_deleted':
    case 'comment.deleted':
      return <MessageSquareIcon className={cn(iconClass, 'text-muted-foreground')} aria-hidden />;
    case 'checklist_created':
    case 'checklist.created':
      return <ListChecksIcon className={cn(iconClass, 'text-green-600')} aria-hidden />;
    case 'checklist_item_added':
    case 'checklist.item_added':
      return <ListPlusIcon className={cn(iconClass, 'text-green-600')} aria-hidden />;
    case 'checklist_item_removed':
    case 'checklist.item_removed':
      return <ListXIcon className={cn(iconClass, 'text-muted-foreground')} aria-hidden />;
    case 'attachment_removed':
    case 'attachment.removed':
      return <PaperclipIcon className={cn(iconClass, 'text-muted-foreground')} aria-hidden />;
    case 'watched_activity':
      return <MessageSquareIcon className={cn(iconClass, 'text-muted-foreground')} aria-hidden />;
    // DEM-154 — board erişim talebi bildirimi.
    case 'board_access_requested':
    case 'board.access_requested':
      return <KeyRoundIcon className={cn(iconClass, 'text-cyan-500')} aria-hidden />;
    default:
      return <MessageSquareIcon className={cn(iconClass, 'text-muted-foreground')} aria-hidden />;
  }
}
