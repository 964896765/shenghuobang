export type ViewerLocation = {
  latitude?: number;
  longitude?: number;
  region?: string;
};

export type PermissionSnapshot = {
  status: "undetermined" | "granted" | "denied";
  canAskAgain: boolean;
  servicesEnabled: boolean;
};

export function locationOwnerKey(userId?: number) {
  return userId === undefined ? "guest" : `user:${userId}`;
}

export function isLocationOwnerActive(expectedOwnerKey: string, currentOwnerKey: string) {
  return expectedOwnerKey === currentOwnerKey;
}

export function scopedLocationValue<T>(stateOwnerKey: string, currentOwnerKey: string, value: T) {
  return isLocationOwnerActive(stateOwnerKey, currentOwnerKey) ? value : undefined;
}

export function resolveForegroundPermission(snapshot: PermissionSnapshot) {
  if (snapshot.status === "undetermined") return "not_asked" as const;
  if (snapshot.status === "granted") return snapshot.servicesEnabled ? "granted" as const : "services_disabled" as const;
  return snapshot.canAskAgain ? "denied" as const : "permanently_denied" as const;
}

export type ApproximateResourceLocation = {
  latitude: number | string | null;
  longitude: number | string | null;
  region?: string | null;
};

export type ReverseGeocodeParts = {
  city?: string | null;
  district?: string | null;
  subregion?: string | null;
  region?: string | null;
};

function normalizeLocationName(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 64) : undefined;
}

export function roundForStorage(value: number) {
  return Number(value.toFixed(2));
}

export function resolveStoredLocationName(input?: { cityName?: string | null; regionName?: string | null }) {
  return normalizeLocationName(input?.regionName) ?? normalizeLocationName(input?.cityName);
}

export function buildManualLocationUpdatePayload(value: string) {
  const cityName = normalizeLocationName(value);
  if (!cityName || cityName.length < 2) {
    throw new Error("请输入至少 2 个字的城市名称");
  }
  return {
    source: "manual" as const,
    cityName,
  };
}

export function buildDeviceLocationUpdatePayload(
  coordinates: { latitude: number; longitude: number },
  address?: ReverseGeocodeParts,
  fallbackRegion?: string,
) {
  const cityName = normalizeLocationName(address?.city)
    ?? normalizeLocationName(address?.subregion)
    ?? normalizeLocationName(address?.region)
    ?? normalizeLocationName(fallbackRegion);
  const regionCandidate = normalizeLocationName(address?.district)
    ?? normalizeLocationName(address?.subregion)
    ?? normalizeLocationName(fallbackRegion);
  const regionName = regionCandidate && regionCandidate !== cityName ? regionCandidate : undefined;
  return {
    source: "device" as const,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    cityName,
    regionName,
    displayName: resolveStoredLocationName({ cityName, regionName }),
  };
}

export function formatLocationPreferenceError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause ?? "");
  if (message.includes("请输入至少 2 个字的城市名称")) return message;
  if (
    /too_small|invalid_type|TRPCClientError|regionName|cityName|minimum|path|origin|\{|\[/.test(message)
  ) {
    return "城市信息不完整，请重新定位或选择城市。";
  }
  return "保存失败，请稍后重试";
}

export function normalizeViewerLocation(input?: ViewerLocation): ViewerLocation | undefined {
  if (!input) return undefined;
  const region = normalizeLocationName(input.region);
  const hasCoordinates = Number.isFinite(input.latitude) && Number.isFinite(input.longitude);
  if (!hasCoordinates) return region ? { region } : undefined;
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return region ? { region } : undefined;
  }
  return { latitude, longitude, region };
}

export function distanceKm(viewer: ViewerLocation, resource: ApproximateResourceLocation) {
  if (!Number.isFinite(viewer.latitude) || !Number.isFinite(viewer.longitude)) return null;
  const latitude = Number(resource.latitude);
  const longitude = Number(resource.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(latitude - Number(viewer.latitude));
  const dLon = radians(longitude - Number(viewer.longitude));
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(Number(viewer.latitude))) * Math.cos(radians(latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function approximateDistance(distance: number | null) {
  if (distance === null) return null;
  if (distance < 1) return { distanceKm: 1, distanceLabel: "约 1 公里内" };
  const rounded = Math.max(1, Math.round(distance));
  return { distanceKm: rounded, distanceLabel: `约 ${rounded} 公里` };
}

export function nearbyRank(
  viewer: ViewerLocation | undefined,
  resource: ApproximateResourceLocation | undefined,
  fallbackRegion?: string | null,
) {
  if (!viewer) return { rank: Number.POSITIVE_INFINITY, distanceKm: null, distanceLabel: null };
  const approximate = resource ? approximateDistance(distanceKm(viewer, resource)) : null;
  if (approximate) return { rank: approximate.distanceKm, ...approximate };
  const wanted = viewer.region?.trim().toLocaleLowerCase();
  const available = (resource?.region ?? fallbackRegion)?.trim().toLocaleLowerCase();
  if (wanted && available && (available.includes(wanted) || wanted.includes(available))) {
    const viewerHasCoordinates = Number.isFinite(viewer.latitude) && Number.isFinite(viewer.longitude);
    return { rank: viewerHasCoordinates ? Number.MAX_SAFE_INTEGER : 0, distanceKm: null, distanceLabel: "同地区" };
  }
  return { rank: Number.POSITIVE_INFINITY, distanceKm: null, distanceLabel: null };
}

export function stableNearbySort<T extends { rank: number; index: number }>(rows: T[]) {
  return [...rows].sort((a, b) => a.rank - b.rank || a.index - b.index);
}
