# DEM-73 Keyboard Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small Trello-style keyboard shortcut layer for board and card-modal workflows, including `Ctrl+Space` as a second global-search shortcut.

**Architecture:** Build a narrow shortcut utility module in `apps/web/src/lib/shortcuts/`, then wire existing UI surfaces through small controlled props. Board route owns board shortcut actions; card modal owns modal shortcut actions; editable targets gate all global shortcuts. No active card/list selection model is introduced in this work.

**Tech Stack:** Next.js App Router client components, React, TypeScript, Vitest, React Testing Library, TanStack Query, tRPC, existing `@pusula/ui` shadcn/Radix primitives, lucide-react.

---

## File Structure

- Create `apps/web/src/lib/shortcuts/keyboard.ts`: pure keyboard event normalization and editable-target guard.
- Create `apps/web/src/lib/shortcuts/use-shortcut-scope.ts`: React hook for scoped `window.keydown` bindings.
- Create `apps/web/src/lib/shortcuts/index.ts`: barrel exports.
- Create `apps/web/src/lib/shortcuts/keyboard.test.ts`: unit tests for normalization and editable-target guard.
- Modify `apps/web/src/app/(app)/_components/search-dialog.tsx`: controlled `open` support and `Ctrl+Space` handling beside `Cmd/Ctrl+K`.
- Modify `apps/web/src/app/(app)/_components/app-shell.test.tsx`: global search shortcut coverage for `Ctrl+Space`.
- Create `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/shortcut-help-dialog.tsx`: board/card shortcut help dialog.
- Create `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/shortcut-help-dialog.test.tsx`: help dialog render coverage.
- Modify `apps/web/src/lib/strings.ts`: `strings.shortcuts`.
- Modify `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/page.tsx`: board shortcut state, route-level shortcut scope, help dialog, board search open state.
- Modify `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-top-bar.tsx`: controlled board search open props.
- Modify `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-columns.tsx`: shortcut tokens for first-list add-card and add-list.
- Modify `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/list-column.tsx`: add-card composer open token.
- Modify `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/add-list-column.tsx`: add-list composer open token.
- Modify `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/page.test.tsx`: board shortcut behavior.
- Modify `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-title.tsx`: focus/select token for title shortcut.
- Modify `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-modal-meta-chips.tsx`: controlled dropdown key.
- Modify `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-modal-meta-chips.test.tsx`: controlled dropdown behavior.
- Modify `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-dialog.tsx`: modal shortcut scope and help dialog.
- Modify `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-dialog.test.tsx`: modal shortcut behavior.
- Modify `docs/architecture/08-web-ve-mobil.md`: DEM-73 keyboard shortcut section.
- Modify `docs/architecture/13-ui-tasarim-dili.md`: shortcut help dialog and out-of-scope active selection note.
- Modify `docs/process/05-is-kayit-defteri.md`: DEM-73 implementation row update.

## Scope Check

The approved spec is one subsystem: keyboard shortcuts for existing board and card-modal surfaces. Active card/list selection is deliberately excluded and stays as a follow-up. The implementation can be delivered in one plan because each task produces a working slice and shares the same shortcut utility module.

---

### Task 1: Shortcut Utility Module

**Files:**

- Create: `apps/web/src/lib/shortcuts/keyboard.ts`
- Create: `apps/web/src/lib/shortcuts/use-shortcut-scope.ts`
- Create: `apps/web/src/lib/shortcuts/index.ts`
- Test: `apps/web/src/lib/shortcuts/keyboard.test.ts`

- [ ] **Step 1: Write failing unit tests for normalization and input gating**

Create `apps/web/src/lib/shortcuts/keyboard.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { isShortcutEditableTarget, normalizeShortcutEvent } from './keyboard';

function keyEvent(init: KeyboardEventInit) {
  return new KeyboardEvent('keydown', init);
}

describe('normalizeShortcutEvent', () => {
  it('normalizes printable keys and modifiers', () => {
    expect(normalizeShortcutEvent(keyEvent({ key: 'N' }))).toMatchObject({
      key: 'n',
      label: 'N',
      shift: false,
      ctrlOrMeta: false,
    });
    expect(normalizeShortcutEvent(keyEvent({ key: 'N', shiftKey: true }))).toMatchObject({
      key: 'n',
      shift: true,
      ctrlOrMeta: false,
    });
    expect(normalizeShortcutEvent(keyEvent({ key: '/', ctrlKey: false }))).toMatchObject({
      key: '/',
      label: '/',
      ctrlOrMeta: false,
    });
    expect(normalizeShortcutEvent(keyEvent({ key: 'K', metaKey: true }))).toMatchObject({
      key: 'k',
      meta: true,
      ctrlOrMeta: true,
    });
    expect(normalizeShortcutEvent(keyEvent({ key: ' ', ctrlKey: true }))).toMatchObject({
      key: 'space',
      label: 'Space',
      ctrl: true,
      ctrlOrMeta: true,
    });
  });

  it('marks composing events so callers can ignore them', () => {
    const event = keyEvent({ key: 'n' });
    vi.spyOn(event, 'isComposing', 'get').mockReturnValue(true);

    expect(normalizeShortcutEvent(event).isComposing).toBe(true);
  });
});

describe('isShortcutEditableTarget', () => {
  it('detects native form controls', () => {
    expect(isShortcutEditableTarget(document.createElement('input'))).toBe(true);
    expect(isShortcutEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isShortcutEditableTarget(document.createElement('select'))).toBe(true);
  });

  it('detects contenteditable and ProseMirror/Tiptap roots', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    expect(isShortcutEditableTarget(editable)).toBe(true);

    const proseMirror = document.createElement('div');
    proseMirror.className = 'ProseMirror';
    expect(isShortcutEditableTarget(proseMirror)).toBe(true);

    const nested = document.createElement('span');
    proseMirror.appendChild(nested);
    expect(isShortcutEditableTarget(nested)).toBe(true);
  });

  it('does not block plain buttons or generic elements', () => {
    expect(isShortcutEditableTarget(document.createElement('button'))).toBe(false);
    expect(isShortcutEditableTarget(document.createElement('div'))).toBe(false);
    expect(isShortcutEditableTarget(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the unit tests and verify they fail**

Run:

```powershell
pnpm.cmd --filter @pusula/web exec vitest run src/lib/shortcuts/keyboard.test.ts
```

Expected: FAIL because `apps/web/src/lib/shortcuts/keyboard.ts` does not exist.

- [ ] **Step 3: Implement the pure shortcut helpers**

Create `apps/web/src/lib/shortcuts/keyboard.ts`:

```ts
export type NormalizedShortcutEvent = {
  key: string;
  label: string;
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  ctrlOrMeta: boolean;
  isComposing: boolean;
};

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function normalizeShortcutEvent(event: KeyboardEvent): NormalizedShortcutEvent {
  const rawKey = event.key === ' ' ? 'space' : event.key.toLocaleLowerCase('tr');
  const label = event.key === ' ' ? 'Space' : event.key;

  return {
    key: rawKey,
    label,
    shift: event.shiftKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    alt: event.altKey,
    ctrlOrMeta: event.ctrlKey || event.metaKey,
    isComposing: event.isComposing,
  };
}

export function isShortcutEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const element = target as HTMLElement;

  if (EDITABLE_TAGS.has(element.tagName)) return true;
  if (element.isContentEditable) return true;
  if (element.closest('[contenteditable="true"]')) return true;
  if (element.closest('.ProseMirror')) return true;
  if (element.closest('[data-shortcut-editable="true"]')) return true;

  return false;
}
```

- [ ] **Step 4: Implement the scoped hook**

Create `apps/web/src/lib/shortcuts/use-shortcut-scope.ts`:

```ts
'use client';

import { useEffect } from 'react';
import {
  isShortcutEditableTarget,
  normalizeShortcutEvent,
  type NormalizedShortcutEvent,
} from './keyboard';

export type ShortcutBinding = {
  id: string;
  match: (event: NormalizedShortcutEvent) => boolean;
  run: () => void;
  preventDefault?: boolean;
};

export function useShortcutScope({
  enabled,
  bindings,
}: {
  enabled: boolean;
  scope: string;
  bindings: ShortcutBinding[];
}) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isShortcutEditableTarget(event.target)) return;

      const normalized = normalizeShortcutEvent(event);
      if (normalized.isComposing) return;

      const binding = bindings.find((item) => item.match(normalized));
      if (!binding) return;

      if (binding.preventDefault !== false) event.preventDefault();
      binding.run();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, bindings]);
}
```

Create `apps/web/src/lib/shortcuts/index.ts`:

```ts
export { isShortcutEditableTarget, normalizeShortcutEvent } from './keyboard';
export type { NormalizedShortcutEvent } from './keyboard';
export { useShortcutScope } from './use-shortcut-scope';
export type { ShortcutBinding } from './use-shortcut-scope';
```

- [ ] **Step 5: Run the unit tests and verify they pass**

Run:

```powershell
pnpm.cmd --filter @pusula/web exec vitest run src/lib/shortcuts/keyboard.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- apps/web/src/lib/shortcuts/keyboard.ts apps/web/src/lib/shortcuts/use-shortcut-scope.ts apps/web/src/lib/shortcuts/index.ts apps/web/src/lib/shortcuts/keyboard.test.ts
git commit -m "feat: DEM-73 add shortcut utilities"
```

---

### Task 2: SearchDialog Controlled Open and Ctrl+Space

**Files:**

- Modify: `apps/web/src/app/(app)/_components/search-dialog.tsx`
- Modify: `apps/web/src/app/(app)/_components/app-shell.test.tsx`

- [ ] **Step 1: Add failing AppShell coverage for Ctrl+Space**

In `apps/web/src/app/(app)/_components/app-shell.test.tsx`, add this test near the current Ctrl+K search test:

```ts
it('opens global search with Ctrl+Space', () => {
  render(
    <AppShell userName="Aria Chen" userEmail="aria@example.com">
      <div>content</div>
    </AppShell>,
  );

  fireEvent.keyDown(window, { key: ' ', ctrlKey: true });

  expect(screen.getByRole('searchbox', { name: 'Arama sorgusu' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused AppShell test and verify it fails**

Run:

```powershell
pnpm.cmd --filter @pusula/web exec vitest run "src/app/(app)/_components/app-shell.test.tsx" -t "Ctrl\\+Space"
```

Expected: FAIL because `Ctrl+Space` does not open the search dialog.

- [ ] **Step 3: Extend SearchDialog props and shortcut handler**

In `apps/web/src/app/(app)/_components/search-dialog.tsx`, update the props type:

```ts
type SearchDialogProps = {
  variant?: 'global' | 'board';
  workspaceId?: string;
  boardId?: string;
  enableShortcut?: boolean;
  triggerMode?: 'wide' | 'icon';
  triggerLabel?: string;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};
```

In the function signature, destructure controlled props:

```ts
export function SearchDialog({
  variant = 'global',
  workspaceId,
  boardId,
  enableShortcut = false,
  triggerMode = 'wide',
  triggerLabel,
  triggerClassName,
  open: controlledOpen,
  onOpenChange,
}: SearchDialogProps) {
```

Replace the local open state and all uses of `open`:

```ts
const [internalOpen, setInternalOpen] = useState(false);
const open = controlledOpen ?? internalOpen;
```

Replace `setDialogOpen`:

```ts
const setDialogOpen = (next: boolean) => {
  if (controlledOpen === undefined) setInternalOpen(next);
  onOpenChange?.(next);
  if (!next) setQuery('');
};
```

Replace the shortcut effect body condition:

```ts
const isGlobalSearchShortcut =
  (event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase('tr') === 'k';
const isCtrlSpaceShortcut = event.ctrlKey && event.key === ' ';
if (isGlobalSearchShortcut || isCtrlSpaceShortcut) {
  event.preventDefault();
  setDialogOpen(true);
}
```

- [ ] **Step 4: Run the focused AppShell search tests**

Run:

```powershell
pnpm.cmd --filter @pusula/web exec vitest run "src/app/(app)/_components/app-shell.test.tsx" -t "search"
```

Expected: PASS for Ctrl+K and Ctrl+Space search tests.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- "apps/web/src/app/(app)/_components/search-dialog.tsx" "apps/web/src/app/(app)/_components/app-shell.test.tsx"
git commit -m "feat: DEM-73 add ctrl-space search shortcut"
```

---

### Task 3: Shortcut Help Dialog and Strings

**Files:**

- Create: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/shortcut-help-dialog.tsx`
- Create: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/shortcut-help-dialog.test.tsx`
- Modify: `apps/web/src/lib/strings.ts`

- [ ] **Step 1: Add strings for shortcut help**

In `apps/web/src/lib/strings.ts`, add a top-level `shortcuts` group near existing app-level groups:

```ts
shortcuts: {
  dialogTitle: 'Klavye kısayolları',
  dialogDescription: 'Pano ve kart ayrıntısı ekranlarında kullanılabilen kısayollar.',
  groups: {
    general: 'Genel',
    board: 'Pano',
    cardModal: 'Kart ayrıntısı',
  },
  keys: {
    commandK: 'Cmd/Ctrl+K',
    ctrlSpace: 'Ctrl+Space',
    slash: '/',
    question: '?',
    n: 'N',
    shiftN: 'Shift+N',
    l: 'L',
    e: 'E',
    c: 'C',
    d: 'D',
    m: 'M',
    t: 'T',
    a: 'A',
    escape: 'Esc',
  },
  actions: {
    globalSearch: 'Genel aramayı aç',
    boardSearch: 'Bu panoda ara',
    help: 'Kısayol yardımını aç',
    newCard: 'İlk aktif listeye kart ekle',
    newList: 'Liste ekle',
    editTitle: 'Kart başlığını düzenle',
    toggleComplete: 'Kart tamamlandı durumunu değiştir',
    dueDate: 'Son tarih alanını aç',
    members: 'Üyeler alanını aç',
    labels: 'Etiketler alanını aç',
    archive: 'Kartı arşivle veya geri yükle',
    closeModal: 'Kart penceresini kapat',
  },
},
```

- [ ] **Step 2: Write the failing help dialog test**

Create `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/shortcut-help-dialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { strings } from '@/lib/strings';
import { ShortcutHelpDialog } from './shortcut-help-dialog';

describe('<ShortcutHelpDialog>', () => {
  it('renders general, board, and card modal shortcut groups', () => {
    render(<ShortcutHelpDialog open onOpenChange={() => undefined} includeCardModal />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(strings.shortcuts.groups.general)).toBeInTheDocument();
    expect(screen.getByText(strings.shortcuts.groups.board)).toBeInTheDocument();
    expect(screen.getByText(strings.shortcuts.groups.cardModal)).toBeInTheDocument();
    expect(screen.getByText(strings.shortcuts.keys.ctrlSpace)).toBeInTheDocument();
    expect(screen.getByText(strings.shortcuts.actions.globalSearch)).toBeInTheDocument();
    expect(screen.getByText(strings.shortcuts.actions.newCard)).toBeInTheDocument();
    expect(screen.getByText(strings.shortcuts.actions.editTitle)).toBeInTheDocument();
  });

  it('hides the card modal group when includeCardModal is false', () => {
    render(<ShortcutHelpDialog open onOpenChange={() => undefined} includeCardModal={false} />);

    expect(screen.queryByText(strings.shortcuts.groups.cardModal)).not.toBeInTheDocument();
    expect(screen.queryByText(strings.shortcuts.actions.editTitle)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the help dialog test and verify it fails**

Run:

```powershell
pnpm.cmd --filter @pusula/web exec vitest run "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/shortcut-help-dialog.test.tsx"
```

Expected: FAIL because `shortcut-help-dialog.tsx` does not exist.

- [ ] **Step 4: Implement the help dialog**

Create `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/shortcut-help-dialog.tsx`:

```tsx
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
```

- [ ] **Step 5: Run the help dialog test**

Run:

```powershell
pnpm.cmd --filter @pusula/web exec vitest run "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/shortcut-help-dialog.test.tsx"
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- apps/web/src/lib/strings.ts "apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/shortcut-help-dialog.tsx" "apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/shortcut-help-dialog.test.tsx"
git commit -m "feat: DEM-73 add shortcut help dialog"
```

---

### Task 4: Board Route Shortcuts

**Files:**

- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/page.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-top-bar.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-columns.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/list-column.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/add-list-column.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/page.test.tsx`

- [ ] **Step 1: Extend page test mocks for shortcut callbacks**

In `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/page.test.tsx`, replace the `BoardColumns` mock with one that exposes buttons and captures props:

```ts
vi.mock('./_components/board-columns', () => ({
  BoardColumns: (props: {
    openFirstCardComposerToken?: number;
    openAddListComposerToken?: number;
  }) => (
    <div data-testid="board-columns">
      <span data-testid="add-card-token">{props.openFirstCardComposerToken ?? 0}</span>
      <span data-testid="add-list-token">{props.openAddListComposerToken ?? 0}</span>
    </div>
  ),
}));
```

Replace the `BoardTopBar` mock with controlled board-search support:

```tsx
vi.mock('./_components/board-top-bar', () => ({
  BoardTopBar: (props: {
    archive?: Record<string, unknown>;
    title: string;
    boardSearchOpen?: boolean;
    onBoardSearchOpenChange?: (open: boolean) => void;
  }) => {
    h.boardTopBarProps.push(props);

    return (
      <div data-testid="board-top-bar">
        {props.title}
        {props.boardSearchOpen && <span data-testid="board-search-open" />}
        <button type="button" onClick={() => props.onBoardSearchOpenChange?.(true)}>
          open-board-search
        </button>
        {props.archive && 'showArchivedCards' in props.archive && (
          <span data-testid="archived-card-toggle-prop" />
        )}
      </div>
    );
  },
}));
```

- [ ] **Step 2: Add failing board shortcut tests**

Add tests in the same describe block:

```ts
it('opens board search with slash and shortcut help with question mark', async () => {
  h.queryResults.set(
    'board.accessRequests.context',
    queryStub({ isSuccess: true, data: { access: { hasAccess: true, role: 'admin' } } }),
  );
  h.queryResults.set(
    'board.get',
    queryStub({
      isSuccess: true,
      data: {
        board: {
          id: 'b_1',
          title: 'Aktif pano',
          role: 'admin',
          archivedAt: null,
          background: null,
        },
        lists: [],
        cards: [],
      },
    }),
  );

  await renderPage();

  await userEvent.keyboard('/');
  expect(screen.getByTestId('board-search-open')).toBeInTheDocument();

  await userEvent.keyboard('?');
  expect(screen.getByRole('dialog', { name: 'Klavye kısayolları' })).toBeInTheDocument();
});

it('increments add-card and add-list shortcut tokens for editable boards', async () => {
  h.queryResults.set(
    'board.accessRequests.context',
    queryStub({ isSuccess: true, data: { access: { hasAccess: true, role: 'admin' } } }),
  );
  h.queryResults.set(
    'board.get',
    queryStub({
      isSuccess: true,
      data: {
        board: {
          id: 'b_1',
          title: 'Aktif pano',
          role: 'admin',
          archivedAt: null,
          background: null,
        },
        lists: [
          {
            id: 'l_1',
            title: 'Yapılacak',
            position: 'a0',
            color: null,
            icon: null,
            iconColor: null,
            archivedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        cards: [],
      },
    }),
  );

  await renderPage();

  expect(screen.getByTestId('add-card-token')).toHaveTextContent('0');
  await userEvent.keyboard('n');
  expect(screen.getByTestId('add-card-token')).toHaveTextContent('1');

  expect(screen.getByTestId('add-list-token')).toHaveTextContent('0');
  await userEvent.keyboard('{Shift>}n{/Shift}');
  expect(screen.getByTestId('add-list-token')).toHaveTextContent('1');
  await userEvent.keyboard('l');
  expect(screen.getByTestId('add-list-token')).toHaveTextContent('2');
});
```

- [ ] **Step 3: Run the page shortcut tests and verify they fail**

Run:

```powershell
pnpm.cmd --filter @pusula/web exec vitest run "src/app/(app)/workspaces/[id]/boards/[boardId]/page.test.tsx" -t "shortcut"
```

Expected: FAIL because board route shortcut state is not implemented.

- [ ] **Step 4: Add controlled board search props to BoardTopBar**

In `board-top-bar.tsx`, extend `BoardTopBarProps`:

```ts
  boardSearchOpen?: boolean;
  onBoardSearchOpenChange?: (open: boolean) => void;
```

Destructure the props:

```ts
  boardSearchOpen,
  onBoardSearchOpenChange,
```

Pass them into `SearchDialog`:

```tsx
<SearchDialog
  variant="board"
  workspaceId={workspaceId}
  boardId={boardId}
  triggerMode="icon"
  triggerLabel={copy.search}
  triggerClassName={boardChromeButtonClass}
  open={boardSearchOpen}
  onOpenChange={onBoardSearchOpenChange}
/>
```

- [ ] **Step 5: Add shortcut tokens through BoardColumns, ListColumn, and AddListColumn**

In `board-columns.tsx`, extend props:

```ts
  openFirstCardComposerToken?: number;
  openAddListComposerToken?: number;
```

Destructure them and compute first active visible list:

```ts
  openFirstCardComposerToken = 0,
  openAddListComposerToken = 0,
```

```ts
const firstActiveListId = visibleLists.find((list) => list.archivedAt == null)?.id ?? null;
```

Pass token only to first active list:

```tsx
<ListColumn
  boardId={boardId}
  list={list}
  cards={cardsByList.get(list.id) ?? []}
  canEdit={canEdit}
  allLists={lists}
  boardLabels={boardLabels}
  boardMembers={boardMembers}
  openAddCardComposerToken={
    canEdit && list.id === firstActiveListId ? openFirstCardComposerToken : 0
  }
/>
```

Pass token to `AddListColumn`:

```tsx
{
  canEdit && (
    <AddListColumn boardId={boardId} openAddListComposerToken={openAddListComposerToken} />
  );
}
```

In `list-column.tsx`, extend props:

```ts
  openAddCardComposerToken?: number;
```

Destructure with default:

```ts
  openAddCardComposerToken = 0,
```

Add an effect after `addingCard` state:

```ts
useEffect(() => {
  if (!listEditable || openAddCardComposerToken <= 0) return;
  setAddingCard(true);
}, [listEditable, openAddCardComposerToken]);
```

In `add-list-column.tsx`, extend props and add an effect:

```ts
import { useEffect, useState } from 'react';
```

```ts
type AddListColumnProps = {
  boardId: string;
  openAddListComposerToken?: number;
};
```

```ts
export function AddListColumn({ boardId, openAddListComposerToken = 0 }: AddListColumnProps) {
```

```ts
useEffect(() => {
  if (openAddListComposerToken <= 0) return;
  setOpen(true);
}, [openAddListComposerToken]);
```

- [ ] **Step 6: Implement BoardShortcutScope in page.tsx**

In `page.tsx`, import `useSearchParams`, `useShortcutScope`, and the help dialog:

```ts
import { useSearchParams } from 'next/navigation';
import { useShortcutScope } from '@/lib/shortcuts';
import { ShortcutHelpDialog } from './_components/shortcut-help-dialog';
```

Add a child component above `export default`:

```tsx
function BoardShortcutScope({
  enabled,
  canEditBoardContent,
  hasActiveList,
  onOpenBoardSearch,
  onOpenHelp,
  onOpenFirstCardComposer,
  onOpenAddListComposer,
}: {
  enabled: boolean;
  canEditBoardContent: boolean;
  hasActiveList: boolean;
  onOpenBoardSearch: () => void;
  onOpenHelp: () => void;
  onOpenFirstCardComposer: () => void;
  onOpenAddListComposer: () => void;
}) {
  const searchParams = useSearchParams();
  const cardModalOpen = searchParams.has('card');

  useShortcutScope({
    scope: 'board',
    enabled: enabled && !cardModalOpen,
    bindings: [
      {
        id: 'board-search',
        match: (event) => event.key === '/' && !event.ctrlOrMeta && !event.alt,
        run: onOpenBoardSearch,
      },
      {
        id: 'shortcut-help',
        match: (event) => event.key === '?' && !event.ctrlOrMeta && !event.alt,
        run: onOpenHelp,
      },
      {
        id: 'new-card',
        match: (event) => event.key === 'n' && !event.shift && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (canEditBoardContent && hasActiveList) onOpenFirstCardComposer();
        },
      },
      {
        id: 'new-list-shift-n',
        match: (event) => event.key === 'n' && event.shift && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (canEditBoardContent) onOpenAddListComposer();
        },
      },
      {
        id: 'new-list-l',
        match: (event) => event.key === 'l' && !event.shift && !event.ctrlOrMeta && !event.alt,
        run: () => {
          if (canEditBoardContent) onOpenAddListComposer();
        },
      },
    ],
  });

  return null;
}
```

In `BoardDetailPage`, add state:

```ts
const [boardSearchOpen, setBoardSearchOpen] = useState(false);
const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
const [openFirstCardComposerToken, setOpenFirstCardComposerToken] = useState(0);
const [openAddListComposerToken, setOpenAddListComposerToken] = useState(0);
```

After `canEditBoardContent`:

```ts
const hasActiveList = lists.some((list) => list.archivedAt == null);
```

Pass search props to `BoardTopBar`:

```tsx
boardSearchOpen = { boardSearchOpen };
onBoardSearchOpenChange = { setBoardSearchOpen };
```

Pass tokens to `BoardColumns`:

```tsx
openFirstCardComposerToken = { openFirstCardComposerToken };
openAddListComposerToken = { openAddListComposerToken };
```

Render shortcut scope and help dialog near the existing `CardDetailRoute` Suspense:

```tsx
<Suspense fallback={null}>
  <BoardShortcutScope
    enabled
    canEditBoardContent={canEditBoardContent}
    hasActiveList={hasActiveList}
    onOpenBoardSearch={() => setBoardSearchOpen(true)}
    onOpenHelp={() => setShortcutHelpOpen(true)}
    onOpenFirstCardComposer={() => setOpenFirstCardComposerToken((value) => value + 1)}
    onOpenAddListComposer={() => setOpenAddListComposerToken((value) => value + 1)}
  />
  <CardDetailRoute boardId={boardId} />
</Suspense>
<ShortcutHelpDialog
  open={shortcutHelpOpen}
  onOpenChange={setShortcutHelpOpen}
  includeCardModal={false}
/>
```

- [ ] **Step 7: Run board shortcut tests**

Run:

```powershell
pnpm.cmd --filter @pusula/web exec vitest run "src/app/(app)/workspaces/[id]/boards/[boardId]/page.test.tsx" -t "shortcut"
```

Expected: PASS.

- [ ] **Step 8: Run related component tests**

Run:

```powershell
pnpm.cmd --filter @pusula/web exec vitest run "src/app/(app)/workspaces/[id]/boards/[boardId]/page.test.tsx" "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-top-bar.test.tsx" "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/list-column.test.tsx"
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```powershell
git add -- "apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/page.tsx" "apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/page.test.tsx" "apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-top-bar.tsx" "apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-columns.tsx" "apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/list-column.tsx" "apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/add-list-column.tsx"
git commit -m "feat: DEM-73 add board shortcuts"
```

---

### Task 5: Card Modal Shortcuts

**Files:**

- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-title.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-modal-meta-chips.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-modal-meta-chips.test.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-dialog.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-dialog.test.tsx`

- [ ] **Step 1: Add controlled dropdown tests for meta chips**

In `card-modal-meta-chips.test.tsx`, add:

```tsx
it('opens a controlled menu key from props', () => {
  setup({ openMenu: 'labels', onOpenMenuChange: () => undefined });

  expect(screen.getByText('Etiket menüsü')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: m.labelsChip })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});
```

- [ ] **Step 2: Run the meta chip test and verify it fails**

Run:

```powershell
pnpm.cmd --filter @pusula/web exec vitest run "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-modal-meta-chips.test.tsx" -t "controlled"
```

Expected: FAIL because `openMenu` props do not exist.

- [ ] **Step 3: Add controlled menu props to CardModalMetaChips**

In `card-modal-meta-chips.tsx`, add:

```ts
export type CardModalMetaMenu = 'members' | 'due' | 'labels' | 'cover' | null;
```

Extend `CardModalMetaChipsProps`:

```ts
  openMenu?: CardModalMetaMenu;
  onOpenMenuChange?: (menu: CardModalMetaMenu) => void;
```

Extend `MetaDropdown` props:

```ts
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
```

Pass them into `DropdownMenu`:

```tsx
<DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
```

In `CardModalMetaChips`, destructure:

```ts
  openMenu,
  onOpenMenuChange,
```

Add these exact props to the four existing `MetaDropdown` calls; keep each call's existing `trigger`, `className`, and children unchanged:

```tsx
open={openMenu === 'members'}
onOpenChange={(open) => onOpenMenuChange?.(open ? 'members' : null)}
```

```tsx
open={openMenu === 'due'}
onOpenChange={(open) => onOpenMenuChange?.(open ? 'due' : null)}
```

```tsx
open={openMenu === 'labels'}
onOpenChange={(open) => onOpenMenuChange?.(open ? 'labels' : null)}
```

```tsx
open={openMenu === 'cover'}
onOpenChange={(open) => onOpenMenuChange?.(open ? 'cover' : null)}
```

- [ ] **Step 4: Add title focus token support**

In `card-detail-title.tsx`, extend props:

```ts
  focusEditToken?: number;
```

Destructure default:

```ts
  focusEditToken = 0,
```

Add effect after autosize effect:

```ts
useEffect(() => {
  if (!canEdit || focusEditToken <= 0) return;
  taRef.current?.focus();
  taRef.current?.select();
}, [canEdit, focusEditToken]);
```

- [ ] **Step 5: Add failing modal shortcut tests**

In `card-detail-dialog.test.tsx`, add hoisted mutation spies:

```ts
updateMutate: vi.fn(),
completeMutate: vi.fn(),
uncompleteMutate: vi.fn(),
archiveMutate: vi.fn(),
```

Update the mocked `useMutation` so optimistic card actions can be asserted independently:

```ts
useMutation: (options?: { procedure?: string }) => {
  const mutate =
    options?.procedure === 'card.complete'
      ? h.completeMutate
      : options?.procedure === 'card.uncomplete'
        ? h.uncompleteMutate
        : options?.procedure === 'card.archive'
          ? h.archiveMutate
          : options?.procedure === 'card.update'
            ? h.updateMutate
            : vi.fn();

  return {
    mutate,
    mutateAsync: h.mutationMutateAsync,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  };
},
```

Replace the tRPC mock with a version that keeps the current deep proxy for queries but exposes named card mutation tokens:

```ts
const namedMutationOptions = (procedure: string) => (options?: unknown) => ({
  procedure,
  options,
});

const deepProxy: unknown = new Proxy(function () {} as object, {
  get: (_t, prop) => (prop === 'then' ? undefined : deepProxy),
  apply: () => deepProxy,
});

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    card: {
      get: deepProxy,
      update: { mutationOptions: namedMutationOptions('card.update') },
      complete: { mutationOptions: namedMutationOptions('card.complete') },
      uncomplete: { mutationOptions: namedMutationOptions('card.uncomplete') },
      archive: { mutationOptions: namedMutationOptions('card.archive') },
      members: { list: deepProxy, add: deepProxy, remove: deepProxy },
      labels: { list: deepProxy, add: deepProxy, remove: deepProxy },
      activity: { list: deepProxy },
    },
    board: { members: { list: deepProxy }, get: deepProxy },
    label: { list: deepProxy, create: deepProxy },
    checklist: {
      list: deepProxy,
      create: deepProxy,
      update: deepProxy,
      delete: deepProxy,
      item: {
        create: deepProxy,
        toggle: deepProxy,
        update: deepProxy,
        delete: deepProxy,
      },
    },
    comment: { list: deepProxy, create: deepProxy, update: deepProxy, delete: deepProxy },
    attachment: { createUpload: deepProxy },
  }),
}));
```

Reset the new spies in `beforeEach`:

```ts
h.updateMutate.mockReset();
h.completeMutate.mockReset();
h.uncompleteMutate.mockReset();
h.archiveMutate.mockReset();
```

Add tests:

```tsx
it('focuses title edit and opens meta menus from modal shortcuts', async () => {
  const user = userEvent.setup();
  renderDialog();

  await user.keyboard('e');
  expect(screen.getByLabelText(strings.card.detail.titleLabel)).toHaveFocus();

  await user.keyboard('d');
  expect(screen.getByText(strings.card.detail.dueTitle)).toBeInTheDocument();

  await user.keyboard('{Escape}');
  await user.keyboard('m');
  expect(screen.getByText(strings.card.members.title)).toBeInTheDocument();

  await user.keyboard('{Escape}');
  await user.keyboard('t');
  expect(screen.getByText(strings.card.labels.title)).toBeInTheDocument();
});

it('runs complete and archive shortcuts when allowed', async () => {
  const user = userEvent.setup();
  renderDialog();

  await user.keyboard('c');
  expect(h.completeMutate).toHaveBeenCalledWith({ cardId: 'card1' });

  await user.keyboard('a');
  expect(h.archiveMutate).toHaveBeenCalledWith({ cardId: 'card1', archived: true });
});

it('opens shortcut help from the card modal', async () => {
  const user = userEvent.setup();
  renderDialog();

  await user.keyboard('?');

  expect(screen.getByRole('dialog', { name: strings.shortcuts.dialogTitle })).toBeInTheDocument();
  expect(screen.getByText(strings.shortcuts.groups.cardModal)).toBeInTheDocument();
});
```

- [ ] **Step 6: Run modal shortcut tests and verify they fail**

Run:

```powershell
pnpm.cmd --filter @pusula/web exec vitest run "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-dialog.test.tsx" -t "shortcut|modal shortcuts|complete and archive"
```

Expected: FAIL because modal shortcuts are not wired.

- [ ] **Step 7: Implement modal shortcut state and handlers**

In `card-detail-dialog.tsx`, import:

```ts
import { useShortcutScope } from '@/lib/shortcuts';
import { ShortcutHelpDialog } from '../shortcut-help-dialog';
import type { CardModalMetaMenu } from './card-modal-meta-chips';
```

Add state near other `useState` calls:

```ts
const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
const [titleFocusToken, setTitleFocusToken] = useState(0);
const [openMetaMenu, setOpenMetaMenu] = useState<CardModalMetaMenu>(null);
```

Add shortcut scope after computed permissions and mutation state:

```ts
useShortcutScope({
  scope: 'card-modal',
  enabled: Boolean(card),
  bindings: [
    {
      id: 'card-help',
      match: (event) => event.key === '?' && !event.ctrlOrMeta && !event.alt,
      run: () => setShortcutHelpOpen(true),
    },
    {
      id: 'card-edit-title',
      match: (event) => event.key === 'e' && !event.ctrlOrMeta && !event.alt,
      run: () => {
        if (canEdit) setTitleFocusToken((value) => value + 1);
      },
    },
    {
      id: 'card-toggle-complete',
      match: (event) => event.key === 'c' && !event.ctrlOrMeta && !event.alt,
      run: () => {
        if (!canEdit || completePending) return;
        if (completed) uncompleteCard.mutate({ cardId });
        else completeCard.mutate({ cardId });
      },
    },
    {
      id: 'card-due',
      match: (event) => event.key === 'd' && !event.ctrlOrMeta && !event.alt,
      run: () => {
        if (canEdit) setOpenMetaMenu('due');
      },
    },
    {
      id: 'card-members',
      match: (event) => event.key === 'm' && !event.ctrlOrMeta && !event.alt,
      run: () => {
        if (canEdit) setOpenMetaMenu('members');
      },
    },
    {
      id: 'card-labels',
      match: (event) => event.key === 't' && !event.ctrlOrMeta && !event.alt,
      run: () => {
        if (canEdit) setOpenMetaMenu('labels');
      },
    },
    {
      id: 'card-archive',
      match: (event) => event.key === 'a' && !event.ctrlOrMeta && !event.alt,
      run: () => {
        if (!canArchive || archiveCard.isPending) return;
        archiveCard.mutate({ cardId, archived: !archived });
      },
    },
  ],
});
```

Pass title token:

```tsx
<CardDetailTitle
  title={card.title}
  completed={completed}
  canEdit={canEdit}
  onSave={(title) => updateTitle.mutate({ cardId, title })}
  pending={updateTitle.isPending}
  error={errOf(updateTitle)}
  focusEditToken={titleFocusToken}
/>
```

Pass the controlled menu props to `CardModalMetaChips` immediately after `canEdit={canEdit}`. Keep the existing `membersContent`, `dueContent`, `labelsContent`, and `coverContent` props unchanged:

```tsx
openMenu = { openMetaMenu };
onOpenMenuChange = { setOpenMetaMenu };
```

Render shortcut help inside the Dialog content fragment:

```tsx
<ShortcutHelpDialog open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen} includeCardModal />
```

- [ ] **Step 8: Run modal and meta chip tests**

Run:

```powershell
pnpm.cmd --filter @pusula/web exec vitest run "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-modal-meta-chips.test.tsx" "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-dialog.test.tsx"
```

Expected: PASS.

- [ ] **Step 9: Commit Task 5**

```powershell
git add -- "apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-title.tsx" "apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-modal-meta-chips.tsx" "apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-modal-meta-chips.test.tsx" "apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-dialog.tsx" "apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-dialog.test.tsx"
git commit -m "feat: DEM-73 add card modal shortcuts"
```

---

### Task 6: Documentation Sync

**Files:**

- Modify: `docs/architecture/08-web-ve-mobil.md`
- Modify: `docs/architecture/13-ui-tasarim-dili.md`
- Modify: `docs/process/05-is-kayit-defteri.md`

- [ ] **Step 1: Update web architecture doc**

Add a short DEM-73 note near the search / board technical needs sections in `docs/architecture/08-web-ve-mobil.md`:

```md
> **Klavye kısayolları ([DEM-73](https://linear.app/demirkol/issue/DEM-73)):** board route'unda küçük bir shortcut katmanı vardır. `Cmd/Ctrl+K` ve `Ctrl+Space` global search dialog'unu açar; board ekranında `/` board-scoped search açar, `n` ilk aktif listeye kart ekleme formunu, `Shift+N`/`L` liste ekleme formunu, `?` yardım dialog'unu açar. Kart modalı açıkken modal scope'u önceliklidir: `E` başlık edit focus, `C` complete toggle, `D` due picker, `M` member picker, `T` label picker, `A` archive/restore, `Esc` mevcut Dialog close davranışı. Shortcut'lar input/textarea/select/contenteditable/Tiptap odakta çalışmaz; a11y keyboard navigation'ın yerine geçmez.
```

- [ ] **Step 2: Update UI design language doc**

In `docs/architecture/13-ui-tasarim-dili.md`, replace the existing DEM-73 out-of-scope note with:

```md
- **Klavye kısayolu katmanı** — DEM-73 ile küçük kapsamda uygulanır: global search (`Cmd/Ctrl+K`, `Ctrl+Space`), board-scoped search (`/`), board add-card/add-list (`N`, `Shift+N`/`L`), shortcut help (`?`) ve card modal aksiyonları (`E`, `C`, `D`, `M`, `T`, `A`, `Esc`). Aktif kart/liste seçimi ve ok tuşlarıyla board navigasyonu ayrı follow-up kapsamıdır.
```

- [ ] **Step 3: Update work register**

In `docs/process/05-is-kayit-defteri.md`, add or update the DEM-73 row:

```md
| FE-2026-05-14-011 | DEM-73 | Trello-stili klavye kısayolları (board + kart modalı) | 8 — Sertleştirme | In Progress | Codex | `docs/superpowers/specs/2026-05-14-dem-73-keyboard-shortcuts-design.md`, `docs/superpowers/plans/2026-05-14-dem-73-keyboard-shortcuts.md`, `docs/architecture/08-web-ve-mobil.md`, `docs/architecture/13-ui-tasarim-dili.md`, `docs/process/05-is-kayit-defteri.md` | `apps/web/src/lib/shortcuts`, `apps/web/src/app/(app)/_components/search-dialog.tsx`, `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/**` | 2026-05-14 | Küçük shortcut katmanı: `Cmd/Ctrl+K` + `Ctrl+Space` global search, `/` board search, `N` kart ekleme, `Shift+N`/`L` liste ekleme, `?` yardım dialog'u, kart modalı `E/C/D/M/T/A`; aktif kart/liste selection follow-up dışarıda. |
```

- [ ] **Step 4: Run docs diff check**

Run:

```powershell
git diff --check -- docs/architecture/08-web-ve-mobil.md docs/architecture/13-ui-tasarim-dili.md docs/process/05-is-kayit-defteri.md
```

Expected: no whitespace errors.

- [ ] **Step 5: Commit Task 6**

```powershell
git add -- docs/architecture/08-web-ve-mobil.md docs/architecture/13-ui-tasarim-dili.md docs/process/05-is-kayit-defteri.md
git commit -m "docs: DEM-73 document keyboard shortcuts"
```

---

### Task 7: Full Verification and Linear Closure Prep

**Files:**

- No new files.
- Verify all DEM-73 touched files.

- [ ] **Step 1: Run focused unit and RTL tests**

Run:

```powershell
pnpm.cmd --filter @pusula/web exec vitest run src/lib/shortcuts/keyboard.test.ts "src/app/(app)/_components/app-shell.test.tsx" "src/app/(app)/workspaces/[id]/boards/[boardId]/page.test.tsx" "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/shortcut-help-dialog.test.tsx" "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-modal-meta-chips.test.tsx" "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-dialog.test.tsx"
```

Expected: PASS.

- [ ] **Step 2: Run web typecheck**

Run:

```powershell
pnpm.cmd --filter @pusula/web typecheck
```

Expected: PASS.

- [ ] **Step 3: Run web lint**

Run:

```powershell
pnpm.cmd --filter @pusula/web lint
```

Expected: PASS or only documented pre-existing warnings unrelated to DEM-73.

- [ ] **Step 4: Run web build if typecheck and lint pass**

Run:

```powershell
pnpm.cmd --filter @pusula/web build
```

Expected: PASS.

- [ ] **Step 5: Inspect staged and unstaged DEM-73 diff**

Run:

```powershell
git diff --stat -- apps/web/src/lib/shortcuts "apps/web/src/app/(app)/_components/search-dialog.tsx" "apps/web/src/app/(app)/_components/app-shell.test.tsx" "apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]" docs/architecture/08-web-ve-mobil.md docs/architecture/13-ui-tasarim-dili.md docs/process/05-is-kayit-defteri.md
```

Expected: diff only contains DEM-73 shortcut implementation and docs.

- [ ] **Step 6: Add Linear implementation comment**

Add a Linear comment to DEM-73 with:

```md
Kodlama notu:

- Shortcut utility module eklendi: event normalize + editable target guard + scoped keydown hook.
- `Ctrl+Space`, mevcut `Cmd/Ctrl+K` ile aynı global search davranışını açıyor.
- Board route kısayolları: `/`, `N`, `Shift+N`/`L`, `?`.
- Card modal kısayolları: `E`, `C`, `D`, `M`, `T`, `A`, `?`; `Esc` mevcut Dialog close davranışında kaldı.
- Input/textarea/select/contenteditable/Tiptap odakta shortcut'lar devre dışı.
- Aktif kart/liste seçim modeli ayrı follow-up kapsamına bırakıldı.

Verification:

- PASS/FAIL: `<focused vitest command>`
- PASS/FAIL: `pnpm.cmd --filter @pusula/web typecheck`
- PASS/FAIL: `pnpm.cmd --filter @pusula/web lint`
- PASS/FAIL: `pnpm.cmd --filter @pusula/web build`
```

- [ ] **Step 7: Commit final verification notes only if docs changed after Task 6**

If only Linear was updated, do not create a git commit. If local docs changed after Task 6, run:

```powershell
git add -- docs/process/05-is-kayit-defteri.md
git commit -m "docs: DEM-73 record verification"
```

---

## Execution Notes

- Use TDD for each task: write or extend tests first, run the focused test to see it fail, implement, run the focused test again.
- Do not introduce new dependencies.
- Do not build active card/list selection in this work.
- Keep all new user-facing copy in `strings.shortcuts`.
- Stage only DEM-73 files when committing; the current worktree may contain unrelated changes.
