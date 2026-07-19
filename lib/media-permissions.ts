export type MediaPermissionState = {
  granted: boolean;
  canAskAgain: boolean;
  accessPrivileges?: "all" | "limited" | "none" | null;
};

export function mediaPermissionGuidance(permission: MediaPermissionState) {
  if (permission.granted || permission.accessPrivileges === "limited") {
    return { allowed: true, shouldOpenSettings: false, message: "" };
  }
  return {
    allowed: false,
    shouldOpenSettings: !permission.canAskAgain,
    message: permission.canAskAgain
      ? "需要相册权限才能选择物品图片。你可以再次点击选择并授权，拒绝权限不会影响其他功能。"
      : "相册权限已被关闭，请前往系统设置允许生活帮访问你选择的照片。",
  };
}
