import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "shenghuobang_push_device_id";
const PUSH_REGISTRATION_KEY = "shenghuobang_push_registration";

export type PushRegistrationInput = {
  platform: "ios" | "android";
  token: string;
  deviceId: string;
};

export type NotificationPermissionState = {
  status: "granted" | "denied" | "undetermined" | "unsupported";
  canAskAgain: boolean;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "生活帮通知",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: "#16A34A",
  });
}

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  if (Platform.OS === "web") return { status: "unsupported", canAskAgain: false };
  try {
    const permission = await Notifications.getPermissionsAsync();
    return { status: permission.status, canAskAgain: permission.canAskAgain };
  } catch {
    return { status: "unsupported", canAskAgain: false };
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (Platform.OS === "web") return { status: "unsupported", canAskAgain: false };
  try {
    await ensureAndroidNotificationChannel();
    const current = await Notifications.getPermissionsAsync();
    const permission = current.granted || !current.canAskAgain
      ? current
      : await Notifications.requestPermissionsAsync();
    return { status: permission.status, canAskAgain: permission.canAskAgain };
  } catch {
    return { status: "unsupported", canAskAgain: false };
  }
}

async function getDeviceId() {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

function getEasProjectId() {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return Constants.easConfig?.projectId ?? extra?.eas?.projectId;
}

export async function getStoredPushRegistration(): Promise<PushRegistrationInput | null> {
  const stored = await AsyncStorage.getItem(PUSH_REGISTRATION_KEY);
  if (!stored) return null;
  try { return JSON.parse(stored) as PushRegistrationInput; }
  catch { return null; }
}

export async function clearStoredPushRegistration() {
  await AsyncStorage.removeItem(PUSH_REGISTRATION_KEY);
}

export async function registerExpoPushToken(
  register: (input: PushRegistrationInput) => Promise<unknown>,
  options: { requestPermission?: boolean } = {},
) {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    return { registered: false as const, reason: "当前平台不支持移动 Push" };
  }
  if (!Device.isDevice) return { registered: false as const, reason: "Expo Push Token 需要在 Android 或 iOS 真机上获取" };

  const permission = options.requestPermission
    ? await requestNotificationPermission()
    : await getNotificationPermissionState();
  if (permission.status !== "granted") {
    return { registered: false as const, reason: "通知权限未开启", permission };
  }
  await ensureAndroidNotificationChannel();
  const projectId = getEasProjectId();
  if (!projectId) return { registered: false as const, reason: "缺少 EXPO_PUBLIC_EAS_PROJECT_ID，暂时无法获取 Expo Push Token" };

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const registration: PushRegistrationInput = {
      platform: Platform.OS,
      token,
      deviceId: await getDeviceId(),
    };
    await register(registration);
    await AsyncStorage.setItem(PUSH_REGISTRATION_KEY, JSON.stringify(registration));
    return { registered: true as const, registration };
  } catch (error) {
    return { registered: false as const, reason: error instanceof Error ? error.message : "Expo Push Token 获取失败" };
  }
}
