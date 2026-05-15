# Trello Board Gradients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Trello's current board background gradient presets to Pusula without removing existing presets.

**Architecture:** This is an additive contract change across domain constants, UI class mapping, CSS tokens, and picker copy. Stored board background values stay in the existing `gradient:<name>` format, using a `trello-` prefix to avoid collisions with existing local presets.

**Tech Stack:** TypeScript, Zod, Vitest, React Testing Library, Tailwind v4 CSS custom properties, pnpm workspace filters.

---

## File Map

- Modify `packages/domain/src/constants.ts`: append `trello-*` gradient names to `BOARD_BACKGROUND_GRADIENTS`.
- Modify `packages/domain/src/schemas/board.test.ts`: prove domain schema accepts a Trello gradient.
- Modify `packages/ui/src/board-background.ts`: append `trello-*` names and `BG_GRADIENT_CLASS` entries.
- Modify `packages/ui/src/styles/theme.css`: add Trello gradient variables and utility classes for light/dark modes.
- Modify `apps/web/src/lib/strings.ts`: add picker labels under `strings.board.background.gradientNames`.
- Modify `apps/web/src/lib/board-background-class.test.ts`: prove class resolver maps a Trello gradient.
- Modify `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/background-picker.test.tsx`: prove picker can select a Trello swatch.
- Modify `docs/process/05-is-kayit-defteri.md`: track DEM-113 status.

---

### Task 1: Domain Schema Acceptance

**Files:**

- Test: `packages/domain/src/schemas/board.test.ts`
- Modify: `packages/domain/src/constants.ts`

- [ ] **Step 1: Write the failing domain test**

Add this assertion to `it('accepts the expanded board gradient presets', ...)`:

```ts
expect(boardBackgroundSchema.parse('gradient:trello-snow')).toBe('gradient:trello-snow');
```

- [ ] **Step 2: Run the domain test to verify RED**

Run:

```bash
pnpm --filter @pusula/domain test -- src/schemas/board.test.ts
```

Expected: FAIL because `gradient:trello-snow` is not in `BOARD_BACKGROUND_GRADIENTS`.

- [ ] **Step 3: Add Trello gradient names to domain constants**

Append these names to `BOARD_BACKGROUND_GRADIENTS` in `packages/domain/src/constants.ts`:

```ts
'trello-bubble',
'trello-snow',
'trello-ocean',
'trello-crystal',
'trello-rainbow',
'trello-peach',
'trello-flower',
'trello-earth',
'trello-alien',
'trello-volcano',
```

- [ ] **Step 4: Run the domain test to verify GREEN**

Run:

```bash
pnpm --filter @pusula/domain test -- src/schemas/board.test.ts
```

Expected: PASS.

---

### Task 2: UI Class Contract

**Files:**

- Test: `apps/web/src/lib/board-background-class.test.ts`
- Modify: `packages/ui/src/board-background.ts`

- [ ] **Step 1: Write the failing class resolver test**

Add this assertion to `maps known board backgrounds to CSS classes`:

```ts
expect(boardBackgroundClass('gradient:trello-snow')).toBe('board-bg-gradient-trello-snow');
```

- [ ] **Step 2: Run the web class resolver test to verify RED**

Run:

```bash
pnpm --filter @pusula/web test -- src/lib/board-background-class.test.ts
```

Expected: FAIL because `gradient:trello-snow` currently falls back to `board-bg-default`.

- [ ] **Step 3: Add Trello gradients to UI constants and class map**

Append the same ten names to `BOARD_BACKGROUND_GRADIENTS` in `packages/ui/src/board-background.ts`, then add this map block to `BG_GRADIENT_CLASS`:

```ts
'trello-bubble': 'board-bg-gradient-trello-bubble',
'trello-snow': 'board-bg-gradient-trello-snow',
'trello-ocean': 'board-bg-gradient-trello-ocean',
'trello-crystal': 'board-bg-gradient-trello-crystal',
'trello-rainbow': 'board-bg-gradient-trello-rainbow',
'trello-peach': 'board-bg-gradient-trello-peach',
'trello-flower': 'board-bg-gradient-trello-flower',
'trello-earth': 'board-bg-gradient-trello-earth',
'trello-alien': 'board-bg-gradient-trello-alien',
'trello-volcano': 'board-bg-gradient-trello-volcano',
```

- [ ] **Step 4: Run the web class resolver test to verify GREEN**

Run:

```bash
pnpm --filter @pusula/web test -- src/lib/board-background-class.test.ts
```

Expected: PASS.

---

### Task 3: Picker Behavior

**Files:**

- Test: `apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/background-picker.test.tsx`
- Modify: `apps/web/src/lib/strings.ts`
- Depends on: `packages/ui/src/board-background.ts`

- [ ] **Step 1: Write the failing picker test**

Add this assertion to `renders expanded gradient and board-only white solid swatches` before switching to the solid tab:

```ts
await user.click(screen.getByRole('button', { name: 'Trello Mavi' }));
expect(h.mutate).toHaveBeenCalledWith({ boardId: 'b1', background: 'gradient:trello-snow' });
```

- [ ] **Step 2: Run the picker test to verify RED**

Run:

```bash
pnpm --filter @pusula/web test -- "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/background-picker.test.tsx"
```

Expected: FAIL because `copy.gradientNames['trello-snow']` is missing.

- [ ] **Step 3: Add picker labels**

Add these labels under `strings.board.background.gradientNames` in `apps/web/src/lib/strings.ts`:

```ts
'trello-bubble': 'Trello Acik mavi',
'trello-snow': 'Trello Mavi',
'trello-ocean': 'Trello Koyu mavi',
'trello-crystal': 'Trello Koyu mor',
'trello-rainbow': 'Trello Mor',
'trello-peach': 'Trello Turuncu',
'trello-flower': 'Trello Pembe',
'trello-earth': 'Trello Yesil',
'trello-alien': 'Trello Gri',
'trello-volcano': 'Trello Kirmizi',
```

- [ ] **Step 4: Run the picker test to verify GREEN**

Run:

```bash
pnpm --filter @pusula/web test -- "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/background-picker.test.tsx"
```

Expected: PASS.

---

### Task 4: CSS Tokens And Utilities

**Files:**

- Modify: `packages/ui/src/styles/theme.css`

- [ ] **Step 1: Add Trello light gradient variables**

Add this block near the existing `--bg-gradient-*` root variables:

```css
--bg-gradient-trello-bubble: linear-gradient(145deg, #e9f2fe 2%, #cfe1fd 100%);
--bg-gradient-trello-snow: linear-gradient(145deg, #0c66e4 2%, #37b4c3 100%);
--bg-gradient-trello-ocean: linear-gradient(145deg, #0c66e4 2%, #09326c 100%);
--bg-gradient-trello-crystal: linear-gradient(145deg, #09326c 2%, #cd519d 100%);
--bg-gradient-trello-rainbow: linear-gradient(145deg, #6e5dc6 2%, #e774bb 100%);
--bg-gradient-trello-peach: linear-gradient(145deg, #e34935 2%, #faa53d 100%);
--bg-gradient-trello-flower: linear-gradient(145deg, #e774bb 2%, #f87462 100%);
--bg-gradient-trello-earth: linear-gradient(145deg, #1f845a 2%, #60c6d2 100%);
--bg-gradient-trello-alien: linear-gradient(145deg, #505f79 2%, #172b4d 100%);
--bg-gradient-trello-volcano: linear-gradient(145deg, #43290f 2%, #ae2a19 100%);
```

- [ ] **Step 2: Add Trello dark gradient variables**

Add this block near the existing `.dark --bg-gradient-*` variables:

```css
--bg-gradient-trello-bubble: linear-gradient(145deg, #1c2b42 2%, #123263 100%);
--bg-gradient-trello-snow: linear-gradient(145deg, #0c66e4 2%, #37b4c3 100%);
--bg-gradient-trello-ocean: linear-gradient(145deg, #0c66e4 2%, #09326c 100%);
--bg-gradient-trello-crystal: linear-gradient(145deg, #09326c 2%, #cd519d 100%);
--bg-gradient-trello-rainbow: linear-gradient(145deg, #6e5dc6 2%, #e774bb 100%);
--bg-gradient-trello-peach: linear-gradient(145deg, #e34935 2%, #faa53d 100%);
--bg-gradient-trello-flower: linear-gradient(145deg, #e774bb 2%, #f87462 100%);
--bg-gradient-trello-earth: linear-gradient(145deg, #1f845a 2%, #60c6d2 100%);
--bg-gradient-trello-alien: linear-gradient(145deg, #505f79 2%, #172b4d 100%);
--bg-gradient-trello-volcano: linear-gradient(145deg, #43290f 2%, #ae2a19 100%);
```

- [ ] **Step 3: Add board background classes**

Add these classes near the existing `.board-bg-gradient-*` classes:

```css
.board-bg-gradient-trello-bubble {
  --board-base: #dceafe;
  --board-surface-image: var(--bg-gradient-trello-bubble);
}
.board-bg-gradient-trello-snow {
  --board-base: #228cd5;
  --board-surface-image: var(--bg-gradient-trello-snow);
}
.board-bg-gradient-trello-ocean {
  --board-base: #0b50af;
  --board-surface-image: var(--bg-gradient-trello-ocean);
}
.board-bg-gradient-trello-crystal {
  --board-base: #674284;
  --board-surface-image: var(--bg-gradient-trello-crystal);
}
.board-bg-gradient-trello-rainbow {
  --board-base: #a869c1;
  --board-surface-image: var(--bg-gradient-trello-rainbow);
}
.board-bg-gradient-trello-peach {
  --board-base: #ef763a;
  --board-surface-image: var(--bg-gradient-trello-peach);
}
.board-bg-gradient-trello-flower {
  --board-base: #f488a6;
  --board-surface-image: var(--bg-gradient-trello-flower);
}
.board-bg-gradient-trello-earth {
  --board-base: #3fa495;
  --board-surface-image: var(--bg-gradient-trello-earth);
}
.board-bg-gradient-trello-alien {
  --board-base: #374866;
  --board-surface-image: var(--bg-gradient-trello-alien);
}
.board-bg-gradient-trello-volcano {
  --board-base: #762a14;
  --board-surface-image: var(--bg-gradient-trello-volcano);
}
.dark .board-bg-gradient-trello-bubble {
  --board-base: #172f53;
}
```

- [ ] **Step 4: Add standalone preview utilities**

Add these classes near the existing `.bg-gradient-*` classes:

```css
.bg-gradient-trello-bubble {
  background-color: var(--background);
  background-image: var(--bg-gradient-trello-bubble);
}
.bg-gradient-trello-snow {
  background-color: var(--background);
  background-image: var(--bg-gradient-trello-snow);
}
.bg-gradient-trello-ocean {
  background-color: var(--background);
  background-image: var(--bg-gradient-trello-ocean);
}
.bg-gradient-trello-crystal {
  background-color: var(--background);
  background-image: var(--bg-gradient-trello-crystal);
}
.bg-gradient-trello-rainbow {
  background-color: var(--background);
  background-image: var(--bg-gradient-trello-rainbow);
}
.bg-gradient-trello-peach {
  background-color: var(--background);
  background-image: var(--bg-gradient-trello-peach);
}
.bg-gradient-trello-flower {
  background-color: var(--background);
  background-image: var(--bg-gradient-trello-flower);
}
.bg-gradient-trello-earth {
  background-color: var(--background);
  background-image: var(--bg-gradient-trello-earth);
}
.bg-gradient-trello-alien {
  background-color: var(--background);
  background-image: var(--bg-gradient-trello-alien);
}
.bg-gradient-trello-volcano {
  background-color: var(--background);
  background-image: var(--bg-gradient-trello-volcano);
}
```

- [ ] **Step 5: Run UI typecheck**

Run:

```bash
pnpm --filter @pusula/ui typecheck
```

Expected: PASS.

---

### Task 5: Final Verification

**Files:**

- Verify all changed files.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
pnpm --filter @pusula/domain test -- src/schemas/board.test.ts
pnpm --filter @pusula/web test -- src/lib/board-background-class.test.ts
pnpm --filter @pusula/web test -- "src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/background-picker.test.tsx"
pnpm --filter @pusula/ui typecheck
```

Expected: all commands exit 0.

- [ ] **Step 2: Run diff hygiene**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 3: Review changed files**

Run:

```bash
git diff -- packages/domain/src/constants.ts packages/domain/src/schemas/board.test.ts packages/ui/src/board-background.ts packages/ui/src/styles/theme.css apps/web/src/lib/strings.ts apps/web/src/lib/board-background-class.test.ts "apps/web/src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/background-picker.test.tsx" docs/process/05-is-kayit-defteri.md docs/superpowers/plans/2026-05-15-trello-board-gradients.md
```

Expected: only the Trello gradient feature and matching docs/register changes appear.
