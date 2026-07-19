> SUPERSEDED FOR EXECUTION: This 1.0 plan is retained for history only. Use [DEVELOPMENT_EXECUTION_INDEX](../DEVELOPMENT_EXECUTION_INDEX.md).

Document Status: SUPERSEDED_FOR_EXECUTION
Spec Version: 1.0.0
Updated At: 2026-07-19
Risk Level: HIGH


> **执行状态说明：** 本文件属于 1.0 版历史规划，已被 2.0 主路线替代，不得作为 NEXT 任务直接执行。相关内容应按 `../MASTER_STAGE_DELIVERY_MATRIX.md` 和 `../tracks/CROSS_CUTTING_TECHNICAL_TRACKS.md` 重新排入 V3.3-A、V3.3-B、V4.1、V4.2、V4.3 或跨阶段技术轨。

# V3.3.1：云端测试平台、存储、Push 与可观测性

## 1. 目标

本阶段按系统总规划推进，完成本领域可迁移、可测试、可回滚、可审计的闭环，不以页面数量作为完成标准。

## 2. 开发任务

1. 建立 development、test、staging、production 环境边界和配置清单。
2. 部署稳定 HTTPS/WSS API、MySQL 隔离库、迁移作业、健康/就绪探针和自动回滚。
3. 接入 S3/COS/OSS Provider、私有 bucket、生命周期、CDN、备份和恢复验证。
4. 完成 FCM/APNs/Expo Push 凭据、receipt 轮询、失败队列、Token 停用和通知追踪。
5. 接入结构化日志、指标、错误追踪、告警、审计保留和容量基线。

## 3. 明确不做

- 不接生产支付；不把云供应商 SDK 写进领域服务；不使用生产用户数据测试。
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

- 测试环境可重复部署；文件和 Push 真机闭环；备份恢复与告警演练通过。
