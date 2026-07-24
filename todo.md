# 生活帮当前开发 TODO

唯一总控入口：[`docs/execution/DEVELOPMENT_EXECUTION_INDEX.md`](docs/execution/DEVELOPMENT_EXECUTION_INDEX.md)

## 当前产品方向

生活帮最终定位为：连接创意、生产、使用、流转和回收的产品全生命周期协作与资源交易平台。

产品主路线：

身份与权限架构 → 创意落地最小闭环 → 生产协作 → 产品数字档案与流转 → 回收材料闭环

## 当前任务

### V4 Alpha 稳定化（`codex/v4-demo-stabilization`）

- [ ] 恢复 GitHub CI：拆分 `quality`、`dependency-audit`、`mysql-integration`、`android-export`。
- [ ] 修复依赖审计与 V4 active-doc 校验，不再让历史 V3.2.4 文档冻结矩阵阻断当前 CI。
- [ ] 统一版本号到 `package.json=4.0.0-alpha.1`、Expo `4.0.0`、Android `400001`。
- [ ] 建立可撤销 Session、缩短 JWT 生命周期并补 `logout all`。
- [ ] 为登录和注册增加单实例 Alpha 限流与失败保护。
- [ ] 为 `db:seed` 增加 production、本地主机和库名保护，不再重写既有演示账号密码。
- [ ] 冻结 `0000—0037` 历史迁移 checksum，后续仅允许新增 `0038+`。
- [ ] 修复 Release 启动：根 ErrorBoundary、启动日志、可见兜底页和黑屏定位。
- [ ] 统一客户端角色、身份和 capabilities，并修正首页“需求”入口到公开聚合页。
- [ ] 收紧 Docker MySQL 暴露与 production 端口冲突行为。
- [ ] 增加 `SECURITY.md`、Release 说明和 README 当前状态说明。

## V3.3-A 后续批次

1. [A2：追加迁移、回填和恢复脚本](docs/execution/stages/V3_3_A_BATCH2_DATABASE_MIGRATION_TASK.md)。
2. [A3：授权内核、权限 Procedure 和兼容适配器](docs/execution/stages/V3_3_A_BATCH3_AUTHORIZATION_KERNEL_TASK.md)。
3. [A4：身份、认证、组织和成员服务](docs/execution/stages/V3_3_A_BATCH4_IDENTITY_ORGANIZATION_SERVICES_TASK.md)。
4. [A5：项目成员、身份/组织/工作台最小 UI](docs/execution/stages/V3_3_A_BATCH5_PROJECT_MEMBERSHIP_UI_TASK.md)。
5. [A6：越权、安全、并发和迁移验证](docs/execution/stages/V3_3_A_BATCH6_SECURITY_TEST_TASK.md)。
6. [A7：真机验收、报告和源码归档](docs/execution/stages/V3_3_A_BATCH7_DEVICE_RELEASE_TASK.md)。

## 产品后续阶段

1. V3.3-B：创意公开/私密/NDA、协作者邀请、设计版本、原型里程碑、交付验收和意向登记。
2. V4.1：RFQ、隔离报价、BOM、生产订单、批次、质检和产品实例。
3. V4.2：产品型号、单件身份、所有权、维修、折损、估值、易手和翻新。
4. V4.3：回收复检、交接、拆解、零件再利用、再生材料和材料去向。

## 跨阶段技术专项

- [ ] 金额影子列、双写、读切换和对账；按业务资金门禁穿插，不抢占产品主线。
- [ ] 隔离云测试环境、对象存储、Push 和可观测性。
- [ ] 支付、退款、托管、结算和日终对账。
- [ ] 隐私、安全、密钥、注销和数据导出。
- [ ] AI 结构化、物品识别、估价辅助、搜索和位置。
- [ ] 真机、弱网、性能、灾备和发布候选。

## 当前禁止事项

- [ ] 不先创建几十种固定角色或复制工作台。
- [ ] 不先堆创意、生产、BOM、质检和拆解页面。
- [ ] 不删除旧角色、旧认证或旧项目字段。
- [ ] 不把客户端工作台切换当成权限依据。
- [ ] 不直接修改或推送 `main`。
- [ ] 不移动、删除或覆盖 `v4.0.0-alpha`。
- [ ] 不强制推送，不改写 `0000—0037` 历史迁移。
- [ ] 在 Release 黑屏未解决前，不继续扩大真机业务验收范围。
