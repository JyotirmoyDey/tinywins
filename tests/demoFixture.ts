import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { selectOnlyJsonFixture } from '../src/analytics/screenshotDemoData';

const demoDirectory = resolve(process.cwd(), 'src/assets/demo');
const fixtureFiles = readdirSync(demoDirectory)
  .filter(file => file.toLowerCase().endsWith('.json'))
  .map(file => `./${file}`);

const fixtureContext = Object.assign(
  (key: string) => JSON.parse(readFileSync(resolve(demoDirectory, key.slice(2)), 'utf8')) as unknown,
  { keys: () => fixtureFiles },
);

export const screenshotFixture = selectOnlyJsonFixture(fixtureContext);
