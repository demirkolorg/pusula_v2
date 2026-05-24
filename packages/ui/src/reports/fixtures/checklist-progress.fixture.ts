import type { ChecklistProgressData } from '../micro/checklist-progress';

export const checklistProgressFixture: ChecklistProgressData = {
  total: 28,
  completed: 18,
  percentage: 64,
};

export const checklistProgressFullFixture: ChecklistProgressData = {
  total: 12,
  completed: 12,
  percentage: 100,
};

export const checklistProgressEmptyFixture: ChecklistProgressData = {
  total: 0,
  completed: 0,
  percentage: null,
};
