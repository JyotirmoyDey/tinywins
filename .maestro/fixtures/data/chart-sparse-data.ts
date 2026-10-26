export const chartSparseFixture = {
  activities: [
    {
      id: 'chart-sparse-workout',
      name: 'Workout',
      createdDaysAgo: 364,
      levels: [
        { id: 'chart-sparse-workout-low', title: 'Low', description: 'A lighter day.' },
        { id: 'chart-sparse-workout-medium', title: 'Medium', description: 'A steady day.' },
        { id: 'chart-sparse-workout-high', title: 'High', description: 'A full day.' },
      ],
      recordings: [
        { daysAgo: 0, levelIndex: 1 },
        { daysAgo: 29, levelIndex: 0 },
        { daysAgo: 180, levelIndex: 2 },
        { daysAgo: 364, levelIndex: 1 },
      ],
    },
    {
      id: 'chart-sparse-reading',
      name: 'Reading',
      createdDaysAgo: 60,
      levels: [
        { id: 'chart-sparse-reading-low', title: 'A few pages', description: 'A little reading.' },
        { id: 'chart-sparse-reading-medium', title: 'Some reading', description: 'Time with a book.' },
        { id: 'chart-sparse-reading-high', title: 'Immersed', description: 'Lost in a book.' },
      ],
      recordings: [{ daysAgo: 60, levelIndex: 0 }],
    },
  ],
  customRange: { startDaysAgo: 364, endDaysAgo: 0, emptyStartDaysAgo: 120, emptyEndDaysAgo: 100 },
  expected: { workoutTotal: 4, readingTotal: 1, combinedTotal: 5,
    workoutCounts: { Low: 1, Medium: 2, High: 1 }, readingCounts: { 'A few pages': 1 } },
} as const;
