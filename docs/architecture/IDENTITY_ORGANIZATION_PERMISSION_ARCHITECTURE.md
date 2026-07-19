Document Status: ACTIVE
Spec Version: 2.0.0
Updated At: 2026-07-19
Source Baseline: Current users.role + user_profiles.currentRole + engineer/merchant verification model
Approved By: Product Direction Confirmed By User

# 身份、组织与数据权限目标架构

## 1. 设计目标

建立一套能承载创意、设计、生产、维修、流转和回收的权限骨架，同时避免两种错误：

- 为每个新业务不断向 `users.role` 增加固定角色。
- 为几十种行业身份复制相似权限和页面。

目标模型由六个相互独立的概念组成：账号、业务身份、认证资质、组织、项目角色和平台后台职务。

## 2. 六个核心概念

### Account：账号

账号只负责登录、安全、状态和个人基础资料，不直接等于设计师、商家或生产商。

### Business Identity：业务身份

一个账号可以同时拥有多个身份。第一批身份类型只建立可扩展目录，不一次性开发所有页面：

- `consumer`：普通用户，系统自动创建
- `designer`
- `engineer`
- `merchant`
- `repair_provider`
- `manufacturer`
- `supplier`
- `inspection_provider`
- `recycler`
- `enterprise_representative`

身份表示“以什么业务身份参与”，不代表已经认证，也不自动获得资源权限。

### Qualification：认证资质

认证与身份分离。统一状态：

`not_applied → pending → additional_info_required → approved / rejected → revoked / expired`

认证对象可以是个人身份，也可以是组织。认证类型通过目录扩展，例如实名、设计师能力、工程师能力、营业执照、生产许可、检测资质和回收资质。

### Organization：组织

工作室、门店、公司、工厂、检测机构、回收企业和企业客户都用组织表示。一个账号可加入多个组织，每个组织数据隔离。

组织成员状态：`invited / active / suspended / left / removed`。

组织角色使用少量模板和能力组合，而不是行业角色爆炸：

- owner
- admin
- project_manager
- business_operator
- technical_operator
- quality_operator
- finance_operator
- viewer

组织可创建自定义角色，但最终仍映射到能力目录。

### Project Role：项目角色

用户在具体项目中的角色独立于全局身份和组织岗位：

- initiator
- project_lead
- design_lead
- engineer
- supplier
- manufacturer
- inspector
- reviewer
- viewer

项目成员可来自个人身份或组织。项目角色只在该项目资源范围内生效。

### Platform Staff Assignment：平台职务

客服、审核、投诉、财务和安全人员使用独立后台职务，不写入业务身份。后台职务必须支持有效期、职责分离、停职和审计。

## 3. 权限模型

采用 **RBAC + ABAC + Data Scope + Field Mask**。

### RBAC：能力目录

角色只提供原则上的能力，例如：

- `idea.create`
- `idea.view_confidential`
- `project.member.invite`
- `project.design.upload`
- `project.milestone.submit`
- `project.milestone.accept`
- `organization.member.manage`
- `rfq.quote.submit`
- `production.batch.record`
- `product.passport.read_internal`
- `recycling.dismantlement.record`
- `verification.review.initial`
- `fund.release.execute`

### ABAC：条件

能力存在后还必须检查：

- 账号是否有效
- 当前业务身份和认证状态
- 是否属于指定组织
- 是否为项目成员及其项目角色
- 是否为资源所有者或被分配执行人
- 资源当前状态是否允许该动作
- 资源保密级别和 NDA 是否允许
- 是否存在投诉冻结、支付冻结或版本冻结
- 是否违反职责分离

### Data Scope：数据范围

标准数据范围：

- `SELF`
- `OWNED_RESOURCE`
- `PROJECT`
- `ORGANIZATION`
- `ASSIGNED_CASES`
- `CITY_OR_REGION`
- `PLATFORM_LIMITED`
- `PLATFORM_ALL`（仅极少后台职务）

### Field Mask：字段级脱敏

权限结果可附带字段掩码，例如：

- 历史所有者姓名、手机号和地址始终隐藏
- 生产商不可查看竞争生产商报价
- 设计师不可查看供应商底价和财务结算账户
- 回收商只看到履约所需位置，不看到不相关交易历史
- 普通用户只看到公开质检和维修摘要

## 4. 统一授权决策接口

每次高风险读写都调用服务端授权服务：

```text
authorize({
  subject: account + identities + memberships + projectRoles + staffAssignments,
  action: capabilityCode,
  resource: type + id + ownerId + organizationId + projectId + state + confidentiality,
  context: selectedWorkspace + requestPurpose + client + time
})
```

返回：

```text
allow / deny
reasonCode
matchedPolicy
resolvedDataScope
fieldMask
requiresStepUp
```

### 判定顺序

1. 账号状态和会话安全
2. 明确拒绝和资源冻结
3. 平台后台职务（只处理被授权业务）
4. 资源所有权
5. 组织成员关系和组织能力
6. 项目成员关系和项目能力
7. 业务状态、保密级别和 NDA
8. 职责分离与二次确认
9. 默认拒绝

所有拒绝必须返回稳定 `reasonCode`，客户端不能用字符串猜测权限原因。

## 5. 目标数据表

V3.3-A 采用追加迁移，建议新增：

| 表 | 作用 |
|---|---|
| `business_identities` | 账号的多业务身份及状态 |
| `identity_profiles` | 身份显示资料和专业信息，避免继续扩张 user_profiles |
| `qualification_types` | 可扩展认证类型目录 |
| `qualifications` | 个人身份或组织的认证申请与结果 |
| `qualification_documents` | 认证材料 |
| `qualification_actions` | 审核过程日志 |
| `organizations` | 工作室、门店、企业、工厂、机构 |
| `organization_memberships` | 成员关系和生命周期 |
| `organization_invitations` | 邀请、接受、过期和撤销 |
| `organization_roles` | 内置或组织自定义角色 |
| `capabilities` | 能力目录 |
| `organization_role_capabilities` | 组织角色到能力映射 |
| `organization_member_roles` | 成员角色分配 |
| `project_members` | 项目成员、来源组织和状态 |
| `project_member_roles` | 项目角色和能力扩展 |
| `platform_staff_assignments` | 平台后台职务、有效期和状态 |
| `workspace_preferences` | 当前个人/组织/专业工作台选择 |
| `authorization_audit_logs` | 高风险允许/拒绝和权限变更审计 |

V3.3-A 不建立生产、回收等完整业务表，只确保未来可通过身份类型、组织类型、项目角色和能力目录扩展。

## 6. 当前模型到目标模型迁移

| 当前字段/表 | 目标归属 | 迁移方式 |
|---|---|---|
| `users.role=user` | 普通账号 | 保持兼容；普通用户身份自动回填 |
| `users.role` 后台值 | `platform_staff_assignments` | 生成对应职务；旧字段双读后退役 |
| `user_profiles.currentRole` | `workspace_preferences` | 作为初始工作台选择回填 |
| `engineerStatus` | `business_identities + qualifications` | 回填 engineer 身份与认证状态 |
| `merchantStatus` | `business_identities + qualifications` | 回填 merchant 身份与认证状态 |
| `engineer_profiles` | `identity_profiles` | 保持旧表适配器，逐字段迁移 |
| `merchant_profiles` | 个人 merchant 身份或 organization | 根据资料和后续用户选择迁移 |
| 三套 verification 表 | 通用 qualifications | 先兼容读取，再迁移和停写 |
| `projects.ownerId/engineerId` | `project_members` | 回填 initiator/engineer 成员；旧字段保留至 V3.3-B 稳定 |
| 路由中的直接 ID 比较 | authorization service | 逐路由替换，默认拒绝 |
| `adminProcedure` | capability procedure | 保留兼容入口，按后台职务能力收敛 |

## 7. 职责分离

至少落实以下不可兼任规则：

- 交付提交者不能验收自己的交付。
- 认证初审和终审不能由同一人完成高风险认证。
- 投诉调查和最终裁定应分离。
- 财务审核和资金执行应分离。
- 权限管理员不能给自己授予超级管理员。
- 组织财务人员不能修改技术交付内容。

## 8. 离职、停职和权限回收

- 组织成员停职后立即失去组织数据写权限，进行中的任务进入待重新分配。
- 退出组织不删除历史署名和审计，但不能继续访问组织私密文件。
- 项目成员移除后，其历史提交保留；访问令牌和文件签名立即失效。
- 认证撤销只取消依赖该认证的能力，不删除身份和历史履约。
- 权限变更必须记录操作者、原因、变更前后、作用范围和时间。

## 9. 客户端工作台与安全边界

工作台切换只改变导航、默认筛选和当前组织上下文，不是授权来源。服务端每次请求都重新解析有效身份、成员关系、资源状态和数据范围。客户端不得缓存可绕过服务端的角色判断。
