import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import * as Location from "expo-location";

import { useAuth } from "@/hooks/use-auth";
import { readCachedRegion, writeCachedRegion } from "@/lib/location-storage";
import { trpc } from "@/lib/trpc";
import {
  buildDeviceLocationUpdatePayload,
  buildManualLocationUpdatePayload,
  formatLocationPreferenceError,
  isLocationOwnerActive,
  locationOwnerKey,
  resolveForegroundPermission,
  resolveStoredLocationName,
  scopedLocationValue,
} from "@/shared/location";

export type ForegroundPermissionState =
  | "not_asked"
  | "requesting"
  | "granted"
  | "denied"
  | "permanently_denied"
  | "services_disabled";

export type ForegroundLocationState = "idle" | "acquiring" | "success" | "failed" | "manual";

type Coordinates = { latitude: number; longitude: number };

const LOCATION_TIMEOUT_MS = 12_000;
const SERVICES_DISABLED_MESSAGE = "系统定位服务已关闭，请开启后重试或手动选择地区";

async function positionWithTimeout() {
  return Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("定位超时，请重试或手动选择地区")), LOCATION_TIMEOUT_MS)),
  ]);
}

export function useForegroundLocation() {
  const { user } = useAuth();
  const ownerKey = locationOwnerKey(user?.id);
  const activeOwnerKeyRef = useRef(ownerKey);
  activeOwnerKeyRef.current = ownerKey;
  const [permission, setPermission] = useState<ForegroundPermissionState>("not_asked");
  const [locationState, setLocationState] = useState<ForegroundLocationState>("idle");
  const [coordinates, setCoordinates] = useState<Coordinates>();
  const [region, setRegion] = useState<string>();
  const [error, setError] = useState<string>();
  const [stateOwnerKey, setStateOwnerKey] = useState(ownerKey);
  const preference = trpc.location.me.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const updatePreference = trpc.location.update.useMutation();
  const currentCoordinates = scopedLocationValue(stateOwnerKey, ownerKey, coordinates);
  const currentRegion = scopedLocationValue(stateOwnerKey, ownerKey, region);

  const refreshPermission = useCallback(async () => {
    const requestedOwnerKey = activeOwnerKeyRef.current;
    try {
      const result = await Location.getForegroundPermissionsAsync();
      const servicesEnabled = result.status === Location.PermissionStatus.GRANTED
        ? await Location.hasServicesEnabledAsync()
        : true;
      if (!isLocationOwnerActive(requestedOwnerKey, activeOwnerKeyRef.current)) return;
      const nextPermission = resolveForegroundPermission({
        status: result.status,
        canAskAgain: result.canAskAgain,
        servicesEnabled,
      });
      setPermission(nextPermission);
      if (nextPermission !== "services_disabled") {
        setError((current) => current === SERVICES_DISABLED_MESSAGE ? undefined : current);
        setLocationState((current) => current === "failed" ? (currentRegion ? "manual" : "idle") : current);
      }
    } catch {
      if (!isLocationOwnerActive(requestedOwnerKey, activeOwnerKeyRef.current)) return;
      setPermission("denied");
    }
  }, [currentRegion]);

  useEffect(() => {
    void refreshPermission();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshPermission();
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  useEffect(() => {
    const requestedOwnerKey = ownerKey;
    activeOwnerKeyRef.current = ownerKey;
    setStateOwnerKey(ownerKey);
    setCoordinates(undefined);
    setRegion(undefined);
    setError(undefined);
    setLocationState("idle");
    let active = true;
    void readCachedRegion(user?.id).then((cached) => {
      if (active && cached && isLocationOwnerActive(requestedOwnerKey, activeOwnerKeyRef.current)) {
        setRegion(cached);
        setLocationState((current) => current === "idle" ? "manual" : current);
      }
    });
    return () => { active = false; };
  }, [ownerKey, user?.id]);

  useEffect(() => {
    const stored = resolveStoredLocationName(preference.data ?? undefined);
    if (preference.data?.userId === user?.id && stateOwnerKey === ownerKey && stored && !currentRegion) {
      setRegion(stored);
      setLocationState((current) => current === "idle" ? "manual" : current);
    }
  }, [currentRegion, ownerKey, preference.data, stateOwnerKey, user?.id]);

  const acquire = useCallback(async () => {
    const requestedOwnerKey = activeOwnerKeyRef.current;
    if (stateOwnerKey !== requestedOwnerKey) {
      setStateOwnerKey(requestedOwnerKey);
      setCoordinates(undefined);
      setRegion(undefined);
    }
    setLocationState("acquiring");
    setError(undefined);
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!isLocationOwnerActive(requestedOwnerKey, activeOwnerKeyRef.current)) return;
      if (!servicesEnabled) {
        setCoordinates(undefined);
        setPermission("services_disabled");
        setLocationState("failed");
        setError(SERVICES_DISABLED_MESSAGE);
        return;
      }
      const position = await positionWithTimeout();
      if (!isLocationOwnerActive(requestedOwnerKey, activeOwnerKeyRef.current)) return;
      const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setCoordinates(next);
      setPermission("granted");
      let resolvedRegion = currentRegion;
      let devicePayload = buildDeviceLocationUpdatePayload(next, undefined, currentRegion);
      try {
        const addresses = await Location.reverseGeocodeAsync(next);
        if (!isLocationOwnerActive(requestedOwnerKey, activeOwnerKeyRef.current)) return;
        devicePayload = buildDeviceLocationUpdatePayload(next, addresses[0], currentRegion);
        resolvedRegion = devicePayload.displayName ?? currentRegion;
      } catch {
        // Reverse geocoding is optional. Nearby distance still works without a region label.
      }
      if (resolvedRegion) {
        setRegion(resolvedRegion);
        await writeCachedRegion(resolvedRegion, user?.id);
        if (!isLocationOwnerActive(requestedOwnerKey, activeOwnerKeyRef.current)) return;
      }
      if (user) {
        await updatePreference.mutateAsync(devicePayload);
        if (!isLocationOwnerActive(requestedOwnerKey, activeOwnerKeyRef.current)) return;
      }
      setLocationState("success");
    } catch (cause) {
      if (!isLocationOwnerActive(requestedOwnerKey, activeOwnerKeyRef.current)) return;
      setCoordinates(undefined);
      setLocationState("failed");
      setError(cause instanceof Error ? cause.message : "无法获取位置，请重试或手动选择地区");
    }
  }, [currentRegion, stateOwnerKey, updatePreference, user]);

  const request = useCallback(async () => {
    const requestedOwnerKey = activeOwnerKeyRef.current;
    setPermission("requesting");
    setError(undefined);
    try {
      const result = await Location.requestForegroundPermissionsAsync();
      if (!isLocationOwnerActive(requestedOwnerKey, activeOwnerKeyRef.current)) return;
      if (result.status !== Location.PermissionStatus.GRANTED) {
        setPermission(result.canAskAgain ? "denied" : "permanently_denied");
        setLocationState("failed");
        setError("未获得位置权限，仍可手动选择城市或地区");
        return;
      }
      setPermission("granted");
      await acquire();
    } catch {
      if (!isLocationOwnerActive(requestedOwnerKey, activeOwnerKeyRef.current)) return;
      setPermission("denied");
      setLocationState("failed");
      setError("位置权限请求失败，请重试或手动选择地区");
    }
  }, [acquire]);

  const useManualRegion = useCallback(async (value: string) => {
    const requestedOwnerKey = activeOwnerKeyRef.current;
    const payload = buildManualLocationUpdatePayload(value);
    setError(undefined);
    if (user) {
      try {
        await updatePreference.mutateAsync(payload);
      } catch (cause) {
        if (__DEV__) {
          console.warn("[location.manual.save_failed]", {
            source: payload.source,
            cityName: payload.cityName,
            error: cause instanceof Error ? cause.message : String(cause ?? ""),
          });
        }
        throw new Error(formatLocationPreferenceError(cause));
      }
    }
    if (!isLocationOwnerActive(requestedOwnerKey, activeOwnerKeyRef.current)) return;
    setStateOwnerKey(requestedOwnerKey);
    setCoordinates(undefined);
    setRegion(payload.cityName);
    setLocationState("manual");
    await writeCachedRegion(payload.cityName, user?.id);
  }, [updatePreference, user]);

  const queryInput = useMemo(() => currentCoordinates
    ? { ...currentCoordinates, region: currentRegion }
    : currentRegion ? { region: currentRegion } : undefined, [currentCoordinates, currentRegion]);

  return {
    permission,
    locationState,
    coordinates: currentCoordinates,
    region: currentRegion,
    error,
    queryInput,
    request,
    retry: permission === "granted" ? acquire : request,
    useManualRegion,
    openSettings: () => Linking.openSettings(),
    refreshPermission,
  };
}
