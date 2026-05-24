import type { MemberContributionData } from '../micro/member-contribution';

export const memberContributionFixture: MemberContributionData = {
  total: 152,
  contributors: [
    { userId: 'u-1', count: 64 },
    { userId: 'u-2', count: 48 },
    { userId: 'u-3', count: 30 },
    { userId: 'u-4', count: 10 },
  ],
};

export const memberContributionEmptyFixture: MemberContributionData = {
  total: 0,
  contributors: [],
};
