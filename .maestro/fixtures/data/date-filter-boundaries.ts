/** Boundary dates for inclusive local-calendar date-range filtering. */
export const dateFilterBoundariesFixture = {
  activity: {
    id: 'date-filter-boundaries-activity',
    name: 'Date Boundary Test',
    levels: [
      { id: 'date-filter-boundaries-low', title: 'Low', description: 'A little happened.' },
      { id: 'date-filter-boundaries-moderate', title: 'Moderate', description: 'A moderate day.' },
      { id: 'date-filter-boundaries-high', title: 'High', description: 'A lot happened.' },
    ],
    recordings: [
      { daysAgo: 0, levelIndex: 0 },
      { daysAgo: 6, levelIndex: 1 },
      { daysAgo: 7, levelIndex: 2 },
      { daysAgo: 29, levelIndex: 0 },
      { daysAgo: 30, levelIndex: 1 },
      { daysAgo: 89, levelIndex: 2 },
      { daysAgo: 90, levelIndex: 0 },
    ],
  },
  expectedCounts: { '7D': 2, '30D': 4, '90D': 6, custom: 3, empty: 0 },
  customDaysAgo: { inclusiveStart: 30, inclusiveEnd: 7, emptyStart: 59, emptyEnd: 50 },
} as const;
