# Role Info Tooltips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add contextual info icon buttons that explain workspace, board, and card membership rules where users manage those roles.

**Architecture:** Add one small `InfoTooltipButton` web component that wraps the existing `@pusula/ui` Tooltip and Button primitives with lucide `InfoIcon`. Feed all copy from `apps/web/src/lib/strings.ts`, then place the component beside the relevant section headers in workspace management, board settings, and card detail members.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Testing Library, `@pusula/ui`, lucide-react.

---

### Task 1: Shared Info Tooltip Button

**Files:**

- Create: `apps/web/src/components/info-tooltip-button.tsx`
- Create: `apps/web/src/components/info-tooltip-button.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `apps/web/src/components/info-tooltip-button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InfoTooltipButton } from './info-tooltip-button';

describe('<InfoTooltipButton>', () => {
  it('exposes an accessible info button and reveals the tooltip on focus', async () => {
    const user = userEvent.setup();
    render(<InfoTooltipButton label="Rol bilgisi" content="Workspace rolu genel erisimi belirler." />);

    const button = screen.getByRole('button', { name: 'Rol bilgisi' });
    expect(button).toBeInTheDocument();

    await user.tab();
    expect(button).toHaveFocus();
    const matches = await screen.findAllByText('Workspace rolu genel erisimi belirler.');
    expect(matches.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
pnpm.cmd --filter @pusula/web test -- src/components/info-tooltip-button.test.tsx
```

Expected: fail because `./info-tooltip-button` does not exist.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/info-tooltip-button.tsx`:

```tsx
'use client';

import { InfoIcon } from 'lucide-react';
import { Button, Tooltip, TooltipContent, TooltipTrigger, cn } from '@pusula/ui';

type InfoTooltipButtonProps = {
  label: string;
  content: string;
  className?: string;
};

export function InfoTooltipButton({ label, content, className }: InfoTooltipButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('text-muted-foreground hover:text-foreground size-7 shrink-0', className)}
          aria-label={label}
        >
          <InfoIcon className="size-3.5" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-80 leading-relaxed">{content}</TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 4: Run the component test and verify GREEN**

Run:

```powershell
pnpm.cmd --filter @pusula/web test -- src/components/info-tooltip-button.test.tsx
```

Expected: pass.

### Task 2: Workspace Member Info

**Files:**

- Modify: `apps/web/src/lib/strings.ts`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/page.test.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/page.tsx`

- [ ] **Step 1: Write the failing workspace page test**

In `apps/web/src/app/(app)/workspaces/[id]/page.test.tsx`, add an assertion in the existing successful render test:

```tsx
expect(
  screen.getByRole('button', { name: strings.members.roleInfoLabel }),
).toBeInTheDocument();
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
pnpm.cmd --filter @pusula/web test -- "src/app/(app)/workspaces/[id]/page.test.tsx"
```

Expected: fail because `strings.members.roleInfoLabel` and the button do not exist.

- [ ] **Step 3: Add strings and render the info button**

Add these keys under `strings.members` in `apps/web/src/lib/strings.ts`:

```ts
roleInfoLabel: 'Workspace rol bilgisi',
roleInfo:
  'Workspace rolü genel erişimi belirler. Sahip ve Yönetici üyeleri yönetir; Üye panolarda çalışabilir; Misafir yalnızca davet edildiği panolara erişir.',
```

In `apps/web/src/app/(app)/workspaces/[id]/page.tsx`, import the component:

```tsx
import { InfoTooltipButton } from '@/components/info-tooltip-button';
```

Then change the members title row to include the button:

```tsx
<CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
  <UsersIcon className="size-4" />
  {strings.members.sectionTitle}
  <InfoTooltipButton label={strings.members.roleInfoLabel} content={strings.members.roleInfo} />
</CardTitle>
```

- [ ] **Step 4: Run the workspace page test and verify GREEN**

Run:

```powershell
pnpm.cmd --filter @pusula/web test -- "src/app/(app)/workspaces/[id]/page.test.tsx"
```

Expected: pass.

### Task 3: Board Settings Info

**Files:**

- Modify: `apps/web/src/lib/strings.ts`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/board-settings-dropdown.tsx`
- Create: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/board-settings-dropdown.test.tsx`

- [ ] **Step 1: Write the failing board settings dropdown test**

Create `board-settings-dropdown.test.tsx` beside the dropdown:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '@/lib/strings';
import { BoardSettingsDropdown } from './board-settings-dropdown';

vi.mock('./board-members-section', () => ({
  BoardMembersSection: () => <div>board members section</div>,
}));
vi.mock('./board-invitations-section', () => ({
  BoardInvitationsSection: () => <div>board invitations section</div>,
}));
vi.mock('./board-access-requests-section', () => ({
  BoardAccessRequestsSection: () => <div>board access requests section</div>,
}));
vi.mock('./background-picker', () => ({
  BoardBackgroundPicker: () => <div>background picker</div>,
}));
vi.mock('./board-icon-picker', () => ({
  BoardIconPicker: () => <div>board icon picker</div>,
}));
vi.mock('./board-labels-section', () => ({
  BoardLabelsSection: () => <div>board labels section</div>,
}));

function renderDropdown(activeTab: 'members' | 'invitations' | 'accessRequests') {
  render(
    <BoardSettingsDropdown
      boardId="b1"
      workspaceId="w1"
      currentIcon="layout-grid"
      currentBackground={null}
      canManage
      boardActive
      archived={false}
      open
      activeTab={activeTab}
      onOpenChange={vi.fn()}
      onActiveTabChange={vi.fn()}
      onRename={vi.fn()}
      onArchive={vi.fn()}
      onRestore={vi.fn()}
      restorePending={false}
    />,
  );
}

describe('<BoardSettingsDropdown>', () => {
  it('shows the board member role info button on the members tab', () => {
    renderDropdown('members');
    expect(screen.getByRole('button', { name: strings.board.settings.membersInfoLabel })).toBeInTheDocument();
  });

  it('shows the board invitation info button on the invitations tab', () => {
    renderDropdown('invitations');
    expect(screen.getByRole('button', { name: strings.board.settings.invitationsInfoLabel })).toBeInTheDocument();
  });

  it('shows the board access request info button on the access requests tab', () => {
    renderDropdown('accessRequests');
    expect(screen.getByRole('button', { name: strings.board.settings.accessRequestsInfoLabel })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the dropdown test and verify RED**

Run:

```powershell
pnpm.cmd --filter @pusula/web test -- "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/board-settings-dropdown.test.tsx"
```

Expected: fail because the info string keys and buttons do not exist.

- [ ] **Step 3: Add board settings strings and panel support**

Add these keys under `strings.board.settings`:

```ts
membersInfoLabel: 'Pano rol bilgisi',
membersInfo:
  'Panoda açık rol varsa o kullanılır. Yoksa workspace Sahip/Yönetici panoda Yönetici, workspace Üye panoda Üye sayılır. Misafir yalnızca açıkça eklendiği panoya girer.',
invitationsInfoLabel: 'Pano davet bilgisi',
invitationsInfo:
  'Pano daveti kabul edilince kişi workspace üyesi değilse önce Misafir yapılır, sonra bu panoya seçilen rolle eklenir.',
accessRequestsInfoLabel: 'Pano erişim talebi bilgisi',
accessRequestsInfo:
  'Paylaşılan pano linkinden gelen talepler yalnızca bu pano içindir. Onaylanırsa kullanıcı gerekirse workspace Misafir’i olur ve seçilen pano rolünü alır.',
```

In `board-settings-dropdown.tsx`, import `InfoTooltipButton`, extend `SettingsPanel` with optional `info`, and place it beside `SectionHeader`:

```tsx
import { InfoTooltipButton } from '@/components/info-tooltip-button';

function SettingsPanel({ icon, title, description, info, children }: {
  icon: ReactNode;
  title: string;
  description: string;
  info?: { label: string; content: string };
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <SectionHeader icon={icon} className="mb-0">
            {title}
          </SectionHeader>
          {info && <InfoTooltipButton label={info.label} content={info.content} />}
        </div>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}
```

Pass `info` on the three target panels:

```tsx
info={{ label: settingsCopy.membersInfoLabel, content: settingsCopy.membersInfo }}
info={{ label: settingsCopy.invitationsInfoLabel, content: settingsCopy.invitationsInfo }}
info={{ label: settingsCopy.accessRequestsInfoLabel, content: settingsCopy.accessRequestsInfo }}
```

- [ ] **Step 4: Run the dropdown test and verify GREEN**

Run:

```powershell
pnpm.cmd --filter @pusula/web test -- "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/board-settings-dropdown.test.tsx"
```

Expected: pass.

### Task 4: Card Member Info

**Files:**

- Modify: `apps/web/src/lib/strings.ts`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-members.test.tsx`
- Modify: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-members.tsx`

- [ ] **Step 1: Write the failing card members test**

In `card-detail-members.test.tsx`, add this assertion to the first render test:

```tsx
expect(screen.getByRole('button', { name: copy.infoLabel })).toBeInTheDocument();
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
pnpm.cmd --filter @pusula/web test -- "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-members.test.tsx"
```

Expected: fail because `copy.infoLabel` and the info button do not exist.

- [ ] **Step 3: Add strings and render the info button**

Add these keys under `strings.card.members`:

```ts
infoLabel: 'Kart üyesi bilgisi',
info:
  'Sorumlu ve İzleyen kart ilişkileridir, erişim yetkisi vermez. Karta eklenen kişi panoyu zaten görebiliyor olmalıdır.',
```

In `card-detail-members.tsx`, import the component:

```tsx
import { InfoTooltipButton } from '@/components/info-tooltip-button';
```

Change the heading area:

```tsx
<div className="flex items-center gap-1.5">
  <h3 className="text-muted-foreground text-sm font-medium">{copy.title}</h3>
  <InfoTooltipButton label={copy.infoLabel} content={copy.info} />
</div>
```

- [ ] **Step 4: Run the card members test and verify GREEN**

Run:

```powershell
pnpm.cmd --filter @pusula/web test -- "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-members.test.tsx"
```

Expected: pass.

### Task 5: Focused Verification

**Files:**

- Verify only.

- [ ] **Step 1: Run all focused tests**

Run:

```powershell
pnpm.cmd --filter @pusula/web test -- src/components/info-tooltip-button.test.tsx "src/app/(app)/workspaces/[id]/page.test.tsx" "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/board-settings-dropdown.test.tsx" "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/card-detail/card-detail-members.test.tsx"
```

Expected: all pass.

- [ ] **Step 2: Run typecheck for the web package**

Run:

```powershell
pnpm.cmd --filter @pusula/web typecheck
```

Expected: pass.
