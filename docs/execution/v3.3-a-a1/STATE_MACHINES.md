Document Status: ACTIVE
Spec Version: 2.1.0
Updated At: 2026-07-19
Parent Stage: V3.3-A / A1.1

# V3.3-A / A1.1 状态机

## 1. 通用执行契约

- 状态更新必须是领域命令，不开放任意 `status` 写入。
- 所有命令携带 `requestId`（幂等）和 `expectedVersion`（并发保护）；CAS 失败返回 `CONCURRENT_MODIFICATION`。
- 权限变化、敏感 allow/deny 和非法迁移写 `permission_audit_events`；业务历史动作表只追加。
- 非法迁移统一返回 `RESOURCE_STATE_FORBIDDEN`，不得静默成功、覆盖或删除旧记录。
- 恢复不是把历史删除，而是显式迁移并记录发起者、原因、前后状态和策略版本。

## 2. 业务身份 `business_identities.status`

状态：`active`（初始）→ `suspended` → `active`；`active|suspended` → `closed`（终态）。

| 迁移 | 发起者 | 前置条件 | 并发/幂等 | 审计 | 恢复/非法处理 |
|---|---|---|---|---|---|
| create → active | 本人/系统回填/平台 | type active；同账号类型唯一 | `(account,type)` unique；requestId | `identity.created` | 重复返回既有记录 |
| active → suspended | 本人或平台治理 | 无未交接关键任务；平台需能力 | version CAS | `identity.suspended` | 可 restore；已 suspended 重复成功 |
| suspended → active | 本人或治理人员 | 处罚解除；依赖认证按能力另检 | version CAS | `identity.restored` | active 重复成功 |
| active/suspended → closed | 本人/平台 | 二次确认；历史保留 | version CAS | `identity.closed` | 默认不可恢复；重开创建新审批流程 |

consumer 身份不得被关闭到账号无任何基本身份；身份停用不改认证历史，但依赖身份的能力立即失效。

## 3. 认证 `certifications.status`

状态完整集合：`not_applied`（初始/可为无记录的派生视图）、`pending`、`additional_info_required`、`approved`、`rejected`、`revoked`、`expired`。

| 迁移 | 发起者 | 前置条件 | 并发/幂等 | 审计 | 撤销/恢复/非法处理 |
|---|---|---|---|---|---|
| not_applied → pending | 认证主体 | 类型/主体 active；材料齐全；无开放申请 | activeDedupeKey + requestId | `certification.submitted` | 重复提交返回同申请 |
| pending → additional_info_required | 初审员 | 案件分配；理由和缺件列表 | action requestId + version | `certification.info_required` | 主体补件后 resubmit |
| additional_info_required → pending | 主体 | 新材料版本；未过补件期限 | requestId + version | `certification.resubmitted` | 重复返回当前 pending |
| pending → approved | 单审或复审员 | reviewMode 满足；材料可用；复审人与初审人不同 | review action unique + version | `certification.approved` | approved 后只能 revoke/expire |
| pending → rejected | 有权审核员 | 理由代码必填；两阶段规则满足 | 同上 | `certification.rejected` | 重新申请创建新 applicationNo，不倒回同记录 |
| approved → revoked | 有权治理人员 | 证据、二次确认；不能删历史 | version CAS | `certification.revoked` | 重新申请新记录；依赖能力即时失效 |
| approved → expired | 系统任务 | `expiresAt<=now` | job key + version | `certification.expired` | 续期创建新申请/按类型规则 |

同一人初审再复审返回 `SEPARATION_OF_DUTIES`；旧单阶段记录只标 `legacy_single_stage`，不得伪造复审。

## 4. 组织 `organizations.status`

状态：`active`（初始）、`suspended`、`dissolving`、`closed`。

| 迁移 | 发起者 | 前置条件 | 并发/幂等 | 审计 | 恢复/非法处理 |
|---|---|---|---|---|---|
| create → active | 创建账号 | 原子生成组织、owner membership/position | requestId + transaction | `organization.created` | 失败整体回滚 |
| active → suspended | 平台治理 | 处罚/关键认证失效；原因必填 | version CAS | `organization.suspended` | 高风险写立即失效；保留只读法定义务 |
| suspended → active | 平台治理 | 处罚解除/认证恢复 | version CAS | `organization.restored` | active 重复成功 |
| active/suspended → dissolving | owner | 二次确认；开始清理 | requestId + version | `organization.dissolving` | 可在关闭前取消并回原状态 |
| dissolving → closed | owner+系统 | 活动项目=0、未结资金=0、开放邀请/转让=0、法定保留完成 | 行锁+version | `organization.closed` | closed 终态 |

存在活动项目时关闭返回 `RESOURCE_STATE_FORBIDDEN`。

## 5. 组织成员 `organization_memberships.status`

状态：`active`（邀请接受/创建者初始）、`suspended`、`left`、`removed`。

| 迁移 | 发起者 | 前置条件 | 并发/幂等 | 审计 | 恢复/非法处理 |
|---|---|---|---|---|---|
| create → active | 邀请接受事务/组织创建 | invitation accepted 或 creator owner | membership unique + requestId | `organization.member.joined` | 重复接受返回同 membership |
| active → suspended | owner/admin | 目标非最后 owner；理由 | version CAS + owner 行锁 | `organization.member.suspended` | 派生权限/签名即时失效 |
| suspended → active | owner/admin | org active；目标仍合规 | version CAS | `organization.member.restored` | active 重复成功 |
| active/suspended → left | 成员本人 | 非最后 owner；任务/资产交接 | version CAS + owner 行锁 | `organization.member.left` | 权限终态；关系行保留 |
| active/suspended → removed | owner/admin | 非最后 owner；不得自移除逃避责任 | version CAS | `organization.member.removed` | 权限终态；关系行保留 |
| left/removed → active | 新邀请接受事务 | 新 invitation 已锁定且 accepted；org active；账号匹配 | 稳定唯一行 + `lastRequestId` + version CAS | `organization.member.reactivated` | **模式 A**；无新邀请直接恢复拒绝 |

## 6. 组织邀请 `organization_invitations.status`

状态：`pending`（初始）→ `accepted|declined|revoked|expired`（终态）。

| 迁移 | 发起者 | 前置条件 | 并发/幂等 | 审计 | 非法处理 |
|---|---|---|---|---|---|
| create → pending | 有 invite 能力成员 | org/member active；被邀请主体明确；到期时间未来 | requestId/tokenDigest/activeDedupeKey unique | `organization.invitation.created` | 重复开放目标返回原邀请 |
| pending → accepted | 被邀请账号 | token/主体匹配；未过期；org active | `SELECT FOR UPDATE` + version；原子建 membership | `organization.invitation.accepted` | 重复接受返回原 membership；他人接受 `INVITATION_INVALID` |
| pending → declined | 被邀请账号 | token/主体匹配 | version CAS | `organization.invitation.declined` | 终态重复幂等 |
| pending → revoked | 邀请人/组织管理员 | 邀请仍 pending | version CAS | `organization.invitation.revoked` | accepted 后不可撤销，改走成员移除 |
| pending → expired | 系统/接受时惰性过期 | `expiresAt<=now` | job/requestId + version | `organization.invitation.expired` | 接受返回 `INVITATION_EXPIRED` |

## 7. 项目邀请 `project_invitations.status`

状态同组织邀请：`pending` → `accepted|declined|revoked|expired`。

额外规则：创建和接受均重新检查项目状态、邀请人项目成员状态、目标账号/组织关系、提议角色、clearance 和 NDA；创建使用 `activeDedupeKey`，接受事务原子创建或重新激活 `project_memberships` 与 `project_membership_roles`。并发重复接受只生成一个稳定成员/角色关系；项目关闭、邀请人被移除或 NDA 失效时拒绝并可转 `revoked/expired`。审计事件前缀为 `project.invitation.*`。

## 8. 项目成员 `project_memberships.status`

状态：`active`（初始）、`suspended`、`left`、`removed`。

| 迁移 | 发起者 | 前置条件 | 并发/幂等 | 审计 | 恢复/非法处理 |
|---|---|---|---|---|---|
| create → active | 邀请接受/A2 legacy 回填 | 项目存在；账号唯一；来源有效 | unique + requestId | `project.member.joined/backfilled` | 重复返回原成员 |
| active → suspended | project lead/治理 | 目标非最后负责人；任务重分配 | version CAS | `project.member.suspended` | 文件/消息/写权限即时失效 |
| suspended → active | project lead/治理 | 项目可协作；来源组织仍有效 | version CAS | `project.member.restored` | active 重复成功 |
| active/suspended → left | 成员本人 | 非最后负责人；交接完成 | version CAS | `project.member.left` | 权限终态；历史署名和关系行保留 |
| active/suspended → removed | project lead/治理 | 非最后负责人；理由 | version CAS | `project.member.removed` | 权限终态；关系行保留 |
| left/removed → active | 新项目邀请接受事务 | 新 invitation 已锁定且 accepted；项目可协作；账号匹配 | 稳定唯一行 + `lastRequestId` + version CAS | `project.member.reactivated` | **模式 A**；无新邀请直接恢复拒绝 |

来源组织成员停职/退出时，不删除项目成员；授权解析将其视为无效或进入待重分配，具体由项目来源策略决定并审计。

## 9. 平台后台职务 `platform_staff_positions.status`

状态：`active`（初始）、`suspended`、`revoked`、`expired`。

| 迁移 | 发起者 | 前置条件 | 并发/幂等 | 审计 | 恢复/非法处理 |
|---|---|---|---|---|---|
| create → active | 另一名 permission admin | 目标/范围有效；禁止自授 super/PLATFORM_ALL；二次确认 | activeDedupeKey + requestId | `platform.position.assigned` | 重复返回原职务 |
| active → suspended | permission admin/安全治理 | 理由；不能自操作高权职务 | version CAS | `platform.position.suspended` | 即时撤权；可 restore |
| suspended → active | 另一名 permission admin | 原因解除；有效期未过 | version CAS | `platform.position.restored` | active 重复成功 |
| active/suspended → revoked | 另一名 permission admin | 二次确认；案件交接 | version CAS | `platform.position.revoked` | 终态；重新分配新记录 |
| active/suspended → expired | 系统 | validUntil<=now | job key + version | `platform.position.expired` | 续期建新记录 |

## 10. 能力授予 `capability_grants.status`

状态：`active`（初始）、`revoked`、`expired`。

| 迁移 | 发起者 | 前置条件 | 并发/幂等 | 审计 | 恢复/非法处理 |
|---|---|---|---|---|---|
| create → active | 有 scope 内授权能力者 | capability active；主体有效；范围不高于授予者；不得绕过 SoD | activeDedupeKey + requestId | `capability.granted` | 重复返回原 grant |
| active → revoked | 原授权者/有权管理员 | 理由；目标匹配；禁止销毁历史 | version CAS | `capability.revoked` | 终态；恢复需新 grant |
| active → expired | 系统/惰性检查 | validUntil<=now | job key + version | `capability.expired` | 新授权新记录 |

任何 grant 即使 active，仍必须通过认证、成员状态、资源状态、保密和职责分离检查。

## 11. 关系唯一性与终态统一规则

`organization_memberships`、`project_memberships`、`organization_member_positions`、`project_membership_roles`、`position_capabilities`、`project_role_capabilities` 统一采用**模式 A：稳定关系行**。前两类只有在新邀请 accepted 的同一事务中允许 `left/removed -> active`；后四类只有在新分配/映射命令中允许 `revoked -> active`。每次恢复都锁定稳定行、验证组合 FK 范围、写 `lastRequestId`、递增 `version`、清空旧终结字段，并追加唯一 `idempotencyKey` 审计。终态对权限解析仍是终态；“可受控重新激活”不等于任意状态回退。

`certifications`、`organization_invitations`、`project_invitations`、`organization_owner_transfers`、`platform_staff_positions`、`capability_grants` 统一采用**模式 B：历史多记录**。创建开放记录时填充数据字典 ADK-01—06，进入终态时在同一 CAS 中清空 `activeDedupeKey`，后续命令创建新行。`platform_staff_positions.suspended` 仍为开放记录；owner transfer 的 `pending/confirmed` 均为开放记录；认证的 `approved` 在有效期内仍占用同类开放键。

所有模式 A/B 并发命令统一规则：先执行范围组合 FK/替代约束验证，再锁父聚合和当前关系；唯一键冲突读取赢家并按 requestId 判断幂等，否则返回 `CONCURRENT_MODIFICATION`。不得依赖服务层“先查无记录再插入”。

## 12. 非法迁移测试映射

| 状态机 | 安全测试 |
|---|---|
| 业务身份 | `SEC-023`、`SEC-029` |
| 认证 | `SEC-010`、`SEC-024`、`SEC-027` |
| 组织 | `SEC-020`、`SEC-030` |
| 组织成员 | `SEC-005`、`SEC-006`、`SEC-019` |
| 组织邀请 | `SEC-007`、`SEC-008`、`SEC-018` |
| 项目邀请 | `SEC-018`、`SEC-025` |
| 项目成员 | `SEC-004`、`SEC-005`、`SEC-006` |
| 平台职务 | `SEC-017`、`SEC-021`、`SEC-028` |
| 能力授予 | `SEC-009`、`SEC-022`、`SEC-026` |
| 模式 A 关系重新激活 | `SEC-041`、`SEC-042` |
| 模式 B 开放记录去重 | `SEC-040` |
