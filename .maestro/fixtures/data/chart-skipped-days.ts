const mixedDays = Array.from({ length: 30 }, (_, index) => {
  const daysAgo = 29 - index;
  if (daysAgo % 4 === 0 && daysAgo <= 24) return { daysAgo, state: 'skipped' as const, levelIndex: 0 };
  if (daysAgo % 4 === 1) return { daysAgo, state: 'recorded' as const, levelIndex: 1 + (Math.floor(daysAgo / 4) % 2) };
  return { daysAgo, state: 'missing' as const, levelIndex: null };
});

export const chartSkippedDaysFixture = {
  dayCount: 30,
  activities: [
    {
      id: 'chart-skipped-mixed',
      name: 'Skipped Days Test',
      createdDaysAgo: 29,
      levels: [
        { id: 'chart-skipped-level-skipped', title: 'Skipped', description: 'I chose to skip today.' },
        { id: 'chart-skipped-level-low', title: 'Low', description: 'A little happened.' },
        { id: 'chart-skipped-level-good', title: 'Good', description: 'A good day for this.' },
      ],
      days: mixedDays,
    },
    {
      id: 'chart-skipped-reading',
      name: 'Regular Reading',
      createdDaysAgo: 29,
      levels: [
        { id: 'chart-skipped-reading-low', title: 'A few pages', description: 'A little reading.' },
        { id: 'chart-skipped-reading-mid', title: 'Some reading', description: 'Time with a book.' },
        { id: 'chart-skipped-reading-high', title: 'Immersed', description: 'Lost in a book.' },
      ],
      recordings: Array.from({ length: 30 }, (_, index) => ({ daysAgo: 29 - index, levelIndex: index % 3 })),
    },
  ],
  expected: { mixedRecorded: 15, skipped: 7, regularRatings: 8, missing: 15,
    supportRecorded: 30, totalRecorded: 45, totalEligibleTaskDays: 60 },
} as const;
