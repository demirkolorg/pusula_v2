---
title: 'Trello Board Gradients Design'
description: 'Add Trello-matched board background gradient presets with light and dark theme handling.'
aliases:
  - 'Trello Board Gradients'
  - 'Trello Pano Gradientleri'
tags:
  - 'pusula'
  - 'architecture/ui'
type: 'architecture'
axis: 'architecture'
status: 'active'
parent: '[[docs/architecture/13-ui-tasarim-dili|UI Tasarim Dili]]'
updated: 2026-05-15
---

# Trello Board Gradients Design

## Context

Pusula already supports board background presets through the canonical stored format `gradient:<name>` and `solid:<name>`. The contract is mirrored in three places:

- `packages/domain/src/constants.ts` validates allowed background names.
- `packages/ui/src/board-background.ts` maps background values to CSS classes.
- `packages/ui/src/styles/theme.css` defines light and dark gradient tokens plus board chrome variables.

The board settings picker renders `BOARD_BACKGROUND_GRADIENTS`, so adding values to the shared lists is enough to make the presets selectable once the CSS and strings exist.

## Source Values

The Trello gradients are taken from Trello's current web app bundle and its referenced SVG gradient assets. Trello's SVG assets use the same linear gradient geometry for the set:

```xml
<linearGradient x1="0%" y1="0%" x2="80%" y2="116%">
  <stop offset="2%" stop-color="TOP" />
  <stop offset="100%" stop-color="BOTTOM" />
</linearGradient>
```

In CSS this will be represented as:

```css
linear-gradient(145deg, TOP 2%, BOTTOM 100%)
```

The light-mode presets are:

| Stored value              | Label            | Top       | Bottom    | Base      |
| ------------------------- | ---------------- | --------- | --------- | --------- |
| `gradient:trello-bubble`  | Trello Acik mavi | `#E9F2FE` | `#CFE1FD` | `#DCEAFE` |
| `gradient:trello-snow`    | Trello Mavi      | `#0C66E4` | `#37B4C3` | `#228CD5` |
| `gradient:trello-ocean`   | Trello Koyu mavi | `#0C66E4` | `#09326C` | `#0B50AF` |
| `gradient:trello-crystal` | Trello Koyu mor  | `#09326C` | `#CD519D` | `#674284` |
| `gradient:trello-rainbow` | Trello Mor       | `#6E5DC6` | `#E774BB` | `#A869C1` |
| `gradient:trello-peach`   | Trello Turuncu   | `#E34935` | `#FAA53D` | `#EF763A` |
| `gradient:trello-flower`  | Trello Pembe     | `#E774BB` | `#F87462` | `#F488A6` |
| `gradient:trello-earth`   | Trello Yesil     | `#1F845A` | `#60C6D2` | `#3FA495` |
| `gradient:trello-alien`   | Trello Gri       | `#505F79` | `#172B4D` | `#374866` |
| `gradient:trello-volcano` | Trello Kirmizi   | `#43290F` | `#AE2A19` | `#762A14` |

Trello exposes a separate dark SVG only for `gradient-bubble`. Pusula will use that exact dark value for `trello-bubble`:

| Stored value             | Dark top  | Dark bottom | Dark base |
| ------------------------ | --------- | ----------- | --------- |
| `gradient:trello-bubble` | `#1C2B42` | `#123263`   | `#172F53` |

For the other Trello gradients, dark mode will keep the same Trello stops. This preserves the "birebir Trello" requirement instead of inventing darker variants.

## Decision

Add the Trello gradients as additive presets named with a `trello-` prefix. Existing Pusula gradient values stay valid and unchanged.

This avoids breaking boards that already store values such as `gradient:ocean` and prevents a naming collision with the existing `ocean`, `rainbow`, and other local presets.

## Implementation Plan

### Domain Contract

Append the ten new `trello-*` gradient names to `BOARD_BACKGROUND_GRADIENTS` in `packages/domain/src/constants.ts`.

The existing `boardBackgroundSchema` regex is generated from that list, so no new schema shape is required. Stored values remain plain strings in `boards.background`.

### UI Contract

Append the same ten names to `BOARD_BACKGROUND_GRADIENTS` in `packages/ui/src/board-background.ts`.

Extend `BG_GRADIENT_CLASS` with:

- `trello-bubble` -> `board-bg-gradient-trello-bubble`
- `trello-snow` -> `board-bg-gradient-trello-snow`
- `trello-ocean` -> `board-bg-gradient-trello-ocean`
- `trello-crystal` -> `board-bg-gradient-trello-crystal`
- `trello-rainbow` -> `board-bg-gradient-trello-rainbow`
- `trello-peach` -> `board-bg-gradient-trello-peach`
- `trello-flower` -> `board-bg-gradient-trello-flower`
- `trello-earth` -> `board-bg-gradient-trello-earth`
- `trello-alien` -> `board-bg-gradient-trello-alien`
- `trello-volcano` -> `board-bg-gradient-trello-volcano`

### CSS Tokens

In `packages/ui/src/styles/theme.css`, add `:root` variables:

- `--bg-gradient-trello-bubble`
- `--bg-gradient-trello-snow`
- `--bg-gradient-trello-ocean`
- `--bg-gradient-trello-crystal`
- `--bg-gradient-trello-rainbow`
- `--bg-gradient-trello-peach`
- `--bg-gradient-trello-flower`
- `--bg-gradient-trello-earth`
- `--bg-gradient-trello-alien`
- `--bg-gradient-trello-volcano`

Add matching `.dark` variables. Only `--bg-gradient-trello-bubble` differs in dark mode; the rest repeat the Trello light stops by design.

Add utility classes:

- `.board-bg-gradient-trello-*` sets `--board-base` to the Trello base color and `--board-surface-image` to the matching token.
- `.bg-gradient-trello-*` mirrors the existing standalone preview utilities and sets `background-image` to the matching token.

### Picker Copy

Add Turkish labels under `strings.board.background.gradientNames`. Labels must be distinct from existing Pusula presets, using the `Trello ...` prefix.

### Tests

Update focused tests:

- `packages/domain/src/schemas/board.test.ts` accepts a representative Trello gradient such as `gradient:trello-snow`.
- `apps/web/src/lib/board-background-class.test.ts` maps a representative Trello gradient to its class.
- `background-picker.test.tsx` can select a Trello gradient swatch and calls `board.update` with the correct stored value.

## Out Of Scope

- Replacing or renaming existing Pusula gradient presets.
- Generating custom dark variants for every Trello gradient.
- Adding image, Unsplash, or uploaded board backgrounds.
- Changing the `boards.background` database column shape.

## Risks

The main risk is manual sync drift between domain constants, UI constants, CSS classes, and strings. The implementation should update all four in the same patch and keep tests on representative Trello values to catch omissions.

## Verification

Run targeted checks after implementation:

```bash
pnpm --filter @pusula/domain test -- --run src/schemas/board.test.ts
pnpm --filter @pusula/web test -- --run src/lib/board-background-class.test.ts src/app/(app)/workspaces/[id]/boards/[boardId]/_components/board-settings/background-picker.test.tsx
pnpm --filter @pusula/ui typecheck
```
