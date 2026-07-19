> SUPERSEDED FOR EXECUTION: This 1.0 plan is retained for history only. Use [DEVELOPMENT_EXECUTION_INDEX](../DEVELOPMENT_EXECUTION_INDEX.md).

Document Status: SUPERSEDED_FOR_EXECUTION
Spec Version: 1.0.0
Updated At: 2026-07-19
Risk Level: HIGH


> **执行状态说明：** 本文件属于 1.0 版历史规划，已被 2.0 主路线替代，不得作为 NEXT 任务直接执行。相关内容应按 `../MASTER_STAGE_DELIVERY_MATRIX.md` 和 `../tracks/CROSS_CUTTING_TECHNICAL_TRACKS.md` 重新排入 V3.3-A、V3.3-B、V4.1、V4.2、V4.3 或跨阶段技术轨。

# V3.3.0 Phase 5：金额最终切换与审计冻结

## 1. 目标

本阶段按系统总规划推进，完成本领域可迁移、可测试、可回滚、可审计的闭环，不以页面数量作为完成标准。

## 2. 开发任务

1. 停止旧列业务写入，将旧列标记为 legacy/read-only，并增加写入侦测。
2. 执行全量历史对账、账本守恒检查和抽样业务回放。
3. 形成旧列退役迁移方案，但本阶段默认不立即物理删除，以保留回退窗口。
4. 冻结金额数据字典、API 契约、数据库版本和财务审计报告。
5. 更新 seed、测试数据、后台财务页和所有阶段文档。

## 3. 明确不做

- 不在没有完整备份和回退验证时 DROP 旧列；不接正式生产支付。
## 统一执行要求

- 只追加迁移，不修改已发布迁移。
- 权限、最终状态、金额和审计以后端为准。
- 每个实施批次结束后停止并运行相关门禁。
- 完成后输出执行报告、问题清单、迁移报告和干净源码包。

## 4. 验收重点

- 规格、数据、服务端、客户端、自动化、环境和交付七个批次分别验收。
- 运行全局门禁以及本阶段新增的迁移、并发、安全或外部 Provider 测试。
- 对所有未接真实账号的能力明确标记 Sandbox/Stub。

## 5. 退出条件

- 旧列无业务写入；全量对账通过；金额契约冻结；具备进入云平台阶段条件。
