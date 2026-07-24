import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

type CameraMenuAction = {
  id: string;
  title: string;
  description: string;
  icon: "camera.fill" | "magnifyingglass" | "cube.box.fill";
  onPress: () => void;
};

type DiscoverCameraMenuProps = {
  visible: boolean;
  onClose: () => void;
  onSearchByPhoto: () => void;
  onScanPassport: () => void;
  onShootAndPublish: () => void;
};

export function DiscoverCameraMenu({
  visible,
  onClose,
  onSearchByPhoto,
  onScanPassport,
  onShootAndPublish,
}: DiscoverCameraMenuProps) {
  const colors = useColors();
  const actions: CameraMenuAction[] = [
    {
      id: "photo-search",
      title: "拍照搜索",
      description: "进入搜索页，继续按内容、商品或服务查找。",
      icon: "magnifyingglass",
      onPress: onSearchByPhoto,
    },
    {
      id: "scan-passport",
      title: "扫描产品护照",
      description: "打开产品护照扫码页，查询公开产品身份与履历。",
      icon: "cube.box.fill",
      onPress: onScanPassport,
    },
    {
      id: "shoot-publish",
      title: "拍摄并发布",
      description: "进入发布页，继续创建图文、视频或业务内容。",
      icon: "camera.fill",
      onPress: onShootAndPublish,
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>相机菜单</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭相机菜单"
              onPress={onClose}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={[styles.closeText, { color: colors.muted }]}>关闭</Text>
            </Pressable>
          </View>
          {actions.map((action) => (
            <Pressable
              key={action.id}
              accessibilityRole="button"
              accessibilityLabel={action.title}
              onPress={() => {
                onClose();
                action.onPress();
              }}
              style={({ pressed }) => [
                styles.actionRow,
                { backgroundColor: pressed ? colors.surface : "transparent" },
              ]}
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
                <IconSymbol name={action.icon} size={20} color={colors.foreground} />
              </View>
              <View style={styles.actionContent}>
                <Text style={[styles.actionTitle, { color: colors.foreground }]}>{action.title}</Text>
                <Text style={[styles.actionDescription, { color: colors.muted }]}>{action.description}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.28)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 22,
  },
  closeText: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  actionDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
});
