import { createContext, useContext, type ReactNode } from "react";

import { useForegroundLocation } from "@/hooks/use-foreground-location";

type GlobalLocationValue = ReturnType<typeof useForegroundLocation>;

const GlobalLocationContext = createContext<GlobalLocationValue | null>(null);

export function GlobalLocationProvider({ children }: { children: ReactNode }) {
  const location = useForegroundLocation();
  return <GlobalLocationContext.Provider value={location}>{children}</GlobalLocationContext.Provider>;
}

export function useGlobalLocation() {
  const value = useContext(GlobalLocationContext);
  if (!value) throw new Error("useGlobalLocation 必须在 GlobalLocationProvider 内使用");
  return value;
}
