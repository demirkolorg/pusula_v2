/**
 * Board navigation helpers (Faz 3D — DEM-45). Thin locator helpers over the
 * seeded board screen — accessible selectors only (`getByRole` / `getByLabel`),
 * targeting the committed board UI (`board-columns.tsx` / `list-column.tsx` /
 * `card-item.tsx`):
 *  - a list column is a `<section aria-label="<list title>">`;
 *  - a card chip is an `<article role="button" aria-label="<card title>">`;
 *  - the list drag handle is a `<button aria-label="Listeyi sürükleyerek taşı">`
 *    inside the column header.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { strings } from '../../apps/web/src/lib/strings';
import { boardPath } from './e2e-data';

const LIST_DRAG_HANDLE_LABEL = strings.board.dnd.listDragHandleLabel;
// The older `dnd.error` / `dnd.conflict` copy was consolidated into
// `optimistic.error` / `conflict.refreshed` for the broader Faz 4 optimistic
// UI rollout — drag-drop reuses them now (`apps/web/src/lib/strings.ts`).
const DND_ERROR_TEXT = strings.board.optimistic.error;
const DND_CONFLICT_TEXT = strings.board.conflict.refreshed;

export class BoardPage {
  constructor(readonly page: Page) {}

  /** Navigate to the seeded board and wait for at least the first list to render. */
  async goto(): Promise<void> {
    await this.page.goto(boardPath);
    await expect(this.column('Liste 1')).toBeVisible();
  }

  /** The list column `<section>` by its (unique) list title. */
  column(title: string): Locator {
    return this.page.getByRole('region', { name: title, exact: true });
  }

  /** The drag handle button inside a column header. */
  columnDragHandle(title: string): Locator {
    return this.column(title).getByRole('button', { name: LIST_DRAG_HANDLE_LABEL });
  }

  /** A card chip `<article>` by its title. Scoped to a column when given. */
  card(title: string, withinColumn?: string): Locator {
    const root = withinColumn ? this.column(withinColumn) : this.page;
    return root.getByRole('button', { name: title, exact: true });
  }

  /** Card titles in DOM order within a list column. */
  async cardTitlesIn(columnTitle: string): Promise<string[]> {
    const articles = this.column(columnTitle).locator('article[aria-label]');
    return articles.evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-label') ?? '').filter(Boolean),
    );
  }

  /**
   * List (column) titles in DOM order across the board strip — restricted to the
   * three known seeded titles so unrelated `<section>`s elsewhere don't leak in.
   */
  async columnTitles(): Promise<string[]> {
    const known = new Set(['Liste 1', 'Liste 2', 'Liste 3']);
    const labels = await this.page
      .locator('section[aria-label]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
    return labels.filter((l) => known.has(l));
  }

  /** The low-noise drag-error alert text locator. */
  get dndError(): Locator {
    return this.page.getByText(DND_ERROR_TEXT, { exact: true });
  }

  /** The "moved by someone else" conflict notice locator. */
  get dndConflict(): Locator {
    return this.page.getByText(DND_CONFLICT_TEXT, { exact: true });
  }
}
