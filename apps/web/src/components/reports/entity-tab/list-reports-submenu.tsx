/**
 * Faz 13G (DEM-263) — liste ⋮ menüsünde "Bu liste için rapor" item'ı.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.4.
 * `list-column.tsx` `DROPDOWN_MENU_KIT` ile entegre — generic `Item`
 * component'i (DropdownMenuItem veya ContextMenuItem) caller'dan gelir.
 *
 * `useParams<{id}>()` workspaceId'i route'tan çeker — `ListColumn`'a
 * yeni prop drilling yok (Pusula `(app)/workspaces/[id]/...` rotası).
 */
'use client';

import { type ElementType, useState } from 'react';
import { BarChart3Icon } from 'lucide-react';
import { useReportI18n } from '../hooks/use-report-i18n';
import { ReportComposerDialog } from '../composer/report-composer-dialog';

export interface ListReportsSubmenuProps {
  listId: string;
  boardId: string;
  /** Menu kit'inin Item component'i (DropdownMenuItem | ContextMenuItem). */
  Item: ElementType;
  /**
   * Caller'dan zorunlu — `useParams` import'u test environment'larında
   * mock'lanmadığında patlıyordu. ListColumn parent'ı route'taki
   * `[id]`'i prop olarak verir; verilmemişse item gizlenir (test
   * setup'ı için backwards-compat).
   */
  workspaceId?: string;
}

export function ListReportsSubmenu({
  listId,
  boardId,
  workspaceId,
  Item,
}: ListReportsSubmenuProps) {
  const { t } = useReportI18n();
  const [open, setOpen] = useState(false);

  // workspaceId gelmemişse (test setup'ı veya parent prop drilling eksiği)
  // sessizce gizle — menu üstü Separator için parent guard sorumlu.
  if (!workspaceId) return null;

  return (
    <>
      <Item
        onSelect={(e: Event) => {
          e.preventDefault();
          setTimeout(() => setOpen(true), 0);
        }}
        data-testid="list-reports-menu-item"
      >
        <BarChart3Icon />
        {t('reports.entity.list.menuItem')}
      </Item>
      {open && (
        <ReportComposerDialog
          open={open}
          onOpenChange={setOpen}
          scope={{ kind: 'list', listId, boardId, workspaceId }}
        />
      )}
    </>
  );
}
