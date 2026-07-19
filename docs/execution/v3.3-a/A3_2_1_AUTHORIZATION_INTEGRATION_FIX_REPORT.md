# V3.3-A / A3.2.1 统一授权路由接入修正报告

## 结论

A3.2.1 指定的三个接入缺陷已修复，新增专项回归测试通过。未修改 `drizzle/schema.ts`、0000—0029、金额单位或资金语义；未执行历史回填，未连接数据库，未进入 A4/A5。

## 修复文件

- `server/authorization/drizzle-data-source.ts`
- `server/authorization/field-mask.ts`
- `scripts/test-v33-a3-authorization-integration-fixes.ts`
- `package.json`
- `docs/execution/v3.3-a/A3_2_1_AUTHORIZATION_INTEGRATION_FIX_REPORT.md`

## 根因与修复

### 1. 项目角色冻结基线位置及空值问题

根因：冻结回退被错误放在 `organizationMembershipRow` 分支，组织岗位没有当前能力时会访问可能不存在的 `projectMembershipRow.id/scopeId`；真正的项目角色流程反而没有执行冻结回退。

修复：

- 组织岗位分支只解析 `organization_member_positions` 和 `position_capabilities`。
- 只有存在 `projectMembershipRow` 时才查询 `project_membership_roles`。
- 先按当前 capability 精确查询显式 `project_role_capabilities`。
- 当前 capability 存在任何显式事实时，无论 active/revoked 或组合后的非 active 状态，都只返回显式事实，不执行冻结回退。
- 仅当前 capability 完全没有显式记录时，才读取 active membership role 并应用 `PROJECT_ROLE_FROZEN_CAPABILITIES`。
- 其他 capability 的显式记录不影响当前 capability 的冻结判断。
- 冻结命中继续写 `compat:project-role-frozen:*` 观测；membership 不存在时返回空项目角色事实，不抛出异常。

### 2. 认证资源字段键不匹配

根因：`RESOURCE_FIELDS` 注册了不存在的通用键 `verification`，而运行时实际使用 `verification:identity`、`verification:engineer` 和 `verification:merchant`，导致 `availableFields` 为空，field mask 无法覆盖真实认证字段。

修复：分别注册三类真实资源键：

- identity：realName、idType、证件摘要/尾号、provider、状态和拒绝原因。
- engineer：realName、职称、专业分类、经验、介绍、skills、状态和拒绝原因。
- merchant：商家名、注册号摘要/尾号、分类、描述、精确地址、状态和拒绝原因。

同时把 `realName/rejectReason/applicationData` 纳入认证敏感字段组。没有扩大默认字段权限；无字段授权时证件、注册号、地址和认证敏感字段仍被裁剪。

### 3. `file.access` 无资源分支过宽

根因：任何 `file.access` 请求只要资源解析为空，就会获得 `ACCOUNT_SELF/SELF` assignment，下载、签发或非法 ID 请求存在误获基础能力的可能。

修复：无资源 assignment 现在同时要求：

- capability 精确为 `file.access`；
- purpose 精确为 `upload_file`；
- 未提供 resourceType/resourceId；
- resource 确实为 null。

下载、签发和 content 请求始终携带 `stored_file` 资源；资源不存在、ID 非法或解析失败时不再获得 SELF assignment。`file.access` 和 `project.file.download` 的资源允许状态固定为 `available`；disabled 文件拒绝，policy version 不匹配返回 `CONCURRENT_MODIFICATION`，旧签名仍由内容端签名/version 复核拒绝。

## 同范围复核修正

- quote 自身 assignment 按动作拆分：双方可 view；仅 engineer/assignee 可 submit；仅需求 owner 可 accept/reject。报价提交者不能接受或拒绝自己的报价。
- 后台列表保持先验证有效 platform position，再逐行按 `PLATFORM_ASSIGNED` resourceType/resourceId 过滤。
- suspended、left、removed membership 继续在 AuthorizationService capability 解析前实时拒绝。
- users.role、currentRole、workspace preference 仅写 compatibility observation，不生成 assignment。
- permission audit 只保存资源 ID SHA-256 摘要和策略元数据；专项测试确认不含原始资源 ID 或敏感明文。

## 新增测试

命令：`pnpm test:v33-a3-integration-fixes`

结果：PASS，13 个回归组。覆盖：

1. 有组织 membership、无 projectId 时不进入项目角色查询且不崩溃。
2. 有组织 membership、无项目 membership 时不解引用空值。
3. 仅项目 membership、无显式当前能力时使用冻结最小基线并写兼容观测。
4. 显式 active 当前能力优先。
5. 显式 revoked 当前能力阻止冻结补权。
6. 其他 capability 的显式记录不错误阻断当前 capability 冻结判断。
7. 三类 verification 真实键的 availableFields 和 field mask。
8. missing/非法 stored file、disabled 文件、旧 policy version 全部拒绝；只有 upload 初始化允许无资源。
9. 项目角色、组织岗位、平台职务和 grant 同时为撤销事实时，compatibility observation 不产生 allow。
10. quote engineer 不能 accept/reject。
11. PLATFORM_ASSIGNED 对允许/不允许案件执行行级过滤。
12. suspended/left/removed 项目成员立即失权；legacy-only 事实不 allow。
13. permission audit 不包含原始资源 ID 和敏感明文。

## 门禁真实结果

| 顺序 | 命令 | 结果 |
| --- | --- | --- |
| 1 | `pnpm check` | PASS |
| 2 | `pnpm lint` | PASS，0 warning |
| 3 | `pnpm check:money:v330` | PASS，30/30 registered |
| 4 | `pnpm test:v33-a2-backfill` | PASS；DB integration 为 `BLOCKED_BY_ENVIRONMENT` |
| 5 | `pnpm test:v33-a3-authorization` | PASS，18 cases |
| 6 | `pnpm test:v33-a3-routes` | PASS，16 cases |
| 7 | `pnpm test:v33-a3-integration-fixes` | PASS，13 regression groups |
| 8 | `pnpm test` | 79 PASS / 1 FAIL；唯一失败为源码包无 `.git`，`git ls-tree -r --name-only HEAD` 无法执行 |

`pnpm test` 的失败不是业务、授权或 TypeScript 回归；按硬约束未创建临时 Git 仓库，也未伪造 HEAD。

## 数据库环境

当前 `DATABASE_URL` 未设置，真实 MySQL adapter/路由数据库集成继续标记 `BLOCKED_BY_ENVIRONMENT`。没有连接未知、共享或生产数据库，没有伪造数据库通过结果。

## A4+A5 结论

A3.2.1 授权修正和全部可执行功能门禁已完成，代码层面具备进入 A4+A5 的条件。`pnpm test` 唯一非绿项是已明确记录的缺 `.git` 源码包环境项；生产发布仍需在带真实 Git 元数据及安全测试数据库的统一环境复核。本轮按要求停止，不启动 A4/A5。
