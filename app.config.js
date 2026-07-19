require("./scripts/load-env.cjs");

const bundleId = process.env.APP_BUNDLE_ID?.trim() || "com.shenghuobang.app";
const defaultEasProjectId = "197aef13-6b84-45e3-9c9a-ad87c596971f";
const easProjectId =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || defaultEasProjectId;

/** @type {import("expo/config").ExpoConfig} */
const config = {
  name: "生活帮",
  slug: "shenghuobang",
  version: "3.2.4",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "shenghuobang",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: bundleId,
    buildNumber: "324",
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
    package: bundleId,
    versionCode: 324,
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
    ["expo-audio", { microphonePermission: false, recordAudioAndroid: false }],
    [
      "expo-image-picker",
      {
        photosPermission: "允许生活帮访问你选择的照片，用于发布和编辑物品图片。",
        cameraPermission: false,
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
  extra: { eas: { projectId: easProjectId } },
  experiments: { typedRoutes: true },
};

module.exports = config;
