Document Status: ACTIVE
Spec Version: 2.1.0
Updated At: 2026-07-19
Parent Stage: V3.3-A / A1.1
Source Baseline: V3.2.4 schema and migrations 0000-0014

# V3.3-A / A1.1 数据字典

## 1. 冻结约定

- 账号外键统一指向现有 `users.id`；项目外键统一指向现有 `projects.id`；文件外键统一指向现有 `stored_files.id`。
- 本批新增主键和指向现有表的外键均使用 `INT`，与现有 MySQL/Drizzle 列型一致；时间均为 UTC `TIMESTAMP`。
- 所有外键采用 `ON DELETE RESTRICT ON UPDATE RESTRICT`。成员、认证、授权、职务和审计记录不得物理删除。
- 可变聚合使用 `version INT NOT NULL DEFAULT 1` 做乐观并发；更新使用 `WHERE id=? AND version=?` 并将版本加一。
- 软删除只用于目录、展示资料和组织；使用 `deletedAt TIMESTAMP NULL`。关系生命周期使用终态，不以删除代替退出、移除、撤销或过期。
- 审计操作者字段允许系统任务使用 `NULL`，但必须同时写 `actorType=system` 和稳定原因。
- `user_profiles.currentRole` 不是授权字段；工作台偏好只写 `workspace_preferences`，授权每次重新解析有效关系。

统一枚举：

```text
dataScope = SELF | OWNED_RESOURCE | ORGANIZATION | PROJECT | ASSIGNED_RESOURCE |
            CITY_OR_REGION | PUBLIC | INVITED_RESOURCE | PLATFORM_ASSIGNED | PLATFORM_ALL
confidentiality = PUBLIC | INTERNAL | CONFIDENTIAL | NDA | RESTRICTED
```

## 2. A2 业务基础表总览（24 张）

| # | 表 | 用途 | 隔离键 | 删除策略 |
|---:|---|---|---|---|
| 1 | `identity_types` | 可扩展业务身份类型目录 | - | `deletedAt` |
| 2 | `business_identities` | 账号拥有的业务身份 | `accountId` | 状态终结 |
| 3 | `identity_profiles` | 身份展示和专业资料 | `identityId` | `deletedAt` |
| 4 | `certification_types` | 认证类型目录 | - | `deletedAt` |
| 5 | `certifications` | 身份或组织认证申请 | `subjectIdentityId`/`subjectOrganizationId` | 追加申请、状态终结 |
| 6 | `certification_documents` | 认证材料版本 | `certificationId` | 状态终结 |
| 7 | `certification_review_actions` | 初审、复审和撤销轨迹 | `certificationId` | 仅追加 |
| 8 | `capabilities` | 稳定能力代码目录 | - | `deletedAt` |
| 9 | `organizations` | 工作室、门店、公司、工厂和机构 | `id` | `deletedAt` + 状态终结 |
| 10 | `organization_memberships` | 账号与组织成员关系 | `organizationId` | 状态终结 |
| 11 | `organization_invitations` | 组织邀请与幂等接受 | `organizationId` | 状态终结 |
| 12 | `organization_positions` | 组织岗位定义 | `organizationId` | `deletedAt` |
| 13 | `organization_member_positions` | 成员岗位分配 | `organizationId` | 撤销终结 |
| 14 | `position_capabilities` | 组织岗位到能力映射 | `organizationId` | 撤销终结 |
| 15 | `organization_owner_transfers` | 所有者转让二次确认 | `organizationId` | 状态终结 |
| 16 | `project_memberships` | 多成员项目关系 | `projectId` | 状态终结 |
| 17 | `project_invitations` | 项目邀请与幂等接受 | `projectId` | 状态终结 |
| 18 | `project_roles` | 稳定项目角色目录 | - | `deletedAt` |
| 19 | `project_membership_roles` | 项目成员角色分配 | `projectId` | 撤销终结 |
| 20 | `project_role_capabilities` | 项目角色到能力映射 | - | 撤销终结 |
| 21 | `platform_staff_positions` | 独立平台后台职务 | `accountId` | 状态终结 |
| 22 | `capability_grants` | 例外授权/收窄授权记录 | 多态主体 + 资源范围 | 状态终结 |
| 23 | `workspace_preferences` | 客户端工作台偏好 | `accountId` | 覆盖更新 |
| 24 | `permission_audit_events` | 权限变更及敏感允许/拒绝 | 资源归属快照 | 仅追加 |

### 2.1 迁移基础设施表（3 张，单独统计）

| # | 表 | 物理动作 | 用途 | 删除策略 |
|---:|---|---|---|---|
| M1 | `migration_runs` | A2 新建 | 一次迁移、恢复或重跑的冻结配置与总状态 | 永久保留 |
| M2 | `migration_checkpoints` | A2 新建 | 分阶段、分实体、分批次的可恢复游标和计数 | 永久保留 |
| M3 | `migration_anomalies` | A2 增量升级现有简版表 | 结构化异常、严重度、处理动作与解决轨迹 | 永久保留 |

冻结统计口径：**24 张业务基础表 + 3 张迁移基础设施表 + 6 张现有表追加字段**。源码基线已经存在简版 `migration_anomalies`，所以 A2 不得同名重复建表；必须先新建 `migration_runs`/`migration_checkpoints`，再以追加列、回填、收紧约束的方式升级该表。

## 3. 身份与工作台

### 3.1 `identity_types`

```text
id INT PK AUTO_INCREMENT
code VARCHAR(64) NOT NULL
name VARCHAR(128) NOT NULL
description VARCHAR(500) NULL
requiresCertification BOOLEAN NOT NULL DEFAULT FALSE
isSystem BOOLEAN NOT NULL DEFAULT FALSE
status ENUM('active','inactive') NOT NULL DEFAULT 'active'
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
deletedAt TIMESTAMP NULL
```

约束/索引：`UNIQUE(code)`；`INDEX(status, deletedAt)`。首批种子：`consumer`、`designer`、`engineer`、`merchant`、`repair_provider`、`manufacturer`、`supplier`、`inspection_provider`、`recycler`、`enterprise_representative`。类型是目录数据，不是 `users.role` 枚举。

### 3.2 `business_identities`

```text
id INT PK AUTO_INCREMENT
accountId INT NOT NULL FK users.id
identityTypeId INT NOT NULL FK identity_types.id
status ENUM('active','suspended','closed') NOT NULL DEFAULT 'active'
source ENUM('system','legacy_backfill','self_service','platform') NOT NULL
createdBy INT NULL FK users.id
suspendedAt TIMESTAMP NULL
suspendedBy INT NULL FK users.id
suspensionReason VARCHAR(500) NULL
closedAt TIMESTAMP NULL
version INT NOT NULL DEFAULT 1
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

约束/索引：`UNIQUE(accountId, identityTypeId)`；`INDEX(accountId,status)`；`INDEX(identityTypeId,status)`。每个账号必须有且仅有一个 `consumer` 身份；身份存在不等于认证通过。

### 3.3 `identity_profiles`

```text
id INT PK AUTO_INCREMENT
identityId INT NOT NULL FK business_identities.id
displayName VARCHAR(128) NULL
professionalTitle VARCHAR(128) NULL
introduction TEXT NULL
skills JSON NULL
cityCode VARCHAR(32) NULL
cityName VARCHAR(64) NULL
contactPhoneEncrypted VARBINARY(512) NULL
contactPhoneLast4 CHAR(4) NULL
contactEmailEncrypted VARBINARY(768) NULL
publicContactPolicy ENUM('hidden','masked','visible') NOT NULL DEFAULT 'hidden'
profileData JSON NULL
version INT NOT NULL DEFAULT 1
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
deletedAt TIMESTAMP NULL
```

约束/索引：`UNIQUE(identityId)`；`INDEX(cityCode,deletedAt)`。电话、邮箱为敏感字段；客户端不得持久化解密值。

### 3.4 `workspace_preferences`

```text
id INT PK AUTO_INCREMENT
accountId INT NOT NULL FK users.id
workspaceType ENUM('personal','identity','organization','platform') NOT NULL DEFAULT 'personal'
identityId INT NULL FK business_identities.id
organizationId INT NULL FK organizations.id
platformStaffPositionId INT NULL FK platform_staff_positions.id
lastUsedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
version INT NOT NULL DEFAULT 1
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

约束/索引：`UNIQUE(accountId)`；`CHECK` 工作台类型与对应外键恰好匹配；`INDEX(identityId)`、`INDEX(organizationId)`。此表只影响导航和默认筛选，不授予能力。

### 3.5 A2 对现有表的追加字段（不删除、不改旧语义）

| 现有表 | 追加字段 | 默认/空值 | 索引/约束 | 用途与历史兼容 |
|---|---|---|---|---|
| `projects` | `authorizationVersion INT NOT NULL DEFAULT 1` | 历史为 1 | `INDEX(status,authorizationVersion)` | 成员/角色/保密策略变化时递增，使旧授权缓存失效；不替代 `ownerId/engineerId` |
| `milestones` | `assigneeProjectMembershipId INT NULL`、`lastSubmittedByProjectMembershipId INT NULL`、`authorizationVersion INT NOT NULL DEFAULT 1` | 历史均 NULL/1 | 两个组合 FK：`(projectId,assigneeProjectMembershipId)`、`(projectId,lastSubmittedByProjectMembershipId) -> project_memberships(projectId,id)`；`INDEX(projectId,assigneeProjectMembershipId,status)` | 支持被分配数据范围和自验收检查；`submittedBy` 只允许确定性交叉项目成员后回填 `lastSubmittedByProjectMembershipId`，不代表验收人 |
| `project_files` | `confidentialityLevel ENUM('PUBLIC','INTERNAL','CONFIDENTIAL','NDA','RESTRICTED') NOT NULL DEFAULT 'INTERNAL'`、`ndaRequired BOOLEAN NOT NULL DEFAULT FALSE`、`accessPolicyVersion INT NOT NULL DEFAULT 1`、`disabledAt TIMESTAMP NULL`、`disabledBy INT NULL` | 历史 INTERNAL/false/1 | `disabledBy -> users.id`；`INDEX(projectId,status,confidentialityLevel)` | 文件元数据、签名和内容端点统一复核；旧文件默认不被错误抬升为公开 |
| `project_acceptances` | `reviewerProjectMembershipId INT NULL`、`deliverySubmissionVersion INT NULL` | 历史 NULL | 组合 FK `(projectId,reviewerProjectMembershipId) -> project_memberships(projectId,id)`；`INDEX(projectId,milestoneId,createdAt)` | 仅新事实或旧模型明确 `reviewer/acceptedBy/approvedBy` 事实可写验收成员；历史 `submittedBy -> reviewerProjectMembershipId = FORBIDDEN` |
| `stored_files` | `accessPolicyVersion INT NOT NULL DEFAULT 1` | 历史 1 | `INDEX(relatedEntityType,relatedEntityId,status)` | 资源撤权/保密变化后使旧通用文件签名失效；保留既有 `privacyLevel` |
| `conversations` | `status ENUM('active','closed') NOT NULL DEFAULT 'active'`、`authorizationVersion INT NOT NULL DEFAULT 1` | 历史 active/1 | `INDEX(refType,refId,status)` | 资源撤权后关闭/递增版本；现有 `userAId/userBId/refType/refId` 保留 |

上述 FK 在新表创建并完成项目成员回填后追加。历史无法确定的 assignee/reviewer 必须保持 `NULL` 并进入异常报告，不能猜测。当前基线 `project_acceptances` 只有 `submittedBy`，没有明确 reviewer/acceptedBy/approvedBy 事实，因此其历史 `reviewerProjectMembershipId` 一律为 `NULL` 并写 `MIG-REVIEWER-UNKNOWN`；`submittedBy` 只能用于推断交付提交者 `lastSubmittedByProjectMembershipId`。

## 4. 认证

### 4.1 `certification_types`

```text
id INT PK AUTO_INCREMENT
code VARCHAR(64) NOT NULL
name VARCHAR(128) NOT NULL
subjectType ENUM('identity','organization','either') NOT NULL
reviewMode ENUM('single','two_stage') NOT NULL DEFAULT 'single'
validityDays INT NULL
sensitiveLevel ENUM('sensitive','high_sensitive') NOT NULL DEFAULT 'sensitive'
requirements JSON NULL
status ENUM('active','inactive') NOT NULL DEFAULT 'active'
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
deletedAt TIMESTAMP NULL
```

约束/索引：`UNIQUE(code)`；`INDEX(subjectType,status)`。首批：`real_name`、`engineer_basic`、`merchant_business_license`；高风险类型采用 `two_stage`。

### 4.2 `certifications`

```text
id INT PK AUTO_INCREMENT
applicationNo VARCHAR(64) NOT NULL
certificationTypeId INT NOT NULL FK certification_types.id
subjectIdentityId INT NULL FK business_identities.id
subjectOrganizationId INT NULL FK organizations.id
status ENUM('not_applied','pending','additional_info_required','approved','rejected','revoked','expired') NOT NULL DEFAULT 'not_applied'
applicationData JSON NULL
activeDedupeKey VARCHAR(191) NULL
submittedAt TIMESTAMP NULL
approvedAt TIMESTAMP NULL
expiresAt TIMESTAMP NULL
revokedAt TIMESTAMP NULL
revokedBy INT NULL FK users.id
decisionReasonCode VARCHAR(64) NULL
decisionReason VARCHAR(500) NULL
legacySourceType VARCHAR(64) NULL
legacySourceId INT NULL
version INT NOT NULL DEFAULT 1
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

约束/索引：`UNIQUE(applicationNo)`；`UNIQUE(activeDedupeKey)`（仅开放申请填充，终态置 `NULL`）；`CHECK` 身份/组织主体恰好一个非空；`UNIQUE(legacySourceType,legacySourceId)`；`INDEX(subjectIdentityId,certificationTypeId,status)`；`INDEX(subjectOrganizationId,certificationTypeId,status)`；`INDEX(status,expiresAt)`。`applicationData` 禁止存完整证件号、银行账号或文件 URL，只存摘要、末四位和结构化非秘密字段。

### 4.3 `certification_documents`

```text
id INT PK AUTO_INCREMENT
certificationId INT NOT NULL FK certifications.id
fileId INT NOT NULL FK stored_files.id
documentType VARCHAR(64) NOT NULL
versionNo INT NOT NULL DEFAULT 1
status ENUM('available','superseded','disabled') NOT NULL DEFAULT 'available'
uploadedBy INT NOT NULL FK users.id
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
disabledAt TIMESTAMP NULL
disabledBy INT NULL FK users.id
```

约束/索引：`UNIQUE(certificationId,documentType,versionNo)`；`UNIQUE(certificationId,fileId)`；`INDEX(certificationId,status)`。文件必须是 `high_sensitive`、短签名、`no-store`、访问审计。

### 4.4 `certification_review_actions`

```text
id INT PK AUTO_INCREMENT
certificationId INT NOT NULL FK certifications.id
stage ENUM('submission','initial_review','final_review','revocation','expiry') NOT NULL
action ENUM('submit','resubmit','start_review','request_info','approve','reject','revoke','expire') NOT NULL
fromStatus VARCHAR(32) NULL
toStatus VARCHAR(32) NOT NULL
actorId INT NULL FK users.id
platformStaffPositionId INT NULL FK platform_staff_positions.id
reasonCode VARCHAR(64) NULL
reason VARCHAR(500) NULL
requestId VARCHAR(64) NOT NULL
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
```

约束/索引：`UNIQUE(requestId)`；`INDEX(certificationId,createdAt)`；`INDEX(actorId,stage,createdAt)`。二阶段审核以查询约束确保初审人与复审人不同；记录仅追加。

## 5. 能力与组织

### 5.1 `capabilities`

```text
code VARCHAR(128) PK
domain VARCHAR(64) NOT NULL
name VARCHAR(128) NOT NULL
description VARCHAR(500) NOT NULL
riskLevel ENUM('normal','sensitive','high') NOT NULL DEFAULT 'normal'
defaultAuditMode ENUM('none','deny','allow_and_deny') NOT NULL DEFAULT 'deny'
status ENUM('active','deprecated') NOT NULL DEFAULT 'active'
replacementCode VARCHAR(128) NULL FK capabilities.code
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
deletedAt TIMESTAMP NULL
```

约束/索引：`INDEX(domain,status)`。代码一经发布不改名；废弃通过 `replacementCode` 迁移。

### 5.2 `organizations`

```text
id INT PK AUTO_INCREMENT
name VARCHAR(128) NOT NULL
organizationType VARCHAR(64) NOT NULL
registrationCountry CHAR(2) NULL
creatorAccountId INT NOT NULL FK users.id
description TEXT NULL
cityCode VARCHAR(32) NULL
cityName VARCHAR(64) NULL
status ENUM('active','suspended','dissolving','closed') NOT NULL DEFAULT 'active'
suspendedAt TIMESTAMP NULL
closedAt TIMESTAMP NULL
version INT NOT NULL DEFAULT 1
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
deletedAt TIMESTAMP NULL
```

约束/索引：`INDEX(creatorAccountId)`；`INDEX(organizationType,status)`；`INDEX(cityCode,status)`。`organizationType` 为目录代码而非权限角色；组织关闭前必须无活动项目、未结资金和待处理转让。

### 5.3 `organization_memberships`

```text
id INT PK AUTO_INCREMENT
organizationId INT NOT NULL FK organizations.id
accountId INT NOT NULL FK users.id
status ENUM('active','suspended','left','removed') NOT NULL DEFAULT 'active'
sourceInvitationId INT NULL FK organization_invitations.id
joinedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
suspendedAt TIMESTAMP NULL
leftAt TIMESTAMP NULL
removedAt TIMESTAMP NULL
endedBy INT NULL FK users.id
endReason VARCHAR(500) NULL
lastRequestId VARCHAR(64) NOT NULL
version INT NOT NULL DEFAULT 1
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

约束/索引：`UNIQUE(organizationId,accountId)`、`UNIQUE(organizationId,id)`；表齐备后追加组合 FK `(organizationId,sourceInvitationId) -> organization_invitations(organizationId,id)`；`INDEX(accountId,status)`；`INDEX(organizationId,status)`。本表采用**模式 A：稳定关系行**；新邀请接受可受控执行 `left/removed -> active`，复用原行、清空终结字段、更新 `sourceInvitationId/lastRequestId`、递增 `version`，并在 `permission_audit_events` 追加动作证据。停职、退出、移除在事务提交后立即使组织及派生项目授权失效。

### 5.4 `organization_invitations`

```text
id INT PK AUTO_INCREMENT
organizationId INT NOT NULL FK organizations.id
inviterMembershipId INT NOT NULL FK organization_memberships.id
inviteeAccountId INT NULL FK users.id
inviteePhoneDigest CHAR(64) NULL
inviteeEmailDigest CHAR(64) NULL
tokenDigest CHAR(64) NOT NULL
status ENUM('pending','accepted','declined','revoked','expired') NOT NULL DEFAULT 'pending'
activeDedupeKey VARCHAR(191) NULL
expiresAt TIMESTAMP NOT NULL
acceptedByAccountId INT NULL FK users.id
acceptedAt TIMESTAMP NULL
requestId VARCHAR(64) NOT NULL
version INT NOT NULL DEFAULT 1
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

约束/索引：`UNIQUE(tokenDigest)`；`UNIQUE(requestId)`；`UNIQUE(activeDedupeKey)`；`UNIQUE(organizationId,id)`；组合 FK `(organizationId,inviterMembershipId) -> organization_memberships(organizationId,id)`；`CHECK` account/phone/email 邀请目标恰好一个；`INDEX(organizationId,status,expiresAt)`；`INDEX(inviteeAccountId,status)`。不保存明文 token；接受使用行锁/CAS，重复接受返回原结果。

### 5.5 `organization_positions`

```text
id INT PK AUTO_INCREMENT
organizationId INT NOT NULL FK organizations.id
code VARCHAR(64) NOT NULL
name VARCHAR(128) NOT NULL
description VARCHAR(500) NULL
isOwnerPosition BOOLEAN NOT NULL DEFAULT FALSE
isSystem BOOLEAN NOT NULL DEFAULT FALSE
status ENUM('active','inactive') NOT NULL DEFAULT 'active'
version INT NOT NULL DEFAULT 1
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
deletedAt TIMESTAMP NULL
```

约束/索引：`UNIQUE(organizationId,code)`；`UNIQUE(organizationId,id)`；`INDEX(organizationId,status)`。岗位是少量能力组合，不承载产业链身份枚举。

### 5.6 `organization_member_positions`

```text
id INT PK AUTO_INCREMENT
organizationId INT NOT NULL FK organizations.id
membershipId INT NOT NULL FK organization_memberships.id
positionId INT NOT NULL FK organization_positions.id
status ENUM('active','revoked') NOT NULL DEFAULT 'active'
assignedBy INT NOT NULL FK users.id
assignedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
revokedBy INT NULL FK users.id
revokedAt TIMESTAMP NULL
reason VARCHAR(500) NULL
lastRequestId VARCHAR(64) NOT NULL
version INT NOT NULL DEFAULT 1
```

约束/索引：`UNIQUE(membershipId,positionId)`；组合 FK `(organizationId,membershipId) -> organization_memberships(organizationId,id)` 与 `(organizationId,positionId) -> organization_positions(organizationId,id)`；`INDEX(organizationId,status)`。本表采用**模式 A：稳定关系行**；新分配命令可受控执行 `revoked -> active`，更新 `lastRequestId`、递增 `version` 并追加审计。最后一名有效 owner 岗位不得撤销。

### 5.7 `position_capabilities`

```text
id INT PK AUTO_INCREMENT
organizationId INT NOT NULL FK organizations.id
positionId INT NOT NULL FK organization_positions.id
capabilityCode VARCHAR(128) NOT NULL FK capabilities.code
dataScope ENUM(...) NOT NULL
conditionJson JSON NULL
status ENUM('active','revoked') NOT NULL DEFAULT 'active'
grantedBy INT NOT NULL FK users.id
revokedBy INT NULL FK users.id
revokedAt TIMESTAMP NULL
lastRequestId VARCHAR(64) NOT NULL
version INT NOT NULL DEFAULT 1
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
```

约束/索引：`UNIQUE(positionId,capabilityCode,dataScope)`；组合 FK `(organizationId,positionId) -> organization_positions(organizationId,id)`；`INDEX(organizationId,capabilityCode,status)`。本表采用**模式 A：稳定关系行**；新映射命令可受控执行 `revoked -> active`，更新 `lastRequestId`、递增 `version` 并追加审计。组织岗位不得获得 `PLATFORM_ALL`。

### 5.8 `organization_owner_transfers`

```text
id INT PK AUTO_INCREMENT
organizationId INT NOT NULL FK organizations.id
fromMembershipId INT NOT NULL FK organization_memberships.id
toMembershipId INT NOT NULL FK organization_memberships.id
status ENUM('pending','confirmed','cancelled','expired','completed') NOT NULL DEFAULT 'pending'
activeDedupeKey VARCHAR(191) NULL
initiatedBy INT NOT NULL FK users.id
initiatorConfirmedAt TIMESTAMP NULL
recipientConfirmedAt TIMESTAMP NULL
secondFactorConfirmedAt TIMESTAMP NULL
expiresAt TIMESTAMP NOT NULL
completedAt TIMESTAMP NULL
requestId VARCHAR(64) NOT NULL
version INT NOT NULL DEFAULT 1
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

约束/索引：`UNIQUE(requestId)`；`UNIQUE(activeDedupeKey)`；组合 FK `(organizationId,fromMembershipId) -> organization_memberships(organizationId,id)` 与 `(organizationId,toMembershipId) -> organization_memberships(organizationId,id)`；`INDEX(organizationId,status)`。完成必须在单事务中授予新 owner、校验仍有 owner、撤销旧 owner 并写审计。

## 6. 项目成员与角色

### 6.1 `project_memberships`

```text
id INT PK AUTO_INCREMENT
projectId INT NOT NULL FK projects.id
accountId INT NOT NULL FK users.id
businessIdentityId INT NULL FK business_identities.id
sourceOrganizationId INT NULL FK organizations.id
status ENUM('active','suspended','left','removed') NOT NULL DEFAULT 'active'
sourceInvitationId INT NULL FK project_invitations.id
joinedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
suspendedAt TIMESTAMP NULL
leftAt TIMESTAMP NULL
removedAt TIMESTAMP NULL
endedBy INT NULL FK users.id
endReason VARCHAR(500) NULL
confidentialityClearance ENUM('PUBLIC','INTERNAL','CONFIDENTIAL','NDA','RESTRICTED') NOT NULL DEFAULT 'INTERNAL'
lastRequestId VARCHAR(64) NOT NULL
version INT NOT NULL DEFAULT 1
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

约束/索引：`UNIQUE(projectId,accountId)`、`UNIQUE(projectId,id)`；表齐备后追加组合 FK `(projectId,sourceInvitationId) -> project_invitations(projectId,id)`；`INDEX(accountId,status)`；`INDEX(projectId,status)`；`INDEX(sourceOrganizationId,projectId,status)`。本表采用**模式 A：稳定关系行**；新邀请接受可受控执行 `left/removed -> active`，复用原行、清空终结字段、更新来源与 `lastRequestId`、递增 `version` 并追加审计。项目权限不由全局身份或组织岗位自动推导。

### 6.2 `project_invitations`

```text
id INT PK AUTO_INCREMENT
projectId INT NOT NULL FK projects.id
inviterMembershipId INT NOT NULL FK project_memberships.id
inviteeAccountId INT NULL FK users.id
inviteeOrganizationId INT NULL FK organizations.id
proposedRoleCode VARCHAR(64) NOT NULL FK project_roles.code
confidentialityClearance ENUM('PUBLIC','INTERNAL','CONFIDENTIAL','NDA','RESTRICTED') NOT NULL DEFAULT 'INTERNAL'
tokenDigest CHAR(64) NOT NULL
status ENUM('pending','accepted','declined','revoked','expired') NOT NULL DEFAULT 'pending'
activeDedupeKey VARCHAR(191) NULL
expiresAt TIMESTAMP NOT NULL
acceptedAt TIMESTAMP NULL
requestId VARCHAR(64) NOT NULL
version INT NOT NULL DEFAULT 1
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

约束/索引：`UNIQUE(tokenDigest)`；`UNIQUE(requestId)`；`UNIQUE(activeDedupeKey)`；`UNIQUE(projectId,id)`；组合 FK `(projectId,inviterMembershipId) -> project_memberships(projectId,id)`；`INDEX(projectId,status,expiresAt)`；`CHECK` 被邀请账号/组织恰好一个非空。接受时必须重新检查项目、邀请人、被邀请主体和 NDA 状态。

### 6.3 `project_roles`

```text
code VARCHAR(64) PK
name VARCHAR(128) NOT NULL
description VARCHAR(500) NOT NULL
isSystem BOOLEAN NOT NULL DEFAULT TRUE
status ENUM('active','inactive') NOT NULL DEFAULT 'active'
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
deletedAt TIMESTAMP NULL
```

首批：`initiator`、`project_lead`、`design_lead`、`engineer`、`supplier`、`manufacturer`、`inspector`、`reviewer`、`viewer`。角色仅是能力模板。

### 6.4 `project_membership_roles`

```text
id INT PK AUTO_INCREMENT
projectId INT NOT NULL FK projects.id
projectMembershipId INT NOT NULL FK project_memberships.id
roleCode VARCHAR(64) NOT NULL FK project_roles.code
status ENUM('active','revoked') NOT NULL DEFAULT 'active'
assignedBy INT NOT NULL FK users.id
assignedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
revokedBy INT NULL FK users.id
revokedAt TIMESTAMP NULL
reason VARCHAR(500) NULL
lastRequestId VARCHAR(64) NOT NULL
version INT NOT NULL DEFAULT 1
```

约束/索引：`UNIQUE(projectMembershipId,roleCode)`；组合 FK `(projectId,projectMembershipId) -> project_memberships(projectId,id)`；`INDEX(projectId,roleCode,status)`。本表采用**模式 A：稳定关系行**；新分配命令可受控执行 `revoked -> active`，更新 `lastRequestId`、递增 `version` 并追加审计。

### 6.5 `project_role_capabilities`

```text
id INT PK AUTO_INCREMENT
roleCode VARCHAR(64) NOT NULL FK project_roles.code
capabilityCode VARCHAR(128) NOT NULL FK capabilities.code
dataScope ENUM(...) NOT NULL DEFAULT 'PROJECT'
conditionJson JSON NULL
status ENUM('active','revoked') NOT NULL DEFAULT 'active'
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
revokedAt TIMESTAMP NULL
lastRequestId VARCHAR(64) NOT NULL
version INT NOT NULL DEFAULT 1
```

约束/索引：`UNIQUE(roleCode,capabilityCode,dataScope)`；`INDEX(capabilityCode,status)`。本表采用**模式 A：稳定关系行**；新映射命令可受控执行 `revoked -> active`，更新 `lastRequestId`、递增 `version` 并追加审计。项目角色不得授予组织或平台全局范围。

## 7. 平台职务、显式授权与审计

### 7.1 `platform_staff_positions`

```text
id INT PK AUTO_INCREMENT
accountId INT NOT NULL FK users.id
positionCode VARCHAR(64) NOT NULL
status ENUM('active','suspended','revoked','expired') NOT NULL DEFAULT 'active'
activeDedupeKey VARCHAR(191) NULL
assignedCaseScope JSON NULL
validFrom TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
validUntil TIMESTAMP NULL
assignedBy INT NOT NULL FK users.id
assignmentReason VARCHAR(500) NOT NULL
suspendedAt TIMESTAMP NULL
revokedAt TIMESTAMP NULL
revokedBy INT NULL FK users.id
version INT NOT NULL DEFAULT 1
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

约束/索引：`UNIQUE(activeDedupeKey)`；`INDEX(accountId,status,validUntil)`；`INDEX(positionCode,status)`。首批职务：`customer_service`、`certification_initial_reviewer`、`certification_final_reviewer`、`complaint_investigator`、`complaint_decider`、`finance_reviewer`、`funds_executor`、`security_auditor`、`permission_administrator`、`super_administrator`。职务与业务身份完全分离。

### 7.2 `capability_grants`

```text
id INT PK AUTO_INCREMENT
accountId INT NULL FK users.id
businessIdentityId INT NULL FK business_identities.id
organizationMembershipId INT NULL FK organization_memberships.id
projectMembershipId INT NULL FK project_memberships.id
platformStaffPositionId INT NULL FK platform_staff_positions.id
capabilityCode VARCHAR(128) NOT NULL FK capabilities.code
dataScope ENUM(...) NOT NULL
resourceType VARCHAR(64) NULL
resourceId VARCHAR(64) NULL
conditionJson JSON NULL
status ENUM('active','revoked','expired') NOT NULL DEFAULT 'active'
validFrom TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
validUntil TIMESTAMP NULL
grantedBy INT NOT NULL FK users.id
grantReason VARCHAR(500) NOT NULL
revokedBy INT NULL FK users.id
revokedAt TIMESTAMP NULL
revokeReason VARCHAR(500) NULL
activeDedupeKey VARCHAR(191) NULL
version INT NOT NULL DEFAULT 1
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

约束/索引：`CHECK` 五类主体恰好一个非空；`UNIQUE(activeDedupeKey)`；`INDEX(capabilityCode,status,validUntil)`；各主体列建立 `(subject,status)` 索引。授权只可收窄或补充明确资源范围，不得绕过职责分离、认证、业务状态或保密级别。权限管理员不得给自己授予 `super_administrator` 或 `PLATFORM_ALL`。

### 7.3 `permission_audit_events`

```text
id INT PK AUTO_INCREMENT
eventId CHAR(36) NOT NULL
requestId VARCHAR(64) NULL
idempotencyKey VARCHAR(191) NULL
actorAccountId INT NULL FK users.id
actorType ENUM('account','system') NOT NULL
activeIdentityId INT NULL FK business_identities.id
organizationId INT NULL FK organizations.id
projectId INT NULL FK projects.id
platformStaffPositionId INT NULL FK platform_staff_positions.id
capabilityCode VARCHAR(128) NULL
resourceType VARCHAR(64) NOT NULL
resourceId VARCHAR(64) NULL
decision ENUM('allow','deny','changed') NOT NULL
reasonCode VARCHAR(64) NOT NULL
resolvedDataScope VARCHAR(32) NULL
confidentiality VARCHAR(32) NULL
fieldMask JSON NULL
policyVersion VARCHAR(64) NOT NULL
contextData JSON NULL
ipAddress VARCHAR(64) NULL
userAgent VARCHAR(255) NULL
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
```

约束/索引：`UNIQUE(eventId)`；`UNIQUE(idempotencyKey)`（可空，关系命令格式 `rel|<table>|<rowId>|<requestId>`）；`INDEX(actorAccountId,createdAt)`；`INDEX(resourceType,resourceId,createdAt)`；`INDEX(capabilityCode,decision,createdAt)`；`INDEX(organizationId,createdAt)`；`INDEX(projectId,createdAt)`。仅追加；`contextData` 必须先递归脱敏，禁止电话、邮箱、证件、银行账号、token、文件 URL、报价正文和设计原文件内容。模式 A 的每次激活、停用、退出、移除、撤销与恢复都必须在同一事务写一条 `decision=changed` 事件；唯一 `idempotencyKey` 保存完整动作历史并使任意旧 `requestId` 重放返回原结果。

## 8. 关系唯一性与数据库隔离冻结契约

### 8.1 `activeDedupeKey` 确定性规则（6 条）

以下六类均采用**模式 B：历史多记录**。尖括号内值使用数据库主键十进制字符串；代码使用小写稳定代码；digest/hash 使用小写十六进制；JSON 先按键名递归排序、去除无意义空白并以 UTF-8 编码，再算 SHA-256。

| # | 表 | 开放状态 | `activeDedupeKey` 精确格式 |
|---:|---|---|---|
| ADK-01 | `certifications` | `pending/additional_info_required/approved` | `cert|<identity:id|organization:id>|<certificationTypeId>` |
| ADK-02 | `organization_invitations` | `pending` | `orginv|<organizationId>|<account:id|phone:sha256|email:sha256>` |
| ADK-03 | `project_invitations` | `pending` | `prjinv|<projectId>|<account:id|organization:id>|<proposedRoleCode>` |
| ADK-04 | `organization_owner_transfers` | `pending/confirmed` | `ownxfer|<organizationId>|<fromMembershipId>|<toMembershipId>` |
| ADK-05 | `platform_staff_positions` | `active/suspended` | `staff|<accountId>|<positionCode>|<scopeSha256前32位>`；空 scope 的 hash 输入为 `{}` |
| ADK-06 | `capability_grants` | `active` | `grant|<subjectKind>:<subjectId>|<capabilityCode>|<dataScope>|<resourceType或->:<resourceId或->|<conditionSha256前32位>` |

所有六表必须有真实可空字段 `activeDedupeKey VARCHAR(191) NULL` 和 `UNIQUE(activeDedupeKey)`。创建开放记录时，在单事务内计算完整 key 并插入；并发冲突以唯一索引裁决，失败连接读取该 key 对应的开放记录并返回幂等结果，不得先查后插。记录进入表中未列为开放状态的终态时，必须在同一 CAS 更新中将 key 置 `NULL`；终态历史行永久保留，后续同类命令创建新行。禁止使用时间、随机数或 requestId 参与 key。

### 8.2 稳定关系行契约（模式 A，6 条）

| 表 | 稳定唯一键 | 受控重新激活 | 必备证据 |
|---|---|---|---|
| `organization_memberships` | `(organizationId,accountId)` | 新邀请接受：`left/removed -> active` | `lastRequestId`、`version`、`organization.member.reactivated` |
| `project_memberships` | `(projectId,accountId)` | 新邀请接受：`left/removed -> active` | `lastRequestId`、`version`、`project.member.reactivated` |
| `organization_member_positions` | `(membershipId,positionId)` | 新分配：`revoked -> active` | `lastRequestId`、`version`、`organization.position.reactivated` |
| `project_membership_roles` | `(projectMembershipId,roleCode)` | 新分配：`revoked -> active` | `lastRequestId`、`version`、`project.role.reactivated` |
| `position_capabilities` | `(positionId,capabilityCode,dataScope)` | 新映射：`revoked -> active` | `lastRequestId`、`version`、`organization.position_capability.reactivated` |
| `project_role_capabilities` | `(roleCode,capabilityCode,dataScope)` | 新映射：`revoked -> active` | `lastRequestId`、`version`、`project.role_capability.reactivated` |

重新激活必须锁定稳定行，验证新的邀请/分配命令及当前组织/项目归属，清理旧终结时间和原因，写 `lastRequestId`、递增 `version`，并在同一事务追加 `permission_audit_events`。命令先以 `rel|<table>|<rowId>|<requestId>` 查询/插入审计 `idempotencyKey`；重复 requestId 返回原动作结果。无新邀请/分配依据、直接把终态改 active，统一拒绝为 `RESOURCE_STATE_FORBIDDEN`。

### 8.3 组合外键清单（13 条）

| # | 子表组合列 | 父表组合唯一键 | 目的 |
|---:|---|---|---|
| CFK-01 | `organization_invitations(organizationId,inviterMembershipId)` | `organization_memberships(organizationId,id)` | 邀请人不得跨组织 |
| CFK-02 | `organization_memberships(organizationId,sourceInvitationId)` | `organization_invitations(organizationId,id)` | 邀请来源不得跨组织 |
| CFK-03 | `organization_member_positions(organizationId,membershipId)` | `organization_memberships(organizationId,id)` | 成员岗位不得跨组织 |
| CFK-04 | `organization_member_positions(organizationId,positionId)` | `organization_positions(organizationId,id)` | 岗位不得跨组织 |
| CFK-05 | `position_capabilities(organizationId,positionId)` | `organization_positions(organizationId,id)` | 岗位能力不得跨组织 |
| CFK-06 | `organization_owner_transfers(organizationId,fromMembershipId)` | `organization_memberships(organizationId,id)` | 原 owner 不得跨组织 |
| CFK-07 | `organization_owner_transfers(organizationId,toMembershipId)` | `organization_memberships(organizationId,id)` | 新 owner 不得跨组织 |
| CFK-08 | `project_invitations(projectId,inviterMembershipId)` | `project_memberships(projectId,id)` | 邀请人不得跨项目 |
| CFK-09 | `project_memberships(projectId,sourceInvitationId)` | `project_invitations(projectId,id)` | 邀请来源不得跨项目 |
| CFK-10 | `project_membership_roles(projectId,projectMembershipId)` | `project_memberships(projectId,id)` | 角色分配不得跨项目 |
| CFK-11 | `milestones(projectId,assigneeProjectMembershipId)` | `project_memberships(projectId,id)` | 任务受派人不得跨项目 |
| CFK-12 | `milestones(projectId,lastSubmittedByProjectMembershipId)` | `project_memberships(projectId,id)` | 交付提交人不得跨项目 |
| CFK-13 | `project_acceptances(projectId,reviewerProjectMembershipId)` | `project_memberships(projectId,id)` | 验收人不得跨项目 |

父表必须显式建立上表所列组合唯一键，即使 `id` 已是全局主键。所有组合 FK 均为 `ON DELETE RESTRICT ON UPDATE RESTRICT`；A2 不得以服务层比较替代。循环的 CFK-02/CFK-09 以及指向新项目成员的 CFK-11—13 在回填验证后分步追加。

无法使用组合 FK 的仅限真正多态关系：`capability_grants` 的五类主体和 `resourceType/resourceId`。替代约束为主体列恰一非空的 `CHECK`、稳定 resource type 注册表、事务内按主体种类 `SELECT ... FOR UPDATE` 验证归属、grant 自身 CAS，以及 `SEC-044`/`SEC-045` 跨域负向测试；不得扩大此例外。

## 9. 迁移基础设施表完整定义

### 9.1 `migration_runs`

```text
migrationRunId VARCHAR(64) PK
migrationVersion VARCHAR(32) NOT NULL
runMode ENUM('migrate','rerun','recovery') NOT NULL DEFAULT 'migrate'
parentMigrationRunId VARCHAR(64) NULL FK migration_runs.migrationRunId
runSequence INT NOT NULL
sourceBaseline VARCHAR(128) NOT NULL
sourceChecksum CHAR(64) NOT NULL
manifestChecksum CHAR(64) NOT NULL
configurationChecksum CHAR(64) NOT NULL
status ENUM('pending','running','completed','failed','aborted') NOT NULL DEFAULT 'pending'
startedAt TIMESTAMP(3) NULL
completedAt TIMESTAMP(3) NULL
failedAt TIMESTAMP(3) NULL
abortedAt TIMESTAMP(3) NULL
heartbeatAt TIMESTAMP(3) NULL
processedCount INT NOT NULL DEFAULT 0
succeededCount INT NOT NULL DEFAULT 0
failedCount INT NOT NULL DEFAULT 0
skippedCount INT NOT NULL DEFAULT 0
requestedByAccountId INT NULL FK users.id
failureCode VARCHAR(64) NULL
failureDetail JSON NULL
version INT NOT NULL DEFAULT 1
createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
updatedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
```

约束/索引：`UNIQUE(migrationVersion,sourceBaseline,runSequence)`；父 run 不得等于自身；`CHECK` 四类计数非负且 `processedCount=succeededCount+failedCount+skippedCount`；`INDEX(parentMigrationRunId,runMode)`；`INDEX(status,heartbeatAt)`；`INDEX(migrationVersion,sourceBaseline,createdAt)`。`completed` 必须有 `completedAt` 且无 `failedAt`，`failed` 必须有 `failedAt/failureCode`，其他终态时间互斥。状态仅允许 `pending -> running -> completed|failed|aborted`；`failed/aborted/completed` 不原地重开。

### 9.2 `migration_checkpoints`

```text
id INT PK AUTO_INCREMENT
migrationRunId VARCHAR(64) NOT NULL FK migration_runs.migrationRunId
checkpointKey VARCHAR(191) NOT NULL
phase ENUM('schema','seed','backfill','validate','recovery') NOT NULL
entityType VARCHAR(64) NOT NULL
rangeStartExclusive VARCHAR(128) NULL
rangeEndInclusive VARCHAR(128) NULL
cursorJson JSON NULL
status ENUM('pending','running','completed','failed','skipped') NOT NULL DEFAULT 'pending'
processedCount INT NOT NULL DEFAULT 0
succeededCount INT NOT NULL DEFAULT 0
failedCount INT NOT NULL DEFAULT 0
skippedCount INT NOT NULL DEFAULT 0
batchSize INT NOT NULL
attemptCount INT NOT NULL DEFAULT 0
checksum CHAR(64) NOT NULL
startedAt TIMESTAMP(3) NULL
completedAt TIMESTAMP(3) NULL
failedAt TIMESTAMP(3) NULL
lastErrorCode VARCHAR(64) NULL
lastErrorDetail JSON NULL
version INT NOT NULL DEFAULT 1
createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
updatedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
```

约束/索引：`UNIQUE(migrationRunId,checkpointKey)`；`CHECK` 计数非负且 processed 等于三项结果之和；`CHECK(batchSize BETWEEN 1 AND 500)`；`INDEX(migrationRunId,status,phase)`；`INDEX(entityType,status)`。`checkpointKey` 固定为 `<phase>|<entityType>|<六位分片号>|<规范化rangeStartExclusive或BEGIN>`。`checksum` 是本批源主键序列、规范化输入摘要和结果计数连接后的 SHA-256；恢复前不一致即写 `MIG-CHECKPOINT-CHECKSUM-MISMATCH` 并阻断。

### 9.3 `migration_anomalies`

```text
id INT PK AUTO_INCREMENT                         -- 现有字段保留
migrationVersion VARCHAR(32) NOT NULL           -- 现有字段保留
migrationRunId VARCHAR(64) NOT NULL FK migration_runs.migrationRunId
checkpointKey VARCHAR(191) NULL
severity ENUM('INFO','WARNING','BLOCKING') NOT NULL
entityType VARCHAR(64) NOT NULL                 -- 现有字段保留
entityId INT NULL                               -- 现有字段保留
code VARCHAR(64) NOT NULL                       -- 现有字段保留
fingerprint CHAR(64) NOT NULL
handling ENUM('CONTINUE','MIN_PRIVILEGE','SKIP_ENTITY','MANUAL_REVIEW','ABORT_RUN') NOT NULL
status ENUM('open','resolved','waived') NOT NULL DEFAULT 'open'
detail JSON NULL                                -- 现有字段保留并执行脱敏
detailChecksum CHAR(64) NOT NULL
resolvedAt TIMESTAMP NULL                       -- 现有字段保留
resolvedByAccountId INT NULL FK users.id
resolutionNote VARCHAR(500) NULL
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP -- 现有字段保留
```

约束/索引：`UNIQUE(migrationRunId,fingerprint)`；`INDEX(migrationVersion,code)`（保留现有索引）；`INDEX(migrationRunId,severity,status)`；`INDEX(entityType,entityId,code)`；`CHECK(severity <> 'BLOCKING' OR handling='ABORT_RUN')`。`fingerprint=SHA-256(migrationVersion|sourceBaseline|entityType|entityId或-|code|规范化detailChecksum)`，保证重试不重复记异常。现有旧 anomaly 行先关联一个专用导入 run，再把 `migrationRunId/severity/handling/fingerprint/detailChecksum` 收紧为非空。

`detail`、`failureDetail`、`lastErrorDetail` 使用同一脱敏器：仅允许来源表名、数字 ID、字段名、允许的枚举值、计数、规则代码和不可逆摘要；电话、邮箱、地址、证件、银行账号、token/secret、storageKey、URL/文件名、报价正文、设计/BOM/工艺内容不得出现。确需关联时写 `SHA-256(migrationRunId|fieldName|normalizedValue)` 和允许的末四位，禁止明文或可逆密文。写入前递归检查键名和值，违规本身产生 `MIG-ANOMALY-DETAIL-UNSAFE`（BLOCKING）。

### 9.4 回填来源字段

`business_identities`、`identity_profiles`、`certifications`、`certification_documents`、`certification_review_actions`、`project_memberships`、`project_membership_roles`、`platform_staff_positions`、`workspace_preferences` 的 A2 定义统一增加 `migrationRunId VARCHAR(64) NULL FK migration_runs.migrationRunId` 与 `INDEX(migrationRunId)`。新业务写入为 `NULL`；A2 回填必须写实际 runId。目录种子不因恢复删除，以 manifest 校验；迁移回填记录只有在没有后续业务引用时才能按该列精确恢复。

## 10. A2 建表与回填顺序

```text
Phase A: migration_runs
Phase B: migration_checkpoints -> upgrade migration_anomalies
Phase C: identity_types -> capabilities -> project_roles -> certification_types
      -> business_identities -> identity_profiles -> organizations
      -> organization_memberships -> organization_invitations -> organization_positions
      -> organization_member_positions -> position_capabilities -> organization_owner_transfers
      -> project_memberships -> project_invitations -> project_membership_roles
      -> project_role_capabilities -> platform_staff_positions -> certifications
      -> certification_documents -> certification_review_actions -> capability_grants
      -> workspace_preferences -> permission_audit_events
Phase D: add deferred/cyclic FK -> seed -> backfill -> validate
```

Phase C 先创建可空关系列但不添加循环 FK。Phase D 按 CFK-01、03—08、10，再 CFK-02/09，最后 CFK-11—13 的顺序增加组合唯一键和组合 FK；审核职务、工作台职务等普通循环 FK 也在此阶段追加。全过程禁止 `SET FOREIGN_KEY_CHECKS=0`，不得为绕过建表顺序永久放弃外键。
