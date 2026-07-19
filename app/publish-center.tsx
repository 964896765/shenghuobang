import { useRouter } from "expo-router";
import { useEffect } from "react";

// publish-center 路由重定向到 publish tab
export default function PublishCenterRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/(tabs)/publish" as any);
  }, [router]);
  return null;
}
