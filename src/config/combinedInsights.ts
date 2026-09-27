export const MAX_COMBINED_INSIGHTS_ITEMS = 5;
export const COMBINED_INSIGHTS_LIMIT_MESSAGE =
  `You can include up to ${MAX_COMBINED_INSIGHTS_ITEMS} things in combined Insights. Remove one to make room.`;

/** Mirrors the repository's initial Home order (creation time, then stable ID). */
export function initialCombinedTaskIds<T extends { id: string; active: boolean; createdAt: string }>(tasks: T[]): Set<string> {
  return new Set(tasks.filter(task => task.active)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .slice(0, MAX_COMBINED_INSIGHTS_ITEMS).map(task => task.id));
}
