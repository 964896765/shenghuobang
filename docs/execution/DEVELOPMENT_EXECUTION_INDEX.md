Document Status: ACTIVE
Spec Version: 2.0.0
Updated At: 2026-07-19
Source Baseline: V3.2.4 stable business baseline + V3.3.0 amount foundation
Approved By: Product Direction Confirmed By User

# 生活帮开发执行总索引

## 1. 开发前唯一阅读顺序

1. [产品最终形态与系统开发总蓝图](./SHENGHUOBANG_MASTER_DEVELOPMENT_BLUEPRINT.md)
2. [生活帮最终产品形态](../strategy/SHENGHUOBANG_FINAL_PRODUCT_FORM.md)
3. [最终 App 信息架构与工作台形态](../strategy/END_STATE_APP_INFORMATION_ARCHITECTURE.md)
4. [身份、组织与数据权限目标架构](../architecture/IDENTITY_ORGANIZATION_PERMISSION_ARCHITECTURE.md)
5. [核心领域整合蓝图](../architecture/CORE_DOMAIN_INTEGRATION_BLUEPRINT.md)
6. [系统开发总规划](./V3_3_TO_V4_SYSTEMATIC_DEVELOPMENT_PLAN.md)
7. [主阶段交付总矩阵](./MASTER_STAGE_DELIVERY_MATRIX.md)
8. 当前阶段任务书
9. `AGENTS.md`、`README.md`、`todo.md`
10. 与当前任务直接相关的 V3.2.4 冻结规范和代码

V3.2.4 冻结文档继续作为稳定业务事实，不因新路线直接改写。V3.3 起的战略、架构和执行文档位于 `docs/strategy`、`docs/architecture` 和 `docs/execution`。

## 2. 当前状态

- 稳定业务基线：V3.2.4。
- 已完成技术专项：V3.3.0 金额迁移 Phase 1（字段盘点、整数分契约、只读审计）。
- 当前 `main` 基线：`8973608d7580dccaa06f752bbdfa067ed9cd6c1a`。
- 当前正式标签：`v4.0.0-alpha`。
- 当前稳定化分支：`codex/v4-demo-stabilization`。
- 当前工作重点：GitHub CI、Release 启动、安全、迁移完整性、客户端入口与真机稳定性。
- V3.3-A / A1 现为历史执行入口，不再是当前唯一任务。
- GitHub 不是本地开发前置条件；本地提交、阶段报告和干净源码归档仍必须保留。

## 3. 产品主线

| 顺序 | 版本 | 目标 | 状态 | 任务书 |
|---|---|---|---|---|
| 01 | V3.3-A | 多身份、认证、组织、项目成员、权限和工作台 | LANDED IN ALPHA | [任务书](./stages/V3_3_A_IDENTITY_ORG_PERMISSION_FOUNDATION.md) |
| 02 | V3.3-B | 创意发布到原型验收和意向登记 | LANDED IN ALPHA | [任务书](./stages/V3_3_B_IDEA_TO_PROTOTYPE_MVP.md) |
| 03 | V4.1 | RFQ、BOM、生产订单、批次、质检和产品实例 | PARTIAL IN ALPHA | [任务书](./stages/V4_1_PRODUCTION_COLLABORATION.md) |
| 04 | V4.2 | 产品数字档案、所有权、维修、折损、易手和翻新 | PARTIAL IN ALPHA | [任务书](./stages/V4_2_PRODUCT_PASSPORT_AND_CIRCULATION.md) |
| 05 | V4.3 | 回收、拆解、零件再利用、再生材料和去向 | PARTIAL IN ALPHA | [任务书](./stages/V4_3_RECYCLING_AND_MATERIAL_LOOP.md) |

## 4. 当前批次

当前有效执行入口为 [`docs/restructure/RUNNABLE_PROTOTYPE_EXECUTION.md`](../restructure/RUNNABLE_PROTOTYPE_EXECUTION.md) 与稳定化任务书；当前批次聚焦：

- 恢复 V4 GitHub CI 与依赖审计
- 修复 Android Release 启动黑屏与启动诊断
- 加固 Session、登录限流与 Demo Seed 防护
- 冻结 `0000—0037` 历史迁移完整性
- 修正客户端角色、身份、capabilities 与首页“需求”入口
- 更新 README、SECURITY 和 Alpha Release 文档

历史 A1 任务仍保留作为分阶段追溯材料，不再阻断当前 V4 Alpha 稳定化工作。

## 5. 跨阶段技术轨

金额、云服务、支付、安全、AI、位置和发布质量按 [跨阶段技术轨](./tracks/CROSS_CUTTING_TECHNICAL_TRACKS.md) 推进。它们为产品阶段提供硬门禁，但不再改变产品主线顺序。

## 6. 旧执行计划处理

此前以“金额迁移 → 云平台 → 身份安全 → 支付”为主顺序的 1.0 版计划已被 2.0 版取代。旧阶段文件只保留历史参考，不再作为 NEXT 任务。任何工具不得根据旧文件自动启动金额 Phase 2、云平台或正式支付。

## 7. 阶段交付规则

每个阶段只保留：

- 一份有效任务书
- 一份实际执行报告
- 一份未关闭问题清单
- 一份干净源码包

阶段报告必须区分：已实现、仅规格完成、Stub/Sandbox、未验证和未完成。不得用“代码已写”替代 MySQL、越权、真机或外部服务验收。


## 8. V3.3-A 后续批次任务卡

- [A2 数据库迁移与兼容回填](./stages/V3_3_A_BATCH2_DATABASE_MIGRATION_TASK.md)
- [A3 授权内核与兼容适配](./stages/V3_3_A_BATCH3_AUTHORIZATION_KERNEL_TASK.md)
- [A4 身份、认证与组织服务](./stages/V3_3_A_BATCH4_IDENTITY_ORGANIZATION_SERVICES_TASK.md)
- [A5 项目成员、工作台与最小 UI](./stages/V3_3_A_BATCH5_PROJECT_MEMBERSHIP_UI_TASK.md)
- [A6 越权、安全与迁移验证](./stages/V3_3_A_BATCH6_SECURITY_TEST_TASK.md)
- [A7 真机验收与交付](./stages/V3_3_A_BATCH7_DEVICE_RELEASE_TASK.md)

这些任务卡是规划输入，不代表已经执行。A1 未通过前不得启动 A2。
