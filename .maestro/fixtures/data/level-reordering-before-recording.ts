export const levelReorderingBeforeRecordingFixture = {
  activity: {
    id: 'level-reordering-before-recording-workout',
    name: 'Workout',
    levels: [
      { id: 'level-reordering-before-very-light', title: 'Very Light', description: 'Minimal effort' },
      { id: 'level-reordering-before-light', title: 'Light', description: 'Comfortable effort' },
      { id: 'level-reordering-before-moderate', title: 'Moderate', description: 'Noticeable effort' },
      { id: 'level-reordering-before-intense', title: 'Intense', description: 'Challenging effort' },
    ],
  },
  expectedInitialIds: [
    'level-reordering-before-very-light',
    'level-reordering-before-light',
    'level-reordering-before-moderate',
    'level-reordering-before-intense',
  ],
  expectedFinalIds: [
    'level-reordering-before-intense',
    'level-reordering-before-light',
    'level-reordering-before-moderate',
    'level-reordering-before-very-light',
  ],
} as const;
