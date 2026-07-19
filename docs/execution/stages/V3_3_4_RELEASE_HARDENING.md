> SUPERSEDED FOR EXECUTION: This 1.0 plan is retained for history only. Use [DEVELOPMENT_EXECUTION_INDEX](../DEVELOPMENT_EXECUTION_INDEX.md).

Document Status: SUPERSEDED_FOR_EXECUTION
Spec Version: 1.0.0
Updated At: 2026-07-19
Risk Level: HIGH


> **执行状态说明：** 本文件属于 1.0 版历史规划，已被 2.0 主路线替代，不得作为 NEXT 任务直接执行。相关内容应按 `../MASTER_STAGE_DELIVERY_MATRIX.md` 和 `../tracks/CROSS_CUTTING_TECHNICAL_TRACKS.md` 重新排入 V3.3-A、V3.3-B、V4.1、V4.2、V4.3 或跨阶段技术轨。

# V3.3.4：生产发布收口与唯一候选版本

## 1. 目标

本阶段按系统总规划推进，完成本领域可迁移、可测试、可回滚、可审计的闭环，不以页面数量作为完成标准。

## 2. 开发任务

1. 清零当前版本 P0/P1，冻结功能范围和数据版本。
2. 执行压测、长稳、弱网、并发、渗透、安全依赖和备份恢复演练。
3. 完成 Android/iOS 设备矩阵、权限、键盘、通知、支付和文件专项。
4. 准备隐私政策、用户协议、权限说明、客服、投诉和商店材料。
5. 生成唯一 RC 包、验收证据、发布说明、回滚手册和正式标签候选。

## 3. 明确不做

- 不在 RC 阶段新增业务；不生成多个无法区分的候选包。
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

- 全门禁通过；唯一 RC 真机通过；回滚和灾备可执行；具备正式发布条件。
