import { colorsByTaskId, fallbackTaskColor } from './taskColors';
import { initialCombinedTaskIds } from '../config/combinedInsights';
import { AnalyticsDataset } from './types';
import { localDate, parseLocalDate } from '../domain/task';

const raw = require('../assets/demo/tinywins-demo-180d.json');

type ScreenshotLevel = { value: number; title: string; description?: string };
type ScreenshotActivity = { key: string; name: string; levels: ScreenshotLevel[] };
type ScreenshotRecording = { date: string; activity_key: string; level_value: number; days_before_anchor: number };
type ScreenshotFixture = {
  fixture_format: string;
  fixture_only: boolean;
  not_an_application_backup: boolean;
  anchor_date: string;
  date_range: { start: string; end: string; days_inclusive: number };
  activities: ScreenshotActivity[];
  recordings: ScreenshotRecording[];
};

/** Maps the screenshot fixture into ordinary local records. Relative day offsets
 * keep the latest sample on the device's current local day. */
export function loadScreenshotDataset(today = localDate()): AnalyticsDataset {
  const fixture = raw as ScreenshotFixture;
  validateScreenshotFixture(fixture);
  const endDate = parseLocalDate(today);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (fixture.date_range.days_inclusive - 1));
  const start = localDate(startDate);
  const updatedAt = `${today}T12:00:00.000Z`;
  const taskIds = fixture.activities.map(activity => `screenshot-${activity.key}`);
  const colors = colorsByTaskId(taskIds);
  const initialGraphIds = initialCombinedTaskIds(fixture.activities.map((activity, index) => ({
    id: taskIds[index], name: activity.name, active: true, createdAt: `${start}T12:00:00.000Z`,
  })));
  const tasks = fixture.activities.map((activity, index) => {
    const id = taskIds[index];
    const createdAt = `${start}T12:00:00.000Z`;
    const color = colors.get(id) ?? fallbackTaskColor(id);
    return {
      id,
      name: activity.name,
      active: true,
      includeInCombinedInsights: initialGraphIds.has(id),
      createdAt,
      createdLocalDate: start,
      updatedAt,
      color,
      chartColor: color,
      options: activity.levels.map((level, levelIndex) => ({
        id: `${id}-level-${level.value}`,
        label: level.title,
        description: level.description,
        position: levelIndex + 1,
        rank: levelIndex + 1,
        normalizedWeight: Math.round((levelIndex / (activity.levels.length - 1)) * 100),
      })),
    };
  });
  const taskByKey = new Map(fixture.activities.map((activity, index) => [activity.key, { activity, task: tasks[index] }]));
  const entries = fixture.recordings.map((recording, index) => {
    const match = taskByKey.get(recording.activity_key);
    // The fixture validator guarantees both references exist.
    if (!match) throw new Error('The screenshot dataset contains an invalid recording.');
    const date = dateBefore(today, recording.days_before_anchor);
    const option = match.task.options.find(item => item.position === match.activity.levels.findIndex(level => level.value === recording.level_value) + 1);
    const sourceLevel = match.activity.levels.find(level => level.value === recording.level_value);
    if (!option || !sourceLevel) throw new Error('The screenshot dataset contains an invalid level reference.');
    return {
      id: `screenshot-entry-${index + 1}`,
      taskId: match.task.id,
      optionId: option.id,
      localDate: date,
      optionLabelAtEntry: sourceLevel.title,
      positionAtEntry: option.position,
      normalizedWeightAtEntry: option.normalizedWeight,
    };
  });
  return { tasks, entries, lifecycle: [] };
}

function dateBefore(date: string, days: number) {
  const value = parseLocalDate(date);
  value.setDate(value.getDate() - days);
  return localDate(value);
}

function validateScreenshotFixture(fixture: ScreenshotFixture) {
  if (fixture.fixture_format !== 'tinywins-portable-demo-v1' || fixture.fixture_only !== true ||
    fixture.not_an_application_backup !== true || !fixture.activities.length ||
    !Number.isInteger(fixture.date_range.days_inclusive) || fixture.date_range.days_inclusive < 1 ||
    !fixture.date_range.start || !fixture.date_range.end)
    throw new Error('The screenshot dataset file is not valid.');
  parseLocalDate(fixture.anchor_date);
  parseLocalDate(fixture.date_range.start);
  parseLocalDate(fixture.date_range.end);
  const activities = new Map<string, ScreenshotActivity>();
  const taskIds = new Set<string>();
  for (const activity of fixture.activities) {
    if (!activity.key || !activity.name?.trim() || activities.has(activity.key) ||
      activity.levels.length < 2 || activity.levels.length > 7)
      throw new Error('The screenshot dataset contains an invalid activity.');
    const levels = new Set<number>();
    for (const level of activity.levels) {
      if (!Number.isInteger(level.value) || levels.has(level.value) || !level.title?.trim())
        throw new Error('The screenshot dataset contains an invalid level.');
      levels.add(level.value);
    }
    activities.set(activity.key, activity);
    taskIds.add(`screenshot-${activity.key}`);
  }
  const uniqueDays = new Set<string>();
  for (const recording of fixture.recordings) {
    const activity = activities.get(recording.activity_key);
    const key = `${recording.activity_key}:${recording.days_before_anchor}`;
    if (!activity || uniqueDays.has(key) || !activity.levels.some(level => level.value === recording.level_value) ||
      !Number.isInteger(recording.days_before_anchor) || recording.days_before_anchor < 0 ||
      recording.days_before_anchor >= fixture.date_range.days_inclusive ||
      dateBefore(fixture.anchor_date, recording.days_before_anchor) !== recording.date)
      throw new Error('The screenshot dataset contains an invalid recording.');
    uniqueDays.add(key);
  }
  if (!taskIds.size) throw new Error('The screenshot dataset contains no activities.');
}
