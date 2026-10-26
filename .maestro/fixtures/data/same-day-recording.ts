/** Fixed two-activity history for testing same-day upserts. */
export const sameDayRecordingFixture = {
  activities: [
    {
      id: 'same-day-recording-workout',
      name: 'Workout',
      levels: [
        { id: 'same-day-recording-workout-low', title: 'Low', description: 'A little movement.' },
        { id: 'same-day-recording-workout-moderate', title: 'Moderate', description: 'A steady workout.' },
        { id: 'same-day-recording-workout-high', title: 'High', description: 'A strong workout.' },
      ],
      recordings: [
        { daysAgo: 1, levelIndex: 1 },
        { daysAgo: 0, levelIndex: 0 },
      ],
    },
    {
      id: 'same-day-recording-reading',
      name: 'Reading',
      levels: [
        { id: 'same-day-recording-reading-low', title: 'A few pages', description: 'A little reading.' },
        { id: 'same-day-recording-reading-moderate', title: 'A chapter', description: 'Some reading.' },
        { id: 'same-day-recording-reading-high', title: 'Immersed', description: 'Lost in a book.' },
      ],
      recordings: [{ daysAgo: 0, levelIndex: 2 }],
    },
  ],
  expectedInitial: { workoutToday: 'Low', workoutYesterday: 'Moderate', readingToday: 'Immersed' },
  expectedFinal: { workoutToday: 'Moderate', workoutYesterday: 'Moderate', readingToday: 'Immersed' },
  expectedFinalWorkoutDistribution: { Low: 0, Moderate: 2, High: 0 },
} as const;
