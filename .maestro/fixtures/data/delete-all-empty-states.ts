/** Deterministic data for deleting the final active activity and checking empty states. */
export const deleteAllEmptyStatesFixture = {
  activities: [
    {
      id: 'delete-all-empty-workout', name: 'Workout', createdDaysAgo: 3,
      levels: [
        { id: 'delete-all-empty-workout-low', title: 'Low', description: 'A lighter day.' },
        { id: 'delete-all-empty-workout-moderate', title: 'Moderate', description: 'A steady day.' },
        { id: 'delete-all-empty-workout-high', title: 'High', description: 'A more intense day.' },
      ],
      recordings: [
        { daysAgo: 3, levelIndex: 0 }, { daysAgo: 1, levelIndex: 1 }, { daysAgo: 0, levelIndex: 2 },
      ],
    },
    {
      id: 'delete-all-empty-reading', name: 'Reading', createdDaysAgo: 3,
      levels: [
        { id: 'delete-all-empty-reading-short', title: 'Short', description: 'A brief read.' },
        { id: 'delete-all-empty-reading-regular', title: 'Regular', description: 'Some reading time.' },
        { id: 'delete-all-empty-reading-extended', title: 'Extended', description: 'A longer reading session.' },
      ],
      recordings: [{ daysAgo: 1, levelIndex: 0 }, { daysAgo: 0, levelIndex: 1 }],
    },
    {
      id: 'delete-all-empty-guitar', name: 'Guitar', createdDaysAgo: 3,
      levels: [
        { id: 'delete-all-empty-guitar-basic', title: 'Basic', description: 'A little practice.' },
        { id: 'delete-all-empty-guitar-intermediate', title: 'Intermediate', description: 'Some focused practice.' },
        { id: 'delete-all-empty-guitar-advanced', title: 'Advanced', description: 'An extended session.' },
      ],
      recordings: [{ daysAgo: 0, levelIndex: 1 }],
    },
  ],
  expected: { activityCount: 3, levelCount: 9, recordingCount: 6 },
} as const;
