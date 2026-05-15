'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pusula/ui';
import { strings } from '@/lib/strings';

type ShortcutItem = {
  keys: string[];
  label: string;
};

function ShortcutRow({ item }: { item: ShortcutItem }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm">{item.label}</span>
      <span className="flex shrink-0 items-center gap-1">
        {item.keys.map((key) => (
          <kbd
            key={key}
            className="rounded border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
          >
            {key}
          </kbd>
        ))}
      </span>
    </div>
  );
}

function ShortcutGroup({ title, items }: { title: string; items: ShortcutItem[] }) {
  return (
    <section aria-label={title} className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        {title}
      </h3>
      <div className="divide-y rounded-md border px-3 py-1">
        {items.map((item) => (
          <ShortcutRow key={`${title}-${item.label}`} item={item} />
        ))}
      </div>
    </section>
  );
}

export function ShortcutHelpDialog({
  open,
  onOpenChange,
  includeCardModal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  includeCardModal: boolean;
}) {
  const copy = strings.shortcuts;
  const general: ShortcutItem[] = [
    { keys: [copy.keys.commandK, copy.keys.ctrlSpace], label: copy.actions.globalSearch },
    { keys: [copy.keys.question], label: copy.actions.help },
  ];
  const board: ShortcutItem[] = [
    { keys: [copy.keys.slash], label: copy.actions.boardSearch },
    { keys: [copy.keys.n], label: copy.actions.newCard },
    { keys: [copy.keys.shiftN, copy.keys.l], label: copy.actions.newList },
  ];
  const cardModal: ShortcutItem[] = [
    { keys: [copy.keys.e], label: copy.actions.editTitle },
    { keys: [copy.keys.c], label: copy.actions.toggleComplete },
    { keys: [copy.keys.d], label: copy.actions.dueDate },
    { keys: [copy.keys.m], label: copy.actions.members },
    { keys: [copy.keys.t], label: copy.actions.labels },
    { keys: [copy.keys.a], label: copy.actions.archive },
    { keys: [copy.keys.escape], label: copy.actions.closeModal },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={strings.common.close} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.dialogTitle}</DialogTitle>
          <DialogDescription>{copy.dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <ShortcutGroup title={copy.groups.general} items={general} />
          <ShortcutGroup title={copy.groups.board} items={board} />
          {includeCardModal && <ShortcutGroup title={copy.groups.cardModal} items={cardModal} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
