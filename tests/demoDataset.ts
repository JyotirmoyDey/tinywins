import { loadDemoDataset as loadAppDemoDataset } from '../src/analytics/demoData';
import { screenshotFixture } from './demoFixture';

/** Keep analytics tests deterministic and independent of Metro's runtime context. */
export function loadDemoDataset(today = '2026-10-20') {
  return loadAppDemoDataset(today, screenshotFixture);
}
