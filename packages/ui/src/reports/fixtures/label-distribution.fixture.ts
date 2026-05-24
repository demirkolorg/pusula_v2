import type { LabelDistributionData } from '../micro/label-distribution';

export const labelDistributionFixture: LabelDistributionData = {
  total: 88,
  labels: [
    { labelId: 'l-1', name: 'Bug', color: 'red', count: 24 },
    { labelId: 'l-2', name: 'Feature', color: 'blue', count: 30 },
    { labelId: 'l-3', name: 'Improvement', color: 'green', count: 18 },
    { labelId: 'l-4', name: 'Tech Debt', color: 'orange', count: 12 },
    { labelId: 'l-5', name: 'Spike', color: 'purple', count: 4 },
  ],
};

export const labelDistributionEmptyFixture: LabelDistributionData = {
  total: 0,
  labels: [],
};
