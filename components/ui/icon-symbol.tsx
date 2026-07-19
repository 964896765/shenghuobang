// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "safari.fill": "explore",
  "plus.circle.fill": "add-circle",
  "message.fill": "chat",
  "person.fill": "person",
  "briefcase.fill": "work",
  "list.bullet.rectangle.fill": "list-alt",
  "folder.fill": "folder",
  "storefront.fill": "storefront",
  "doc.text.fill": "description",
  "bell.fill": "notifications",
  magnifyingglass: "search",
  sparkles: "auto-awesome",
  "wrench.fill": "build",
  "arrow.3.trianglepath": "recycling",
  "gift.fill": "card-giftcard",
  "cube.box.fill": "inventory-2",
  "person.2.fill": "people",
  "mappin.circle.fill": "place",
  "star.fill": "star",
  "checkmark.circle.fill": "check-circle",
  "checkmark.seal.fill": "verified",
  "clock.fill": "schedule",
  "creditcard.fill": "credit-card",
  "shield.fill": "shield",
  "lightbulb.fill": "lightbulb",
  "hand.raised.fill": "pan-tool",
  "arrow.right": "arrow-forward",
  xmark: "close",
  plus: "add",
  "ellipsis.message.fill": "forum",
  "square.grid.2x2.fill": "grid-view",
  "heart.fill": "favorite",
  "camera.fill": "photo-camera",
  "location.fill": "my-location",
  "gearshape.fill": "settings",
  "questionmark.circle.fill": "help",
  "arrow.right.square.fill": "logout",
  "tag.fill": "sell",
  "banknote.fill": "payments",
  "hammer.fill": "handyman",
  "cart.fill": "shopping-cart",
  "flag.fill": "flag",
  "info.circle.fill": "info",
  "exclamationmark.triangle.fill": "warning",
  "text.bubble.fill": "comment",
  "arrow.2.squarepath": "swap-horiz",
  "chart.bar.fill": "bar-chart",
  "bolt.fill": "bolt",
  "envelope.fill": "email",
  "phone.fill": "phone",
  "trash.fill": "delete",
  pencil: "edit",
  "eye.fill": "visibility",
  "lock.fill": "lock",
  "hand.thumbsup.fill": "thumb-up",
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
