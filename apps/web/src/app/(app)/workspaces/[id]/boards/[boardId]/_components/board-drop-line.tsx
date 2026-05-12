'use client';

import { DropIndicator } from '@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box';
import type { Edge } from './board-dnd-types';

/**
 * Thin wrapper over Atlassian's `DropIndicator` so call sites just render
 * `<BoardDropLine edge={edge} />` (and nothing when `edge` is `null`). The
 * indicator is absolutely positioned by the library against the nearest
 * `position: relative` ancestor — so the wrapping card/column element must be
 * `relative`. Phase 3B — DEM-43.
 */
export function BoardDropLine({ edge, gap }: { edge: Edge | null; gap?: string }) {
  if (!edge) return null;
  return <DropIndicator edge={edge} gap={gap} />;
}
