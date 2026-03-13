import { TrendPoint } from '@/types';

export const trends: Record<string, TrendPoint[]> = {
  constructionSpending: [
    { period: 'Oct', value: 2.17 },
    { period: 'Nov', value: 2.18 },
    { period: 'Dec', value: 2.20 },
    { period: 'Jan', value: 2.21 },
    { period: 'Feb', value: 2.22 },
    { period: 'Mar', value: 2.23 }
  ],
  financingStress: [
    { period: 'Oct', value: 56 },
    { period: 'Nov', value: 57 },
    { period: 'Dec', value: 58 },
    { period: 'Jan', value: 60 },
    { period: 'Feb', value: 61 },
    { period: 'Mar', value: 63 }
  ],
  segmentMomentum: [
    { period: 'Oct', value: 51 },
    { period: 'Nov', value: 52 },
    { period: 'Dec', value: 53 },
    { period: 'Jan', value: 52 },
    { period: 'Feb', value: 51 },
    { period: 'Mar', value: 52 }
  ]
};
