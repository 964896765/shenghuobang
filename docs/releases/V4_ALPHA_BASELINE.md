Document Status: ACTIVE
Updated At: 2026-07-23

# V4 Alpha Baseline

## Baseline

- GitHub `main` baseline: `8973608d7580dccaa06f752bbdfa067ed9cd6c1a`
- Tag: `v4.0.0-alpha`
- Stabilization branch: `codex/v4-demo-stabilization`

## Included

- V3.3-A 身份、组织、权限与工作台基础
- V3.3-B 创意、协作者、设计原型与验收意向基础
- V4 Alpha 的 Product、ProductUnit、产品护照、内容、筹措、商城、订单与 Sandbox 支付
- MySQL 迁移 `0000—0037`
- 幂等演示 Seed、本地 Web/API、Android 与 Web 构建能力

## Known Limits

- 当前版本属于 LAN Demo Alpha，不是公开生产发布包
- `PAYMENT_PROVIDER` 仅允许 `sandbox`
- Android Release APK 仍存在启动黑屏 P1，需要在稳定化分支继续修复
- 图片、视频、实体二维码、维修、捐赠、回收与部分弱网真机闭环尚未完成最终证据
- 不提供包含本地 LAN 配置的 APK/AAB 下载物
