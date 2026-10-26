/** Fixed histories for repeated archive and restore lifecycle coverage. */
export const repeatedArchiveRestoreFixture = {
  activities: [
    {
      id: 'repeat-archive-workout', name: 'Workout', createdDaysAgo: 3,
      levels: [
        { id: 'repeat-archive-workout-light', title: 'Light', description: 'A lighter session.' },
        { id: 'repeat-archive-workout-steady', title: 'Steady', description: 'A regular session.' },
        { id: 'repeat-archive-workout-intense', title: 'Intense', description: 'A demanding session.' },
      ],
      recordings: [
        { daysAgo: 3, levelIndex: 0 }, { daysAgo: 2, levelIndex: 1 },
        { daysAgo: 1, levelIndex: 2 }, { daysAgo: 0, levelIndex: 1 },
      ],
    },
    {
      id: 'repeat-archive-reading', name: 'Reading', createdDaysAgo: 3,
      levels: [
        { id: 'repeat-archive-reading-few', title: 'A few pages', description: 'A little reading.' },
        { id: 'repeat-archive-reading-some', title: 'A chapter', description: 'Some time with a book.' },
        { id: 'repeat-archive-reading-immersed', title: 'Immersed', description: 'Lost in a book.' },
      ],
      recordings: [
        { daysAgo: 2, levelIndex: 1 }, { daysAgo: 1, levelIndex: 0 }, { daysAgo: 0, levelIndex: 2 },
      ],
    },
    {
      id: 'repeat-archive-guitar', name: 'Guitar', createdDaysAgo: 3,
      levels: [
        { id: 'repeat-archive-guitar-warmup', title: 'Warm-up', description: 'A short practice.' },
        { id: 'repeat-archive-guitar-practice', title: 'Practice', description: 'Time with the instrument.' },
        { id: 'repeat-archive-guitar-flow', title: 'In the flow', description: 'A satisfying session.' },
      ],
      recordings: [{ daysAgo: 1, levelIndex: 0 }, { daysAgo: 0, levelIndex: 2 }],
    },
  ],
  expected: { activityCount: 3, recordingCount: 9, initialCombinedRecorded: 9,
    combinedEligible: 12, workoutArchivedRecorded: 5, workoutArchivedEligible: 8,
    readingArchivedRecorded: 6, readingArchivedEligible: 8,
    workoutArchives: 3, workoutRestores: 3, readingArchives: 1, readingRestores: 1 },
} as const;
