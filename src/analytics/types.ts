import { Task, TaskOption, DailyEntry, RatingScaleVersion } from '../domain/task';
export type AnalyticsTask = Pick<Task, 'id'|'name'|'createdAt'|'updatedAt'|'active'|'currentScaleVersionId'|'currentTrendEpochId'> & { options: Pick<TaskOption,'id'|'label'|'position'|'rank'|'normalizedWeight'>[]; color: string };
export type AnalyticsEntry = Pick<DailyEntry,'id'|'taskId'|'optionId'|'localDate'|'optionLabelAtEntry'|'positionAtEntry'|'normalizedWeightAtEntry'|'scaleVersionIdAtEntry'|'trendEpochIdAtEntry'> & { scaleVersionAtEntry?: string };
export type AnalyticsDataset = { tasks: AnalyticsTask[]; entries: AnalyticsEntry[]; scaleVersions: RatingScaleVersion[] };
export type RangeKey = '30D'|'3M'|'6M'|'1Y';
export type TimelinePoint = { date: string; weight: number|null; label?: string; position?: number };
