/** Fixed history for the All Insights archive/restore regression flow. */
export const allInsightsArchiveFixture = {
  activities: [
    {
      id: 'all-insights-archive-workout',
      name: 'Workout',
      levels: [
        { id: 'all-insights-archive-workout-easy', title: 'Easy', description: 'A lighter session.' },
        { id: 'all-insights-archive-workout-focused', title: 'Focused', description: 'A steady session.' },
        { id: 'all-insights-archive-workout-challenging', title: 'Challenging', description: 'A demanding session.' },
      ],
      recordings: [
        { daysAgo: 3, levelIndex: 0 },
        { daysAgo: 2, levelIndex: 1 },
        { daysAgo: 1, levelIndex: 2 },
        { daysAgo: 0, levelIndex: 1 },
      ],
    },
    {
      id: 'all-insights-archive-reading',
      name: 'Reading',
      levels: [
        { id: 'all-insights-archive-reading-pages', title: 'A few pages', description: 'A little reading.' },
        { id: 'all-insights-archive-reading-chapter', title: 'A chapter', description: 'A bit more reading.' },
        { id: 'all-insights-archive-reading-immersed', title: 'Immersed', description: 'Lost in a book.' },
      ],
      recordings: [
        { daysAgo: 3, levelIndex: 1 },
        { daysAgo: 2, levelIndex: 2 },
        { daysAgo: 1, levelIndex: 0 },
        { daysAgo: 0, levelIndex: 2 },
      ],
    },
    {
      id: 'all-insights-archive-guitar',
      name: 'Guitar',
      levels: [
        { id: 'all-insights-archive-guitar-warmup', title: 'Warm-up', description: 'A short practice.' },
        { id: 'all-insights-archive-guitar-practice', title: 'Practice', description: 'Time with the instrument.' },
        { id: 'all-insights-archive-guitar-flow', title: 'In the flow', description: 'A satisfying session.' },
      ],
      recordings: [
        { daysAgo: 3, levelIndex: 2 },
        { daysAgo: 2, levelIndex: 0 },
        { daysAgo: 1, levelIndex: 1 },
        { daysAgo: 0, levelIndex: 0 },
      ],
    },
  ],
} as const;
