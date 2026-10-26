export const levelReorderingAfterRecordingFixture = {
  activity: {
    id: 'level-reordering-after-recording-workout',
    name: 'Workout',
    levels: [
      { id: 'level-reordering-after-very-light', title: 'Very Light', description: 'Minimal effort' },
      { id: 'level-reordering-after-light', title: 'Light', description: 'Comfortable effort' },
      { id: 'level-reordering-after-moderate', title: 'Moderate', description: 'Noticeable effort' },
      { id: 'level-reordering-after-intense', title: 'Intense', description: 'Challenging effort' },
    ],
  },
  initialRecording: { daysAgo: 2, levelIndex: 2 },
  updatedLevelIndex: 3,
} as const;
