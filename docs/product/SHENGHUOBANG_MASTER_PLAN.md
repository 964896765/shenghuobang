Document Status: FROZEN
Spec Version: 0.7.0
Updated At: 2026-07-15
Code Baseline Commit: 34f96defd6fa82274730fcb22ae8aeca560353f5
Approved By: User Approved
Replaces: None
Change Summary: 移除已由 DEC-007/008/009 解决的未决事项，并保留真正需要后续版本决定的边界

# 生活帮总控计划

## 1. 文档定位

- 本文件是 Codex 后续执行生活帮所有任务时首先阅读的唯一入口。
- 本文件不复制详细矩阵内容，只负责总控索引、当前阶段、优先级、工作方式和未决事项。
- 当前状态为 `DRAFT`，待用户确认后方可进入 `FROZEN`。

## 2. 产品最终目标摘要

- 建立一个围绕生活需求撮合、专业服务履约、二手物品流转、回收与置换的可追溯平台。
- 保证业务状态受控、权限以后端为准、资金与审计留痕、移动端体验可验收。
- 用统一产品参照和审查体系支撑后续全程序审查、问题冻结与分批修复。

## 3. 用户角色摘要

- 未登录访客
- 普通用户
- 工程师申请中 / 已认证工程师
- 商家申请中 / 已认证商家或回收方
- 运营角色
- 审核角色
- 财务角色
- 审计角色
- 管理员

## 4. 业务模块摘要

- 账号与个人资料
- 首页与发现
- 搜索
- 需求、方案、报价、项目、里程碑、文件
- 物品发布、管理、一口价、置换、回收
- 订单、支付、退款、投诉
- 消息、通知
- 认证、信用、后台权限、财务与审计

## 5. 当前阶段

- 当前阶段：`V3.2.4 全量审查与体验收口准备`
- 当前目标：
  - 冻结产品标准
  - 冻结 V3.2.4 审查基线
  - 完成路由、接口、权限、状态机双向追踪
  - 为后续全程序审查做准备
- 当前限制：
  - 不修改业务代码
  - 不开始问题修复
  - 不执行真机写操作
  - 不执行数据库写操作

## 6. 品牌级长期产品方向

- `生活妙招`：经验与方法的沉淀。
- `生活认知`：规律与认知的总结。
- `奇思妙想`：想法验证与可能世界。
- `互帮互助`：理解、沟通、需求服务与资源流通。
- `未来可期`：决策、执行与个人发展。
- 当前需求、工程师、旧物、置换和回收平台，主要归入 `互帮互助`。
- 上述方向属于已确认的长期顶层产品方向，不直接计入 V3.2.4 未实现缺陷。

## 7. 版本路线摘要

- `V3.2.4`：全量审查、Android 真机验收、问题冻结、体验收口
- `V3.2.5`：发布候选与产品合规
- `V3.2.6`：云端测试环境
- `V3.2.7`：云存储与正式 Push
- `V3.3.0`：金额迁移
- `V3.3.1`：正式支付
- `V3.4 / V4.0`：赠送、捐赠、租借、拍卖、新品共创与运营后台

## 8. 文档优先级

1. 用户最新明确决定
2. `PRODUCT_DECISION_LOG.md`
3. `SHENGHUOBANG_PRODUCT_BLUEPRINT.md`
4. `V3_2_4_ACCEPTANCE_BASELINE.md`
5. `FEATURE_ACCEPTANCE_MATRIX.md`
6. `USER_FLOW_MAP.md`
7. `UI_UX_STANDARD.md`
8. 当前阶段任务书
9. `README.md` 与 `todo.md`
10. 历史阶段文档
11. 现有代码行为

## 9. 详细规范文件

- [产品决策记录](./PRODUCT_DECISION_LOG.md)
- [产品蓝图](./SHENGHUOBANG_PRODUCT_BLUEPRINT.md)
- [产品路线图](./PRODUCT_ROADMAP.md)
- [角色权限矩阵](./ROLE_PERMISSION_MATRIX.md)
- [领域状态机](./DOMAIN_STATE_MACHINES.md)
- [功能验收矩阵](./FEATURE_ACCEPTANCE_MATRIX.md)
- [Procedure 全量清单](./PROCEDURE_INVENTORY.md)
- [用户流程图](./USER_FLOW_MAP.md)
- [UI / UX 标准](./UI_UX_STANDARD.md)
- [路由与接口追踪表](./ROUTE_API_TRACEABILITY.md)
- [V3.2.4 验收基线](../releases/V3_2_4_ACCEPTANCE_BASELINE.md)
- [V3.2.4 审查清单](../testing/V3_2_4_AUDIT_CHECKLIST.md)
- [V3.2.4 初始差距分析](../testing/V3_2_4_INITIAL_GAP_ANALYSIS.md)

## 10. 当前未决策事项

- UI 量化标准中的少数边界值是否最终确认
- 后台高风险能力未来是否、何时提供正式运营 UI（V3.2.4 已决定不新增入口）

## 11. 当前禁止扩展事项

- 在 DRAFT 阶段直接新增业务范围
- 在审查阶段发现问题立即修复
- 把个人局域网地址写入受 Git 跟踪文档
- 把 FUTURE 或 NEXT_RELEASE 能力直接计入 V3.2.4 缺陷

## 12. 审查与修复工作方式

- 先完成全程序审查，再统一冻结问题清单，然后逐批修复。
- 审查阶段只登记差距、证据和优先级，不直接进入修复。
- 文档冻结后，任何范围变化必须先写入 `PRODUCT_DECISION_LOG.md`。
