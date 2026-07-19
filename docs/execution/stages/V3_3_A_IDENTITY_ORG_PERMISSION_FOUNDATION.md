Document Status: NEXT
Spec Version: 2.0.0
Updated At: 2026-07-19
Source Baseline: V3.2.4 stable business baseline + V3.3.0 amount foundation
Approved By: Product Direction Confirmed By User

# V3.3-A 多身份、组织与数据权限基础工程

## 1. 阶段目标

在不破坏现有普通用户、工程师、商家、旧物、回收和项目流程的前提下，将当前固定角色模型升级为：

账号 + 多业务身份 + 独立认证 + 组织成员关系 + 项目角色 + 能力权限 + 数据范围 + 字段脱敏 + 平台后台职务。

本阶段结束后必须能用一个账号创建多个身份、加入多个组织、参与多成员项目，并在成员停职或退出后立即回收权限。

## 2. 当前问题

- `user_profiles.currentRole` 只能三选一。
- `engineerStatus/merchantStatus` 混合身份和认证状态。
- `users.role` 同时承担普通用户和后台职务。
- `merchant_profiles` 无法表达门店、工厂及其员工。
- `projects.ownerId + engineerId` 只能支持双人项目。
- 路由使用直接 ID 比较，缺少统一能力、数据范围和字段掩码。

## 3. 阶段范围

### 必须完成

1. 多业务身份及当前工作台上下文。
2. 通用个人/组织认证模型和统一状态。
3. 组织、成员、邀请、角色、停职、退出和移除。
4. 项目成员和项目角色。
5. 能力目录、组织角色能力和授权决策服务。
6. 数据范围与敏感字段脱敏。
7. 平台后台职务、有效期和职责分离基础。
8. 权限变更、敏感访问和授权拒绝审计。
9. 旧工程师、商家、认证、项目和后台角色的兼容迁移。
10. “我的身份/我的组织/切换工作台”的最小 UI。

### 明确不做

- 不做完整生产商、供应商、回收商业务页面。
- 不做创意落地业务实体和流程（属于 V3.3-B）。
- 不删除旧角色字段和三套认证表。
- 不接真实支付。
- 不允许客户端角色判断替代服务端授权。

## 4. 数据模型

追加表及字段以 [身份组织权限架构](../../architecture/IDENTITY_ORGANIZATION_PERMISSION_ARCHITECTURE.md) 为准。迁移必须：

- 只新增，不破坏旧表。
- 每个旧账号回填 `consumer` 身份。
- 工程师/商家资料回填对应身份和认证。
- 后台角色回填平台职务。
- 现有项目回填 initiator 和 engineer 项目成员。
- 提供逐表数量、冲突和无法确定记录报告。
- 可重复执行且不会产生重复身份、成员或职务。

## 5. 服务端能力

### 新增核心服务

- `IdentityService`
- `QualificationService`
- `OrganizationService`
- `ProjectMembershipService`
- `AuthorizationService`
- `WorkspaceContextService`
- `PlatformStaffService`
- `SensitiveDataMaskService`

### 建议 API

```text
identity.listMine
identity.create
identity.activate / suspend
workspace.listAvailable
workspace.switch
qualification.listMine
qualification.submit / resubmit
organization.create
organization.get
organization.listMine
organization.invitation.create / accept / decline / revoke
organization.member.list / suspend / restore / remove / leave
organization.role.list / create / assign / revoke
project.member.list / invite / accept / remove
project.member.role.assign / revoke
authorization.explainMine
platformStaff.assign / suspend / revoke
```

后台职务接口必须使用能力型 Procedure，不得仅检查 `role === admin`。

## 6. 第一批能力目录

### 个人与身份

`identity.create`、`identity.view_self`、`identity.switch_workspace`、`qualification.submit_self`

### 组织

`organization.create`、`organization.view`、`organization.update`、`organization.member.invite`、`organization.member.manage`、`organization.role.manage`、`organization.billing.view`

### 项目

`project.view`、`project.member.invite`、`project.member.manage`、`project.requirement.edit`、`project.file.upload`、`project.file.read_confidential`、`project.milestone.submit`、`project.milestone.accept`

### 平台

`verification.review.initial`、`verification.review.final`、`complaint.investigate`、`complaint.decide`、`fund.review`、`fund.execute`、`security.audit`、`permission.administer`

## 7. 授权规则最低要求

- 默认拒绝，未注册能力不得放行。
- 工作台切换不自动授予权限。
- 用户必须是组织有效成员才能读取组织私密数据。
- 被停职、退出或移除后，旧文件签名和会话内权限立即失效。
- 项目文件必须检查项目成员、文件保密级别和项目状态。
- 交付提交者不能执行同一交付的验收。
- 认证初审与终审、投诉调查与裁定、资金审核与执行不可由同一职务完成。
- 权限管理员不可提升自己的平台职务。

## 8. 客户端最小 UI

### 我的身份

- 当前普通用户身份
- 已创建身份和认证状态
- 申请设计师/工程师/商家身份的入口
- 认证与身份状态分别展示

### 我的组织

- 创建组织
- 我加入的组织
- 成员、邀请和我的岗位
- 退出组织

### 工作台切换

- 个人模式
- 专业身份模式
- 组织工作台
- 只显示当前具有有效访问条件的工作台

本阶段不为每种身份复制首页。工作台仅提供标题、上下文、可用入口和待办摘要。

## 9. 七个执行批次

### A1：规格与权限威胁模型

输出数据模型、能力目录、授权判定、字段脱敏、职责分离、状态机、路由改造清单和测试矩阵。不得修改业务代码。

### A2：追加迁移与回填

新增表、索引和约束；实现空库迁移、V3.2.4 升级、可重复回填、冲突报告和恢复脚本。

### A3：授权内核与兼容适配器

实现授权服务、权限 Procedure、工作台上下文和兼容读取。优先改造项目文件、项目详情、组织成员和后台高风险接口。

### A4：身份、认证和组织服务

完成身份、通用认证、组织、邀请、成员、角色、停职、退出和审计 API。

### A5：项目成员与最小 UI

现有项目接入 `project_members`；完成身份、组织和工作台页面。旧工程师/商家页面继续可用。

### A6：越权、安全和迁移验证

完成单元、集成、并发、越权、签名撤权、职责分离和迁移重跑测试。

### A7：真机验收与交付

验证普通用户旧流程无回归、多身份切换、组织邀请、停职回收、项目成员和后台职责分离；输出报告和源码包。

## 10. 必须改造的第一批现有接口

| 当前接口区域 | 改造目标 |
|---|---|
| `profile.switchRole` | 迁移为工作台选择兼容入口，不负责授权 |
| `projects.detail` | 从 owner/engineer 判断改为项目成员和能力判定 |
| `projects.uploadFile/fileAccessUrl/disableFile` | 加入项目成员、保密级别、文件状态和签名撤权 |
| `projects.submit/accept milestone` | 加入任务分配和提交者不可自验收 |
| `verifications` | 建立通用认证适配层 |
| `adminProcedure` 高风险路由 | 改为平台职务能力和职责分离 |
| `messages.start/read` | 为后续组织/项目频道预留资源授权 |

## 11. 测试门禁

- 旧账号全部有且仅有一个 consumer 身份。
- 已认证工程师/商家迁移结果与旧状态一致。
- 同一账号可以拥有多个身份且不会复制账号。
- 同一账号加入两个组织，数据严格隔离。
- 邀请重复、并发接受和过期处理幂等。
- 停职、退出、移除后写权限即时失效。
- 项目非成员无法读详情和文件。
- 受邀查看者只读，不能上传、变更或验收。
- 提交者不能验收自己的交付。
- 后台职责分离规则不可绕过。
- 权限拒绝包含稳定 reasonCode 并写审计（敏感接口）。
- 现有需求、报价、项目、旧物、回收、订单和登录流程无回归。

## 12. 完成定义

只有 A1-A7 全部通过才可进入 V3.3-B。任何暂时保留的旧字段、兼容路由和待迁移记录必须在阶段报告中列出，不得声称已经完全退役。

## 13. 立即执行任务

当前只启动 **A1：规格与权限威胁模型**。详见 [Codex 执行任务](./V3_3_A_BATCH1_CODEX_TASK.md)。
