Document Status: FROZEN
Spec Version: 0.7.0
Updated At: 2026-07-15
Code Baseline Commit: 34f96defd6fa82274730fcb22ae8aeca560353f5
Approved By: User Approved
Replaces: Previous draft without header metadata
Change Summary: 删除重复决策编号，固定 DEC-007/008/009 的有效范围与编号唯一性规则

# 产品决策记录

## 1. 文档定位

- 本文件记录用户已经明确确认的产品规则、范围边界和审查策略。
- 当后续文档与本文件冲突时，以用户最新明确决定优先，其次以本文件为准。
- 本文件只记录已确认决策，不记录推测结论。

## 2. 决策列表

| 决策编号 | 日期 | 决策内容 | 影响文档 |
| --- | --- | --- | --- |
| DEC-001 | 2026-07-14 | 先完成整个程序审查，再统一冻结问题清单，然后逐批修复。 | 全部产品与审查文档 |
| DEC-002 | 2026-07-14 | 审查阶段不得发现一个问题立即修一个。 | `V3_2_4_ACCEPTANCE_BASELINE.md` `V3_2_4_AUDIT_CHECKLIST.md` |
| DEC-003 | 2026-07-14 | V3.2.4 重点是全程序审查、Android 真机验收、问题修复和体验收口。 | `SHENGHUOBANG_PRODUCT_BLUEPRINT.md` `V3_2_4_ACCEPTANCE_BASELINE.md` |
| DEC-004 | 2026-07-14 | 正式支付、云存储、正式 Push、iOS 发布不属于当前必过项。 | `SHENGHUOBANG_PRODUCT_BLUEPRINT.md` `V3_2_4_ACCEPTANCE_BASELINE.md` |
| DEC-005 | 2026-07-14 | 局域网地址只允许存在于本地忽略环境文件 `.env` 与 `.env.local`，不得写入受 Git 跟踪源码或公共配置。 | `SHENGHUOBANG_PRODUCT_BLUEPRINT.md` `V3_2_4_ACCEPTANCE_BASELINE.md` |
| DEC-006 | 2026-07-15 | 通知“全部已读”是已暴露给用户的真实操作，纳入 V3.2.4 `MUST_PASS / FULL_FLOW / 受控写操作验证`。 | `FEATURE_ACCEPTANCE_MATRIX.md` `V3_2_4_AUDIT_CHECKLIST.md` `ROUTE_API_TRACEABILITY.md` |
| DEC-007 | 2026-07-15 | 品牌级长期产品方向正式确认为 `生活妙招 / 生活认知 / 奇思妙想 / 互帮互助 / 未来可期`，当前 V3 平台主要归入“互帮互助”。 | `SHENGHUOBANG_MASTER_PLAN.md` `SHENGHUOBANG_PRODUCT_BLUEPRINT.md` |
| DEC-008 | 2026-07-15 | 当前 App 已向普通用户展示的页面、入口和操作，原则上属于 `MUST_PASS`；没有当前 UI 入口的后台、内部和运营能力属于 `CURRENT_STATE_ONLY`；未来未暴露功能属于 `NOT_REQUIRED`。 | `FEATURE_ACCEPTANCE_MATRIX.md` `V3_2_4_ACCEPTANCE_BASELINE.md` `PROCEDURE_INVENTORY.md` |
| DEC-009 | 2026-07-15 | 不因为某个后端 Procedure 存在，就在 V3.2.4 新增页面入口；`admin.changeRole`、`projects.pay`、`orders.pay` 仅执行权限、契约与审计审查。 | `PROCEDURE_INVENTORY.md` `ROLE_PERMISSION_MATRIX.md` `V3_2_4_AUDIT_CHECKLIST.md` |
| DEC-010 | 2026-07-17 | 批准 V3.2.4 冻结后的 R2 增补：只提供用户主动触发的前台一次性定位；允许手动地区降级；服务端最多保存约 1 公里精度偏好，只公开区域或整数公里近似距离；不启用后台定位、轨迹、其他用户坐标或生产位置分析。原 `v3.2.4-spec-freeze` 不移动，候选修订标签为待批准的 `v3.2.4-spec-freeze-r2`。 | `V3_2_4_SPEC_REVISION_R2.md` `V3_2_4_LOCATION_PRIVACY_R2.md` `FEATURE_ACCEPTANCE_MATRIX.md` `V3_2_4_AUDIT_CHECKLIST.md` |

## 3. 当前有效范围规则

- 审查优先于修复。
- 全量问题清单冻结优先于分批改动。
- V3.2.4 以“审查基线统一”和“体验收口”作为当前版本目标。
- 当前 App 已向普通用户展示的页面、入口和操作，原则上纳入 `MUST_PASS`。
- 没有当前 UI 入口的后台、内部和运营能力纳入 `CURRENT_STATE_ONLY`。
- 未来未暴露功能纳入 `NOT_REQUIRED`。
- 所有范围中的崩溃、越权、数据损坏和安全问题都必须处理。
- 不因为某个后端 Procedure 存在，就在 V3.2.4 新增页面入口。
- 长期产品蓝图与当前版本验收基线必须分开表达：
  - 产品蓝图定义最终方向。
  - V3.2.4 基线定义当前版本范围。
- 现有代码行为不等于正确产品标准。
