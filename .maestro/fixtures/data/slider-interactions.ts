/** Fixed records for rapid slider-selection and same-day upsert coverage. */
export const sliderInteractionsFixture = {
  activities: [
    {
      id: 'slider-interactions-workout',
      name: 'Workout',
      levels: [
        { id: 'slider-interactions-workout-very-light', title: 'Very Light', description: 'A gentle day.' },
        { id: 'slider-interactions-workout-light', title: 'Light', description: 'A little movement.' },
        { id: 'slider-interactions-workout-moderate', title: 'Moderate', description: 'A steady session.' },
        { id: 'slider-interactions-workout-intense', title: 'Intense', description: 'A demanding session.' },
        { id: 'slider-interactions-workout-very-intense', title: 'Very Intense', description: 'A full-on session.' },
      ],
      recordings: [{ daysAgo: 1, levelIndex: 1 }],
    },
    {
      id: 'slider-interactions-reading',
      name: 'Reading',
      levels: [
        { id: 'slider-interactions-reading-few', title: 'Few pages', description: 'A little reading.' },
        { id: 'slider-interactions-reading-some', title: 'Some reading', description: 'Time with a book.' },
        { id: 'slider-interactions-reading-immersed', title: 'Immersed', description: 'Lost in a book.' },
      ],
      recordings: [{ daysAgo: 0, levelIndex: 1 }],
    },
  ],
  expectedInitial: { workoutYesterday: 'Light', workoutToday: 'Not recorded', readingToday: 'Some reading' },
  expectedFinal: { workoutYesterday: 'Light', workoutToday: 'Very Intense', readingToday: 'Some reading' },
} as const;
