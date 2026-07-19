Document Status: ACTIVE
Spec Version: 1.0.0
Updated At: 2026-07-19
Approved By: Product Direction Confirmed By User

# 生活帮核心领域整合蓝图

## 1. 为什么需要统一领域骨架

生活帮最终包含生活服务、创意协作、生产、交易、维修、易手、回收和材料再利用。若每个功能各自建立账号、成员、文件、订单、资金和消息，将产生重复数据、状态冲突和越权风险。

统一骨架要求所有新模块围绕以下核心对象扩展：

- Account：账号；
- Business Identity：业务身份；
- Qualification：认证资质；
- Organization：组织；
- Project：协作项目；
- Item / Product Instance：物品或单件产品；
- Listing / Need / Idea / RFQ：市场与协作入口；
- Order：履约主单；
- Financial Ledger：支付、退款、托管和结算；
- File：文件及访问授权；
- Conversation / Notification：沟通与通知；
- Audit / Complaint：审计与争议治理。

## 2. 最终对象关系

```text
Account
├─ BusinessIdentity *
├─ Qualification *
├─ OrganizationMembership *
├─ ProjectMembership *
├─ WorkspacePreference
└─ PlatformStaffAssignment *

Organization
├─ Membership *
├─ Role / Capability *
├─ Qualification *
├─ ProjectParticipation *
├─ RFQ / Quote / ProductionOrder *
└─ Asset / ProductInstance *

Idea
├─ VisibilityGrant / NDA
├─ InterestRegistration *
└─ converts to Project

Project
├─ ProjectMember *
├─ Requirement / Change *
├─ Milestone *
├─ File / DesignVersion *
├─ Acceptance *
├─ RFQ *
└─ may produce ProductModel

ProductModel
├─ DesignRelease *
├─ BOMVersion *
├─ ProductionBatch *
└─ ProductInstance *

ProductInstance / Item
├─ OwnershipHistory *
├─ ServiceHistory *
├─ ConditionAssessment *
├─ Listing *
├─ Order *
├─ Refurbishment *
└─ RecyclingCase *

RecyclingCase
├─ Quote / Reinspection / Handover
├─ DismantlementBatch
├─ ReusablePartInstance *
└─ RecycledMaterialBatch *
```

“*”表示一对多。所有关系必须保留历史，不允许用静默覆盖抹除关键事实。

## 3. 八个共享底座

### 3.1 账号、身份与组织

任何业务参与者都从账号进入，通过身份表达专业方向，通过认证证明资质，通过组织表达多人经营主体。不得在业务表中新增 `isDesigner`、`isManufacturer` 等布尔字段作为授权来源。

### 3.2 项目与任务

创意、设计、原型、定制维修和生产准备都复用统一 Project。项目不是订单的替代品：

- Project 管协作范围、成员、任务、版本、文件和验收；
- Order 管价格、履约、交接、售后和资金；
- 两者可以关联，但状态机独立。

### 3.3 物品与产品实例

现有 `items` 是普通用户物品主档。V4.2 增加产品型号和单件身份后：

- 普通低价值物品可以继续只使用 item；
- 高价值或可追踪产品绑定 product instance；
- 新品从生产批次自动生成实例；
- 旧物可补建或由认证机构验证后绑定实例；
- listing 只表示“当前如何流转”，不保存完整产品历史。

### 3.4 统一订单

出售、置换、维修、租赁、回收、项目阶段款和生产采购应复用统一订单骨架，通过业务类型和订单明细扩展。禁止为每个模块另造完全独立的支付状态。

订单至少关联：

- 买卖/委托双方主体；
- 个人身份或组织；
- 来源资源；
- 金额快照；
- 交付方式；
- 状态历史；
- 投诉和售后；
- 支付/托管/退款/结算。

### 3.5 文件与保密

所有设计图、原型资料、合同、报价附件、质检报告和回收证明进入统一存储和访问审计。

文件访问由以下条件共同决定：

- 文件所属资源；
- 项目/组织成员关系；
- 保密级别；
- NDA 状态；
- 当前业务状态；
- 文件是否撤销或被新版本取代；
- 用户访问目的；
- 短签名有效期。

### 3.6 消息和通知

消息可关联需求、报价、项目、订单、组织、生产订单或回收任务。通知只包含最少必要摘要，敏感资源无权后不得通过通知泄露标题、附件名、报价或参与者。

### 3.7 资金和账本

全部金额使用整数分和统一账本。业务模块只创建资金意图，不直接修改支付成功状态。正式资金由支付、退款、托管、结算和对账服务处理。

### 3.8 审计、投诉与职责分离

认证、权限变更、文件访问、报价比较、验收、质检、资金和回收去向必须留下审计。投诉调查与裁定、财务审核与执行、认证初审与复审必须分离。

## 4. 三层产品如何共享对象

| 产品层 | 入口对象 | 核心协作对象 | 履约对象 | 事实沉淀 |
|---|---|---|---|---|
| 生活服务与资源流转 | need/listing/recycling request | conversation/quote | order | item/ownership/service history |
| 创意落地与新品孵化 | idea | project/milestone/design version | project order/stage payment | product model/design release |
| 产品生命周期与产业链 | RFQ/product instance/recycling case | organization/project/production batch | procurement/service/recycling order | passport/material provenance |

## 5. 从当前代码到目标架构

### 5.1 直接保留

- `needs`、`need_comments`、`solutions`；
- `quotes`、`quote_versions`；
- `projects`、`milestones`、`project_requirements`、`project_changes`、`project_acceptances`；
- `project_files`、`stored_files`、`file_access_logs`；
- `items`、`item_media`、`item_defects`、`item_accessories`；
- `item_ownership_history`、`item_service_history`、`item_status_logs`；
- `listings`、`offers`、`giveaway_applications`、`swap_requests`；
- `recycling_requests`、`recycling_quotes`；
- `orders`、`order_status_logs`；
- `conversations`、`messages`、`notifications`；
- `payments`、`refunds`、`escrow_records`、`settlements`；
- `complaints` 和 `audit_logs`。

### 5.2 追加抽象

- `users` 保留为 Account；
- `user_profiles.currentRole` 降级为工作台偏好兼容字段；
- `engineer_profiles`、`merchant_profiles` 通过 identity profile 适配；
- 三套 verification 表迁入统一 qualification；
- `projects.ownerId/engineerId` 兼容回填 project member；
- `items` 可选关联 product model/product instance；
- 回收基础表后续扩展复检、交接、拆解和材料批次。

### 5.3 新增领域

V3.3-A：身份、认证、组织、成员、能力、项目成员、平台职务。

V3.3-B：创意、可见范围、邀请、NDA、意向登记、设计版本元数据。

V4.1：RFQ、生产报价、设计发布、BOM、生产订单、批次、质检、工程变更。

V4.2：产品型号、实例、质保、所有权声明、成色/折损/估值、部件、翻新。

V4.3：回收任务、复检、交接、拆解、零件实例、再生材料批次、材料去向。

## 6. 数据所有权与隔离边界

每张新增业务表必须至少明确以下归属字段中的一种或多种：

- `ownerAccountId`；
- `subjectIdentityId`；
- `organizationId`；
- `projectId`；
- `productInstanceId`；
- `orderId`；
- `assignedCaseId`。

不得建立没有明确数据归属的专业业务记录。服务端查询必须先解析数据范围，再执行过滤，不能先取全量数据后在客户端隐藏。

## 7. 跨阶段状态连接

### 创意到项目

idea 发布不自动生成项目；只有发起人确认协作者、范围和保密条件后，执行幂等 `convertToProject`，写入来源关联和初始项目成员。

### 项目到生产

项目设计达到冻结条件后创建 design release。RFQ、BOM 和生产订单只能引用已发布版本，不直接引用可编辑草稿。

### 生产到产品实例

合格批次根据型号、批次和序列策略幂等生成实例。质检不合格或报废记录不得生成可销售实例。

### 产品实例到流转

listing/order 只改变流转和所有权，不覆盖生产、维修和质检历史。所有权转移需有效订单或经验证交接。

### 产品实例到回收材料

回收交接后进入拆解；拆解产出零件或材料批次；材料进入新产品时建立来源关联，不回写覆盖原产品记录。

## 8. 统一验收原则

任何新模块必须通过以下整合检查：

- 是否复用了 Account/Identity/Organization，而不是新增独立用户体系；
- 是否复用了 Project/Order/File/Message/Ledger/Audit；
- 是否有明确资源归属和服务端权限；
- 是否保留状态和版本历史；
- 是否能从最终结果反向追踪到来源；
- 是否能在身份停职、成员退出和权限撤销后立即失效；
- 是否避免向普通用户暴露专业内部字段。
