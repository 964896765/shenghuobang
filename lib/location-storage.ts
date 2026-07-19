import AsyncStorage from "@react-native-async-storage/async-storage";

const LOCATION_CACHE_PREFIX = "shenghuobang:location-region:";

export function locationCacheKey(userId?: number) {
  return `${LOCATION_CACHE_PREFIX}${userId ?? "guest"}`;
}

export async function readCachedRegion(userId?: number) {
  return AsyncStorage.getItem(locationCacheKey(userId));
}

export async function writeCachedRegion(region: string, userId?: number) {
  await AsyncStorage.setItem(locationCacheKey(userId), region.trim());
}

export async function clearLocationCaches() {
  const keys = await AsyncStorage.getAllKeys();
  const locationKeys = keys.filter((key) => key.startsWith(LOCATION_CACHE_PREFIX));
  if (locationKeys.length > 0) await AsyncStorage.multiRemove(locationKeys);
}
