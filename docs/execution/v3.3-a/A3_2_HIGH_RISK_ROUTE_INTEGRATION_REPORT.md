# V3.3-A / A3.2 高风险业务路由接入报告

## 结论

A3.2 已完成代码接入。51 个本阶段指定入口已在原业务事务之前调用统一授权内核；另外为项目关联会话补充了 6 个实时 membership 复核点。未修改 `drizzle/schema.ts`、0000—0029、金额单位或资金语义，未执行存量回填，未连接数据库或生产环境。

## 接入范围

- 项目 12 个：列表、详情、确认、上传/签发/禁用文件、提交/验收/返工里程碑、创建/响应/撤回变更。
- 报价 8 个：详情、版本、创建版本、方案、报价、我的报价、接受、拒绝。
- 文件链路：通用文件上传/签发/content、项目文件 content、认证文件所有者/后台签发及 content 实时复核。
- 认证后台 5 个、投诉后台 6 个、财务后台 8 个、后台菜单/实时统计/审计/平台运维 6 个。
- 项目关联会话 6 个：会话列表、发起、读取、发送、已读、回执；成员 `suspended/left/removed` 后实时失权。
- 公开序列化：工程师详情、商家列表先应用服务端敏感字段裁剪。

## 数据库授权 adapter

新增 `DrizzleAuthorizationDataSource`，按 account、capability、scope 和 resource 精确查询：账号、业务身份、认证、组织/项目 membership、岗位/角色能力、平台职务、grant、workspace preference，以及项目、文件、报价、会话、认证、投诉、退款、结算和 permission audit 资源事实。认证到期、职务/grant 有效期与全部撤销状态实时计算，不使用高风险授权缓存。

新增 `DrizzlePermissionAuditWriter`，向 `permission_audit_events` 写入所有 deny 和 high-risk allow；资源 ID 只写 SHA-256 摘要，context 仅含策略元数据。现有 `audit_logs` 写入器也增加手机号、邮箱、证件/账户号、URL 和凭证明文清洗。

## capability 映射

- 项目：`project.view`、`project.requirement.edit`、`project.file.*`、`project.milestone.*`、`project.change.*`。
- 报价：`quote.view/submit/accept/reject`；提交报价要求真实 engineer identity 和 `engineer_basic` approved 认证。
- 后台认证：queue/document/initial/final/revoke 五项能力。
- 投诉：read/investigate/decide；调查者不能裁定同案。
- 财务：read/review/funds.execute；审核者不能执行同一退款或结算。
- 后台入口：workspace、audit、permission capabilities 动态生成菜单；旧 admin role 不能单独放行。

若某项目角色尚无显式 `project_role_capabilities` 记录，运行时仅使用冻结的最小角色基线；一旦存在显式记录（包括 revoked），显式事实优先，冻结基线不覆盖。该命中写 compatibility audit，便于后续移除兼容层。

## compatibility adapter

- `users.role` 和 `user_profiles.currentRole` 只产生观测事件，不能直接 allow。
- A2.3 已迁移的新 membership/role/platform position 优先。
- 仅在项目没有 membership 时，旧 `ownerId/engineerId` 可解析为受 capability、账号、项目状态和资源关系共同约束的兼容事实；命中写 `compat:project:*` 事件。
- `workspace_preferences` 仅作为工作台偏好观测，不产生能力。

## 文件、字段与职责分离

- 通用文件、项目文件和认证文档的签发端/content 端使用同一 `accessPolicyVersion`；content 每次重新授权，旧签名不能绕过撤权。
- 项目文件同时检查 membership、clearance、NDA、文件状态和 policy version。
- 当前里程碑提交会写 `lastSubmittedByProjectMembershipId`，当前验收写 `reviewerProjectMembershipId`；没有从历史 `submittedBy` 反推 reviewer。
- 项目/报价/认证/投诉/财务/审计列表与详情应用服务端 field mask。覆盖 phone、email、证件、企业注册、结算账户、精确地址/坐标、报价、文件名/storageKey/URL、BOM、工艺、设计源文件、审计 context、Push token 和错误正文。
- 认证文件返回短签名，并用不含个人信息的请求级水印摘要标记下载。

## 测试结果

| 命令 | 结果 |
| --- | --- |
| `pnpm check` | PASS |
| `pnpm lint` | PASS，0 warning |
| `pnpm check:money:v330` | PASS，30/30 registered |
| `pnpm test:v33-a2-backfill` | PASS；数据库集成 `BLOCKED_BY_ENVIRONMENT` |
| `pnpm test:v33-a3-authorization` | PASS，18 cases |
| `pnpm test:v33-a3-routes` | PASS，16 cases |
| `pnpm test` | 79 PASS，1 环境失败：源码包没有 `.git`，`git ls-tree HEAD` 无法执行 |

A3.2 专项覆盖普通账号/旧 admin 后台拒绝、跨项目、成员撤权、兼容观测、旧签名撤权、文件名裁剪、报价隔离、认证/投诉/财务职责分离、Provider 前置拒绝、security auditor 只读、currentRole 不增权、列表脱敏、审计脱敏和原事务静态回归。

## 环境阻断与 A6 暂缓项

当前未设置安全 `DATABASE_URL`，因此真实 MySQL 路由集成、签名下载端到端和 Provider 沙箱集成均标记为 `BLOCKED_BY_ENVIRONMENT`，没有伪造结果。DB-EMPTY、完整越权矩阵、全量并发、恢复演练、真机、最终字段复核和发布证据按计划留到 A6。

## A4+A5 开工条件

授权代码基线已具备 A4+A5 的代码开工条件；这不等于生产发布条件。开始 A4 前应复用 `authorizeOrThrow`/`capabilityProcedure` 和服务端 field mask，不得重新以客户端角色或 `users.role/currentRole` 作为最终授权。按本任务要求，本次不进入 A4。

## 工作区

源码包没有 `.git`，无法生成可靠 Git diff/status，也未创建临时仓库。未提交、未推送；没有改动 Schema 或 0000—0029。
