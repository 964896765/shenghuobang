import { IconSymbol } from "@/components/ui/icon-symbol";
import type { APP_TABS } from "@/shared/navigation/appNavigation";

type TabEntry = (typeof APP_TABS)[number];

export function BottomTabIcon({ entry, color }: { entry: TabEntry; color: string }) {
  const isPublish = entry.id === "publish";
  return <IconSymbol size={isPublish ? 30 : 26} name={entry.icon} color={isPublish ? "#F97316" : color} />;
}
