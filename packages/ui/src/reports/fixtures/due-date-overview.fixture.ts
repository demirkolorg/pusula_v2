import type { DueDateOverviewData } from '../micro/due-date-overview';

export const dueDateOverviewFixture: DueDateOverviewData = {
  overdue: 4,
  dueSoon: 8,
  upcoming: 15,
  noDueDate: 22,
  completed: 31,
  total: 80,
};

export const dueDateOverviewEmptyFixture: DueDateOverviewData = {
  overdue: 0,
  dueSoon: 0,
  upcoming: 0,
  noDueDate: 0,
  completed: 0,
  total: 0,
};
