import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import appJson from '../app.json';

type ExpoConfig = Record<string, any>;
const { parseStringPromise } = require('xml2js') as {
  parseStringPromise: (xml: string) => Promise<Record<string, any>>;
};
const withAndroidDatabaseBackupExclusion = require('../plugins/withAndroidDatabaseBackupExclusion') as
  (config: ExpoConfig) => ExpoConfig;

function pluginConfig(): ExpoConfig {
  return withAndroidDatabaseBackupExclusion({ name: 'TinyWins', slug: 'tinywins' });
}

const exclusions = [
  { $: { domain: 'database', path: '.' } },
  { $: { domain: 'file', path: 'SQLite/' } },
];

test('app config registers the Android SQLite backup exclusion plugin', () => {
  assert.ok(appJson.expo.plugins.includes('./plugins/withAndroidDatabaseBackupExclusion'));
});

test('backup plugin sets both manifest references and remains idempotent', async () => {
  const config = pluginConfig();
  const applyManifest = config.mods.android.manifest as (value: ExpoConfig) => Promise<ExpoConfig>;
  const modConfig = {
    modResults: { manifest: { application: [{ $: { 'android:allowBackup': 'true' } }] } },
    modRequest: {},
  };

  await applyManifest(modConfig);
  await applyManifest(modConfig);

  assert.deepEqual(modConfig.modResults.manifest.application[0].$, {
    'android:allowBackup': 'true',
    'android:fullBackupContent': '@xml/tinywins_backup_rules',
    'android:dataExtractionRules': '@xml/tinywins_data_extraction_rules',
  });
});

test('backup plugin generates valid legacy and modern rules for cloud and device transfer', async () => {
  const androidRoot = await mkdtemp(path.join(os.tmpdir(), 'tinywins-backup-rules-'));
  try {
    const config = pluginConfig();
    const applyDangerousMod = config.mods.android.dangerous as (value: ExpoConfig) => Promise<ExpoConfig>;
    const modConfig = { modRequest: { platformProjectRoot: androidRoot } };

    await applyDangerousMod(modConfig);

    const xmlDirectory = path.join(androidRoot, 'app', 'src', 'main', 'res', 'xml');
    const legacyPath = path.join(xmlDirectory, 'tinywins_backup_rules.xml');
    const extractionPath = path.join(xmlDirectory, 'tinywins_data_extraction_rules.xml');
    const legacyXml = await readFile(legacyPath, 'utf8');
    const extractionXml = await readFile(extractionPath, 'utf8');
    const legacy = await parseStringPromise(legacyXml);
    const extraction = await parseStringPromise(extractionXml);

    assert.deepEqual(legacy['full-backup-content'].exclude, exclusions);
    assert.deepEqual(extraction['data-extraction-rules']['cloud-backup'][0].exclude, exclusions);
    assert.deepEqual(extraction['data-extraction-rules']['device-transfer'][0].exclude, exclusions);

    await applyDangerousMod(modConfig);
    assert.equal(await readFile(legacyPath, 'utf8'), legacyXml);
    assert.equal(await readFile(extractionPath, 'utf8'), extractionXml);
    assert.deepEqual((await parseStringPromise(await readFile(extractionPath, 'utf8')))
      ['data-extraction-rules']['cloud-backup'][0].exclude, exclusions);
  } finally {
    await rm(androidRoot, { recursive: true, force: true });
  }
});
