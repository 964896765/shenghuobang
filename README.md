# 生活帮（V4 Alpha 稳定化分支）

生活帮是连接需求、创意、协作、生产、产品使用、交易、维修、捐赠、回收和可信追溯的产品全生命周期协作与资源交易平台。

当前仓库状态：

- 当前 `main` 基线：`8973608d7580dccaa06f752bbdfa067ed9cd6c1a`
- 当前正式标签：`v4.0.0-alpha`
- 当前稳定化分支：`codex/v4-demo-stabilization`
- 当前重点：GitHub CI、Release 启动、安全、迁移完整性与真机稳定性
- 当前已知限制：Release APK 仍存在黑屏启动 P1；图片、视频、实体二维码、维修、捐赠、回收和部分弱网真机闭环尚未完成最终证据

当前源码仍以 V3.2.4 为稳定历史业务基线，但仓库已包含 V3.3-A、V3.3-B 与 V4 Alpha 可运行产品雏形的真实代码、迁移和集成验证，不再以 “V3.3-A / A1 是当前唯一任务” 作为仓库入口说明。

开发前按顺序阅读：

- [产品最终形态与系统开发总蓝图](docs/execution/SHENGHUOBANG_MASTER_DEVELOPMENT_BLUEPRINT.md)
- [最终产品形态](docs/strategy/SHENGHUOBANG_FINAL_PRODUCT_FORM.md)
- [最终 App 信息架构](docs/strategy/END_STATE_APP_INFORMATION_ARCHITECTURE.md)
- [核心领域整合蓝图](docs/architecture/CORE_DOMAIN_INTEGRATION_BLUEPRINT.md)
- [身份组织权限目标架构](docs/architecture/IDENTITY_ORGANIZATION_PERMISSION_ARCHITECTURE.md)
- [开发执行总索引](docs/execution/DEVELOPMENT_EXECUTION_INDEX.md)
- [系统开发总规划](docs/execution/V3_3_TO_V4_SYSTEMATIC_DEVELOPMENT_PLAN.md)
- [主阶段交付总矩阵](docs/execution/MASTER_STAGE_DELIVERY_MATRIX.md)
- [当前 A1 Codex 任务](docs/execution/stages/V3_3_A_BATCH1_CODEX_TASK.md)
- [本地开发与交付工作流](docs/execution/LOCAL_DEVELOPMENT_WORKFLOW.md)

GitHub 不是本地开发前置条件。每个批次仍需本地可追溯提交、验证报告和干净源码归档；对 `main` 的修改必须通过 Pull Request，不直接推送。

## 技术栈

- Expo 54 / React Native 0.81 / Expo Router
- Express + tRPC
- MySQL 8 + Drizzle ORM
- TanStack Query
- NativeWind
- DeepSeek 或其他 OpenAI 兼容模型（可选）

## 环境要求

- Node.js 20+
- pnpm 9.12+
- Docker Desktop，或本机 MySQL 8

## 安全生成源码交付包

先保证所有应交付修改已提交且工作树完全干净，再运行：

```bash
pnpm source:archive
```

脚本仅从当前 `HEAD` 生成 zip，默认写入被忽略的 `artifacts/`，并拒绝未提交文件、已有目标文件、密钥、依赖、构建产物、日志和二进制安装包。

## 本地启动

### 1. 安装依赖

```bash
pnpm install
```

### 2. 创建环境文件

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

macOS / Linux：

```bash
cp .env.example .env
```

至少修改 `.env` 中的 `DATABASE_URL`、`JWT_SECRET` 和 `FILE_SIGNING_SECRET`。生产环境还必须明确配置 `CORS_ORIGINS` 以及当前 Storage Provider 所需字段；服务端会在缺失时拒绝生产启动。字段作用域和必填条件见 `.env.example`。

### 3. 启动 MySQL

使用 Docker Desktop：

```bash
docker compose up -d
```

也可以使用已有 MySQL，并相应修改 `DATABASE_URL`。

### 4. 创建数据库结构并写入演示数据

```bash
pnpm db:migrate
ALLOW_DEMO_SEED=true pnpm db:seed
```

`db:seed` 仅允许在本地 demo/test/acceptance/dev 数据库执行，且必须显式设置 `ALLOW_DEMO_SEED=true`。它按固定演示标识补齐用户、资料和演示业务记录，不清库、不删除其他用户数据，也不会重写既有演示账号密码。可用 `pnpm test:seed:idempotent` 在隔离数据库中连续运行两次并核对计数。

演示账号：

| 身份 | 手机号 | 密码 |
|---|---|---|
| 普通用户 | 13800000001 | Demo123456 |
| 工程师 | 13800000002 | Demo123456 |
| 工程师 | 13800000003 | Demo123456 |
| 回收商 | 13800000004 | Demo123456 |
| 商家 | 13800000005 | Demo123456 |
| 普通用户 | 13800000006 | Demo123456 |

演示密码仅用于本地开发，禁止用于生产环境。

工程师和商家演示账号的认证记录由种子脚本标记为“人工审核通过”，用于本地验证正式报价权限；新注册用户提交认证后不会自动通过。

### 5. 启动前后端

```bash
pnpm dev
```

默认开发地址：

- Web：`http://localhost:8081`
- API：`http://localhost:3000`
- 进程健康检查：`http://localhost:3000/api/health`
- 服务就绪检查：`http://localhost:3000/api/ready`

Expo 必须通过仓库的受控入口启动：

```bash
pnpm dev:metro   # Web Metro
pnpm dev:mobile  # Development Client，局域网模式
```

两个入口都在当前终端运行，禁止同一仓库并发启动第二个 Expo 实例，不会自动改用
8082 等其他端口，并将 Metro 转换限制为单 worker。不要使用 `start`、`cmd /k`、
`Start-Process` 或直接后台启动 `expo start`；停止时在原终端按 Ctrl+C。

LAN Demo 构建与本地开发的区别：

- Development：允许本地 `localhost`、热更新和开发调试能力
- LAN Demo：必须显式设置 `EXPO_PUBLIC_API_BASE_URL` 和 `EXPO_PUBLIC_WS_BASE_URL` 指向局域网地址，不得使用 `localhost`
- Sandbox 支付边界：当前 Alpha 仅允许 `PAYMENT_PROVIDER=sandbox`
- Release 已知问题：Android Release APK 当前仍有黑屏启动 P1，尚不是公开生产发布包

`/api/health` 只证明 Node.js 进程正在响应，不访问数据库。`/api/ready` 会校验 `DATABASE_URL`、`JWT_SECRET`，并对 MySQL 执行 `SELECT 1`；环境缺失或数据库不可用时返回 HTTP 503，适合负载均衡器和编排平台判断是否接收流量。

## 手机真机调试

手机不能使用 `localhost` 访问电脑。

Windows 可先运行 `ipconfig`，找到与手机处于同一 Wi-Fi 的 IPv4 地址。电脑 API 必须监听可被局域网访问的网卡，防火墙也要允许对应端口。

将 `.env` 中的：

```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

改成电脑局域网地址，例如：

```env
EXPO_PUBLIC_API_BASE_URL=http://<LAN-IP>:3000
```

WebSocket 地址可留空并由 API 地址自动推导，也可显式设置为同一主机：

```env
EXPO_PUBLIC_WS_BASE_URL=ws://<LAN-IP>:3000
```

然后执行：

```bash
pnpm android
```

相册、Android 键盘、原生返回键和 Push 应在 development build 真机中检查。Expo Go 可用于普通页面调试，但 Android Expo Go 不支持远程 Push；不能把 Expo Go 结果当作 Push 真机验收。

### 前台附近位置

发现、搜索和工程师列表提供可选的附近排序。App 冷启动、登录和首页不会申请位置权限；用户点击“启用附近定位”，阅读用途说明并确认后，才调用 Android/iOS 前台权限。

- 不使用后台定位、不收集轨迹。
- 拒绝、永久拒绝、系统定位关闭、超时或弱网时可手动选择城市/地区。
- 位置失败不阻断需求、旧物、赠送、回收、工程师和搜索的原有浏览。
- 服务端最多保存小数点后两位的约 1 公里精度偏好；公开接口只返回整数公里近似距离或地区，不返回其他用户坐标。
- 退出登录清理账号相关本地位置缓存。

### Development build

仓库提供 `eas.json` 的 `development` 和 `preview` 内部分发配置，Android development profile 输出 APK：

```bash
npx eas-cli login
npx eas-cli build --profile development --platform android
```

构建前需要在 EAS 项目中配置 `EXPO_PUBLIC_EAS_PROJECT_ID`，并准备对应 Android/iOS 凭据。本仓库不包含 EAS 账号、FCM Service Account、APNs 私钥或 Expo Access Token；缺少这些账号时只能完成代码和本地 bundle 检查，不能声称 development build 或真实 Push 已验证。

### 基础 Push 配置

客户端只在用户主动开启通知，或权限已经授予时获取 Expo Push Token；不会在启动时强制弹权限框。“我的 → 移动端设置”可查看权限、打开系统设置或停用当前设备 Token。登录、Token 变化和应用回到前台会同步注册，退出登录会解除当前设备。

服务端缺省使用不联网的 Log Provider：

```env
PUSH_PROVIDER=log
```

需要连接 Expo Push API 时使用：

```env
PUSH_PROVIDER=expo
EXPO_PUSH_ACCESS_TOKEN=
```

`EXPO_PUBLIC_EAS_PROJECT_ID` 是可公开的项目标识；`EXPO_PUSH_ACCESS_TOKEN`、FCM/APNs 凭据只能放在服务端或 EAS Secret 中。当前 Expo Provider 为轻量直连实现，业务事务不会因推送失败回滚；无效 Token 会停用，临时失败保留投递尝试。独立后台队列、receipt 轮询和生产证书验证仍属于后续基础设施。

## AI 配置

不填写 AI 密钥时，需求发布仍然可用，系统会返回本地基础整理结果，不会阻塞业务。

DeepSeek 示例：

```env
AI_API_URL=https://api.deepseek.com
AI_API_KEY=你的密钥
AI_MODEL=deepseek-chat
```

也可换成其他支持 `/v1/chat/completions` 的 OpenAI 兼容服务。

## 文件存储

开发环境文件存放在：

```text
./uploads
```

`/uploads/*` 不提供静态公开访问。业务私有文件必须先由已登录用户申请短时链接；链接绑定文件、访问用户、用途、过期时间、nonce 和版本，真正下载时再次检查当前权限、文件状态与安全状态并写审计。V3.2.2 仅为已明确标记为 `public`、通过现有文件头/MIME/扩展名/大小校验且状态可用的商品图片提供 `/api/files/:id/public` 读取路径。Local 仅用于开发/单机验证；S3 兼容 Provider 仍是生产待验证底座，本阶段没有搭建 MinIO、生命周期或真实病毒扫描。

## 常用命令

```bash
pnpm check        # TypeScript 检查
pnpm lint         # ESLint
pnpm test         # 自动化测试
pnpm test:integration:mysql # 可重复执行的真实 MySQL 集成测试
pnpm test:integration:v32  # V3.2 物品、升级、WebSocket、文件运行时集成
pnpm test:migrations:empty # 空库全迁移并重复执行
pnpm test:location:mysql # 前台位置、隐私、越权和事务回滚 MySQL 集成
pnpm check:markdown-links # Markdown 本地相对链接；无 .git 源码包也可运行
pnpm check:money:v330 # 校验 30 个金额字段注册表与 Schema 一致
pnpm test:money:v330 # V3.3.0 金额契约专项测试
pnpm audit:money:v330 # 只读检查 MySQL 历史金额与账本一致性
pnpm test:seed:idempotent # 连续两次 seed 并核对数据不重复
pnpm build        # 构建后端 dist/index.mjs
pnpm build:web    # 导出 Web 到 web-dist
pnpm verify       # 连续执行检查、Lint、测试和构建
pnpm db:generate  # 根据 Schema 生成迁移
pnpm db:migrate   # 执行迁移
pnpm db:seed      # 写入演示数据
pnpm admin:create # 使用环境变量创建或更新管理员
```

Web 静态导出：

```bash
pnpm build:web
```

## 当前已经完成

- 去除 Manus OAuth 登录依赖
- 手机号与密码注册、登录
- Scrypt 密码哈希
- 独立 JWT 会话
- Web / Android / iOS 统一 Bearer Token
- 独立 App Scheme 与包名
- 通用 AI 服务配置
- AI 未配置时的降级逻辑
- 本地文件存储基础
- MySQL Docker Compose
- 用户手机号唯一约束
- “我也需要”数据库唯一约束
- 数据库迁移
- 密码与 JWT 测试
- 报价版本历史与新版本提交
- 项目正式需求版本
- 项目双方分别确认协议
- 项目文件中心与文件版本
- 项目文件短时签名访问
- 项目变更单及金额/工期联动
- 独立验收记录
- 项目和里程碑投诉入口
- 历史报价和项目数据迁移回填
- `PaymentProvider` 抽象与 `SandboxPaymentProvider`
- 支付单、支付尝试、不可删除资金事件、退款、托管、释放和阶段结算
- 退款尝试账本、失败退款管理员受控重试和 Provider/数据库双重幂等
- 支付、退款、结算和托管释放幂等约束
- 项目/订单原模拟支付入口停用，统一走支付单确认
- 实名、工程师和商家人工认证审核及敏感文件短时访问
- 工程师/商家认证撤销后的新业务限制
- 投诉时间线、资金冻结、平台裁定、退款/释放和信用处罚业务记录
- 投诉裁定遍历全部快照托管记录，终态不残留 `disputed` 或 `frozen`
- `admin`、认证审核、投诉运营、财务、客服五类管理员角色
- 菜单级与操作级权限、高风险二次确认和脱敏审计日志
- 最小可用 Web/移动共用管理页面
- 独立 item、listing 历史、所有权/状态记录和并发成交锁
- WebSocket Origin/JWT/账号/会话鉴权、连接/订阅/大小/心跳限制与客户端单例重连
- `senderId + clientMessageId` 消息幂等和稳定排序
- 通知业务去重键、投递尝试字段、退避与无效 Token 停用
- Local/S3 兼容私有存储、文件头/MIME/扩展名/哈希校验和短时签名下载
- 独立 `/api/health` 与依赖就绪 `/api/ready`
- GitHub Actions MySQL CI、Dependabot、PR/Issue 模板和 Secret 管理规范
- 物品发布草稿、编辑、图片选择/排序/重试、上下架与受控删除
- 正式置换请求、接收/拒绝/取消、双方确认和双向所有权更新
- 回收报价去重、拒绝、询价取消、订单回看与物品释放
- 会话未读数、历史消息分页、失败消息同幂等键重试和重复消息隐藏
- listing/recycling/swap/message 通知跳转、过期目标提示和主要页面加载/空/错/刷新状态
- Android/iOS 相册权限按用户操作请求、拒绝说明、系统设置入口和有限照片权限兼容
- 移动端 API 超时与局域网地址诊断、WebSocket 降级、长表单键盘和未保存返回拦截
- 登录/登出/前后台/Token 变化的 Expo Push 生命周期、统一通知点击路由和轻量 Expo Provider
- 可重复演示 seed、SDK 54 依赖校验、development/preview EAS 配置和 Node 24 兼容 CI Actions

第二阶段详见 `PHASE2_CHANGES.md`，V3.1 详见 `PHASE3_1_CHANGES.md`，修复版本详见 `PHASE3_1_1_CHANGES.md` 和 `PHASE3_1_2_CHANGES.md`。

V3.2.2 的页面、业务流程、迁移和实测结果详见 `PHASE3_2_2_CHANGES.md`；V3.2.3 移动端准备与真实验证边界详见 `PHASE3_2_3_CHANGES.md` 和 `docs/testing/V3_2_3_ANDROID_CHECKLIST.md`。

V3.2.4 的前台位置隐私、R2 规范修订与 RC 边界见 `docs/product/V3_2_4_LOCATION_PRIVACY_R2.md`、`docs/releases/V3_2_4_SPEC_REVISION_R2.md` 和 `docs/releases/V3_2_4_RELEASE_NOTES.md`。

## V3.2.4 数据库迁移

新增且仅追加迁移 `drizzle/0014_tense_luckman.sql`。迁移增加 `user_location_preferences`：按用户唯一保存手动地区或约 1 公里精度的位置偏好。字段全部兼容旧数据，历史用户无需回填；没有位置偏好的旧数据继续按原排序展示。旧迁移 `0000—0013` 未修改。

## V3.2.3 数据库迁移

新增且仅追加迁移：

```text
drizzle/0013_gorgeous_gargoyle.sql
```

迁移为设备 Push Token 增加 `disabledAt`、`disabledReason` 和自动更新时间，支持记录无效 Token 与用户主动停用。旧迁移 `0000—0012` 未修改；空库连续应用 14 条迁移，V3.2.2 数据库可直接追加升级。

## V3.2.2 数据库迁移

新增且仅追加迁移：

```text
drizzle/0012_lumpy_molecule_man.sql
```

迁移增加正式 `swap_requests` 业务表、物品交换意向字段、可追溯的 listing 删除状态，以及 `swap` 订单类型。旧迁移 `0000—0011` 未修改。空库会连续应用 13 条迁移；V3.1.2 历史库升级脚本也会继续应用到 V3.2.2。

## V3.1 数据库迁移

新增迁移：

```text
drizzle/0004_yummy_storm.sql
```

迁移不会删除第二阶段表或字段，并会回填：

- 已激活工程师/商家的认证审核记录
- 缺失的历史项目订单
- 已验收里程碑的阶段结算和结算明细
- 历史投诉状态日志

执行：

```bash
pnpm db:migrate
```

V3.1.1 新增迁移：

```text
drizzle/0005_silky_squadron_supreme.sql
```

该迁移新增投诉业务快照和活动投诉锁。`complaint_active_locks.projectId` 唯一约束保证同一项目不能同时存在两个活动投诉；投诉结束时受控业务方法删除锁。

V3.1.2 新增迁移：

```text
drizzle/0006_steady_wild_child.sql
```

该迁移新增 `refund_attempts`，为订单增加明确的 `partially_refunded` 状态，并安全清理 V3.1.1 历史重复活动投诉：同项目保留一条有效活动投诉，其余转 `closed`，同时写入 `complaint_status_logs` 和 `complaint_actions`，最后为所有保留的活动投诉补齐活动锁。迁移还会把“支付已部分退款但订单仍为 refunding”的历史记录改为 `partially_refunded` 并写订单状态日志。

## V3.1.1 Provider 与失败持久化

```env
PAYMENT_PROVIDER=sandbox
```

`PaymentProviderRegistry` 负责解析 Provider。资金服务不直接依赖沙箱实现，后续 Provider 只需注册到 Registry。

支付确认和退款执行采用三个阶段：短事务持久化 `pending/processing`、事务外调用 Provider、独立短事务持久化成功或失败。Provider 失败后会先提交 attempt、payment event 和 failedReason，再向调用方抛错，失败记录不会被回滚。

## V3.1.2 退款重试与订单状态

每一次 Provider 退款调用都会写入 `refund_attempts`，记录尝试编号、时间、操作人、Provider 请求/响应、失败原因和独立幂等键。失败尝试使用原键派生的新 attempt 幂等键重试；仍处于 pending 的未知结果会复用同一键，避免重复退款。管理员通过受权限和二次确认保护的 `retryRefund` 操作重试失败退款。

部分退款成功后：支付状态为 `partially_refunded`，订单状态也为 `partially_refunded`；不会继续显示 `refunding`。失败时订单恢复本次退款执行前的履约状态，所有变化写入 `order_status_logs`。

## 当前金额策略（重要）

V3.1.2 **只支持正数、整元人民币金额**。

- 历史 `orders.amount`、项目、报价和里程碑金额仍为 MySQL `INT`，单位为元。
- 新资金账本使用 `DECIMAL(14,2)`，但写入前必须通过整元校验，合法值表现为 `100.00`。
- 支付、退款和投诉资金裁定收到带角分的金额会被后端拒绝。
- 支付、退款和托管释放金额为 0 或负数时会被后端拒绝。
- 不允许把 INT 元与小数金额静默混算。

若未来支持角分，必须进行独立的全链路安全迁移，统一改为整数分或统一 `DECIMAL(14,2)`；这不属于 V3.1.2。

## MySQL 集成测试

脚本会依次创建并最终删除隔离数据库 `shenghuobang_v311_integration` 和 `shenghuobang_v312_integration`：

```powershell
$env:MYSQL_INTEGRATION_URL="mysql://root:password@127.0.0.1:3306/mysql"
pnpm test:integration:mysql
```

原有 V3.1.1 的 10 组真实 MySQL 场景全部保留；V3.1.2 新增 9 组，覆盖投诉退款/释放后的项目、里程碑、订单和托管终态、0/负数金额、失败退款及投诉裁定退款重试、数据库不可用的 `/api/ready`、历史重复投诉升级和多托管裁定。

## 沙箱支付

1. 买家在订单或项目详情点击“进入沙箱支付”。
2. 创建支付单；同一幂等键不会创建第二笔支付。
3. 点击“确认沙箱支付”；后端通过 `SandboxPaymentProvider` 生成沙箱交易号。
4. 支付、订单、项目和托管记录在事务中同步更新。
5. 沙箱页面始终显示：**沙箱支付，仅用于开发测试，不产生真实资金交易。**

沙箱实现不会联系微信、支付宝、Stripe 或银行。接入生产渠道时实现相同的 `PaymentProvider` 接口，并保留现有状态机、幂等键、事件账本和验签流程。

## 创建管理员

迁移数据库后，通过环境变量创建或更新管理员，不在代码中保存固定管理员密码：

Windows PowerShell：

```powershell
$env:ADMIN_PHONE="13900000000"
$env:ADMIN_PASSWORD="请设置至少12位的本地测试密码"
$env:ADMIN_ROLE="admin"
pnpm admin:create
```

`ADMIN_ROLE` 可选：`admin`、`verification_reviewer`、`complaint_operator`、`finance_operator`、`customer_service`。

管理员使用普通手机号密码登录页登录；登录后在“我的 → 管理工作台”进入认证、投诉、财务和审计页面。高风险操作必须在确认弹窗后提交匹配资源的二次确认值，后端仍会独立校验权限和状态。

## 仍属于后续阶段

- 正式短信验证码和真实身份证/企业登记第三方核验
- 正式支付渠道、异步回调验签、对账与真实出款/税务
- 生产 S3/COS/OSS 账号验证、CDN、生命周期和跨区域备份
- 真实病毒扫描服务
- 正式 APNs/FCM/Expo Push 证书、receipt 轮询和独立后台重试队列
- 历史 INT 元金额到整数分或统一 DECIMAL 的全链路迁移
- 压测、渗透测试、监控告警和应用商店发布

## 安全说明

- 不要提交 `.env`
- 不要在客户端保存 AI、数据库或支付密钥
- 生产环境必须配置 `CORS_ORIGINS`
- 正式支付必须接入持牌支付机构
- 管理员不能绕过业务状态机直接改订单、资金或信用状态

## V3.2.1：稳定性收口

V3.2 新增独立物品档案、历史发布、所有权和维修/保养记录。一件现实物品可以保留多次发布历史，交易完成后会产生所有权记录，取消订单会释放物品状态。

统一文件存储支持本地和 S3 兼容服务：

```env
STORAGE_PROVIDER=local
# 或 STORAGE_PROVIDER=s3
S3_ENDPOINT=
S3_REGION=auto
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

Local 配置使用 `LOCAL_UPLOAD_DIR`；生产模式会检查目录可创建、可写且不在 `assets`、`public` 或 `web-dist`。S3 模式要求 endpoint、region、bucket 和访问凭据完整。开发扫描器会拒绝危险/脚本扩展名、双重扩展名、脚本头、MIME/扩展名/文件头冲突、空文件和超限文件；普通文件仍标记为未连接真实病毒扫描服务。

WebSocket 地址优先使用 `EXPO_PUBLIC_WS_BASE_URL`，否则由 API 地址推导，服务端路径为：

```text
/api/ws
```

生产 WebSocket 只接受 `CORS_ORIGINS` 中的浏览器 Origin；无 Origin 原生客户端必须显式设置 `WS_ALLOW_NATIVE_WITHOUT_ORIGIN=true`。聊天使用共享连接、指数退避、前后台/网络恢复、Token 变化重连、重新订阅和断线补拉；不可用时保留 30 秒轮询。

Health 只表示进程存活：

```text
GET /api/health -> {"ok":true,"status":"alive"}
```

Ready 检查配置、数据库 `SELECT 1`、V3.2.1 Schema 标记和当前存储；任一失败返回 HTTP 503，且不返回连接字符串、路径或内部错误：

```text
GET /api/ready
```

V3.2 MySQL 集成测试：

```powershell
$env:MYSQL_INTEGRATION_URL="mysql://root:password@127.0.0.1:3306/mysql"
pnpm test:integration:v32
pnpm test:migrations:empty
```

`test:integration:v32` 会创建隔离库并覆盖 V3.2.2 Token 数据升级、历史 listing 回填、并发购买、取消释放、所有权变更、消息/通知幂等、9 类 V3.1.2 历史升级、WebSocket 拒绝/订阅权限、文件签名/过期/跨用户和审计；完成后自动删库。CI 定义在 `.github/workflows/ci.yml`，对 `main` 的 PR、`main` 推送和手动触发执行全部检查。

详细变更见 `PHASE3_2_CHANGES.md` 与 `PHASE3_2_1_CHANGES.md`。
