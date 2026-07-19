Document Status: ACTIVE
Spec Version: 2.0.0
Updated At: 2026-07-19
Parent Stage: V3.3-A / A1

# V3.3-A / A1 授权决策矩阵

## 1. 统一决策输入与顺序

服务端以账号会话为信任根，客户端 `workspaceId`、`currentRole`、`role`、`organizationId`、`projectId` 都只是待验证输入。

```text
subject = account + active business identities + certifications
        + active organization memberships/positions
        + active project memberships/roles
        + active platform staff positions/grants
request = capabilityCode + requested data scope + purpose + requestId
resource = owner + organization + project + assignee + state + confidentiality + NDA
decision = allow/deny + reasonCode + resolvedDataScope + fieldMask + policyVersion
```

固定顺序：会话与账号 → 明确冻结/撤权 → 能力注册 → 主体关系有效性 → 数据范围 → 资源关系 → 认证 → 业务状态 → 保密/NDA → 职责分离 → 字段掩码 → 审计 → 默认拒绝。平台职务不能跳过后续步骤。

查询必须先按 `resolvedDataScope` 生成 SQL 条件，再取数据；禁止先查全量后在客户端过滤。

## 2. 稳定拒绝原因代码

| reasonCode | 条件 | 对外 HTTP/tRPC | 是否审计 |
|---|---|---|---|
| `AUTH_REQUIRED` | 无有效会话 | 401/UNAUTHORIZED | 高风险接口是 |
| `ACCOUNT_INACTIVE` | restricted/suspended/closed 不允许动作 | 403/FORBIDDEN | 是 |
| `IDENTITY_INACTIVE` | 身份停用/关闭 | 403 | 是 |
| `CERTIFICATION_REQUIRED` | 缺少所需认证 | 403 | 条件 |
| `CERTIFICATION_INACTIVE` | 认证拒绝/撤销/过期 | 403 | 是 |
| `CAPABILITY_MISSING` | 无有效能力来源 | 403 | 是 |
| `GRANT_INACTIVE` | 授权撤销/过期 | 403 | 是 |
| `ORGANIZATION_CONTEXT_REQUIRED` | 缺组织上下文 | 403 | 是 |
| `ORGANIZATION_INACTIVE` | 组织停用/关闭 | 403 | 是 |
| `ORGANIZATION_MEMBERSHIP_INACTIVE` | 非成员、停职、退出或移除 | 403 | 是 |
| `PROJECT_CONTEXT_REQUIRED` | 缺项目上下文 | 403 | 是 |
| `PROJECT_MEMBERSHIP_INACTIVE` | 非成员、停职、退出或移除 | 403 | 是 |
| `DATA_SCOPE_MISMATCH` | 请求对象超出数据范围 | 403 | 是 |
| `RESOURCE_RELATION_REQUIRED` | 不是所有者/参与者/被分配人/受邀者 | 403 | 是 |
| `RESOURCE_STATE_FORBIDDEN` | 当前业务状态禁止动作 | 409/CONFLICT | 是 |
| `CONFIDENTIALITY_TOO_HIGH` | clearance 低于资源级别 | 403 | 是 |
| `NDA_REQUIRED` | 缺有效 NDA | 403 | 是 |
| `FIELD_ACCESS_DENIED` | 只能返回脱敏视图或字段禁止返回 | 403 或字段省略 | 敏感时是 |
| `STAFF_POSITION_INACTIVE` | 职务停职/撤销/过期 | 403 | 是 |
| `SEPARATION_OF_DUTIES` | 命中职责分离 | 409 | 是 |
| `SELF_APPROVAL_FORBIDDEN` | 提交者/发起者试图自批 | 409 | 是 |
| `LAST_OWNER_CANNOT_LEAVE` | 最后一名组织 owner 退出/被撤 | 409 | 是 |
| `OWNER_TRANSFER_CONFIRMATION_REQUIRED` | 转让未完成双确认/二次验证 | 409 | 是 |
| `INVITATION_INVALID` | 邀请主体/token/状态无效 | 409 | 是 |
| `INVITATION_EXPIRED` | 邀请过期 | 410/GONE | 是 |
| `CONCURRENT_MODIFICATION` | version/CAS 冲突 | 409 | 是 |
| `RESOURCE_NOT_FOUND_OR_HIDDEN` | 不存在或需防枚举隐藏 | 404 | 拒绝审计按风险 |
| `DEFAULT_DENY` | 无策略或无法解析 | 403 | 是 |

接口可返回本地化 message，但客户端逻辑只能依赖 reasonCode。

## 3. 决策场景

| # | 主体 | 能力 | 资源 | 组织关系 | 项目关系 | 资源关系 | 认证要求 | 业务状态 | 保密级别 | 数据范围 | 决策 | 拒绝原因 | 审计 |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 登录账号 | `account.profile.view_self` | 本人 profile | - | - | accountId=self | 无 | account!=closed | INTERNAL | SELF | 允许，应用手机号/邮箱掩码策略 | 非本人 `DATA_SCOPE_MISMATCH` | 敏感字段访问记 allow |
| 2 | 登录账号 A | 同上 | 账号 B profile | - | - | 非本人 | 无 | 任意 | INTERNAL | SELF | 拒绝 | `DATA_SCOPE_MISMATCH` | deny |
| 3 | 身份本人 | `identity.switch` | 本人 identity | - | - | identity.accountId=self | 条件 | identity=active | INTERNAL | SELF | 允许，仅改偏好 | inactive: `IDENTITY_INACTIVE` | change |
| 4 | 任意用户 | `need.view_public` | 公开需求 | - | - | public=true | 无 | published/collecting/selecting | PUBLIC | PUBLIC/CITY_OR_REGION | 允许公开字段 | 非公开 `RESOURCE_NOT_FOUND_OR_HIDDEN` | 通常不记 |
| 5 | 需求创建者 | `need.view_owned` | 自己私密需求 | - | - | creator=self | 无 | 非删除 | CONFIDENTIAL | OWNED_RESOURCE | 允许 | 非 owner `RESOURCE_RELATION_REQUIRED` | 敏感 allow/deny |
| 6 | 有效工程师身份 | `quote.submit` | 开放需求 | 条件 | - | 被允许响应 | engineer certification approved | 需求开放 | CONFIDENTIAL | ASSIGNED_RESOURCE | 允许创建自己的报价 | 认证无效 `CERTIFICATION_INACTIVE` | allow/deny |
| 7 | 供应方 A | `quote.view` | 供应方 B 报价 | 可相同组织但非报价 owner | - | 竞争方 | 条件 | 报价有效 | RESTRICTED | OWNED_RESOURCE | 拒绝 | `RESOURCE_RELATION_REQUIRED` | 高风险 deny |
| 8 | 组织 owner/admin | `organization.update` | 当前组织 | active member+position | - | organization match | 条件 | org/member active | INTERNAL | ORGANIZATION | 允许 | 上下文伪造 `DATA_SCOPE_MISMATCH` | change |
| 9 | O1 成员 | `organization.member.invite` | O2 | O1!=O2 | - | 无 | 条件 | O2 active | INTERNAL | ORGANIZATION | 拒绝 | `ORGANIZATION_MEMBERSHIP_INACTIVE` | deny |
| 10 | active owner | `organization.member.suspend` | 普通成员 | 同组织 active | - | 管理关系 | 条件 | target active | CONFIDENTIAL | ORGANIZATION | 允许并即时撤权 | - | change + cache invalidation |
| 11 | active owner | 同上 | 最后一名 owner | 同组织 | - | 最后 owner | 条件 | active | RESTRICTED | ORGANIZATION | 拒绝 | `LAST_OWNER_CANNOT_LEAVE` | 高风险 deny |
| 12 | 当前 owner+接收 owner | `organization.owner.transfer` | 转让请求 | 两者 active | - | from/to match | 条件 | pending、未过期、双确认 | RESTRICTED | ORGANIZATION | 条件满足后允许 | `OWNER_TRANSFER_CONFIRMATION_REQUIRED` | 全流程 allow/deny/change |
| 13 | 项目成员 | `project.view` | 所属项目 | 条件 | membership active | member relation | 条件 | 项目非隐藏终态 | <=clearance | PROJECT | 允许字段掩码后详情 | - | 敏感 allow |
| 14 | 非项目成员 | `project.view` | 他人项目 | 可同组织但无项目关系 | none | 无 | 任意 | 任意 | CONFIDENTIAL | PROJECT | 拒绝/隐藏 | `PROJECT_MEMBERSHIP_INACTIVE` | deny |
| 15 | 被邀请 viewer | `project.view` | 受邀项目摘要 | - | invitation pending/accepted policy | invite matches | NDA 条件 | invitation valid | <=clearance | INVITED_RESOURCE | 只读允许 | `INVITATION_INVALID`/`NDA_REQUIRED` | allow/deny |
| 16 | 项目 assignee | `project.milestone.submit` | 被分配里程碑 | 条件 | active | assignee=self | 条件 | in_progress/revision_required | CONFIDENTIAL | ASSIGNED_RESOURCE | 有正式文件时允许 | 状态错 `RESOURCE_STATE_FORBIDDEN` | allow/change |
| 17 | 交付提交者 | `project.milestone.accept` | 自己提交的交付 | - | active | submitter=self | 条件 | waiting_acceptance | CONFIDENTIAL | PROJECT | 拒绝 | `SELF_APPROVAL_FORBIDDEN` | 高风险 deny |
| 18 | 独立 reviewer | `project.milestone.accept` | 他人交付 | - | active reviewer | submitter!=self 且被指派 | 条件 | waiting_acceptance | CONFIDENTIAL | ASSIGNED_RESOURCE | 允许 | - | 高风险 allow/change |
| 19 | 生产商 | `project.file.disable` | 已冻结设计版本 | active org/member | active project | 参与但非设计 owner | 认证有效 | design frozen | RESTRICTED | PROJECT | 拒绝 | `RESOURCE_STATE_FORBIDDEN` | deny |
| 20 | viewer clearance=INTERNAL | `project.file.download` | CONFIDENTIAL/NDA 文件 | 条件 | active | member | 条件 | file available | 高于 clearance | PROJECT | 拒绝 | `CONFIDENTIALITY_TOO_HIGH` | 高风险 deny |
| 21 | NDA 成员 | `project.file.download` | NDA 文件 | - | active | member | 有效 NDA | file available；NDA 未撤销 | NDA<=clearance | PROJECT | 短签名允许 | `NDA_REQUIRED` | allow + download log |
| 22 | 已移除成员持旧签名 | `project.file.download` | 项目文件 | - | removed | 旧关系 | 任意 | file available | 任意 | PROJECT | 实时复核后拒绝 | `PROJECT_MEMBERSHIP_INACTIVE` | deny |
| 23 | 会话成员 | `message.read` | 双方个人会话 | - | 条件 | conversation participant | 无 | 会话 active | INTERNAL | SELF | 允许 | - | 通常不记正文 |
| 24 | 登录用户 | `message.start` | 无权资源关联 | none | none | 无 | 任意 | 任意 | 任意 | OWNED_RESOURCE/PROJECT/ORGANIZATION | 拒绝 | `RESOURCE_RELATION_REQUIRED` | deny |
| 25 | 认证初审员 | `platform.certification.review_initial` | 分配申请 | - | - | assigned case | 无 | pending | RESTRICTED | PLATFORM_ASSIGNED | 允许 | 非分配 `DATA_SCOPE_MISMATCH` | 高风险 allow/change |
| 26 | 同一初审员 | `platform.certification.review_final` | 已初审申请 | - | - | initial actor=self | 无 | pending final | RESTRICTED | PLATFORM_ASSIGNED | 拒绝 | `SEPARATION_OF_DUTIES` | 高风险 deny |
| 27 | 独立复审员 | `platform.certification.review_final` | 已初审申请 | - | - | initial actor!=self | 无 | initial approved | RESTRICTED | PLATFORM_ASSIGNED | 允许 | - | 高风险 allow/change |
| 28 | 投诉调查员 | `platform.complaint.investigate` | 分配投诉 | - | - | assigned investigator | 无 | under_review | RESTRICTED | PLATFORM_ASSIGNED | 允许 | - | 高风险 |
| 29 | 同一调查员 | `platform.complaint.decide` | 同一投诉 | - | - | investigator=self | 无 | decision_pending | RESTRICTED | PLATFORM_ASSIGNED | 原则拒绝；紧急例外需另两人复核 | `SEPARATION_OF_DUTIES` | 高风险 deny |
| 30 | 财务审核员 | `platform.finance.review` | 分配退款/结算 | - | - | assigned reviewer | 无 | pending review | RESTRICTED | PLATFORM_ASSIGNED | 允许审核 | - | 高风险 |
| 31 | 同一审核员 | `platform.funds.execute` | 已审核资金动作 | - | - | reviewer=self | 无 | approved | RESTRICTED | PLATFORM_ASSIGNED | 拒绝 | `SEPARATION_OF_DUTIES` | 高风险 deny |
| 32 | 独立执行员 | `platform.funds.execute` | 已由他人审核动作 | - | - | executor assigned, reviewer!=self | 无 | approved、幂等未执行 | RESTRICTED | PLATFORM_ASSIGNED | 允许一次 | 幂等/并发 `CONCURRENT_MODIFICATION` | 高风险 |
| 33 | 权限管理员 | `platform.permission.manage` | 给自己 super admin | - | - | actor=target | 无 | 任意 | RESTRICTED | PLATFORM_ASSIGNED | 拒绝 | `SEPARATION_OF_DUTIES` | 高风险 deny |
| 34 | 安全审计员 | `platform.audit.read` | 审计事件 | - | - | 分配范围 | 无 | position active | RESTRICTED | PLATFORM_ASSIGNED | 只读允许 | 写操作 `CAPABILITY_MISSING` | 所有访问审计 |
| 35 | 回收商 | `file.access`/后续履约能力 | 历史所有者个人信息 | active org | 条件 | 仅履约关系 | recycler cert | 活动回收任务 | RESTRICTED | ASSIGNED_RESOURCE | 只给当次必要地址，不给历史身份 | `FIELD_ACCESS_DENIED` | 高风险 allow/deny |

## 4. 职责分离硬规则

| 规则 | 不可兼任关系 | 执行方式 |
|---|---|---|
| 创意/项目交付独立验收 | delivery submitter != acceptance actor | 查提交事实；无独立验收者默认拒绝 |
| 认证初审/复审 | initialReviewer != finalReviewer | review actions 唯一阶段 + actor 比较 |
| 投诉调查/裁定 | investigator != decider | 默认硬拒绝；紧急例外需两名额外批准者并审计，A1 不赋默认例外 |
| 财务审核/资金执行 | reviewer != executor | 执行事务重新读取审核 actor |
| 权限管理员自我提升 | grantor != grantee（super/PLATFORM_ALL） | 数据库前置校验 + 服务事务 + 审计 |
| 安全审计只读 | audit position 不映射任何业务写能力 | 能力模板明确拒绝，不接受 grant 绕过 |
| 所有者转让 | 发起者、接收者双确认 + 二次验证 | owner transfer 状态机；单事务换 owner |
| 最后 owner 保护 | 有效 owner 数量不能变 0 | `SELECT ... FOR UPDATE` 后计数 |

## 5. 缓存与撤权

- 授权缓存键必须含 account、capability、organization/project、resource、policyVersion、membership/grant version；TTL 不超过 30 秒。
- 停职、退出、移除、认证撤销、职务撤销和 grant 撤销在事务提交后发布失效事件；高风险写与文件下载不依赖 TTL，必须查库或版本戳。
- 短签名只证明链接完整性，不证明当前仍有权限；内容端点必须实时执行本矩阵。
