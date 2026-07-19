# V3.3-A / A4+A5 身份、组织与工作台实施报告

日期：2026-07-19  
结论：A4 身份/认证/组织接口与 A5 工作台/移动端接入已完成代码实现及无数据库环境下的静态、合成和构建门禁。本轮未修改 `drizzle/schema.ts` 或 0000—0029，未执行历史回填，未连接任何数据库，未进入 V3.3-B。

## 1. 实际修改文件

新增：

- `server/services/identity-organization-domain.ts`
- `server/services/identity-service.ts`
- `server/services/organization-service.ts`
- `server/services/workspace-service.ts`
- `server/routers/identity-organization-router.ts`
- `app/workspaces.tsx`
- `app/organizations/index.tsx`
- `app/organizations/[id].tsx`
- `scripts/test-v33-a4-identity-organization.ts`
- `scripts/test-v33-a5-workspace-mobile.ts`
- 本报告

修改：

- `server/authorization/drizzle-data-source.ts`
- `server/routers.ts`
- `lib/role-context.tsx`
- `app/(tabs)/profile.tsx`
- `app/engineer-apply.tsx`
- `app/merchant-apply.tsx`
- `app/verifications/index.tsx`
- `package.json`

构建生成物由既有命令更新：`dist/`、`web-dist/`。当前源码包无 `.git`，本报告不声称 git diff、commit、HEAD 或 push 状态。

## 2. 新增和迁移 API

### A4

- `accountProfile.update`：账号名称与公开 profile 分层写入；返回兼容镜像声明。
- `identity.listMine/create/updateProfile/suspend`：本人 business identity 的查询、去重创建、公开业务资料和停用。
- `certification.mine/submitIdentity/submitEngineer/submitMerchant`：三类新认证申请。
- `certification.uploadDocument/documents/documentAccess`：高敏认证材料扫描、存储、版本绑定、列表和经 A3 文件授权的访问入口。
- `organization.create/listMine/get/update`：组织创建、本人组织、详情和版本化更新。
- `organization.members/positions/createPosition`：成员、岗位及岗位能力模板。
- `organization.invite/respondInvitation`：邀请、接受和拒绝；明文 token 只在首次创建返回，库内只保存摘要。
- `organization.changeMemberStatus/leave`：停用、恢复、移除和本人退出。
- `organization.assignPosition/revokePosition`：稳定分配行的分配、撤销和受控再分配。

### A5

- `workspace.listAvailable`：返回个人、有效 identity、有效 organization membership 和有效 platform position 工作台。
- `workspace.switch`：服务端校验归属与状态后写 workspace preference，并仅单向更新 `currentRole` 兼容镜像。

### 旧路由迁移

| 旧路由 | 新事实/行为 |
| --- | --- |
| `profile.update` | `account.profile.update_self` 后写账号/公开 profile；不写业务认证资料 |
| `profile.applyEngineer` | 创建/复用 engineer identity，提交 `engineer_basic` certification |
| `profile.applyMerchant` | 创建/复用 merchant identity，提交 `merchant_business_license`；不创建组织 |
| `profile.switchRole` | 转写 `workspace_preferences`；`currentRole` 仅为兼容镜像 |
| `verifications` 移动端展示/实名提交/材料上传 | 优先读取和写入新 `certifications` / `certification_documents`；旧读取仅作过渡 fallback |

## 3. 服务端授权与数据保护

- 所有新增路由使用 `authorizeOrThrow`；组织能力来自 active membership、active member-position 和 active position-capability。
- `DrizzleAuthorizationDataSource` 新增 identity、organization、organization invitation 资源事实与冻结 SELF 能力清单。
- workspace 中的 active identity 优先参与授权解析；只有尚无 A2.3 workspace preference 的旧账号才使用既有最小兼容回退。
- `users.role`、`user_profiles.currentRole` 和 workspace preference 不直接产生 allow。
- profile 兼容响应先执行服务端敏感字段裁剪；认证列表不返回 `applicationData`、证件摘要、地址、storageKey 或永久 URL。
- 证件号和企业注册号写入 certification application 前转 SHA-256 摘要与末四位；地址、手机号、邮箱、token、storageKey 和文件 URL 不进入 application JSON。
- 认证文件必须通过类型检测、安全扫描、大小和重复校验，按 `high_sensitive` stored file 保存，并再次经过 `file.access` 授权。
- 组织、成员、岗位、邀请与 workspace 高风险变更写 permission audit；审计资源 ID 只写摘要，detail 不含业务敏感正文。

## 4. 状态机和并发行为

### Identity / certification

- business identity：同账号同类型唯一；`active -> suspended` 后即时失权；closed 不原地恢复。
- certification：`pending`、`additional_info_required`、`approved` 占用确定性 active dedupe key；pending/approved 重复提交返回现有申请；补件转回 pending；rejected/revoked/expired 后创建新历史申请。
- approved 认证到期按 expired 解析；revoked/expired certification 不能设为 active identity workspace，也不能提供受认证能力。

### Organization

- 创建事务原子建立 organization、creator membership、system owner position、member-position 与冻结 owner capabilities。
- invitation：pending 才可接受/拒绝；过期写 expired；重复接受幂等返回；并发由 token/request/active-dedupe 唯一键裁决。
- membership：active 可进入 suspended/left/removed；suspended 可 restore；left/removed 只能通过新有效邀请复用稳定关系行并递增 version。
- position assignment：active/revoked 稳定关系；重新分配必须是新命令并更新 lastRequestId/version。
- 最后一名 active owner 不得退出、被移除或撤销 owner position。

### Workspace

- personal 不绑定 identity/organization/platform position。
- identity 必须属于当前账号且 identity=active；认证 revoked/expired 时拒绝。
- organization 必须 organization=active 且 membership=active。
- platform 必须职务 active 且在有效期内。
- 切换只改变默认 UI/查询上下文，不改历史 actor identity，不新增 capability。

## 5. 移动端接入

- “我的”新增“身份与工作台”“我的组织”入口。
- 工程师、商家申请页面改用新 certification API，并刷新 identity/certification/workspace/profile/organization 缓存。
- 认证中心优先展示新认证的 pending、approved、rejected、additional_info_required、expired、revoked 状态，并使用新认证材料 API。
- 工作台页具备 loading、empty、error、retry、不可用原因和稳定 reasonCode 提示；切换后刷新用户、能力相关入口和菜单缓存。
- 组织页支持创建组织、接受/拒绝邀请、创建岗位模板、查看成员、停用/恢复/移除成员、分配和撤销岗位。
- 管理后台入口依据服务端返回的有效 platform workspace 显示，不再依据 `users.role`。

## 6. 测试和门禁真实结果

| 命令 | 结果 |
| --- | --- |
| `pnpm check` | PASS |
| `pnpm lint` | PASS，0 warning |
| `pnpm check:money:v330` | PASS，30/30 注册一致 |
| `pnpm validate:product-specs` | PASS |
| `pnpm check:markdown-links` | PASS |
| `pnpm test:v33-a2-backfill` | PASS；数据库集成环境阻断 |
| `pnpm test:v33-a3-authorization` | PASS，18 cases |
| `pnpm test:v33-a3-routes` | PASS，16 cases；数据库集成环境阻断 |
| `pnpm test:v33-a3-integration-fixes` | PASS，13 groups；数据库集成环境阻断 |
| `pnpm test:v33-a4-identity-organization` | PASS，13 cases；数据库集成环境阻断 |
| `pnpm test:v33-a5-workspace-mobile` | PASS，13 cases；数据库集成环境阻断 |
| `pnpm test` | 79/80 PASS；唯一失败为无 `.git` 时 `git ls-tree -r --name-only HEAD` 无法执行 |
| `pnpm build` | PASS |
| `pnpm build:web` | PASS |

A4/A5 专项覆盖 identity/认证去重、认证实时失权、商家不建组织、跨账号/跨组织、无岗位、suspended/left/removed 失权、owner 初始化、敏感字段裁剪、工作台不增权、currentRole 伪造、他人/无效 identity、组织 membership、缓存刷新和移动端四态页面。

## 7. 环境阻断和已知问题

- `DATABASE_URL` 未设置，因此未执行 DB-EMPTY/MySQL 事务、组合 FK、唯一键竞争和真实行锁测试，状态为 `BLOCKED_BY_ENVIRONMENT`。
- 当前源码包无 `.git`，全量测试中的源码归档用例无法执行；未创建临时 Git 仓库。
- 未执行 Android/iOS 真机交互验收；Web export 已通过。
- 浏览器兼容数据库提示 `caniuse-lite` 已过期 7 个月；按禁止升级依赖要求未更新。
- 旧 verification 数据仍保留只读 fallback；本轮没有删除旧表、旧字段或旧路由。

## 8. V3.3-B 开工结论

代码层面的 A4/A5 最小门禁已满足，具备进入 V3.3-B 开发的条件；但不代表生产发布就绪。开始涉及真实数据的集成验收前，仍必须在明确隔离的 MySQL 8.0.34+ 环境完成 A4/A5 API、邀请并发、认证材料和 workspace 切换的数据库集成测试，并在带真实 `.git` 元数据的源码包复核全量测试。本轮按要求停止，不启动 V3.3-B。
