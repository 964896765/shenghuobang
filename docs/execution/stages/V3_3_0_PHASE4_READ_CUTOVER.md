> SUPERSEDED FOR EXECUTION: This 1.0 plan is retained for history only. Use [DEVELOPMENT_EXECUTION_INDEX](../DEVELOPMENT_EXECUTION_INDEX.md).

Document Status: SUPERSEDED_FOR_EXECUTION
Spec Version: 1.0.0
Updated At: 2026-07-19
Risk Level: HIGH


> **执行状态说明：** 本文件属于 1.0 版历史规划，已被 2.0 主路线替代，不得作为 NEXT 任务直接执行。相关内容应按 `../MASTER_STAGE_DELIVERY_MATRIX.md` 和 `../tracks/CROSS_CUTTING_TECHNICAL_TRACKS.md` 重新排入 V3.3-A、V3.3-B、V4.1、V4.2、V4.3 或跨阶段技术轨。

# V3.3.0 Phase 4：金额读路径与客户端契约切换

## 1. 目标

本阶段按系统总规划推进，完成本领域可迁移、可测试、可回滚、可审计的闭环，不以页面数量作为完成标准。

## 2. 开发任务

1. 服务端业务计算改为只使用 bigint 分；旧列仅作为兼容对照。
2. tRPC/REST 对外金额统一为十进制字符串及明确 currency，不向 JSON 暴露 bigint。
3. 建立客户端 Money 类型、格式化、解析、比较、合计和输入组件，替换页面中的散落金额处理。
4. 按订单、支付、退款、托管、结算、项目、需求、物品和回收逐模块切换。
5. 验证中文金额显示、零值、负差额、大额、边界、小数两位和弱网重试。

## 3. 明确不做

- 不删除旧列；不允许客户端决定关键金额；不扩大币种范围。
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

- 全部读路径来自分列；客户端无浮点业务计算；对账保持一致。
