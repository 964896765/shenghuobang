const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Metro uses jest-worker child processes whenever maxWorkers is greater than 1.
// On Windows, an orphaned Expo process can cause every child to receive its own
// conhost/Windows Terminal window. Keep transforms in the Expo process so every
// supported start command stays in the terminal that launched it.
config.maxWorkers = 1;

module.exports = withNativeWind(config, { input: "./global.css" });
