/**
 * Pragmatic-DnD-compatible drag helper for Playwright (Faz 3D — DEM-45).
 *
 * Atlassian Pragmatic Drag and Drop is built on the browser's *native* HTML5
 * drag-and-drop, so `locator.dragTo()` (which dispatches synthetic events that
 * skip the native pipeline) is unreliable here. Instead we drive the real mouse:
 * press over the source, move in several small steps (so `dragstart` fires and
 * the monitor picks the drag up + the auto-scroller wakes), settle over the
 * target at the offset that yields the desired closest-edge, then release.
 *
 * Reference: Pragmatic DnD's own Playwright recipe — press → multiple `mouse.move`
 * → drop. See `docs/architecture/10-platform.md` §10.1.
 */
import { type Locator, type Page } from '@playwright/test';

type Edge = 'top' | 'bottom' | 'left' | 'right';

type Point = { x: number; y: number };

/** A point inside `box` biased toward the given edge (so closest-edge resolves to it). */
function pointAtEdge(
  box: { x: number; y: number; width: number; height: number },
  edge: Edge,
): Point {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // 18% in from the chosen edge — well inside the hitbox but unambiguously that side.
  const insetX = Math.max(4, box.width * 0.18);
  const insetY = Math.max(4, box.height * 0.18);
  switch (edge) {
    case 'top':
      return { x: cx, y: box.y + insetY };
    case 'bottom':
      return { x: cx, y: box.y + box.height - insetY };
    case 'left':
      return { x: box.x + insetX, y: cy };
    case 'right':
      return { x: box.x + box.width - insetX, y: cy };
  }
}

async function center(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('dragElement: source has no bounding box (not visible?)');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function moveInSteps(page: Page, from: Point, to: Point, steps: number): Promise<void> {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, {
      steps: 2,
    });
    // A micro-pause lets Pragmatic DnD's rAF-driven bookkeeping catch up.
    await page.waitForTimeout(20);
  }
}

/**
 * Drag `source` and drop it onto `target`, biased toward `target`'s `edge`
 * (which side of `target` it should land relative to). For dropping a card into
 * the *end* of an empty/another list, pass the list's cards-area or column
 * locator as `target` (no edge needed — it's a whole-area drop target).
 */
export async function dragElement(
  page: Page,
  source: Locator,
  target: Locator,
  opts: { edge?: Edge; sourceHandle?: Locator } = {},
): Promise<void> {
  const grab = opts.sourceHandle ?? source;
  const start = await center(grab);
  await page.mouse.move(start.x, start.y, { steps: 4 });
  await page.mouse.down();

  // A few small moves near the source first so `dragstart` definitely fires
  // before we head toward the target.
  await moveInSteps(page, start, { x: start.x + 6, y: start.y + 6 }, 3);

  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error('dragElement: target has no bounding box (not visible?)');
  const end = opts.edge
    ? pointAtEdge(targetBox, opts.edge)
    : { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };

  await moveInSteps(page, { x: start.x + 6, y: start.y + 6 }, end, 8);
  // Hover a touch longer at the destination so the drop target's `onDrag`
  // (closest-edge computation) settles.
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.waitForTimeout(80);
  await page.mouse.move(end.x, end.y, { steps: 2 });
  await page.mouse.up();
}
