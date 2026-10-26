const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Enable Metro's context modules so the screenshot-data loader can include the
// sole JSON fixture in src/assets/demo without hardcoding its filename.
config.transformer.unstable_allowRequireContext = true;

module.exports = config;
