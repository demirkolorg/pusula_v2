import type { StatusBreakdownData } from '../micro/status-breakdown';

export const statusBreakdownFixture: StatusBreakdownData = {
  open: 42,
  completed: 78,
  archived: 11,
  total: 131,
};

export const statusBreakdownEmptyFixture: StatusBreakdownData = {
  open: 0,
  completed: 0,
  archived: 0,
  total: 0,
};
