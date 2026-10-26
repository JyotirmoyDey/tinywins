const patterns = [
  [0, 1, 2, 1, 0, 2, 1],
  [0, 1, 2, 3, 4, 3, 2],
  [1, 1, 1, 1, 2, 1, 1],
  [0, 2, 0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2, 3, 1],
  [0, 1, 0, 1, 2, 1, 0],
  [3, 2, 1, 0, 1, 2, 3],
  [4, 0, 2, 1, 3, 2, 0],
] as const;
const levelCounts = [3, 5, 3, 3, 4, 3, 4, 5] as const;

export const chartManyRecordingsFixture = {
  dayCount: 365,
  activities: patterns.map((pattern, activityIndex) => ({
    id: `chart-many-activity-${activityIndex + 1}`,
    name: `Chart Sample ${activityIndex + 1}`,
    createdDaysAgo: 364,
    levels: Array.from({ length: levelCounts[activityIndex] }, (_, levelIndex) => ({
      id: `chart-many-activity-${activityIndex + 1}-level-${levelIndex + 1}`,
      title: `Level ${levelIndex + 1}`,
      description: `Fixed sample level ${levelIndex + 1}.`,
    })),
    recordings: Array.from({ length: 365 }, (_, dayIndex) => ({
      daysAgo: 364 - dayIndex,
      levelIndex: pattern[dayIndex % pattern.length],
    })),
  })),
  expected: { activityCount: 8, recordingsPerActivity: 365, totalRecordings: 2920,
    combinedSelectedCount: 5 },
} as const;
