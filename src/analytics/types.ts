import { Task, TaskOption, DailyEntry, RatingScaleVersion, TaskLifecycleTransition } from '../domain/task';
export type AnalyticsTask = Pick<Task, 'id'|'name'|'createdAt'|'updatedAt'|'active'|'createdLocalDate'|'archivedAt'|'chartColor'|'currentScaleVersionId'|'currentTrendEpochId'> & { options: Pick<TaskOption,'id'|'label'|'position'|'rank'|'normalizedWeight'>[]; color: string };
export type AnalyticsEntry = Pick<DailyEntry,'id'|'taskId'|'optionId'|'localDate'|'optionLabelAtEntry'|'positionAtEntry'|'normalizedWeightAtEntry'|'scaleVersionIdAtEntry'|'trendEpochIdAtEntry'> & { scaleVersionAtEntry?: string };
export type AnalyticsDataset = { tasks: AnalyticsTask[]; entries: AnalyticsEntry[]; scaleVersions: RatingScaleVersion[];
  lifecycle?: TaskLifecycleTransition[] };
export type RangeKey = '30D'|'3M'|'6M'|'1Y';
export type TimelinePoint = { date: string; weight: number|null; label?: string; position?: number };
