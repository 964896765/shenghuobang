import { useCallback, useEffect, useRef } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useColors } from "@/hooks/use-colors";

type ChannelItem<T extends string> = {
  id: T;
  title: string;
};

type DiscoverChannelBarProps<T extends string> = {
  channels: readonly ChannelItem<T>[];
  value: T;
  onChange: (value: T) => void;
};

type ItemLayout = {
  x: number;
  width: number;
};

export function DiscoverChannelBar<T extends string>({
  channels,
  value,
  onChange,
}: DiscoverChannelBarProps<T>) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const viewportWidthRef = useRef(0);
  const layoutsRef = useRef<Record<string, ItemLayout>>({});

  const scrollSelectedIntoView = useCallback((channelId: T) => {
    const viewportWidth = viewportWidthRef.current;
    const layout = layoutsRef.current[channelId];
    if (!viewportWidth || !layout) return;
    const centeredX = Math.max(layout.x - (viewportWidth - layout.width) / 2 - 12, 0);
    scrollRef.current?.scrollTo({ x: centeredX, animated: true });
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => scrollSelectedIntoView(value), 0);
    return () => clearTimeout(handle);
  }, [scrollSelectedIntoView, value]);

  const handleViewportLayout = useCallback((event: LayoutChangeEvent) => {
    viewportWidthRef.current = event.nativeEvent.layout.width;
    scrollSelectedIntoView(value);
  }, [scrollSelectedIntoView, value]);

  return (
    <View style={styles.wrapper} onLayout={handleViewportLayout}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
        style={styles.scrollView}
      >
        {channels.map((item) => {
          const selected = item.id === value;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`发现频道：${item.title}`}
              onLayout={(event) => {
                layoutsRef.current[item.id] = {
                  x: event.nativeEvent.layout.x,
                  width: event.nativeEvent.layout.width,
                };
              }}
              onPress={() => onChange(item.id)}
              style={({ pressed }) => [
                styles.channelItem,
                {
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                  opacity: pressed ? 0.76 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.channelText,
                  { color: selected ? "#FFFFFF" : colors.foreground },
                ]}
              >
                {item.title}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: 44,
    minHeight: 44,
    maxHeight: 44,
  },
  scrollView: {
    height: 44,
  },
  contentContainer: {
    paddingHorizontal: 12,
    paddingVertical: 2,
    alignItems: "center",
  },
  channelItem: {
    height: 36,
    marginRight: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    flexShrink: 0,
  },
  channelText: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
});
