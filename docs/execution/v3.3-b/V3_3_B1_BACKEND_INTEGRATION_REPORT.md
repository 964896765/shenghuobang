# V3.3-B1 后端集成收口报告

日期：2026-07-19
分支：`codex/v3.3-b-idea-prototype`
后端集成提交：`c658018636125eda9e8036bcf88a3ed64f3344d6`

## 范围与结论

B1 创意协作后端已完成 Router、统一授权资源解析与受控附件内容访问集成。本批没有修改 Schema、`0030`、journal、`0000`—`0029` 或金额逻辑；App 页面仍未开发，未进入 B2。

## Router 与接口

新增 `server/routers/ideas-router.ts`，并以 `ideas` 注册到根 Router。Router 只负责会话主体、Zod 输入契约、稳定错误映射和调用 `IdeaService`，通知仍由 Service 产生。

已接入 18 个 Service 方法：

- 创意：`createDraft`、`updateDraft`、`publish`、`listPublic`、`listMine`、`detail`、`archive`；
- 附件：`uploadAttachment`、`disableAttachment`；
- 邀请：`inviteCollaborator`、`listInvitations`、`acceptInvitation`、`declineInvitation`、`revokeInvitation`；
- NDA：`getNda`、`acceptNda`、`getNdaStatus`；
- 项目转换：`convertToProject`。

另新增 `ideas.attachmentAccess`，仅签发短期、受版本约束的内容访问路径。所有写接口要求长度不超过 64 的 `requestId`；账号、创建者、邀请者、上传者、业务状态和项目转换结果均不接受客户端指定。

## Authorization 资源解析

统一授权数据源新增 `idea` 与 `idea_attachment` 事实解析，覆盖：

- 创建者、公开状态、创意状态、转换项目及 `authorizationVersion`；
- accepted 协作者的长期关系；
- 未过期 pending 邀请仅用于邀请接受、NDA 接受及 NDA 摘要前置流程；
- declined、revoked、expired 不产生关系；accepted 不因原 `expiresAt` 到期而失效；
- NDA 接受必须同时绑定当前仍有效的邀请关系和业务身份；
- 附件禁用状态、保密级别、`accessPolicyVersion`、stored file 状态和版本；
- `currentRole` 只保留兼容观测，不产生创意能力。

字段策略增加创意内部 ID、邀请内部字段、文件引用和文件秘密字段。公开列表应用服务端 field mask；详情和附件不返回 `storageKey`、永久 URL、token，公开列表不返回创建者内部身份 ID 或文件 ID。

## 受控文件访问

新增 `GET /api/idea-files/:attachmentId/content`。签名令牌绑定：

- `accountId`、`ideaId`、`attachmentId`、`fileId`；
- download/preview purpose；
- 创意授权版本、附件策略版本、stored file 策略版本；
- 有效期、nonce 和 requestId。

内容请求不会只信任签名：每次重新读取创意、附件和 stored file，重新执行 `AuthorizationService`，复核三层版本、附件未禁用、创意未归档、文件 available 且病毒扫描 clean 后才读取存储。邀请撤销、创意授权版本变化、附件禁用和文件策略变化均使旧令牌立即失效。失败响应不返回文件名、存储键或资源存在细节。

## 实际修改文件

- `server/routers/ideas-router.ts`
- `server/routers.ts`
- `server/authorization/types.ts`
- `server/authorization/drizzle-data-source.ts`
- `server/authorization/resource-resolver.ts`
- `server/authorization/capability-resolver.ts`
- `server/authorization/field-mask.ts`
- `server/storage/idea-file-access-token.ts`
- `server/_core/ideaFileAccess.ts`
- `server/_core/index.ts`
- `server/services/idea-service.ts`（仅补充公开列表 field mask）
- `scripts/test-v33-b1-idea-routes.ts`
- `package.json`
- 本报告

## 验证结果

| 门禁 | 结果 |
| --- | --- |
| `pnpm check` | PASS |
| `pnpm lint` | PASS，0 warning |
| `pnpm check:money:v330` | PASS，30/30 |
| `pnpm test:v33-b1-idea-service` | PASS，34/34 |
| `pnpm test:v33-b1-idea-routes` | PASS，26/26 |
| `pnpm test:v33-a3-authorization` | PASS，18 个安全用例 |
| `pnpm test:v33-a3-routes` | PASS，16 个安全用例 |
| `pnpm test:v33-a3-integration-fixes` | PASS，13 个回归组 |
| `pnpm exec vitest run tests/project-rules.test.ts ...` | PASS，5/5 |
| `pnpm build` | PASS |

专项测试覆盖匿名拒绝、严格输入、稳定游标、草稿/私密关系、NDA 前后、`currentRole` 不增权、pending/accepted 邀请语义、字段裁剪、三层策略版本撤权、受控内容端点、错误映射、Router 单次委托和旧项目/报价/文件回归存在性。

## 环境状态与待办

未设置安全、隔离的 `DATABASE_URL`，因此 MySQL 集成测试真实状态为 `BLOCKED_BY_ENVIRONMENT`；本批未连接未知、共享或生产数据库，也未伪造实测结果。

待后续完成：B1 App 页面、移动端查询与状态接入。B2、PR、合并和标签均不在本批范围。
