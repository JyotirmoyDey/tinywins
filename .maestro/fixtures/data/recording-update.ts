/** Deterministic seed and expected values for the recording-update Maestro flow. */
export const recordingUpdateFixture = {
  id: 'recording-update-activity',
  name: 'Recording Update Test',
  levels: [
    { id: 'recording-update-level-low', title: 'Low', description: 'A little happened.' },
    { id: 'recording-update-level-moderate', title: 'Moderate', description: 'A moderate day.' },
    { id: 'recording-update-level-high', title: 'High', description: 'A lot happened.' },
  ],
  recordings: [
    { daysAgo: 2, levelIndex: 0 },
    { daysAgo: 1, levelIndex: 1 },
    { daysAgo: 0, levelIndex: 2 },
  ],
  editedRecording: { daysAgo: 2, levelIndex: 2 },
  expectedAfterEdit: { Low: 0, Moderate: 1, High: 2 },
} as const;
