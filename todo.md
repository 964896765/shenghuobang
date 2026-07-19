# 生活帮当前开发 TODO

唯一总控入口：[`docs/execution/DEVELOPMENT_EXECUTION_INDEX.md`](docs/execution/DEVELOPMENT_EXECUTION_INDEX.md)

## 当前产品方向

生活帮最终定位为：连接创意、生产、使用、流转和回收的产品全生命周期协作与资源交易平台。

产品主路线：

身份与权限架构 → 创意落地最小闭环 → 生产协作 → 产品数字档案与流转 → 回收材料闭环

## 当前唯一任务

### V3.3-A / A1：规格与权限威胁模型

- [ ] 输出新增表完整数据字典。
- [ ] 输出旧角色/认证/项目到新模型的迁移矩阵。
- [ ] 冻结第一版权限能力目录。
- [ ] 输出 RBAC + ABAC + Data Scope + Field Mask 判定表。
- [ ] 输出敏感字段脱敏矩阵。
- [ ] 输出身份、认证、组织、成员、邀请、项目成员和平台职务状态机。
- [ ] 逐接口列出第一批权限改造范围。
- [ ] 输出跨组织、停职、离职、NDA、职责分离和并发测试矩阵。
- [ ] 运行产品规范、Markdown 链接和 diff 检查。
- [ ] 输出 A1 报告并停止，不自动进入 A2。

任务书：[`V3_3_A_BATCH1_CODEX_TASK.md`](docs/execution/stages/V3_3_A_BATCH1_CODEX_TASK.md)

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
- [ ] 不在 V3.3-A A1 完成前进入迁移和业务代码开发。
