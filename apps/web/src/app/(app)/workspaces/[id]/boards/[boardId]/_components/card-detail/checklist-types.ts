/**
 * Shared view-model + handler types for the card-detail checklist section
 * (split across `card-detail-checklists.tsx`, `checklist-block.tsx`,
 * `checklist-item-row.tsx`, `checklist-add-forms.tsx`). Presentational only —
 * the dialog wires these handlers to tRPC mutations.
 */

export type ChecklistItemView = {
  id: string;
  checklistId: string;
  content: string;
  position: string;
  completed: boolean;
};

export type ChecklistView = {
  id: string;
  cardId: string;
  title: string;
  position: string;
  items: ChecklistItemView[];
};

export type ChecklistHandlers = {
  onCreateChecklist: (title: string) => void;
  onRenameChecklist: (input: { checklistId: string; title: string }) => void;
  onDeleteChecklist: (checklistId: string) => void;
  onAddItem: (input: { checklistId: string; content: string }) => void;
  onToggleItem: (input: { checklistId: string; itemId: string; completed: boolean }) => void;
  onEditItem: (input: { checklistId: string; itemId: string; content: string }) => void;
  onDeleteItem: (input: { checklistId: string; itemId: string }) => void;
};
