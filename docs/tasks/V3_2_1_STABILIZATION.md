# 生活帮 V3.2.1 稳定性收口任务

## 唯一基线

GitHub 仓库：`964896765/shenghuobang`

当前稳定基线：`v3.2.0`

从 `main` 创建独立分支：`codex/v3.2.1-stabilization`，不得直接修改 `main`。

开始前完整阅读：

- `AGENTS.md`
- `README.md`
- `todo.md`
- `design.md`
- `PHASE3_2_CHANGES.md`
- `package.json`
- `drizzle/schema.ts`
- `drizzle/0007_purple_prowler.sql`
- `scripts/test-v32-integration.ts`

先使用计划方式审查现状，再实施开发。

## 本阶段目标

本阶段不增加新业务模块，只验证和修复 V3.2 的完整性、可重复构建能力、数据库升级安全、WebSocket 权限、文件安全和 CI。

禁止开始：

- 正式支付 Provider
- 金额全链路迁移
- 短信验证码
- 实名第三方核验
- 新品共创
- 众筹
- 发票税务
- 应用商店发布

## 一、实际执行 V3.2 MySQL 集成测试

使用 Docker MySQL 8：

```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm test:integration:v32
pnpm build
pnpm build:web
```

## 二、空数据库执行全部迁移

在全新空数据库执行全部 Drizzle 迁移，确认 `0000` 至当前最新迁移可连续、可重复地成功执行。

## 三、V3.1.2 数据库升级至 V3.2.1

准备 V3.1.2 结构和历史数据，执行 `0007` 及本阶段新增迁移，验证回填、约束、索引和业务状态。

## 四、生产模式启动后端

使用测试环境变量和已构建产物以生产模式启动后端，确认生产配置校验、依赖初始化和优雅关闭行为。

## 五、检查 `/api/health`

实际请求 `/api/health`，验证其只表示 Node.js 进程存活。

## 六、检查 `/api/ready`

实际请求 `/api/ready`，验证数据库、配置、存储和迁移状态检查。

## 七、启动 Web 应用并检查主要页面

启动 Web 应用，检查登录、首页、消息、物品、文件及管理入口等主要页面能够加载，不出现阻断性运行错误。

## 八、检查 Git 工作树与禁止提交产物

确认 Git 中没有追踪 `.env`、`node_modules`、`dist`、`web-dist`、`.expo` 和 `uploads`。

## 九、GitHub Actions CI

新增 `.github/workflows/ci.yml`。

CI 在以下情况触发：

- Pull Request 指向 `main`
- 推送到 `main`
- 手动触发

CI 使用 Node.js 20、pnpm 9.12、MySQL 8，不使用任何真实生产密钥。

CI 至少依次执行：

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm build:web
pnpm db:migrate
pnpm test:integration:mysql
pnpm test:integration:v32
```

使用 GitHub Actions MySQL Service 和独立测试数据库，配置健康检查确保 MySQL 真正可用后再迁移。示例环境变量只使用测试值：

```env
NODE_ENV=test
DATABASE_URL=${{ secrets.TEST_DATABASE_URL }}
JWT_SECRET=${{ secrets.TEST_JWT_SECRET }}
PAYMENT_PROVIDER=sandbox
STORAGE_PROVIDER=local
```

CI 不得依赖本地开发者电脑、真实短信服务、真实支付渠道、真实对象存储、生产数据库或生产 AI 密钥。

TypeScript、ESLint、单元测试、集成测试、数据库迁移、后端构建或 Web 构建任一失败，整个 CI 必须失败。禁止用 `continue-on-error: true` 或命令后的 `|| true` 绕过核心验证。

## 十、Dependabot 与仓库维护

新增 `.github/dependabot.yml`，至少每周检查 npm 依赖和 GitHub Actions 依赖，限制一次打开过多 PR。

新增 `.github/pull_request_template.md`，至少包含：修改目标、修改内容、数据库变化、新增迁移、权限变化、状态机变化、测试结果、构建结果、风险、回滚方式、未完成事项、是否涉及真实资金、是否涉及个人敏感信息。

新增：

- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`

Bug 模板至少要求：当前版本、运行平台、复现步骤、实际结果、期望结果、日志、是否涉及支付/订单/文件/权限。

## 十一、Secret 与敏感信息检查

检查整个 Git 历史和当前追踪文件，确认不存在：`.env`、JWT Secret、数据库密码、支付密钥、AI API Key、S3 Secret、身份证号码、银行账号、私密签名下载链接、演示之外的真实手机号和密码。

新增 `docs/security/SECRET_MANAGEMENT.md`，说明：

- 本地使用 `.env`
- GitHub Actions 使用 Repository Secrets
- 生产环境使用部署平台 Secret
- 密钥不得写入 Expo 客户端
- 密钥轮换流程
- 密钥泄露处理流程
- 哪些配置允许 `EXPO_PUBLIC_*`
- 哪些配置绝对不能使用 `EXPO_PUBLIC_*`

确认 `.gitignore` 至少包含：

```text
.env
.env.local
.env.*.local
node_modules/
dist/
web-dist/
.expo/
uploads/
coverage/
*.log
```

保留 `.env.example`。

## 十二、环境变量完整性检查

审核 `.env.example`，确保 V3.2 实际使用的所有配置均被列出，至少检查：

```text
NODE_ENV=
PORT=
DATABASE_URL=
JWT_SECRET=
CORS_ORIGINS=
EXPO_PUBLIC_API_BASE_URL=
EXPO_PUBLIC_WS_BASE_URL=
AI_API_URL=
AI_API_KEY=
AI_MODEL=
PAYMENT_PROVIDER=
STORAGE_PROVIDER=
LOCAL_UPLOAD_DIR=
FILE_SIGNING_SECRET=
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=
PUSH_PROVIDER=
```

每个变量必须有说明，标明必填/可选、仅服务端/允许客户端使用；不得放真实密钥或弱默认生产密码。

生产模式启动时，`DATABASE_URL`、`JWT_SECRET`、`CORS_ORIGINS`、文件签名密钥和当前 Storage Provider 所需配置缺失必须拒绝启动。

`STORAGE_PROVIDER=s3` 时，endpoint 或兼容配置、region、bucket、access key、secret key 任一缺失必须启动失败。

`STORAGE_PROVIDER=local` 时，必须检查上传目录可以创建、可写、不位于公开源码目录且不能执行脚本。

## 十三、Health 与 Readiness

保留两个独立接口。

`/api/health` 只表示 Node.js 进程存活，成功返回：

```json
{ "ok": true, "status": "alive" }
```

不得因为数据库暂时不可用而让进程存活检查失败。

`/api/ready` 至少检查：数据库可连接并执行 `SELECT 1`、必要环境变量完整、当前存储 Provider 可用、本地目录可写或 S3 配置有效、数据库迁移处于支持状态。

正常时返回 HTTP 200：

```json
{
  "ok": true,
  "status": "ready",
  "checks": { "database": "ok", "storage": "ok", "configuration": "ok" }
}
```

异常时返回非 200，建议 HTTP 503：

```json
{
  "ok": false,
  "status": "not_ready",
  "checks": { "database": "failed", "storage": "ok", "configuration": "ok" }
}
```

响应不得暴露数据库连接字符串、存储密钥、内部路径、SQL 错误详情或 Stack Trace。

新增测试覆盖：数据库正常 ready 200、数据库不可用 ready 503、S3 配置缺失 ready 503、本地存储不可写 ready 503、数据库不可用时 health 仍表示进程存活。

## 十四、CORS 与 WebSocket Origin

生产 HTTP CORS 禁止默认 `*`，`CORS_ORIGINS` 必须明确配置允许来源，支持逗号分隔并在启动时解析校验。开发环境可以允许本地地址，但不得自动带入生产环境。

WebSocket 握手检查 Origin 是否在允许列表、JWT 是否有效、用户账号是否正常、用户是否有权加入目标会话。非浏览器原生客户端无法提供标准 Origin 时通过明确配置处理，不能直接关闭全部 Origin 检查。

记录被拒绝的 WebSocket 握手时间、用户或匿名标识、Origin、IP 和拒绝原因；日志不得记录完整 JWT。

## 十五、WebSocket 客户端稳定性

检查移动端 WebSocket Hook 或服务具备：单例或合理连接管理、页面切换不重复建连、指数退避、最大重连间隔、前后台处理、回前台恢复、Token 刷新重鉴权、网络切换恢复、退出登录关闭、重连重新订阅、同步断线缺失消息。

客户端显示：已连接、正在重连、使用轮询降级、离线。WebSocket 不可用不得阻塞查看已有消息。

## 十六、WebSocket 服务端资源控制

增加或确认：单用户最大连接数、单 IP 建连频率、单连接最大订阅会话数、单条消息最大大小、心跳超时、无响应连接清理、异常连接日志、发送队列上限、慢消费者处理。

用户被封禁或退出所有设备时应能关闭现有连接；服务关闭时应优雅断开。

## 十七、消息幂等与顺序

客户端发送消息包含 `clientMessageId`。数据库对 `senderId + clientMessageId` 建立唯一约束或等价防重。

重复发送同一消息时返回原消息，不创建第二条记录、不重复推送事件、不重复增加未读数。

消息至少保存服务端 `messageId`、`clientMessageId`、`conversationId`、`senderId`、`createdAt`、`deliveredAt`、`readAt`。采用 `conversationId + createdAt + messageId` 稳定排序。

## 十八、通知幂等与失败重试

通知使用稳定业务去重键，例如 `eventType + relatedEntityType + relatedEntityId + recipientId`。

`notification_deliveries` 至少保存：notificationId、provider、channel、status、attemptCount、lastError、nextRetryAt、sentAt、deliveredAt。

开发环境 `LogPushProvider` 必须明确仅记录模拟投递，不代表真实移动推送成功。

失败重试有最大次数、退避策略、每次失败记录；最终失败可在后台查看；无效 Push Token 标记失效。本阶段不连接真实 APNs、FCM 或 Expo Push 证书。

## 十九、文件签名链接安全

签名链接至少绑定 fileId、userId 或受控访问主体、expiry、purpose、nonce 或版本、HMAC 签名。

验证时检查签名、过期、文件有效、当前用户权限、文件安全状态和项目/业务对象当前可访问性，不得只凭链接未过期跳过权限。高敏感文件使用更短有效期。

下载后写入 `file_access_logs`，至少记录 fileId、userId、action、relatedEntityType、relatedEntityId、IP、deviceId、result、createdAt；不得保存永久可复用签名链接。

## 二十、文件上传安全

上传前校验用户权限、用途、允许类型、最大大小和数量；上传后校验实际大小、MIME、扩展名、文件头、SHA-256、安全扫描状态和重复文件。

至少拒绝：可执行文件、脚本文件、双重扩展名欺骗、MIME 与扩展名严重冲突、超过限制的压缩包、空文件、非法文件名。

清理文件名路径字符防止目录穿越，不得直接使用用户文件名作为 Storage Key。

## 二十一、正式交付文件保护

项目正式交付文件一旦提交验收、用作验收依据、关联已完成里程碑或关联投诉证据，就不能物理删除。

允许标记失效、新版本替代、隐藏普通用户入口、管理员受控封禁；必须保留原记录、操作人、原因、时间和审计日志。

## 二十二、物品生命周期一致性

检查并修复：

- listing 必须且只能关联一个 item
- 历史 listing 迁移后不能生成多个 item
- 同一物品同一时间只有一个有效成交锁
- 发布关闭不删除物品
- 取消未支付订单：订单取消、listing 恢复、item 恢复、成交锁释放
- 出售完成：更新 ownerId、写 ownership history/status log、listing completed
- 赠送完成：更新 ownerId、写 ownership history、listing completed
- 回收完成：item 为 recycled、写回收历史、原用户不再是可交易所有者
- 置换完成：双方物品分别变更所有者、两条所有权记录、状态一致
- 已出售/赠送/回收物品不能继续产生新订单

## 二十三、旧数据迁移安全

增加可重复执行的升级验证脚本，例如 `scripts/test-v32-upgrade.ts`：创建隔离库，执行 0000—0006，写 V3.1.2 历史数据，执行 0007 及新增迁移，检查回填、约束、索引，尝试重复升级逻辑并确认不重复创建 item/ownership/listing_modes，最后删除隔离库。

样例至少包含：普通出售、接受报价、赠送、回收、已完成订单、已取消订单、没有 modes 的异常旧数据、modes JSON 重复值、已有关联关系的部分迁移数据。

异常旧数据不得静默破坏迁移；应明确失败、写迁移异常记录，或使用安全默认值并记录原因。

## 二十四、数据库索引检查

检查高频查询索引：listings.itemId、items.ownerId、items.status、orders.relatedEntityId、orders.status、messages.conversationId + createdAt、conversation_members.userId、notifications.userId + readAt、file_access_logs.fileId、stored_files.ownerId、device_push_tokens.userId、notification_deliveries.status + nextRetryAt。

不要盲目增加重复索引，并在变更说明列出新增和删除的索引。

## 二十五、事务和并发检查

立即购买、接受报价、选择赠送人、完成置换、完成回收、取消订单释放物品、确认收货转移所有权、创建消息并增加未读、标记已读、注册 Push Token、文件版本替换必须使用事务和并发保护（行锁、唯一约束、乐观锁或条件更新），不能只依赖前端按钮禁用。

## 二十六、代码审查重点

查找并处理 TODO、FIXME、HACK、`@ts-ignore`、`@ts-expect-error`、`any`、`console.log`、空 `catch {}`。

不是机械删除所有日志：生产日志使用统一 Logger、敏感数据脱敏、开发调试日志不进入正式版本、空 catch 必须处理或记录、any 应有合理边界。

检查前端写死管理员权限、前端直接决定支付/订单完成、WebSocket 广播未授权用户、文件接口返回永久公开地址、业务代码硬编码 Storage Provider、旧物状态多处不一致、数据库枚举与前端映射不一致。

## 二十七、必要的小范围重构

只允许稳定性相关重构：拆分过大 Router、提取文件 Policy、提取 WebSocket 鉴权、提取物品状态 Service、提取通知 Dispatcher、集中环境变量验证。

禁止重写后端、更换 tRPC/MySQL/Drizzle/Expo Router、重做 UI、无关目录调整和大规模变量改名。

## 二十八、文档更新

更新 README.md，包含：当前版本 V3.2.1、环境要求、本地启动、MySQL、全量迁移、V3.2 集成测试、WebSocket、Local/S3 Storage、Health/Ready、CI 状态、已完成能力、未完成外部服务。

更新 todo.md：只标记真实完成，未连接服务保持未完成，不保留过期 Manus 描述，不把 Stub 写成生产能力。

新增 `PHASE3_2_1_CHANGES.md`，至少记录修改范围、Bug 修复、新增测试、数据库变化、索引/约束、WebSocket 安全、文件安全、CI、验证结果、已知限制和回滚方式。

## 二十九、版本和分支要求

使用 `codex/v3.2.1-stabilization`。按模块拆分多个可审查提交，示例：

```text
test(v3.2.1): add websocket authorization integration tests
fix(items): prevent duplicate item ownership transfer
fix(storage): enforce signed download authorization
ci: add mysql integration workflow
docs: add v3.2.1 stabilization report
```

不得强制推送 main、重写 main 历史、删除 V3.2 Tag 或自动合并 PR。

## 三十、Pull Request 要求

推送 `codex/v3.2.1-stabilization` 并创建到 `main` 的 PR，建议标题 `release: stabilize V3.2.1`。

PR 正文包含：修改内容、数据库迁移、物品生命周期、文件安全、WebSocket 安全、通知可靠性、CI、实际验证。

列出实际命令和结果：`pnpm check`、`pnpm lint`、`pnpm test`、`pnpm test:integration:mysql`、`pnpm test:integration:v32`、`pnpm build`、`pnpm build:web`。

还要列出单元测试文件/数量、MySQL 集成测试数量、WebSocket 测试数量、文件安全测试数量、构建结果、Web 模块数量、空库迁移、V3.1.2 升级、health/ready、风险。

明确：未接真实支付、未接真实病毒扫描、未接正式移动推送、S3 只验证兼容 Provider 或 MinIO、未完成金额迁移。

回滚说明包含代码回退、新增迁移处理、不可逆数据变化。未完成事项只列实际未完成，不得声称全部完成。

## 三十一、完成标准

只有全部满足才算完成：

- V3.2 MySQL 集成测试真实通过
- 空库全部迁移通过
- V3.1.2 数据库升级通过
- 历史 listing 回填无重复
- 同一物品并发交易只允许一次成功
- 所有权变化正确
- WebSocket 未授权连接和订阅被拒绝
- 文件签名、过期、权限和审计测试通过
- CI 在 Pull Request 中通过
- TypeScript、ESLint、全部自动化测试、后端构建、Web 导出通过
- `/api/health` 正常
- `/api/ready` 正常检查依赖
- README、todo、变更说明更新
- Git 无敏感文件和构建产物
- 分支已推送
- PR 已创建
- 未自动合并 main
- 未夸大未连接外部服务

任何一项未完成必须在 PR 明确标记，不得使用“全部完成”。

## 三十二、最终交付

提供：分支、最新提交 SHA、PR 链接、新增迁移、修改文件数、测试文件/数量、所有验证命令与结果、空库迁移、V3.1.2 升级、WebSocket 安全测试、文件安全测试、CI 链接、README/todo 摘要、已知限制和未完成事项。

不要自动合并 main，不要创建正式 Release。

直接创建分支、修改代码、生成迁移、增加测试、实际验证、更新文档、分模块提交、推送分支、创建 Pull Request，完成后等待人工审核。
