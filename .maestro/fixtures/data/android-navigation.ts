/** Shared local-date fixture for Android back and interruption scenarios. */
export const androidNavigationFixture = {
  activities: [
    {
      id: 'android-nav-workout', name: 'Workout', createdDaysAgo: 3,
      levels: [
        { id: 'android-nav-workout-low', title: 'Low', description: 'A lighter day.' },
        { id: 'android-nav-workout-moderate', title: 'Moderate', description: 'A steady day.' },
        { id: 'android-nav-workout-high', title: 'High', description: 'A more intense day.' },
      ],
      recordings: [
        { daysAgo: 3, levelIndex: 0 }, { daysAgo: 1, levelIndex: 1 }, { daysAgo: 0, levelIndex: 2 },
      ],
    },
    {
      id: 'android-nav-reading', name: 'Reading', createdDaysAgo: 3,
      levels: [
        { id: 'android-nav-reading-short', title: 'Short', description: 'A brief read.' },
        { id: 'android-nav-reading-regular', title: 'Regular', description: 'Some reading time.' },
        { id: 'android-nav-reading-extended', title: 'Extended', description: 'A longer reading session.' },
      ],
      recordings: [{ daysAgo: 1, levelIndex: 0 }, { daysAgo: 0, levelIndex: 1 }],
    },
  ],
  expected: { activityCount: 2, recordingCount: 5 },
} as const;
