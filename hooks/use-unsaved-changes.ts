import { useCallback } from "react";
import { BackHandler, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
export { shouldBlockAndroidBack } from "@/lib/mobile-navigation";

export function useAndroidBackGuard(enabled: boolean, onBack: () => void) {
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== "android" || !enabled) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [enabled, onBack]));
}
