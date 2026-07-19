Document Status: FROZEN
Spec Version: 0.6.0
Updated At: 2026-07-15
Code Baseline Commit: 34f96defd6fa82274730fcb22ae8aeca560353f5
Approved By: User Approved
Replaces: None
Change Summary: 同步 DEC-008：当前用户可达的报价、项目、里程碑、文件、退款、投诉和认证状态机升级为 MUST_PASS
Revision Addendum: R2 CANDIDATE（新增前台位置权限状态机）
Revision Baseline Commit: 05c0a9751978760448174cc1b7f8b5638358c8af

# 领域状态机

## 1. 说明

- 本文档从当前 `schema`、`routers`、`services` 和测试中提取状态机，不凭空编造。
- 为控制篇幅，每个领域以“主状态表”表达核心状态与动作；更细的实现差异以后端代码为准。
- 标记为 `MUST_PASS` 的退款、投诉和认证状态机，当前只对用户已暴露动作执行完整验证；后台审核、财务和运营动作按 `DEC-009` 仅做权限、契约、审计与已有自动化审查。
- “V3.2.4 是否必须验证”只允许：
  - `MUST_PASS`
  - `CURRENT_STATE_ONLY`
  - `NOT_REQUIRED`

## 2. 状态机总表

| 领域 | 状态 | 中文文案 | 可执行动作 | 执行角色 | 下一状态 | 禁止动作 | 幂等要求 | 失败处理 | 终态 | 对应接口 | 对应测试 | V3.2.4 是否必须验证 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 需求 | `draft / published / collecting_solutions / selecting_quote / project_created / solved / closed` | 草稿/已发布/收集方案/选报价/已转项目/已解决/已关闭 | 创建、更新、发布、评论、支持、关闭、标记解决 | 普通用户、工程师 | 按业务流转 | 未发布前正式协作、终态后重复修改 | 需求创建与状态变更应避免重复生效 | 保留草稿或返回失败提示 | `solved` `closed` | `needs.*` | `v31-workflows.test.ts` | MUST_PASS |
| 报价 | `submitted / accepted / not_selected / rejected` + 版本历史 | 已提交/已接受/未选中/已拒绝 | 提交方案、提交报价、创建新版本、接受、拒绝 | 工程师、普通用户 | 项目创建或终止 | 未认证工程师正式报价、重复接受 | 版本创建与接受应保持幂等 | 失败时保留原状态 | `accepted` `not_selected` `rejected` | `quotes.*` | `v31-workflows.test.ts` | MUST_PASS |
| 项目 | `pending_confirmation / pending_agreement / pending_payment / in_progress / waiting_acceptance / revision / disputed / completed / cancelled` | 待确认/待协议/待付款/进行中/待验收/修改中/争议中/已完成/已取消 | 确认协议、进入支付、推进履约、发起争议 | 项目成员 | 按项目流转 | 非成员操作、越过状态直接改终态 | 关键状态变化应事务化 | 失败时保持前一合法状态 | `completed` `cancelled` | `projects.*` | `v31-workflows.test.ts` `test-v31-2-integration.ts` | MUST_PASS |
| 里程碑 | `pending / in_progress / waiting_acceptance / revision_required / accepted / disputed` | 待开始/进行中/待验收/需改稿/已验收/争议中 | 提交交付、验收、要求修改、进入投诉 | 工程师、普通用户 | 按里程碑流转 | 非成员越权提交或验收 | 交付与验收需防重复提交 | 失败时保持原状态并提示 | `accepted` | `projects.submitMilestone` `acceptMilestone` `requestRevision` | `v31-workflows.test.ts` | MUST_PASS |
| 文件 | `uploaded / disabled / blocked` | 已上传/已停用/已阻止 | 上传、停用、签名访问 | 项目成员、审核方 | 受当前文件状态限制 | 非成员访问、绕过签名访问 | 访问与投递要留痕 | 失败时拒绝访问并记录 | `disabled` `blocked` | `projects.uploadFile` `disableFile` `fileAccessUrl` | `v321-security.test.ts` `test-v32-runtime.ts` | MUST_PASS |
| 物品 | `idle / listed / reserved / sold / swapped / given_away / recycled` | 空闲/已上架/已保留/已售/已置换/已赠送/已回收 | 创建、上架、下架、成交、回收、置换 | 普通用户 | 按物品流转 | 已终态继续交易 | 所有权与状态历史需追加 | 失败时回滚到合法前态 | `sold` `swapped` `given_away` `recycled` | `items.*` `listings.*` | `test-v32-integration.ts` | MUST_PASS |
| 发布 | `draft / published / closed / removed` | 草稿/已发布/已关闭/已移除 | 保存、发布、关闭、重开、删除 | 卖家 | 按发布流转 | 非归属者操作、交易中错误删除 | 关闭/重开/删除要防重复 | 失败时保持当前状态 | `removed` | `listings.save` `close` `reopen` `remove` | `test-v32-integration.ts` | MUST_PASS |
| 置换 | `submitted / awaiting_confirmations / rejected / cancelled / completed` | 已提交/待双方确认/已拒绝/已取消/已完成 | 创建、接受、拒绝、取消、确认 | 置换双方 | 按置换流转 | 非参与方操作 | `dedupeKey` 与状态更新需防重复 | 失败时不重复改变物品所有权 | `rejected` `cancelled` `completed` | `swaps.*` | `test-v32-integration.ts` | MUST_PASS |
| 回收询价 | `quoting / cancelled / selected` | 询价中/已取消/已选中报价 | 创建、取消、选择报价 | 普通用户 | 按询价流转 | 非发起人取消或选报价 | 选择报价应避免重复生成承接 | 失败时保留当前报价集 | `cancelled` `selected` | `recycling.create` `cancel` `selectQuote` | `test-v32-integration.ts` | MUST_PASS |
| 回收报价 | `submitted / declined / selected` | 已提交/已拒绝/已选中 | 提交报价、拒绝、被选中 | 商家、普通用户 | 按报价流转 | 未认证商家报价 | 单报价不应重复提交同一结果 | 失败时保持原状态 | `declined` `selected` | `recycling.submitQuote` `declineQuote` `selectQuote` | `test-v32-integration.ts` | MUST_PASS |
| 订单 | `pending_confirmation / pending_payment / paid / pending_delivery / pending_acceptance / completed / cancelled / refunding / partially_refunded / refunded / disputed / closed` | 待确认/待付款/已付款/待交付/待收货/已完成/已取消/退款中/部分退款/已退款/争议中/已关闭 | 下单、支付、交付、收货、取消、退款、评价 | 订单参与方 | 按订单流转 | 越权改变终态 | 订单状态和支付/退款联动要幂等 | 失败时保持账本一致 | `completed` `cancelled` `refunded` `closed` | `orders.*` `payments.*` `refunds.*` | `test-v31-1-integration.ts` `test-v31-2-integration.ts` | MUST_PASS |
| 支付 | `created / pending / success / failed / cancelled` | 已创建/处理中/成功/失败/已取消 | 创建支付单、沙箱确认、回调处理 | 买方、系统 | 按支付流转 | 重复确认成功 | 支付确认必须幂等 | 失败时不重复入账 | `success` `failed` `cancelled` | `payments.create` `confirmSandbox` | `v31-workflows.test.ts` | NOT_REQUIRED |
| 退款 | `submitted / approved / rejected / processing / success / failed` | 已提交/已批准/已拒绝/处理中/成功/失败 | 提交退款、审核、执行、重试 | 买方、财务 | 按退款流转 | 未经审核直接执行 | 审核和执行都要幂等 | 失败时记录 attempt 并允许重试 | `rejected` `success` `failed` | `refunds.submit` `adminFinance.*` | `test-v31-1-integration.ts` `test-v31-2-integration.ts` | MUST_PASS |
| 投诉 | `submitted / waiting_response / under_review / waiting_evidence / negotiating / decision_pending / resolved / rejected / withdrawn / closed` | 已提交/待回应/审核中/待补证/协商中/待裁定/已解决/已驳回/已撤回/已关闭 | 发起投诉、回应、补证、催证、协商、裁定、关闭 | 相关用户、运营 | 按投诉流转 | 非相关方操作、绕过裁定直接恢复业务 | 冻结与裁定必须事务化 | 失败时保持冻结与账本一致 | `resolved` `rejected` `withdrawn` `closed` | `complaints.*` `adminComplaints.*` | `test-v31-1-integration.ts` `test-v31-2-integration.ts` | MUST_PASS |
| 认证 | `draft / submitted / under_review / additional_info_required / approved / rejected / revoked / expired` | 草稿/已提交/审核中/待补充/已通过/已拒绝/已撤销/已过期 | 提交、补充、审核通过、退回、拒绝、撤销 | 用户、审核角色 | 按认证流转 | 未经审核直接成为有效身份 | 审核动作应防重复变更角色资格 | 失败时保留原资格 | `approved` `rejected` `revoked` `expired` | `profile.apply*` `verifications.*` `adminVerifications.*` | `v31-workflows.test.ts` `v321-security.test.ts` | MUST_PASS |
| 消息 | `sent / delivered / read / failed` | 已发送/已送达/已读/失败 | 发送、回执、标记已读、重试 | 会话成员 | 按消息流转 | 非成员访问、重复发送同一客户端消息 | `clientMessageId` 必须幂等 | 失败时保留重试能力 | `read` `failed` | `messagesRouter.*` | `test-v32-integration.ts` `test-v32-runtime.ts` | MUST_PASS |
| 通知 | `isRead=false/true` + 投递 `pending / sent / failed / skipped` | 未读/已读 + 待投递/已发送/失败/跳过 | 创建通知、标记已读、推送重试、停用无效 Token | 系统、用户 | 按通知流转 | 非归属用户读取、重复发同一业务通知 | `dedupeKey`、投递重试和 Token 禁用要幂等 | 失败时记录并重试或停用 Token | 已读终态、投递 sent/failed/skipped | `messagesRouter.notifications` `markRead` `push.*` | `v322-product-polish.test.ts` `v323-mobile-readiness.test.ts` | MUST_PASS |
| 位置权限 | `not_asked / requesting / granted / denied / permanently_denied / services_disabled` + 获取 `idle / acquiring / success / failed / manual` | 未询问/请求中/已允许/已拒绝/永久拒绝/系统定位关闭 + 空闲/获取中/成功/失败/手动地区 | 用户确认后请求、重新定位、打开设置、手动地区、清理偏好 | 当前用户 | 按系统权限和用户选择流转 | 冷启动自动申请、后台定位、修改他人位置、公开坐标 | 偏好按 userId 唯一 upsert | 失败时保留浏览能力并允许手动地区或重试 | `manual` 为稳定降级；权限可由系统设置再次变化 | `location.*`、附近查询 | `location-foundation.test.ts` `test-location-integration.ts` | MUST_PASS |
