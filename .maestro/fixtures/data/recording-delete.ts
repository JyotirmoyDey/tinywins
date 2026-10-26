/** Fixed two-activity history used by the recording-delete Maestro flow. */
export const recordingDeleteFixture = {
  activities: [
    {
      id: 'recording-delete-workout',
      name: 'Workout',
      levels: [
        { id: 'recording-delete-workout-low', title: 'Low', description: 'A little happened.' },
        { id: 'recording-delete-workout-moderate', title: 'Moderate', description: 'A moderate day.' },
        { id: 'recording-delete-workout-high', title: 'High', description: 'A lot happened.' },
      ],
      recordings: [
        { daysAgo: 3, levelIndex: 0 },
        { daysAgo: 2, levelIndex: 1 },
        { daysAgo: 1, levelIndex: 2 },
        { daysAgo: 0, levelIndex: 1 },
      ],
    },
    {
      id: 'recording-delete-reading',
      name: 'Reading',
      levels: [
        { id: 'recording-delete-reading-low', title: 'Low', description: 'A little reading.' },
        { id: 'recording-delete-reading-moderate', title: 'Moderate', description: 'Some reading.' },
        { id: 'recording-delete-reading-high', title: 'High', description: 'Lots of reading.' },
      ],
      recordings: [
        { daysAgo: 1, levelIndex: 0 },
        { daysAgo: 0, levelIndex: 2 },
      ],
    },
  ],
  deletedRecording: { activityId: 'recording-delete-workout', daysAgo: 2 },
} as const;
