> SUPERSEDED FOR EXECUTION: This 1.0 plan is retained for history only. Use [DEVELOPMENT_EXECUTION_INDEX](../DEVELOPMENT_EXECUTION_INDEX.md).

Document Status: SUPERSEDED_FOR_EXECUTION
Spec Version: 1.0.0
Updated At: 2026-07-19
Risk Level: CRITICAL


> **执行状态说明：** 本文件属于 1.0 版历史规划，已被 2.0 主路线替代，不得作为 NEXT 任务直接执行。相关内容应按 `../MASTER_STAGE_DELIVERY_MATRIX.md` 和 `../tracks/CROSS_CUTTING_TECHNICAL_TRACKS.md` 重新排入 V3.3-A、V3.3-B、V4.1、V4.2、V4.3 或跨阶段技术轨。

# V3.6.0：创意验证、筹措、打样、生产与供应链

## 1. 目标

本阶段按系统总规划推进，完成本领域可迁移、可测试、可回滚、可审计的闭环，不以页面数量作为完成标准。

## 2. 开发任务

1. 建立创意、问题、目标用户、可行性评估、投票/反馈和版本记录。
2. 建立 NDA、知识产权归属、贡献记录和受控文件空间。
3. 建立共创项目、任务、里程碑、预算、筹措/预售和退款条件。
4. 建立打样、BOM/规格、供应商报价、生产批次、质检、交付和售后追踪。
5. 把产品最终物品实例接入 item 生命周期、维修、二手流转和回收。

## 3. 明确不做

- 不一开始复制完整 ERP；不在合规和退款规则未确定时开放公众筹资；不公开未授权设计文件。
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

- 从创意到交付有可追溯主线；资金和里程碑一致；供应商与文件权限正确。
