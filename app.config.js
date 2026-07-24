require("./scripts/load-env.cjs");

const pkg = require("./package.json");

const bundleId = process.env.APP_BUNDLE_ID?.trim() || "com.shenghuobang.app";
const publicApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || "";
const defaultEasProjectId = "197aef13-6b84-45e3-9c9a-ad87c596971f";
const easProjectId =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || defaultEasProjectId;
const releaseChannel = process.env.EXPO_PUBLIC_RELEASE_CHANNEL?.trim() || "alpha";
const buildProfile = process.env.EXPO_PUBLIC_BUILD_PROFILE?.trim() || "lan-demo";
const gitCommit = process.env.EXPO_PUBLIC_GIT_COMMIT?.trim() || "dev";
const appVersion = "4.0.0";
const androidVersionCode = 400001;

/** @type {import("expo/config").ExpoConfig} */
const config = {
  name: "生活帮",
  slug: "shenghuobang",
  version: appVersion,
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "shenghuobang",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: bundleId,
    buildNumber: String(androidVersionCode),
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: "resize",
    // LAN demo builds intentionally use http:// on a trusted local network.
    // Production/staging builds should provide https:// and therefore keep
    // cleartext traffic disabled.
    usesCleartextTraffic: publicApiBaseUrl.startsWith("http://"),
    package: bundleId,
    versionCode: androidVersionCode,
    permissions: ["POST_NOTIFICATIONS"],
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-asset",
    "expo-font",
    "expo-web-browser",
    [
      "expo-camera",
      {
        cameraPermission: "允许生活帮使用相机扫描产品二维码和条码。",
        recordAudioAndroid: false,
      },
    ],
    ["expo-audio", { microphonePermission: false, recordAudioAndroid: false }],
    [
      "expo-image-picker",
      {
        photosPermission: "允许生活帮访问你选择的照片，用于发布和编辑物品图片。",
        cameraPermission: "允许生活帮使用相机扫描产品二维码和条码。",
        microphonePermission: false,
      },
    ],
    ["expo-notifications", { color: "#16A34A", defaultChannel: "default" }],
    [
      "expo-location",
      {
        locationWhenInUsePermission: "允许生活帮在你主动使用附近功能时获取位置，用于距离排序；不会后台持续定位。",
      },
    ],
    [
      "expo-video",
      { supportsBackgroundPlayback: true, supportsPictureInPicture: true },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: { backgroundColor: "#000000" },
      },
    ],
    [
      "expo-build-properties",
      { android: { buildArchs: ["armeabi-v7a", "arm64-v8a"], minSdkVersion: 24 } },
    ],
  ],
  extra: {
    eas: { projectId: easProjectId },
    build: {
      appVersion,
      packageVersion: pkg.version,
      versionCode: androidVersionCode,
      releaseChannel,
      buildProfile,
      gitCommit,
      apiBaseUrl: publicApiBaseUrl,
    },
  },
  experiments: { typedRoutes: true },
};

module.exports = config;
