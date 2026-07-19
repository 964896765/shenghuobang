# 生活帮 V3.2.3 移动端真机、基础 Push 与开发体验收口

## 范围与基线

本版本基于 `v3.2.2` / `096cb29`，保持 Expo SDK 54、React Native 0.81、Express/tRPC、MySQL 8 和 Drizzle 技术栈。没有开始 V3.3，没有开发正式支付、金额迁移、S3、短信实名、物品生命周期或 WebSocket 新业务。

## 已完成

- 将 Expo SDK 54 相关依赖更新到兼容补丁版本，补齐 `expo-asset`、`expo-image-picker` 和 `expo-device`。
- 增加 `eas.json` development/preview 内部分发配置、Android APK development client 配置和版本号。
- 原生图片改用系统相册选择器，仅在用户点击后请求权限；增加拒绝、永久拒绝、系统设置和有限照片权限处理。
- 增加原生 API 地址诊断、请求/上传超时、WebSocket 安全推导与轮询降级；写操作不会因超时自动重试。
- 完善发布/编辑/登录/回收/聊天的键盘避让、点击收起和 Android 未保存返回确认。
- 增加“移动端设置”，集中显示通知权限、Push 注册状态、API 诊断以及系统设置/停用当前设备入口。
- 增加客户端 Push 生命周期：已有权限时同步、登录注册、Token 变化/回前台刷新、退出停用、前台刷新通知列表、后台与冷启动统一路由。
- 增加可配置 `log` / `expo` 的 Push Provider Registry。Expo Provider 在数据库事务外调用，保存投递尝试，无效 Token 自动停用，Payload 不包含消息正文或敏感业务数据。
- 演示 seed 改为事务内可重复 upsert，不清库、不删除非演示数据；增加连续两次执行与计数验证脚本。
- GitHub Actions 官方 Action 升级为 Node 24 兼容主版本，保留全部检查和 MySQL 服务，并加入 seed 幂等测试。

## Push 数据边界

客户端通知 Data 仅使用 `type`、`notificationId`、`refType`、`refId`。服务端继续先写站内通知，再尝试 Push；Provider 失败不会回滚业务动作。临时错误沿用轻量退避尝试，无效 Expo Token 写入 `disabledAt`/`disabledReason` 并停用。

本阶段没有 EAS/FCM/APNs 账号或凭据，不声称真实 Push 已发送。尚未实现 Expo receipt 后台轮询、独立队列、生产速率控制或多渠道回退。

## 数据库迁移

新增且仅追加：

```text
drizzle/0013_gorgeous_gargoyle.sql
```

迁移为 `device_push_tokens` 增加 `disabledAt`、`disabledReason`、`updatedAt`。旧迁移 `0000—0012` 未修改；空库共 14 条迁移，V3.2.2 可直接追加升级。

## 自动化实测

- `npx expo-doctor`：18/18 checks passed。
- `npx expo install --check`：Dependencies are up to date。
- `pnpm check`：通过，TypeScript 0 错误。
- `pnpm lint`：通过，ESLint 0 错误、0 警告。
- `pnpm test`：10 个测试文件、58 项全部通过；原 51 项保留，新增 7 项，无 skip。
- `pnpm test:integration:mysql`：V3.1.1 10 组 + V3.1.2 9 组全部通过。
- `pnpm test:integration:v32`：V3.2 MySQL 18 项（含 V3.2.2 Token 数据升级）、历史升级 9 类、运行时 3 项、WebSocket 6 项、文件安全 7 项全部通过。
- `pnpm test:migrations:empty`：空库 14 条迁移连续执行两次通过。
- `pnpm test:seed:idempotent`：同一隔离库连续两次 seed，用户/资料/需求/listing/回收/认证计数保持一致。
- `pnpm build`：通过，生成 `dist/index.mjs`，398.1 kB。
- `pnpm build:web`：通过，1546 个模块、2 个 Web bundle、19 个静态资源。
- `npx expo export --platform all`：通过，Android 1762 个模块、iOS 1746 个模块；临时导出已清理。
- 生产构建实际请求：`/api/health` HTTP 200，`{"ok":true,"status":"alive"}`；`/api/ready` HTTP 200，configuration/database/storage 均为 `ok`。

GitHub CI 结果和 PR 地址在推送后记录到 PR 与最终交付报告。

## 真机与账号侧验证

- Android development build：未执行，等待 EAS 账号、Project ID 和签名凭据。
- Android 真机：未执行，当前环境无设备；清单见 `docs/testing/V3_2_3_ANDROID_CHECKLIST.md`。
- iOS 真机/Xcode 构建：未执行，当前 Windows 环境无 Apple 构建环境和设备。
- 真实 Expo Push：未执行，等待 EAS/FCM/APNs 凭据。

## 未完成事项

- Android/iOS 多尺寸真机、键盘、安全区、弱网、相册和 Push 人工验收。
- EAS development build 与生产 Android/iOS 签名、FCM/APNs 配置。
- Push receipt 后台轮询、独立任务队列、监控和生产容量验证。
- 生产外部服务与 V3.3 业务均未开始。
