const fs = require('node:fs/promises');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

const FULL_BACKUP_RULES = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="database" path="." />
  <exclude domain="file" path="SQLite/" />
</full-backup-content>
`;

const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="database" path="." />
    <exclude domain="file" path="SQLite/" />
  </cloud-backup>
  <device-transfer>
    <exclude domain="database" path="." />
    <exclude domain="file" path="SQLite/" />
  </device-transfer>
</data-extraction-rules>
`;

function withAndroidDatabaseBackupExclusion(config) {
  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('Unable to configure Android database backup rules: application tag is missing.');
    }

    application.$ = {
      ...application.$,
      'android:fullBackupContent': '@xml/tinywins_backup_rules',
      'android:dataExtractionRules': '@xml/tinywins_data_extraction_rules',
    };

    return modConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const xmlDirectory = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );

      await fs.mkdir(xmlDirectory, { recursive: true });
      await Promise.all([
        fs.writeFile(path.join(xmlDirectory, 'tinywins_backup_rules.xml'), FULL_BACKUP_RULES),
        fs.writeFile(
          path.join(xmlDirectory, 'tinywins_data_extraction_rules.xml'),
          DATA_EXTRACTION_RULES,
        ),
      ]);

      return modConfig;
    },
  ]);
}

module.exports = withAndroidDatabaseBackupExclusion;
