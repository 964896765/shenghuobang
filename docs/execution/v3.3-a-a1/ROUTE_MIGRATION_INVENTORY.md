Document Status: ACTIVE
Spec Version: 2.0.0
Updated At: 2026-07-19
Parent Stage: V3.3-A / A1
Source Scan: server/routers.ts, server/routers/*.ts, server/_core/fileRoutes.ts, server/_core/projectFileAccess.ts

# V3.3-A / A1 路由迁移清单

## 1. 标记与约定

- `KEEP`：路径/语义保留，只补统一字段裁剪或审计。
- `COMPATIBILITY_ADAPTER`：旧路径保留，内部转新模型并记录兼容命中。
- `MIGRATE`：路径可保留，但鉴权、范围或职责分离必须替换。
- `ADD`：目标阶段新增。
- `DEPRECATE`：停止新调用，给出替代路径。
- `REMOVE_LATER`：完成兼容门禁后另批移除；本轮不删除。

“Org/Project”表示是否需要经过验证的上下文；客户端传入 ID 永远不能直接成为授权事实。

## 2. 账号、资料、工程师、商家与认证（21）

| 标记 | 当前路由 | 当前鉴权 | 目标能力 | 数据范围 | Org | Project | 敏感 | 兼容策略 | 阶段 | 测试 |
|---|---|---|---|---|---|---|---|---|---|---|
| KEEP | `auth.me` | public/session optional | `account.profile.view_self`（有会话时） | SELF | N | N | 是 | 不返回职务全量/敏感字段 | A3 | SEC-002 |
| COMPATIBILITY_ADAPTER | `profile.me` | protected | `account.profile.view_self`,`identity.list_self` | SELF | N | N | 是 | 合并新身份/偏好；旧 profile fallback | A3 | SEC-011,032 |
| MIGRATE | `profile.update` | protected+self | `account.profile.update_self` | SELF | N | N | 是 | 账号资料与 identity profile 分流 | A3/A4 | SEC-032 |
| COMPATIBILITY_ADAPTER | `profile.switchRole` | active status + 写 currentRole | `identity.switch` | SELF | 条件 | N | 否 | 转写 workspace preference；旧字段仅镜像 | A3/A5 | SEC-011,029 |
| COMPATIBILITY_ADAPTER | `profile.applyEngineer` | protected+旧 verification service | `identity.create`,`certification.submit_self` | SELF | N | N | 高敏 | 创建/复用 engineer identity 后转通用认证 | A4 | SEC-010,024 |
| COMPATIBILITY_ADAPTER | `profile.applyMerchant` | 同上 | `identity.create`,`certification.submit_self` | SELF | 条件 | N | 高敏 | 不自动将个人商家升级组织 | A4 | SEC-010,038 |
| KEEP | `engineers.list` | public | `identity.directory.view_public` | PUBLIC/CITY_OR_REGION | N | N | 是 | 只返公开字段 | A3 | SEC-032 |
| MIGRATE | `engineers.detail` | public | `identity.directory.view_public`,`project.view` | PUBLIC/PROJECT | N | 条件 | 是 | 按 viewer 关系字段掩码 | A3 | SEC-032 |
| MIGRATE | `engineers.setAccepting` | protected+self | `identity.profile.update_self` | SELF | N | N | 否 | 要求 active identity+certification | A4 | SEC-010,011 |
| KEEP | `merchants.list` | public | `identity.directory.view_public` | PUBLIC/CITY_OR_REGION | N | N | 是 | 地址/联系人裁剪 | A3 | SEC-032 |
| COMPATIBILITY_ADAPTER | `verifications.mine` | protected | `certification.view_self` | SELF | 条件 | N | 高敏 | 新表优先、旧表 fallback | A3/A4 | SEC-024 |
| COMPATIBILITY_ADAPTER | `verifications.submitIdentity` | protected | `certification.submit_self` | SELF | N | N | 高敏 | 转 `real_name` certification | A4 | SEC-024 |
| COMPATIBILITY_ADAPTER | `verifications.submitEngineer` | protected | `certification.submit_self` | SELF | N | N | 高敏 | 转 engineer identity certification | A4 | SEC-010,024 |
| COMPATIBILITY_ADAPTER | `verifications.submitMerchant` | protected | `certification.submit_self` | SELF | 条件 | N | 高敏 | 主体显式选择 identity/organization | A4 | SEC-038 |
| MIGRATE | `verifications.uploadDocument` | owner check | `certification.submit_self`,`file.access` | SELF/OWNED_RESOURCE | 条件 | N | 高敏 | 绑定新 certification；短签名/审计 | A3/A4 | SEC-031 |
| MIGRATE | `verifications.documentAccess` | document.ownerId | `certification.view_self`,`file.access` | OWNED_RESOURCE | 条件 | N | 高敏 | 内容端点实时复核 | A3 | SEC-015,031 |
| MIGRATE | `adminVerifications.pending` | old `verification.read` | `platform.certification.queue_read` | PLATFORM_ASSIGNED | N | N | 高敏 | 只返回分配队列 | A3/A4 | SEC-002,032 |
| MIGRATE | `adminVerifications.detail` | old `verification.read` | `platform.certification.queue_read` | PLATFORM_ASSIGNED | N | N | 高敏 | 字段掩码 | A3/A4 | SEC-032 |
| MIGRATE | `adminVerifications.documentAccess` | old `verification.read` | `platform.certification.document_read` | PLATFORM_ASSIGNED | N | N | 高敏 | 水印、purpose、短签名、审计 | A3/A4 | SEC-031 |
| MIGRATE | `adminVerifications.review` | old `verification.review` 单阶段 | `platform.certification.review_initial`,`platform.certification.review_final` | PLATFORM_ASSIGNED | N | N | 高敏 | action 明确阶段，执行 SoD | A4 | SEC-027 |
| MIGRATE | `adminVerifications.revoke` | old `verification.revoke` | `platform.certification.revoke` | PLATFORM_ASSIGNED | N | N | 高敏 | 二次确认、即时撤权 | A4 | SEC-010 |

## 3. 报价与项目（20）

| 标记 | 当前路由 | 当前鉴权 | 目标能力 | 数据范围 | Org | Project | 敏感 | 兼容策略 | 阶段 | 测试 |
|---|---|---|---|---|---|---|---|---|---|---|
| MIGRATE | `quotes.detail` | quote.engineerId/need.creatorId | `quote.view` | OWNED_RESOURCE/ASSIGNED_RESOURCE | 条件 | N | 高敏 | 旧双方关系适配 | A3 | SEC-014 |
| MIGRATE | `quotes.submitSolution` | 登录+需求状态 | `quote.submit` | ASSIGNED_RESOURCE | 条件 | N | 是 | 新身份/认证优先，旧 approved fallback | A3 | SEC-010,011 |
| MIGRATE | `quotes.submitQuote` | `engineerStatus`/认证 | `quote.submit` | ASSIGNED_RESOURCE | 条件 | N | 高敏 | 不信 currentRole | A3 | SEC-010,014 |
| MIGRATE | `quotes.versions` | engineer/creator ID | `quote.view` | OWNED_RESOURCE/ASSIGNED_RESOURCE | 条件 | N | 高敏 | 竞争报价隔离 | A3 | SEC-014 |
| MIGRATE | `quotes.createVersion` | 报价 owner | `quote.submit` | OWNED_RESOURCE | 条件 | N | 高敏 | 版本状态+认证 | A3 | SEC-010 |
| MIGRATE | `quotes.myQuotes` | current account | `quote.view` | OWNED_RESOURCE | 条件 | N | 高敏 | 按 identity/org workspace filter | A3 | SEC-011 |
| MIGRATE | `quotes.accept` | need creator | `quote.accept` | OWNED_RESOURCE | N | N | 高敏 | 原子创建 project+members | A3/A5 | SEC-014 |
| MIGRATE | `quotes.reject` | need creator | `quote.reject` | OWNED_RESOURCE | N | N | 高敏 | 路由保留，能力条件区分动作 | A3 | SEC-014 |
| MIGRATE | `projects.list` | ownerId/engineerId 查询 | `project.view` | PROJECT | 条件 | Y | 是 | project_memberships 新优先 | A3 | SEC-004,005 |
| MIGRATE | `projects.detail` | ownerId/engineerId | `project.view` | PROJECT/INVITED_RESOURCE | 条件 | Y | 高敏 | 兼容双读；字段掩码 | A3 | SEC-001,013 |
| MIGRATE | `projects.confirm` | 两方 ID | `project.requirement.edit` | PROJECT | N | Y | 高敏 | 多成员确认策略；旧字段保留 | A3/A5 | SEC-004 |
| DEPRECATE | `projects.pay` | ownerId | `project.payment.create` | PROJECT | 条件 | Y | 高敏 | 返回替代 payments flow；本轮不删 | A3 | SEC-004 |
| MIGRATE | `projects.uploadFile` | ownerId/engineerId | `project.file.upload` | PROJECT | 条件 | Y | 高敏 | member+state+clearance | A3 | SEC-015,035 |
| MIGRATE | `projects.fileAccessUrl` | ownerId/engineerId | `project.file.download` | PROJECT/INVITED_RESOURCE | 条件 | Y | 高敏 | 短签名不等于授权 | A3 | SEC-005,015,035 |
| MIGRATE | `projects.disableFile` | 项目双方 | `project.file.disable` | PROJECT | 条件 | Y | 高敏 | 上传者/lead+冻结/证据检查 | A3 | SEC-034 |
| MIGRATE | `projects.submitMilestone` | 文件 uploader/项目双方 | `project.milestone.submit` | ASSIGNED/PROJECT | N | Y | 高敏 | assignee+正式文件+状态 | A3 | SEC-016 |
| MIGRATE | `projects.acceptMilestone` | owner | `project.milestone.accept` | ASSIGNED/PROJECT | N | Y | 高敏 | 独立验收 | A3 | SEC-016 |
| MIGRATE | `projects.requestRevision` | owner | `project.milestone.request_revision` | ASSIGNED/PROJECT | N | Y | 高敏 | 同上 | A3 | SEC-016 |
| MIGRATE | `projects.createChange` | owner/engineer | `project.change.propose` | PROJECT | N | Y | 高敏 | member+state+version | A3 | SEC-004 |
| MIGRATE | `projects.respondChange`/`withdrawChange` | 非发起方/发起方 ID | `project.change.approve`/`project.change.propose` | PROJECT | N | Y | 高敏 | 禁止自批；CAS | A3 | SEC-019 |

## 4. 文件与消息（11）

| 标记 | 当前路由 | 当前鉴权 | 目标能力 | 数据范围 | Org | Project | 敏感 | 兼容策略 | 阶段 | 测试 |
|---|---|---|---|---|---|---|---|---|---|---|
| MIGRATE | `POST /api/files/upload` | canManageRelatedFile + role | `file.access` + 资源写能力 | OWNED_RESOURCE/ORGANIZATION/PROJECT | 条件 | 条件 | 高敏 | 资源解析器统一；reasonCode | A3 | SEC-012,013 |
| KEEP | `GET /api/files/:id/public` | public image rules | `file.access` | PUBLIC | N | N | 否 | 保持 MIME/扫描/状态校验 | A3 | SEC-032 |
| MIGRATE | `GET /api/files/:id/access` | owner/public | `file.access` | OWNED_RESOURCE/ORGANIZATION/PROJECT/PUBLIC | 条件 | 条件 | 高敏 | 签发前统一授权 | A3 | SEC-015,035 |
| MIGRATE | `GET /api/files/:id/content` | token+owner/public | `file.access` | 同上 | 条件 | 条件 | 高敏 | 内容端点实时复核撤权 | A3 | SEC-005,009 |
| MIGRATE | `GET /api/project-files/:id` | token+ownerId/engineerId | `project.file.download` | PROJECT/INVITED_RESOURCE | 条件 | Y | 高敏 | membership+clearance+NDA | A3 | SEC-015,035 |
| KEEP | `messagesRouter.conversations` | participant filter | `message.read` | SELF/PROJECT/ORG | 条件 | 条件 | 是 | 增资源撤权过滤 | A3 | SEC-005 |
| MIGRATE | `messagesRouter.start` | 仅登录 | `message.start` | OWNED_RESOURCE/PROJECT/ORGANIZATION/ASSIGNED_RESOURCE | 条件 | 条件 | 是 | 必须验证 refType/refId | A3 | SEC-024 |
| KEEP | `messagesRouter.messages` | participant | `message.read` | SELF/PROJECT/ORG | 条件 | 条件 | 是 | 撤权后项目/组织频道拒绝 | A3 | SEC-005 |
| KEEP | `messagesRouter.send` | participant | `message.send` | SELF/PROJECT/ORG | 条件 | 条件 | 是 | 发送时重查资源授权 | A3 | SEC-005 |
| KEEP | `messagesRouter.markConversationRead` | participant | `message.read` | SELF/PROJECT/ORG | 条件 | 条件 | 是 | 不泄露消息正文 | A3 | SEC-005 |
| KEEP | `messagesRouter.receipts` | participant | `message.read` | SELF/PROJECT/ORG | 条件 | 条件 | 是 | 仅参与者可见 | A3 | SEC-001 |

## 5. 平台后台（22）

| 标记 | 当前路由 | 当前鉴权 | 目标能力 | 数据范围 | Org | Project | 敏感 | 兼容策略 | 阶段 | 测试 |
|---|---|---|---|---|---|---|---|---|---|---|
| MIGRATE | `admin.menu` | role!=user | `platform.workspace.access` | PLATFORM_ASSIGNED | N | N | 是 | 从有效职务算入口 | A3 | SEC-002,021 |
| COMPATIBILITY_ADAPTER | `admin.changeRole` | old admin.roles.write | `platform.permission.manage` | PLATFORM_ASSIGNED | N | N | 高敏 | 转职务分配；不再写 users.role | A4 | SEC-022 |
| REMOVE_LATER | `adminProcedure` 调用模式 | role!=user | `platform.workspace.access`（入口最低要求；具体路由另检能力） | - | - | - | 是 | A3 适配，A6 无调用后另批删除 | A3/A6 | SEC-021 |
| MIGRATE | `auditLogs.list` | old audit.read | `platform.audit.read` | PLATFORM_ASSIGNED | N | N | 高敏 | 只读、字段裁剪 | A3 | SEC-030,031 |
| MIGRATE | `auditLogs.detail` | old audit.read | `platform.audit.read` | PLATFORM_ASSIGNED | N | N | 高敏 | 访问审计 | A3 | SEC-030 |
| MIGRATE | `platformOperations.fileAccess` | old audit.read | `platform.audit.read` | PLATFORM_ASSIGNED | N | N | 高敏 | 最小范围 | A3 | SEC-030 |
| MIGRATE | `platformOperations.notificationFailures` | old audit.read | `platform.audit.read` | PLATFORM_ASSIGNED | N | N | 是 | token/正文裁剪 | A3 | SEC-031 |
| MIGRATE | `adminComplaints.list` | old complaint.read | `platform.complaint.read` | PLATFORM_ASSIGNED | N | 条件 | 高敏 | 只列分配案件 | A3 | SEC-002 |
| MIGRATE | `adminComplaints.detail` | old complaint.read | `platform.complaint.read` | PLATFORM_ASSIGNED | N | 条件 | 高敏 | 字段/证据按目的 | A3 | SEC-032 |
| MIGRATE | `adminComplaints.requestEvidence` | old complaint.operate | `platform.complaint.investigate` | PLATFORM_ASSIGNED | N | 条件 | 高敏 | 记录 investigator | A3 | SEC-028 |
| MIGRATE | `adminComplaints.negotiate` | old complaint.operate | `platform.complaint.investigate` | PLATFORM_ASSIGNED | N | 条件 | 高敏 | 同上 | A3 | SEC-028 |
| MIGRATE | `adminComplaints.decide` | old complaint.decide | `platform.complaint.decide` | PLATFORM_ASSIGNED | N | 条件 | 高敏 | 调查/裁定分离 | A3 | SEC-028 |
| MIGRATE | `adminComplaints.close` | old complaint.operate | `platform.complaint.decide` 或案件关闭能力 | PLATFORM_ASSIGNED | N | 条件 | 高敏 | 只能裁定后关闭 | A3 | SEC-028 |
| MIGRATE | `adminFinance.refunds` | old finance.read | `platform.finance.read` | PLATFORM_ASSIGNED | N | 条件 | 高敏 | 分配范围/字段裁剪 | A3 | SEC-002 |
| MIGRATE | `adminFinance.settlements` | old finance.read | `platform.finance.read` | PLATFORM_ASSIGNED | N | Y | 高敏 | 同上 | A3 | SEC-017 |
| MIGRATE | `adminFinance.approveRefund` | old finance.refund.review | `platform.finance.review` | PLATFORM_ASSIGNED | N | 条件 | 高敏 | 写 reviewer actor | A3 | SEC-017 |
| MIGRATE | `adminFinance.rejectRefund` | old finance.refund.review | `platform.finance.review` | PLATFORM_ASSIGNED | N | 条件 | 高敏 | 同上 | A3 | SEC-017 |
| MIGRATE | `adminFinance.executeRefund` | 同审核能力 | `platform.funds.execute` | PLATFORM_ASSIGNED | N | 条件 | 高敏 | 必须不同人且幂等 | A3 | SEC-017 |
| MIGRATE | `adminFinance.retryRefund` | 同审核能力 | `platform.funds.execute` | PLATFORM_ASSIGNED | N | 条件 | 高敏 | 不同人；复用/派生幂等键 | A3 | SEC-017 |
| MIGRATE | `adminFinance.approveSettlement` | old finance.release | `platform.finance.review` | PLATFORM_ASSIGNED | N | Y | 高敏 | 审核与执行拆开 | A3 | SEC-017 |
| MIGRATE | `adminFinance.releaseSettlement` | old finance.release | `platform.funds.execute` | PLATFORM_ASSIGNED | N | Y | 高敏 | 重新读取 reviewer | A3 | SEC-017 |
| MIGRATE | `realtimeAdmin.stats` | `role==='admin'` | `platform.audit.read` | PLATFORM_ASSIGNED | N | N | 是 | 去掉直接角色判断 | A3 | SEC-021,030 |

## 6. 新增目标路由（23）

| 标记 | 目标路由 | 目标能力 | 数据范围 | Org | Project | 敏感 | 目标阶段 | 测试 |
|---|---|---|---|---|---|---|---|---|
| ADD | `identity.listMine` | `identity.list_self` | SELF | N | N | 是 | A4 | SEC-029 |
| ADD | `identity.create` | `identity.create` | SELF | N | N | 是 | A4 | SEC-023 |
| ADD | `identity.suspend` | `identity.suspend` | SELF | N | N | 是 | A4 | SEC-023 |
| ADD | `workspace.listAvailable` | `identity.list_self` | SELF | 条件 | 条件 | 是 | A5 | SEC-011 |
| ADD | `workspace.switch` | `identity.switch`/上下文关系 | SELF | 条件 | 条件 | 否 | A5 | SEC-011,029 |
| ADD | `organization.create` | `organization.create` | OWNED_RESOURCE | N | N | 是 | A4 | SEC-020 |
| ADD | `organization.listMine` | `organization.view` | SELF/ORGANIZATION | Y | N | 是 | A4 | SEC-003 |
| ADD | `organization.get` | `organization.view` | ORGANIZATION/PUBLIC | Y | N | 是 | A4 | SEC-003,032 |
| ADD | `organization.invitation.create` | `organization.member.invite` | ORGANIZATION | Y | N | 是 | A4 | SEC-003 |
| ADD | `organization.invitation.accept` | `organization.invitation.accept` | INVITED_RESOURCE | Y | N | 是 | A4 | SEC-007,008,018 |
| ADD | `organization.member.list` | `organization.member.list` | ORGANIZATION | Y | N | 是 | A4 | SEC-032 |
| ADD | `organization.member.suspend` | `organization.member.suspend` | ORGANIZATION | Y | N | 是 | A4 | SEC-006,037 |
| ADD | `organization.member.restore` | `organization.member.restore` | ORGANIZATION | Y | N | 是 | A4 | SEC-006 |
| ADD | `organization.member.remove/leave` | `organization.member.remove`,`organization.member.leave` | ORGANIZATION/SELF | Y | N | 是 | A4 | SEC-005,037 |
| ADD | `organization.member.assignPosition` | `organization.member.assign_position` | ORGANIZATION | Y | N | 高敏 | A4 | SEC-019,022 |
| ADD | `organization.owner.transfer` | `organization.owner.transfer` | ORGANIZATION | Y | N | 高敏 | A4 | SEC-036,037 |
| ADD | `project.member.list` | `project.member.list` | PROJECT | 条件 | Y | 是 | A5 | SEC-004 |
| ADD | `project.member.invite/accept` | `project.member.invite`,`project.invitation.accept` | PROJECT/INVITED_RESOURCE | 条件 | Y | 是 | A5 | SEC-018,025 |
| ADD | `project.member.remove` | `project.member.remove` | PROJECT | 条件 | Y | 是 | A5 | SEC-005,019 |
| ADD | `project.role.assign` | `project.role.assign` | PROJECT | 条件 | Y | 高敏 | A5 | SEC-016,019 |
| ADD | `platformStaff.assign/suspend/revoke` | `platform.permission.manage` | PLATFORM_ASSIGNED | N | N | 高敏 | A5 | SEC-022,028 |
| ADD | `authorization.explainMine` | `identity.list_self` | SELF | 条件 | 条件 | 是 | A3 | SEC-011 |
| ADD | `certification.resubmit` | `certification.submit_self` | SELF | 条件 | N | 高敏 | A4 | SEC-024 |

## 7. 路由迁移门禁

1. 每条 `MIGRATE/COMPATIBILITY_ADAPTER/ADD` 路由必须有 allow、deny、伪造上下文和审计断言。
2. `adminProcedure`、`ctx.user.role`、`currentRole`、`ownerId/engineerId` 可以存在于兼容适配器，但不能直接产生最终 allow。
3. 文件签名生成端和内容端必须使用同一策略版本；成员/认证/职务撤销后内容端立即拒绝。
4. A3 只迁移现有高风险路由；A4/A5 新服务按表中阶段实现；A1/A2 不修改 API。
