import { AnalyticsDataset } from './types';
import { localDate } from '../domain/task';
import { loadScreenshotDataset } from './screenshotDemoData';

/** The development Insights source and the screenshot-data importer share the
 * single portable JSON fixture in assets/demo. */
export function loadDemoDataset(today = localDate(), fixtureInput?: unknown): AnalyticsDataset {
  return loadScreenshotDataset(today, fixtureInput);
}
