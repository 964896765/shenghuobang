import Constants from "expo-constants";

type BuildExtra = {
  build?: {
    appVersion?: string;
    packageVersion?: string;
    versionCode?: number;
    releaseChannel?: string;
    buildProfile?: string;
    gitCommit?: string;
    apiBaseUrl?: string;
  };
};

export function getBuildInfo() {
  const extra = (Constants.expoConfig?.extra ?? {}) as BuildExtra;
  return {
    appVersion: extra.build?.appVersion ?? Constants.expoConfig?.version ?? "unknown",
    packageVersion: extra.build?.packageVersion ?? "unknown",
    versionCode: extra.build?.versionCode ?? Constants.expoConfig?.android?.versionCode ?? 0,
    releaseChannel: extra.build?.releaseChannel ?? "unknown",
    buildProfile: extra.build?.buildProfile ?? "unknown",
    gitCommit: extra.build?.gitCommit ?? "dev",
    apiBaseUrl: extra.build?.apiBaseUrl ?? "",
  };
}
