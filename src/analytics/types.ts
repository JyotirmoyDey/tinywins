import { Task, TaskOption, DailyEntry, TaskLifecycleTransition } from '../domain/task';
export type AnalyticsTask = Pick<Task, 'id'|'name'|'createdAt'|'updatedAt'|'active'|'createdLocalDate'|'archivedAt'|'chartColor'|'sortPosition'> & { includeInCombinedInsights?: boolean;
  options: Pick<TaskOption,'id'|'label'|'description'|'position'|'rank'|'normalizedWeight'>[]; color: string };
export type AnalyticsEntry = Pick<DailyEntry,'id'|'taskId'|'optionId'|'localDate'|'optionLabelAtEntry'|'positionAtEntry'|'normalizedWeightAtEntry'>;
export type AnalyticsDataset = { tasks: AnalyticsTask[]; entries: AnalyticsEntry[];
  lifecycle?: TaskLifecycleTransition[] };
export type RangeKey = '30D'|'3M'|'6M'|'1Y';
export type TimelinePoint = { date: string; weight: number|null; label?: string; position?: number };
