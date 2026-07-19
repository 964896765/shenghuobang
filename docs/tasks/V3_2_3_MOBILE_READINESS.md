# 生活帮 V3.2.3 移动端准备现状

## 当前能力

- Expo SDK 54、Expo Router、Safe Area、SecureStore 登录恢复和共享 WebSocket 已存在。
- 物品图片已支持最多 6 张、逐张上传、失败重试、删除和排序。
- 数据库已有 `device_push_tokens`、通知投递尝试、轻量重试和无效 Token 停用底座。
- 服务端已有 Push Provider 接口与 Log Provider，站内通知和统一通知列表已可用。

## Android 真机风险

- 图片当前使用文档选择器，没有按点击触发的相册权限说明、拒绝状态和系统设置入口。
- 聊天、长表单和底部操作虽有基础布局，但 Android 键盘、返回键未统一处理。
- 原生设备使用 `localhost` 时只会连接失败，没有明确的局域网诊断提示。
- 缺少 development/preview EAS 配置，Expo Doctor 报告 `expo-asset` peer 缺失。

## iOS 兼容风险

- 相册权限文案和有限照片权限未显式处理。
- 通知权限状态、系统设置入口及冷启动通知跳转尚未接入。
- 本阶段只能做代码和构建兼容检查，没有 iOS 真实设备。

## Push 已有底座

- Token 表已有用户、Token、平台、active、lastSeenAt，但没有停用时间和停用原因。
- 客户端没有请求权限、获取 Expo Push Token、登录注册、登出解除和通知点击监听。
- Registry 固定返回 Log Provider；尚无 Expo HTTP Provider，环境校验也只接受 `log`。

## 本阶段修改

- 保持 Expo SDK 54，补齐必要 peer、相册模块和 SDK 54 兼容补丁。
- 增加 development/preview build 配置、权限说明、键盘/安全区/返回键处理和局域网诊断。
- 增加统一通知 Data 路由、客户端 Push 生命周期与设置入口。
- 增加轻量 Expo Provider、Token 停用信息及必要的追加迁移。
- 将演示 seed 改为可重复执行，并升级 CI 官方 Action 运行时。
- 增加聚焦单元测试、Android 人工清单和真实验证边界说明。
