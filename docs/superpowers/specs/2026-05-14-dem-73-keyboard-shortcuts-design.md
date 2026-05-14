# DEM-73 Keyboard Shortcuts Design

## Summary

DEM-73 adds a small, explicit shortcut layer for the board screen and card detail modal. This first version does not add Trello-style active card/list selection or arrow-key board navigation. Those need a separate follow-up because the current board has focusable cards and contextual menus, but it does not have a single active-card/list state that can safely receive actions.

The goal is to make common actions faster without weakening accessibility keyboard navigation. Native focus flow, ARIA behavior, Dialog Escape handling, form typing, Tiptap editing, and existing button/menu controls remain the primary accessible paths.

## Scope

### Board screen

- `/` opens board-scoped search.
- `Ctrl+Space` opens the same global search dialog as `Cmd/Ctrl+K`.
- `Cmd/Ctrl+K` keeps its current global search behavior.
- `n` opens the add-card form in the first editable active list.
- `Shift+n` opens the add-list form.
- `l` also opens the add-list form.
- `?` opens the shortcut help dialog.

The board shortcuts run only on the board route after board access and `board.get` data have loaded. If the board is archived, the viewer is not `member+`, or no active list exists, edit shortcuts are no-ops and the help dialog still opens.

### Card detail modal

When a card detail modal is open, modal shortcuts take precedence over board shortcuts:

- `e` starts title editing.
- `c` toggles card complete/incomplete.
- `d` opens the due-date picker.
- `m` opens the members picker.
- `t` opens the labels picker.
- `a` archives or restores the card when the viewer can archive.
- `?` opens the shortcut help dialog with both board and card-modal groups visible.
- `Esc` remains the existing Dialog close behavior.

Readonly, archived, or pending states do not force actions. If an action is not available, the shortcut is ignored.

## Out of Scope

- Active selected card/list state.
- Arrow-key navigation between cards or lists.
- Applying card actions to a selected board card while no card modal is open.
- Mobile-specific shortcuts.
- User-configurable shortcut bindings.
- New package dependencies.

## Architecture

Add a focused `apps/web/src/lib/shortcuts/` module:

- `isShortcutEditableTarget(target)` returns true for `input`, `textarea`, `select`, `button[aria-haspopup]` menus if needed, `[contenteditable=true]`, and Tiptap/prose editor roots.
- `normalizeShortcutEvent(event)` converts a `KeyboardEvent` to a stable descriptor: lower-case key, `shift`, `ctrlOrMeta`, `ctrl`, `meta`, `alt`, and a printable label.
- `useShortcutScope({ enabled, scope, bindings })` registers a single `window.keydown` listener for a component scope. It ignores editable targets, supports `preventDefault`, and cleans up on unmount.

No global singleton registry is required for this version. Scope precedence is achieved by mount order and enable flags: the board scope is disabled while `?card=` is present; the modal scope is mounted only while the modal is open.

## Board Integration

The board page owns board-level actions because it already has `board.get`, role, archived state, list data, and search scope.

Implementation shape:

- `BoardDetailPage` tracks `shortcutHelpOpen`.
- `BoardDetailPage` passes an imperative `openBoardSearch` callback to `BoardTopBar` or lifts `SearchDialog` open state so `/` can open the board-scoped search.
- `BoardColumns` exposes callbacks for:
  - opening the first active list's add-card form,
  - opening the trailing add-list form.
- `ListColumn` accepts an optional `forceAddingCardToken` or explicit controlled `addingCard` API for the first-list shortcut.
- `AddListColumn` accepts an optional `forceAddingListToken` or controlled open API for the add-list shortcut.

Prefer small prop APIs over a broad context until active selection exists. This keeps DEM-73 narrow and avoids building a board command system before there is a selection model.

## Search Shortcut Behavior

`SearchDialog` currently owns `Cmd/Ctrl+K` via `enableShortcut`. DEM-73 should extend that same path so `Ctrl+Space` opens the same global dialog.

Board-scoped `/` should not duplicate search internals. It should open the existing `SearchDialog` instance rendered by `BoardTopBar` with `variant="board"`, `workspaceId`, and `boardId`.

## Card Modal Integration

`CardDetailDialog` owns modal shortcuts because it already has card data, role gates, mutation objects, and picker components.

Implementation shape:

- Keep modal shortcut state close to the modal.
- Add controlled open APIs to `CardModalMetaChips` for the members, due-date, labels, and cover dropdowns only where needed by shortcuts.
- Add a controlled edit trigger to `CardDetailTitle` so `e` starts title edit.
- Reuse existing mutations for `c` and `a`; shortcuts call the same handlers as visible controls.

The modal should not add hidden alternative behaviors. Each shortcut maps to a visible control that already exists.

## Help Dialog

Add `ShortcutHelpDialog` under the board route component tree. It uses existing shadcn Dialog primitives from `@pusula/ui` and strings from `strings.shortcuts`.

Content groups:

- General: global search (`Cmd/Ctrl+K`, `Ctrl+Space`), help (`?`).
- Board: board search (`/`), new card (`n`), new list (`Shift+n` or `l`).
- Card modal: edit title (`e`), complete toggle (`c`), due date (`d`), members (`m`), labels (`t`), archive/restore (`a`), close (`Esc`).

Unavailable actions may remain visible in the help dialog, but the label should describe the capability rather than current availability. The visible UI controls still communicate disabled/readonly state.

## Accessibility and Input Gating

Shortcuts must not fire while users are typing or editing:

- Standard form controls: `input`, `textarea`, `select`.
- Elements with `contenteditable`.
- Rich text editor roots such as ProseMirror/Tiptap.
- Composition events should be respected by ignoring keydown when `event.isComposing` is true.

All shortcut-triggered dialogs and forms must move focus the same way their button-triggered paths already do. The implementation should not manually steal focus if the opened component already handles `autoFocus`.

## Strings

Add `strings.shortcuts`:

- `dialogTitle`
- `dialogDescription`
- `groups.general`
- `groups.board`
- `groups.cardModal`
- action labels for each shortcut listed above
- shortcut display labels such as `Cmd/Ctrl+K`, `Ctrl+Space`, `Shift+N`, `Esc`

No hardcoded user-facing text should be introduced in components.

## Tests

Unit tests:

- `isShortcutEditableTarget` returns true for form controls, contenteditable nodes, and ProseMirror/Tiptap roots.
- `normalizeShortcutEvent` normalizes letter keys, `/`, `?`, `Shift+n`, `Cmd/Ctrl+K`, and `Ctrl+Space`.

RTL tests:

- App shell global search opens with both `Cmd/Ctrl+K` and `Ctrl+Space`.
- Board search opens with `/`.
- `n` opens the first editable list's add-card form.
- `Shift+n` and `l` open the add-list form.
- `?` opens the shortcut help dialog.
- Shortcuts do not fire from an input/textarea/Tiptap editable area.
- Card modal shortcuts trigger title edit, complete toggle, due picker, members picker, labels picker, and archive/restore when allowed.
- Board shortcuts do not fire while card modal shortcuts are active.

## Follow-up

Create a separate follow-up issue for active card/list selection and arrow-key board navigation. That work should define:

- active card/list state ownership,
- visual active-ring treatment,
- screen-reader announcement behavior,
- interaction with drag-and-drop, filters, archived lists, and virtualized lists if added later.
