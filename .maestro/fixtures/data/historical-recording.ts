/** Fixed surrounding history for adding one previously unrecorded past day. */
export const historicalRecordingFixture = {
  activities: [
    {
      id: 'historical-recording-workout',
      name: 'Workout',
      levels: [
        { id: 'historical-recording-workout-low', title: 'Low', description: 'A little movement.' },
        { id: 'historical-recording-workout-moderate', title: 'Moderate', description: 'A steady workout.' },
        { id: 'historical-recording-workout-high', title: 'High', description: 'A strong workout.' },
      ],
      recordings: [
        { daysAgo: 3, levelIndex: 0 },
        { daysAgo: 1, levelIndex: 1 },
        { daysAgo: 0, levelIndex: 2 },
      ],
    },
    {
      id: 'historical-recording-reading',
      name: 'Reading',
      levels: [
        { id: 'historical-recording-reading-low', title: 'Low', description: 'A few pages.' },
        { id: 'historical-recording-reading-moderate', title: 'Moderate', description: 'A chapter.' },
        { id: 'historical-recording-reading-high', title: 'High', description: 'A longer session.' },
      ],
      recordings: [
        { daysAgo: 2, levelIndex: 1 },
        { daysAgo: 0, levelIndex: 0 },
      ],
    },
  ],
  targetDaysAgo: 2,
  targetLevelIndex: 1,
} as const;
