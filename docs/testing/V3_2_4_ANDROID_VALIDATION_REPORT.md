# V3.2.4 Android 真机执行验收报告（AUDIT-001～144）

## 1. 范围与结论

- 执行日期：2026-07-15～2026-07-17（Asia/Shanghai）
- 分支：`codex/v3.2.4-android-validation`
- 冻结提交：`f55ec266edaaa25ed7a33ec547980cd233035888`
- 冻结标签：`v3.2.4-spec-freeze`
- 代码基线：`34f96defd6fa82274730fcb22ae8aeca560353f5`
- 最终批次起点：`be7cc259945dbce7ef0e182b44c58471fba83c45`；已严格执行至 `AUDIT-144`，未进入 `AUDIT-145` 或发布阶段。
- `AUDIT-001` 至 `AUDIT-015` 最终结果：15/15 通过，其中初始 PASS 13、PASS_AFTER_FIX 2、最终 FAIL 0、BLOCKED 0、NOT_REQUIRED 0。
- `AUDIT-016` 至 `AUDIT-030` 最终结果：15/15 通过，其中初始 PASS 14、PASS_AFTER_FIX 1、最终 FAIL 0、BLOCKED 0、NOT_REQUIRED 0。
- 144 项最终统计：初始 PASS 115、PASS_AFTER_FIX 9、NOT_REQUIRED 20、FAIL 0、BLOCKED 0；所有初始失败、根因、修复和回归过程均保留。
- 冻结规范正文未修改；两项修复已按缺陷拆分提交，本报告随第三个闭环提交记录；推送与 CI 在该提交之后执行。
- 所有截图、UI hierarchy、logcat、服务端日志和终端日志均位于未跟踪的 `artifacts` 目录下 `v3.2.4-android-validation` 证据子目录。

## 2. 执行环境

- Windows worktree：仓库根目录 `.`
- Node.js：`v20.19.4`
- pnpm：`9.12.0`
- ADB：`1.0.41`（platform-tools `37.0.0`），来自仓库外的用户提供工具目录
- USB 设备：Xiaomi `23049RAD8C`（device codename `marble`）
- Android：13，API 33，ABI `arm64-v8a`
- ADB 状态：`device`，非 `unauthorized` / `offline`
- 应用：`com.shenghuobang.app`，versionName `3.2.3`，versionCode `323`，minSdk 24，Development Build / debuggable
- 通知权限：安装时存在 `POST_NOTIFICATIONS` 声明；设备当前未授予。通知授权不属于本批 001～015。

### 安装方式

仓库没有受控的 `android/` 目录，本机配置的 Android SDK 路径不存在，因此没有执行 `expo prebuild --clean`，也没有生成或覆盖签名。复用设备内与 EAS 现有 development 构建一致的 3.2.3/323 APK，校验 SHA-256 后通过 `adb install -r` 成功重装；随后用当前 worktree 的 `expo start --dev-client --lan` 加载冻结基线 JavaScript bundle。

EAS 上可查到的 development 构建为 SDK 54、3.2.3/323、internal APK；冻结提交之后没有原生配置变化。当前 worktree 与该构建之间仅有 JavaScript/规范/验证脚本变化，Development Build 能加载当前 bundle。

## 3. 代码与配置审查

### Android / Expo / EAS

- `app.config.js` 可解析，name 为“生活帮”，slug 为 `shenghuobang`，包名与 iOS bundle ID 均为 `com.shenghuobang.app`。
- 保留 adaptive icon、splash、edge-to-edge、键盘 `resize`、predictive back 关闭、SDK 54/new architecture、通知与图片选择插件。
- Android 权限解析结果包含 `POST_NOTIFICATIONS` 与 Expo 音频模块产生的 `MODIFY_AUDIO_SETTINGS`；配置明确关闭录音权限与录音能力。
- `eas.json` 的 development profile 为 development client + internal APK；没有覆盖或改写配置。
- 首页、登录、资料编辑和详情页在 Android 13 的安全区、滚动、键盘与系统返回键下没有发生崩溃。

### API、HTTPS 与网络

- 移动端 API/WS 地址由 `EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_WS_BASE_URL` 注入；真机缺少地址或使用 loopback 时会显示配置错误。
- HTTP/WS 仅用于本轮受控局域网开发环境；HTTPS/WSS 协议配对有客户端校验。生产 HTTPS、证书与最终 network security policy 尚未在本批 release 构建中验证。
- `/api/health` 只返回进程存活；`/api/ready` 检查 configuration、database、storage。
- 真机可 ping 开发机，并可连接隔离 API 与 Metro TCP 端口；当前 worktree bundle 和 API 均通过 LAN 使用。

### 登录、会话与权限

- 原生 session token 与用户缓存使用 SecureStore；Web 才使用 localStorage。
- 登录成功、非法凭据、重复登录、暂停账户、服务不可达均在隔离环境验证；重复登录未产生重复用户。
- 退出登录在服务调用结束或失败时都会清除本地 session 与 Push 注册缓存。
- 审查发现并修复：`auth.me` 过去把网络错误与 401 都转为 `null`，会在弱网冷启动时误清会话。现在只有明确 401 才判定 session 失效，其他错误由 `useAuth` 使用缓存用户恢复。单测与真机断服冷启动均通过。

### WebSocket

- 握手校验 Origin、JWT、账户状态、用户连接上限与 IP 频率；无 Origin 的 native 客户端必须显式启用。
- 订阅前检查会话参与者权限；read 操作要求已订阅；消息大小、订阅数、慢消费者、心跳与重连均有限制。
- 客户端使用指数退避、AppState/online 恢复、订阅恢复与 eventId 去重，断线时进入 reconnecting/polling/offline 状态。
- 修复测试隔离：V3.2 runtime 集成测试现在显式设置 `WS_ALLOW_NATIVE_WITHOUT_ORIGIN=false`，不再继承开发机环境导致安全断言不稳定。

### Push 与通知

- 系统权限不会在首页自动弹出；设置页由用户主动开启。
- 包含 Android channel、EAS projectId、token 变更监听、前台通知列表刷新、点击路由、登出解绑和服务端 token 停用/重试路径。
- 本机通知权限当前为 denied，正式 Push 投递不属于本批 001～015，未激活生产 Push。

### 文件安全

- 上传检查身份、业务对象权限、数量/大小、Base64、文件头、MIME/扩展名、双扩展名、哈希去重和审计日志。
- 私有文件使用短时签名、用户绑定、nonce、版本与权限复核；内容响应为 private/no-store。
- 项目文件仅项目双方可读；实名材料仅本人或有权限审核员可读并记录敏感审计。
- 当前 `DevelopmentFileScanner` 只做本地策略检查并返回 scanner unavailable；真实病毒扫描仍是后续生产门槛，本轮未伪装为已接入。

### 业务状态、UI 与规范覆盖

- 需求、报价、订单、项目、里程碑、退款、投诉、物品、置换、回收、消息与通知状态由冻结状态机/Procedure 映射约束；相关 MySQL 集成链全部通过。
- 主页、需求详情、工程师详情、旧物详情、登录、资料、编辑与退出均从真实页面路径执行；没有使用隐藏按钮或硬编码客户端数据。
- 产品规范校验确认 123 个 `MUST_PASS` 均有 Route/Procedure/Audit 映射；当前只真实执行其中对应 `AUDIT-001`～`AUDIT-030` 的路径，不能据此声称其余 Audit 已完成人工验收。
- 8 个无 UI 写 Procedure 保持契约、权限与审计审查，不新增页面入口。

## 4. 自动化结果

| 项目 | 实际结果 |
| --- | --- |
| `pnpm validate:product-specs` | PASS；139 features、144 audits、54 routes、138 procedures、17 state machines、11 roles；123 MUST_PASS / 5 CURRENT_STATE_ONLY / 11 NOT_REQUIRED；无 mismatch/warning/failure |
| `git diff --check` | PASS |
| `pnpm check` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` | PASS；11 files、60 tests（原 58 + 新增弱网 session 2） |
| `pnpm build` | PASS；`dist/index.mjs` 398.1 kB |
| `pnpm build:web` | PASS；1547 modules、19 assets；仅 caniuse-lite 数据陈旧提示 |
| 空库迁移 | PASS；14 个 Drizzle migrations，连续执行两次均成功 |
| `pnpm db:migrate` / `pnpm db:seed` | PASS；隔离库 `shenghuobang_v324_validation` |
| `pnpm test:seed:idempotent` | PASS |
| `pnpm test:integration:mysql` | PASS；V3.1.1 10 组 + V3.1.2 9 组 |
| `pnpm test:integration:v32` | PASS；V3.2 DB 18 项 + 历史升级 9 variants + runtime health/ready 3、WebSocket 6、file security 7 |
| `/api/health` | localhost 与 LAN 均 HTTP 200 / alive |
| `/api/ready` | localhost 与 LAN 均 HTTP 200 / ready；configuration/database/storage 均 ok |
| Android bundle | PASS；1884 modules，真机从当前 LAN Metro 加载 |
| APK 安装 | PASS；`adb install -r` 返回 Success |

第一次 V3.2 runtime 运行因开发机已有 `WS_ALLOW_NATIVE_WITHOUT_ORIGIN=true` 而失败；该失败真实保留在证据中。测试启动环境显式固定为 false 后复跑完整链通过。

## 5. AUDIT-001 至 AUDIT-015

### AUDIT-001 / AUTH-001、UX-001

- 账号与角色：开发者
- 前置数据：依赖已安装，冻结 worktree 可用
- 真机/终端步骤：执行 check、lint、全部 unit、backend build、web export
- 实际结果：全部退出码 0；60/60 tests 通过
- 预期结果：构建命令通过或明确记录失败
- 状态：PASS
- 截图/录屏：不适用
- 客户端日志：`final2-typecheck.log`、`final2-lint.log`、`final2-unit-tests.log`、`final2-web-build.log`
- 服务端日志：`final2-backend-build.log`
- Procedure/API：无
- 缺陷等级：无
- 修复提交：无（按要求未提交）
- 回归结果：PASS

### AUDIT-002 / ORDER-006、CHAT-003、NOTICE-003、COM-002

- 账号与角色：开发者 / 受控测试角色
- 前置数据：隔离 Docker MySQL 8，数据库 `shenghuobang_v324_validation`；未连接生产库
- 步骤：迁移、Seed、Seed 幂等、V3.1.1/V3.1.2/V3.2 集成、历史升级、空库双迁移
- 实际结果：全部通过；V3.2 runtime 首跑暴露测试环境继承问题，修复后完整复跑通过
- 预期结果：迁移、Seed 与 MySQL 集成脚本通过
- 初始结果：FAIL；runtime 子进程继承本机 WebSocket 无 Origin 开关，生产安全断言失败
- 状态：PASS_AFTER_FIX
- 截图/录屏：不适用
- 客户端日志：不适用
- 服务端/数据库日志：`db-migrate.log`、`db-seed.log`、`seed-idempotency.log`、`integration-mysql.log`、`integration-v32-rerun.log`、`migrations-empty.log`
- Procedure/API：`refunds.submit`、`messagesRouter.send`、`messagesRouter.markRead`、`complaints.create`
- 缺陷编号及等级：`V324-AND-002` / P2
- 修复提交：`0676a4eda3e3d0d50246012da215ba9d13c18702`；文件 `scripts/test-v32-runtime.ts`
- 回归结果：PASS

### AUDIT-003 / UX-004

- 账号与角色：开发者
- 前置数据：隔离后端运行
- 步骤：访问 localhost 与 LAN `/api/health`
- 实际结果：两者均 HTTP 200，`alive`
- 预期结果：alive 且无环境阻断
- 状态：PASS
- 截图/录屏：不适用
- 客户端/服务端日志：`health-ready.txt`、`device-server.stdout.log`
- Procedure/API：`GET /api/health`
- 缺陷等级：无；修复提交：无；回归：PASS

### AUDIT-004 / UX-006

- 账号与角色：开发者
- 前置数据：隔离后端、MySQL 与本地存储运行
- 步骤：访问 localhost 与 LAN `/api/ready`
- 实际结果：两者均 HTTP 200，configuration/database/storage 全部 ok
- 预期结果：ready 且 checks 全部 ok
- 状态：PASS
- 截图/录屏：不适用
- 客户端/服务端日志：`health-ready.txt`、`device-server.stdout.log`
- Procedure/API：`GET /api/ready`
- 缺陷等级：无；修复提交：无；回归：PASS

### AUDIT-005 / UX-001

- 账号与角色：开发者
- 前置数据：USB 真机与 WLAN 可达
- 步骤：以 `--dev-client --lan` 启动 Metro；仅在进程环境注入 LAN API/WS 地址；真机打开当前 bundle
- 实际结果：真机可达 API/Metro TCP，1884 modules bundle 完成并渲染首页
- 预期结果：LAN 地址只存在于被忽略环境/仓库外证据
- 状态：PASS
- 截图/录屏：`home-initial.png`
- 客户端日志：`launch-logcat.txt`、`metro.stdout.log`
- 服务端日志：`device-server.stdout.log`
- Procedure/API：无
- 缺陷等级：无；修复提交：无；回归：PASS

### AUDIT-006 / AUTH-001

- 账号与角色：受控普通用户（ROLE-001）
- 前置数据：隔离 Seed 用户；不写生产
- 步骤：真机打开 `/login`；非法凭据；合法登录；API 重复登录；暂停账户登录；不可达服务
- 实际结果：合法 200；非法凭据 401；重复两次均 200 且用户数仍为 1；暂停账户 403；不可达服务明确报网络错误；真机登录后进入首页
- 预期结果：合法状态成功，非法/受限状态拒绝，无部分写入，可恢复
- 状态：PASS
- 截图/录屏：`audit-006-login.png`、`audit-006-login-success.png`
- 客户端日志：`audit-006-client.log`
- 服务端日志：`audit-006-server.log`、`audit-006-api-scenarios.txt`
- Procedure/API：`POST /api/auth/login`
- 缺陷等级：无
- 修复提交：无
- 回归结果：PASS

### AUDIT-007 / AUTH-002

- 账号与角色：已登录普通用户（ROLE-002）
- 前置数据：真机 SecureStore 中存在受控 session
- 步骤：强制结束应用后冷启动；进入“我的”；随后关闭隔离后端再次冷启动并进入“我的”
- 实际结果：正常恢复时无登录门禁；断服时仍保留缓存身份，登录提示 0、资料身份标记 4
- 预期结果：正常、失败与恢复路径明确，不静默清除有效缓存 session
- 初始结果：FAIL；断服时 `auth.me` 将瞬时请求失败当作 session 失效并清除 SecureStore 会话
- 状态：PASS_AFTER_FIX
- 截图/录屏：`audit-007-session-restored-home.png`、`audit-007-session-profile.png`、`audit-007-offline-session.png`
- 客户端日志：`audit-007-offline-recovery.txt`、`launch-logcat.txt`
- 服务端日志：`device-server.stdout.log`
- Procedure/API：`auth.me` / `GET /api/auth/me`
- 缺陷编号及等级：`V324-AND-001` / P1
- 修复提交：`5c65ed90e83ec030fa5fa5c3d3914b642237740c`；文件 `lib/_core/api.ts`、`lib/_core/api-error.ts`、`tests/auth.session-recovery.test.ts`
- 回归结果：2 个新增单测通过，真机断服冷启动通过

### AUDIT-008 / AUTH-003

- 账号与角色：已登录普通用户（ROLE-002）
- 前置数据：有效受控 session
- 步骤：资料页滚动至退出；确认对话框；执行退出；检查门禁
- 实际结果：确认框正常；退出后“立即登录”门禁出现，本地 session 与注册缓存清理
- 预期结果：退出成功且失败时本地清理仍可恢复；重复/非法请求不产生部分业务写入
- 状态：PASS
- 截图/录屏：`audit-008-logout-dialog.png`、`audit-008-logout-success.png`
- 客户端日志：`audits-006-010-client.log`
- 服务端日志：`audits-006-010-server.log`
- Procedure/API：`auth.logout` / `POST /api/auth/logout`
- 缺陷等级：无；修复提交：无；回归：`auth.logout.test.ts` PASS

### AUDIT-009 / AUTH-004

- 账号与角色：普通用户（ROLE-002）
- 前置数据：会话恢复成功，Seed profile 可读
- 步骤：进入 `/profile`，检查身份、城市、信用、菜单与角色提示
- 实际结果：资料与菜单渲染，无崩溃、无越权入口
- 预期结果：数据、空态、失败态、权限提示与跳转可判断
- 状态：PASS
- 截图/录屏：`audit-009-profile.png`
- 客户端日志：`audit-009-profile-ui.xml`
- 服务端日志：`audits-006-010-server.log`
- Procedure/API：`profile.me`
- 缺陷等级：无；修复提交：无；回归：PASS

### AUDIT-010 / AUTH-005

- 账号与角色：普通用户（ROLE-002）
- 前置数据：隔离用户已登录
- 步骤：进入 `/profile-edit`；写入受控 bio 标记；保存；查询隔离 MySQL
- 实际结果：保存后返回资料页；数据库中精确标记计数为 1
- 预期结果：合法用户可更新，状态与回显一致，不写生产
- 状态：PASS
- 截图/录屏：`audit-010-profile-edit.png`、`audit-010-profile-save.png`
- 客户端日志：`audit-010-profile-edit-ui.xml`、`audit-010-bio-entered-ui.xml`
- 服务端日志：`audits-006-010-server.log`
- Procedure/API：`profile.update`
- 缺陷等级：无；修复提交：无；回归：数据库落库确认 PASS

### AUDIT-011 / HOME-001

- 账号与角色：游客（ROLE-001）
- 前置数据：Seed 首页数据
- 步骤：冷启动并打开 `/`
- 实际结果：位置、搜索、AI 助手、快捷入口与需求列表正常渲染
- 预期结果：首页首屏无崩溃，数据/权限反馈可判断
- 状态：PASS
- 截图/录屏：`audit-011-home.png`
- 客户端日志：`audit-011-home-ui.xml`
- 服务端日志：`device-server.stdout.log`
- Procedure/API：`home.feed`
- 缺陷等级：无；修复提交：无；回归：PASS

### AUDIT-012 / HOME-002

- 账号与角色：游客（ROLE-001）
- 前置数据：Seed 首页数据
- 步骤：检查发布需求、找工程师、旧物出售、回收、赠送与全部服务快捷入口
- 实际结果：快捷入口可点击；需要身份的写入口显示登录门禁，公开入口可访问
- 预期结果：入口无崩溃，权限提示和跳转明确
- 状态：PASS
- 截图/录屏：`audit-012-home-content.png`
- 客户端日志：`audit-012-home-content-ui.xml`
- 服务端日志：`device-server.stdout.log`
- Procedure/API：`home.feed`
- 缺陷等级：无；修复提交：无；回归：PASS

### AUDIT-013 / HOME-003

- 账号与角色：游客（ROLE-001）
- 前置数据：Seed 推荐需求
- 步骤：首页点击推荐需求卡片进入 `/needs/[id]`
- 实际结果：需求标题、状态、预算、发布者、结构化详情与讨论区渲染
- 预期结果：详情无崩溃，数据与权限反馈明确
- 状态：PASS
- 截图/录屏：`audit-013-need-detail.png`
- 客户端日志：`audit-013-need-detail-ui.xml`
- 服务端日志：`device-server.stdout.log`
- Procedure/API：`needs.detail`
- 缺陷等级：无；修复提交：无；回归：PASS

### AUDIT-014 / HOME-004

- 账号与角色：游客（ROLE-001）
- 前置数据：Seed 推荐工程师
- 步骤：首页“找工程师”进入列表，再点击工程师进入 `/engineers/[userId]`
- 实际结果：认证状态、接单状态、经验、评分、技能、简介与联系入口渲染
- 预期结果：详情无崩溃，数据与权限反馈明确
- 状态：PASS
- 截图/录屏：`audit-014-engineer-detail.png`
- 客户端日志：`audit-014-engineer-detail-ui.xml`、`engineers-list-ui.xml`
- 服务端日志：`device-server.stdout.log`
- Procedure/API：`engineers.detail`
- 缺陷等级：无；修复提交：无；回归：PASS

### AUDIT-015 / HOME-005

- 账号与角色：游客（ROLE-001）
- 前置数据：Seed 推荐旧物
- 步骤：首页下滚到推荐旧物，点击卡片进入 `/listings/[id]`
- 实际结果：商品信息与购买入口正常渲染；没有登录门禁阻挡只读详情
- 预期结果：详情无崩溃，数据与权限反馈明确
- 状态：PASS
- 截图/录屏：`audit-015-listing-detail.png`
- 客户端日志：`audit-015-listing-detail-ui.xml`、`home-lower-ui.xml`
- 服务端日志：`device-server.stdout.log`
- Procedure/API：`listings.detail`
- 缺陷等级：无；修复提交：无；回归：PASS

## 6. 缺陷闭环登记

### P0

- 无。

### V324-AND-001 / P1

- 对应 Audit ID：`AUDIT-007`（AUTH-002 会话恢复）。
- 初始结果：FAIL。在线冷启动可以恢复，但关闭隔离后端后冷启动会把瞬时网络故障当作未登录并清除 SecureStore session，不满足失败与恢复检查。
- 复现步骤：使用受控账号登录并确认 session 已保存；停止隔离后端；强制结束应用；从当前 Development Build 冷启动；进入“我的”并检查登录门禁和缓存身份。
- 根因：`lib/_core/api.ts` 的 `getMe()` 捕获所有异常后统一返回 `null`；`useAuth` 无法区分明确 401 与超时/断服，因此执行 `clearSession()`。
- 修改文件：`lib/_core/api.ts`、`lib/_core/api-error.ts`、`tests/auth.session-recovery.test.ts`。
- 自动化测试：新增 2 项 session recovery 测试，确认 401 返回 session 失效、瞬时请求失败继续抛给缓存恢复层；完整 TypeScript、Lint 和单测通过。
- 真机回归结果：PASS。断服后冷启动，登录提示标记为 0，已认证资料标记为 4，SecureStore 缓存身份保留。
- 修复提交：`5c65ed90e83ec030fa5fa5c3d3914b642237740c`。
- 最终结果：PASS_AFTER_FIX。

### V324-AND-002 / P2

- 对应 Audit ID：`AUDIT-002`（V3.2 MySQL/runtime 集成命令）。
- 初始结果：FAIL。首次 `pnpm test:integration:v32` 的数据库 18 项与历史升级通过，但 runtime 安全检查报告 native client without Origin 被接受。
- 复现步骤：在父进程存在 `WS_ALLOW_NATIVE_WITHOUT_ORIGIN=true` 时执行 `pnpm test:integration:v32`；runtime 子进程继承该值；观察生产模式无 Origin 拒绝断言失败。
- 根因：`scripts/test-v32-runtime.ts` 继承父进程环境，却没有为生产安全场景显式固定 `WS_ALLOW_NATIVE_WITHOUT_ORIGIN=false`。
- 修改文件：`scripts/test-v32-runtime.ts`。
- 自动化测试：完整复跑 `pnpm test:integration:v32`；V3.2 DB 18 项、历史升级 9 variants、health/ready 3、WebSocket Origin/JWT 6、文件安全 7 全部通过。
- 真机回归结果：PASS。真机开发环境仅在隔离启动参数显式设为 true 时允许 native 无 Origin；测试中的生产模式固定为 false 并拒绝无 Origin，二者边界明确。
- 修复提交：`0676a4eda3e3d0d50246012da215ba9d13c18702`。
- 最终结果：PASS_AFTER_FIX。

### 环境提示（非产品缺陷）

- MIUI `uiautomator dump` 每次会向 stderr 输出缺少 `theme_compatibility.xml` 的系统栈，但仍成功产出 XML，不影响应用与 Audit 判定。
- 第一次空缓存 Metro bundle 用时较长，完成后应用正常渲染。
- caniuse-lite 数据陈旧仅为 Web 构建警告，不影响导出成功。

## 7. 已修改文件

- `scripts/test-v32-runtime.ts`
- `lib/_core/api.ts`
- `lib/_core/api-error.ts`（新增）
- `tests/auth.session-recovery.test.ts`（新增）
- `docs/testing/V3_2_4_ANDROID_VALIDATION_REPORT.md`（新增）

冻结规范文件均未修改。

## 8. 第一批停止点（历史记录）

- 第一批报告提交后，三个闭环提交已推送，手动触发的 GitHub Actions CI `29424266995` 在提交 `eb59978a257e357803f7d1c836df73e0352cd639` 上成功。
- CI 全绿后才开始第二批，执行记录如下；没有提前执行 `AUDIT-016`。

## 9. 第二批执行汇总

- 执行范围：`AUDIT-016`～`AUDIT-030`，不包含 `AUDIT-031`。
- 角色：`AUDIT-016`～`AUDIT-025` 使用未登录访客（ROLE-001）；`AUDIT-026`～`AUDIT-030` 使用隔离测试库中的受控普通用户（ROLE-002）。
- 前置数据：隔离 MySQL 8 空间执行完整迁移与 seed；所有写操作只落入隔离数据库。
- 初始结果：PASS 14、FAIL 1、BLOCKED 0、NOT_REQUIRED 0。
- 最终结果：PASS 14、PASS_AFTER_FIX 1、FAIL 0、BLOCKED 0、NOT_REQUIRED 0。
- 第二批新增缺陷：P0 0、P1 1、P2 0。
- 证据根：未跟踪证据树中的 `v3.2.4-android-validation/batch2-audit-016-030/`；以下只记录文件名，不记录本机绝对路径。

### AUDIT-016 / DISC-001

- 角色和账号：未登录访客（ROLE-001）；前置数据：seed 公开需求。
- 真机步骤：打开 `/discover`，选择“需求”，下拉刷新并打开列表状态。
- 预期结果：`needs.list` 数据、空态或失败态可明确判断，页面不崩溃。
- 初始实际结果：公开需求列表和状态标签正常显示；PASS。
- 证据：`AUDIT-016-discover-needs.png`、`AUDIT-016-discover-ui.xml`；客户端日志同 UI XML；服务端日志 `server.stdout.log`。
- Procedure/API：`needs.list`；缺陷、根因、修复提交：无；最终回归：PASS。

### AUDIT-017 / DISC-002

- 角色和账号：未登录访客（ROLE-001）；前置数据：seed 认证工程师。
- 真机步骤：在 `/discover` 切换“工程师”。
- 预期结果：`engineers.list` 可稳定展示数据、空态或失败态。
- 初始实际结果：两条认证工程师、技能、评分和起步价正常显示；PASS。
- 证据：`AUDIT-017-discover-engineers.png`、`AUDIT-017-discover-engineers-ui.xml`；服务端日志 `server.stdout.log`。
- Procedure/API：`engineers.list`；缺陷、根因、修复提交：无；最终回归：PASS。

### AUDIT-018 / DISC-003

- 角色和账号：未登录访客（ROLE-001）；前置数据：seed 公开旧物。
- 真机步骤：在 `/discover` 切换“旧物”。
- 预期结果：`listings.list` 可稳定展示数据、空态或失败态。
- 初始实际结果：三条旧物及价格/赠送状态正常显示；PASS。
- 证据：`AUDIT-018-discover-listings.png`、`AUDIT-018-discover-listings-ui.xml`；服务端日志 `server.stdout.log`。
- Procedure/API：`listings.list`；缺陷、根因、修复提交：无；最终回归：PASS。

### AUDIT-019 / DISC-004

- 角色和账号：未登录访客（ROLE-001）；回归使用同一公开权限的受控普通用户；前置数据：seed 开放回收询价。
- 真机步骤：打开 `/discover`，查找并选择“回收”，核对询价卡片和详情跳转入口。
- 预期结果：页面通过 `recycling.openRequests` 展示回收分类，不出现崩溃或权限误拒。
- 初始实际结果：FAIL；普通用户标签只有需求、工程师、旧物、免费赠送，没有回收入口。
- 缺陷：`V324-AND-003` / P1；根因：`app/(tabs)/discover.tsx` 的用户标签、查询启用条件和渲染分支均遗漏冻结矩阵的 DISC-004。
- 修改文件：`app/(tabs)/discover.tsx`、`lib/discover-tabs.ts`、`tests/v324-android-validation.test.ts`。
- 自动化测试：新增 1 项，锁定“回收”标签与 `recycling.openRequests` 映射；TypeScript、Lint、完整 61 项单测和 V3.2 MySQL/runtime 集成均通过。
- 真机回归：回收标签完整显示，点击后展示 seed 询价，未出现权限或布局问题；PASS_AFTER_FIX。
- 证据：初始 `AUDIT-016-discover-ui.xml`；回归 `AUDIT-019-recycling-after-fix.png`、`AUDIT-019-recycling-after-fix-ui.xml`；服务端日志 `server-restart.stdout.log`。
- Procedure/API：`recycling.openRequests`；修复提交：`37f6a553b15c35cbeafe5467207a0f97c45f179d`；最终结果：PASS_AFTER_FIX。

### AUDIT-020 / SEARCH-001

- 角色和账号：未登录访客（ROLE-001）；前置数据：公开搜索页。
- 真机步骤：打开 `/search`，聚焦输入框，检查键盘 resize、输入和搜索键。
- 预期结果：输入框不被遮挡，键盘与页面稳定。
- 初始实际结果：Android 键盘弹出后输入框和热门词仍可操作；PASS。
- 证据：`AUDIT-020-search-keyboard.png`、`AUDIT-020-search-ui.xml`；服务端日志 `server.stdout.log`。
- Procedure/API：`needs.list`、`engineers.list`、`listings.list`；缺陷、根因、修复提交：无；最终回归：PASS。

### AUDIT-021 / SEARCH-002

- 角色和账号：未登录访客（ROLE-001）；前置数据：热门词列表。
- 真机步骤：点击“空调维修”，核对输入回填和搜索状态。
- 预期结果：热门词可点击并触发搜索，结果或空态明确。
- 初始实际结果：关键词正确回填并触发三类查询，当前 seed 返回明确空态；未复现历史 UI 点击问题；PASS。
- 证据：`AUDIT-021-hot-keyword.png`、`AUDIT-021-hot-keyword-ui.xml`；服务端日志 `server.stdout.log`。
- Procedure/API：`needs.list`、`engineers.list`、`listings.list`；缺陷、根因、修复提交：无；最终回归：PASS。

### AUDIT-022 / SEARCH-003

- 角色和账号：未登录访客（ROLE-001）；前置数据：seed 旧物。
- 真机步骤：手动输入匹配关键词并点击搜索。
- 预期结果：匹配结果按业务类型显示。
- 初始实际结果：返回对应旧物卡片，无错误或重复；PASS。
- 证据：`AUDIT-022-manual-results.png`、`AUDIT-022-manual-results-ui.xml`；服务端日志 `server.stdout.log`。
- Procedure/API：`needs.list`、`engineers.list`、`listings.list`；缺陷、根因、修复提交：无；最终回归：PASS。

### AUDIT-023 / SEARCH-004

- 角色和账号：未登录访客（ROLE-001）；前置数据：不匹配任何 seed 的受控关键词。
- 真机步骤：提交无结果关键词。
- 预期结果：显示明确空态和发布需求行动入口。
- 初始实际结果：“没有找到相关内容”、提示和“发布需求”按钮完整显示；PASS。
- 证据：`AUDIT-023-empty-state.png`、`AUDIT-023-empty-state-ui.xml`；服务端日志 `server.stdout.log`。
- Procedure/API：`needs.list`、`engineers.list`、`listings.list`；缺陷、根因、修复提交：无；最终回归：PASS。

### AUDIT-024 / SEARCH-005

- 角色和账号：未登录访客（ROLE-001）；前置数据：隔离后端可安全停止和恢复。
- 真机步骤：停掉隔离后端后提交新关键词，等待请求失败；随后恢复后端。
- 预期结果：显示可理解的失败态和重试入口，不崩溃。
- 初始实际结果：显示“搜索失败”、网络提示和重试能力；后端恢复后页面可继续使用；PASS。
- 证据：`AUDIT-024-failure-state-final.png`、`AUDIT-024-failure-state-ui.xml`；服务端日志 `server.stdout.log`、`server-restart.stdout.log`。
- Procedure/API：`needs.list`、`engineers.list`、`listings.list`；缺陷、根因、修复提交：无；最终回归：PASS。

### AUDIT-025 / SEARCH-006

- 角色和账号：未登录访客（ROLE-001）；前置数据：从发现页进入搜索页。
- 真机步骤：先关闭键盘，再按 Android 系统返回键。
- 预期结果：先处理键盘，再返回上一层，不能退出异常或卡死。
- 初始实际结果：键盘和搜索页按层级退出，最终回到首页/发现导航栈；PASS。
- 证据：`AUDIT-025-android-back.png`、`AUDIT-025-android-back-ui.xml`；客户端日志同 UI XML。
- Procedure/API：无；缺陷、根因、修复提交：无；最终回归：PASS。

### AUDIT-026 / NEED-001

- 角色和账号：受控普通用户（ROLE-002）；前置数据：隔离数据库、本人账号。
- 真机步骤：在 `/needs/create` 填写标题、描述、类型、城市和可见性；执行一次成功创建；另一次在提交前停止隔离后端，确认失败后恢复并重试。
- 预期结果：`needs.create` 只允许登录用户；断服不产生部分写入，恢复后可重试为单条草稿。
- 初始实际结果：正常路径创建草稿；断服路径显示网络错误且数据库记录数为 0，恢复后同一表单创建一条 draft；PASS。
- 权限/非法/重复验证：发布按钮 loading 阻止重复点击；后端契约另验证非创建者发布被拒，已发布需求重复发布被拒。
- 证据：`AUDIT-026-step1-filled.png`、`AUDIT-026-network-failure.png`、`AUDIT-026-network-recovered.png` 及对应 UI XML；服务端日志 `server-restart.stdout.log`、`server-second-restart.stdout.log`。
- Procedure/API：`needs.create`；缺陷、根因、修复提交：无；最终回归：PASS。

### AUDIT-027 / NEED-002

- 角色和账号：受控普通用户（ROLE-002）；前置数据：本人刚创建的草稿。
- 真机步骤：进入步骤 2，等待 `needs.aiStructure`，检查本地基础整理结果，确认内容后继续。
- 预期结果：AI 未配置时仍有明确可编辑结果，不阻塞流程。
- 初始实际结果：显示结构化字段、本地基础整理风险提示和确认控件；确认后成功进入步骤 3；PASS。
- 证据：`AUDIT-027-ai-structure.png`、`AUDIT-027-ai-structure-ui.xml`、`AUDIT-027-ai-confirm-ui.xml`；服务端日志 `server-restart.stdout.log`。
- Procedure/API：`needs.aiStructure`、`needs.update`；缺陷、根因、修复提交：无；最终回归：PASS。

### AUDIT-028 / NEED-003

- 角色和账号：受控普通用户（ROLE-002）；前置数据：本人 draft。
- 真机步骤：填写预算下限/上限与期限，保留服务方式开关，点击下一步。
- 预期结果：`needs.update` 保存合法整数预算并进入预览；状态仍为 draft。
- 初始实际结果：数据库回显 budgetMin 100、budgetMax 300、status draft；预览页正常；PASS。
- 证据：`AUDIT-028-step3.png`、`AUDIT-028-step3-filled.png`、`AUDIT-028-step3-ui.xml`；服务端日志 `server-restart.stdout.log`。
- Procedure/API：`needs.update`；缺陷、根因、修复提交：无；最终回归：PASS。

### AUDIT-029 / NEED-004

- 角色和账号：受控普通用户（ROLE-002）；前置数据：已完成前三步的本人 draft。
- 真机步骤：核对预览，快速双击“确认发布”，刷新详情和数据库。
- 预期结果：只产生一次合法发布，状态与详情一致；非草稿重复发布拒绝。
- 初始实际结果：进入详情并显示“已发布”；数据库同一 ID 只有一条 published；服务端契约拒绝再次发布；PASS。
- 证据：`AUDIT-029-preview.png`、`AUDIT-029-published.png` 及对应 UI XML、`needs-negative-contract.json`；服务端日志 `server-restart.stdout.log`。
- Procedure/API：`needs.publish`；缺陷、根因、修复提交：无；最终回归：PASS。

### AUDIT-030 / NEED-005

- 角色和账号：受控普通用户（ROLE-002）；另用次级受控用户做归属拒绝验证；前置数据：隔离数据库。
- 真机步骤：创建需求并停留在 AI 整理阶段，不发布；打开 `/my-needs`；另以非创建者调用发布契约。
- 预期结果：草稿保留并只对本人可见；非创建者写操作拒绝。
- 初始实际结果：`/my-needs` 显示草稿标题和“草稿”状态；数据库为单条 draft；非创建者发布返回“只有创建者可以发布需求”；PASS。
- 证据：`AUDIT-030-my-needs-draft.png`、`AUDIT-030-my-needs-ui.xml`、`needs-negative-contract.json`；服务端日志 `server-second-restart.stdout.log`。
- Procedure/API：`needs.create`、`needs.update`；缺陷、根因、修复提交：无；最终回归：PASS。

## 10. 第二批修复后自动化

| 项目 | 实际结果 |
| --- | --- |
| `pnpm validate:product-specs` | PASS；139 features、144 audits、123 MUST_PASS；0 warning / 0 failure |
| `pnpm lint` | PASS |
| `pnpm check` | PASS |
| `pnpm test` | PASS；12 files、61 tests，新增发现页回收映射 1 项 |
| `pnpm test:integration:v32` | PASS；DB 18、历史升级 9 variants、health/ready 3、WebSocket 6、文件安全 7 |
| `pnpm build` | PASS；`dist/index.mjs` 398.1 kB |
| `pnpm build:web` | PASS；1548 modules、19 assets；仅 caniuse-lite 数据陈旧提示 |
| `git diff --check` | PASS |

## 11. 第二批修改与停止点

- 修改文件：`app/(tabs)/discover.tsx`、`lib/discover-tabs.ts`、`tests/v324-android-validation.test.ts`、`docs/testing/V3_2_4_ANDROID_VALIDATION_REPORT.md`。
- 冻结规范正文没有修改，`v3.2.4-spec-freeze` 没有移动或重建。
- `AUDIT-031` 及以后未执行；订单、项目、里程碑、退款、投诉、消息、Push、WebSocket 真机消息和文件上传下载等后续 Audit 仍待后续批次。
- 正式 Push、真实病毒扫描、生产 HTTPS/证书、正式支付和生产存储均未激活。

## 12. 第三批范围、环境与判定口径

- 范围：`AUDIT-031`～`AUDIT-090`，严格停止在 `AUDIT-090`；未执行 `AUDIT-091`。
- 真机：Xiaomi 23049RAD8C，Android 13，USB ADB 状态 `device`；Development Build 连接仓库 Metro。
- 数据：只使用隔离 MySQL 8 测试库和受控账号；没有读取或修改生产数据。
- 证据根目录：`artifacts/v3.2.4-android-validation/batch3-audit-031-090/`，该目录保持未跟踪且不提交。
- FULL_FLOW 预期：合法角色和状态只成功一次；重复、越权和非法状态被拒绝；失败不产生部分写入，恢复后可安全重试；页面刷新与数据库一致。
- READ_ONLY_PLUS_AUTOMATION 预期：正常、空态、失败态和恢复路径明确，无崩溃、静默失败或业务写入。
- 表中“服务端日志”统一指证据目录内 `server*.log`；“客户端日志”由对应 UI XML、截图和 Metro 日志组成。数据库证据使用同 Audit 前缀的 `database/db` 文件。

## 13. AUDIT-031～045 逐项结果

| Audit / Feature | 角色、前置数据与真机步骤 | 初始实际结果 / 最终结果 | 证据 | Procedure/API |
| --- | --- | --- | --- | --- |
| AUDIT-031 / NEED-006 | ROLE-002；本人已有受控需求；打开 `/my-needs` 并刷新 | 草稿和已发布需求均按状态显示；PASS | `AUDIT-031-my-needs.png`、`AUDIT-031-my-needs-ui.xml`；客户端/服务端日志 | `needs.list` |
| AUDIT-032 / NEED-007 | ROLE-002；打开受控需求详情并刷新 | 内容、状态、发布者和操作区一致；PASS | `AUDIT-032-need-detail.png`、`AUDIT-032-need-detail-ui.xml`；客户端/服务端日志 | `needs.detail` |
| AUDIT-033 / NEED-008 | ROLE-002；评论并支持需求，快速重复操作后查库 | 评论只写入一次，支持计数和数据库一致；PASS | `AUDIT-033-comment-support.png`、`AUDIT-033-database.txt`；客户端/服务端日志 | `needs.comment`、`needs.support` |
| AUDIT-034 / QUOTE-001 | ROLE-004；受控工程师提交解决方案并重复点击 | 仅生成一条方案，刷新和数据库保持；PASS | `AUDIT-034-solution-submitted.png`、`AUDIT-034-database.json`；客户端/服务端日志 | `quotes.submitSolution` |
| AUDIT-035 / QUOTE-002 | ROLE-004；在同一需求提交报价并重复点击 | 报价金额和说明正确，仅一条记录；PASS | `AUDIT-035-quote-submitted.png`、`AUDIT-035-database.json`；客户端/服务端日志 | `quotes.submitQuote` |
| AUDIT-036 / QUOTE-003 | ROLE-004；打开报价详情并创建新版本 | 版本历史完整，新版本只写一次；PASS | `AUDIT-036-version-created.png`、`AUDIT-036-database.json`；客户端/服务端日志 | `quotes.detail`、`quotes.versions`、`quotes.createVersion` |
| AUDIT-037 / QUOTE-004 | ROLE-002；需求发布者接受报价并重复点击 | 报价进入 accepted，未重复创建业务记录；PASS | `AUDIT-037-accepted.png`、`AUDIT-037-038-database.json`；客户端/服务端日志 | `quotes.accept` |
| AUDIT-038 / PROJ-001 | ROLE-002/004；双方确认项目并完成 sandbox 付款入口 | 项目成功建立并进入正确履约状态，付款记录一致；PASS | `project-payment-done.png`、`project-payment-database.txt`；客户端/服务端日志 | `quotes.accept`、项目付款流程 |
| AUDIT-039 / PROJ-002 | ROLE-002/004；打开项目列表并刷新 | 双方仅看到有权项目，状态正确；PASS | `AUDIT-039-project-list.png`、`AUDIT-039-project-list-ui.xml`；客户端/服务端日志 | `projects.list` |
| AUDIT-040 / PROJ-003 | ROLE-002/004；打开项目详情 | 参与方、金额、里程碑和状态一致；PASS | `AUDIT-040-project-detail.png`、`AUDIT-040-project-detail-ui.xml`；客户端/服务端日志 | `projects.detail` |
| AUDIT-041 / PROJ-004 | ROLE-004；提交里程碑，修订后再次提交 | 首次与修订提交状态均正确，每次操作只生效一次；PASS | `AUDIT-041-milestone-submitted.png`、`AUDIT-041-resubmit-database.txt`；客户端/服务端日志 | `projects.submitMilestone` |
| AUDIT-042 / PROJ-005 | ROLE-002；验收重新提交的里程碑 | 里程碑进入 accepted，数据库与详情一致；PASS | `AUDIT-042-milestone-accepted.png`、`AUDIT-042-database.txt`；客户端/服务端日志 | `projects.acceptMilestone` |
| AUDIT-043 / PROJ-006 | ROLE-002；对首次交付请求修订 | 里程碑进入 revision_required，原因保留；PASS | `AUDIT-043-revision-requested.png`、`AUDIT-043-database.txt`；客户端/服务端日志 | `projects.requestRevision` |
| AUDIT-044 / PROJ-007 | ROLE-002/004；先提交 MIME 不匹配文件，再上传有效 PDF | 非法文件明确拒绝且无元数据；有效文件和审计记录写入；PASS | `AUDIT-044-valid-file-uploaded.png`、`AUDIT-044-valid-database.json`；客户端/服务端日志 | `projects.uploadFile` |
| AUDIT-045 / PROJ-008 | ROLE-002/004；从项目文件列表打开短签名 URL | 有权用户可打开有效文件，签名访问有审计；PASS | `AUDIT-045-file-open.png`、`AUDIT-045-database.json`；客户端/服务端日志 | `projects.fileAccessUrl` |

## 14. AUDIT-046～060 逐项结果

| Audit / Feature | 角色、前置数据与真机步骤 | 初始实际结果 / 最终结果 | 证据 | Procedure/API |
| --- | --- | --- | --- | --- |
| AUDIT-046 / PROJ-009 | ROLE-002/004；创建变更、撤回一条并由对方批准另一条 | 创建、撤回和批准状态清晰，最终数据一致；PASS | `AUDIT-046-change-approved.png`、`AUDIT-046-final-database.txt`；客户端/服务端日志 | `projects.createChange`、`projects.respondChange`、`projects.withdrawChange` |
| AUDIT-047 / LIST-001 | ROLE-002；打开发布页并填写全部基础字段 | 必填校验、输入和回显正常；PASS | `AUDIT-047-fields-filled.png`、`AUDIT-047-fields-filled.xml`；客户端日志 | `listings.save` |
| AUDIT-048 / LIST-002 | ROLE-002；选择多个允许的流转方式 | fixed_price、accept_offers、swap、recycle 等选择状态正确；PASS | `AUDIT-048-all-trade-modes-selected.png`；客户端日志 | `listings.save` |
| AUDIT-049 / IMG-001 | ROLE-002；点击图片选择并检查 Android 权限 | 系统选择器打开，无多余存储权限请求；PASS | `AUDIT-049-050-image-picker.png`、对应 UI XML；客户端日志 | Android 图片选择器 |
| AUDIT-050 / IMG-002 | ROLE-002；选择两张受控图片 | 两张预览均显示，数量与选择一致；PASS | `AUDIT-050-two-images.png`、`AUDIT-050-two-images-ui.xml`；客户端日志 | Android 图片选择器 |
| AUDIT-051 / IMG-003 | ROLE-002；逐张删除已选图片 | 删除后预览和内部数量同步，表单其他字段保留；PASS | `AUDIT-051-images-deleted.png`；客户端日志 | 本地图片状态 |
| AUDIT-052 / IMG-004 | ROLE-002；调整图片顺序 | 主图顺序即时更新且无重复；PASS | `AUDIT-052-image-reordered.png`；客户端日志 | 本地图片状态 |
| AUDIT-053 / IMG-005 | ROLE-002；选择有效 JPEG 并执行上传 | `stored_files` 写入成功，归属和 MIME 正确；PASS | `AUDIT-053-only-valid-jpeg.png`、`AUDIT-053-055-db-actual-pass.txt`；客户端/服务端日志 | `projects.uploadFile` |
| AUDIT-054 / IMG-006 | ROLE-002；用 MIME 不匹配内容触发上传失败 | 失败明确提示、无错误文件记录，已填内容未丢失；PASS | `AUDIT-054-upload-failure-content-preserved.png`、`AUDIT-054-db-after-failure.txt`；客户端/服务端日志 | `projects.uploadFile` |
| AUDIT-055 / LIST-003 | ROLE-002；恢复后发布旧物并快速重复点击 | 仅生成一条 published listing，页面与数据库一致；PASS | `AUDIT-055-published-pass.png`、`AUDIT-053-055-db-published-pass.txt`；客户端/服务端日志 | `listings.save` |
| AUDIT-056 / LIST-004 | ROLE-002；打开“我的旧物”并刷新 | 新发布旧物与正确状态可见；PASS | `AUDIT-056-my-listings.png`、`AUDIT-056-my-listings.xml`；客户端/服务端日志 | `listings.list` |
| AUDIT-057 / LIST-005 | ROLE-002；编辑本人旧物并保存 | 修改只应用一次，刷新和数据库一致；PASS | `AUDIT-057-edited.png`、`AUDIT-057-db-after.txt`；客户端/服务端日志 | `listings.save` |
| AUDIT-058 / LIST-006 | ROLE-002；关闭后重新开放旧物 | close/reopen 前置状态和最终回显正确；PASS | `AUDIT-058-closed.png`、`AUDIT-058-reopened.png`、对应 DB 证据；客户端/服务端日志 | `listings.close`、`listings.reopen` |
| AUDIT-059 / LIST-007 | ROLE-002；关闭后删除本人旧物 | 删除确认明确，列表和数据库均不再返回；PASS | `AUDIT-059-deleted.png`、`AUDIT-059-db-after.txt`；客户端/服务端日志 | `listings.remove` |
| AUDIT-060 / ITEM-001 | ROLE-002；打开“我的物品” | listing 对应物品、所有权和生命周期状态可见；PASS | `AUDIT-060-my-items.png`、`AUDIT-060-db.txt`；客户端/服务端日志 | `items.mine` |

## 15. AUDIT-061～075 逐项结果

| Audit / Feature | 角色、前置数据与真机步骤 | 初始实际结果 / 最终结果 | 证据 | Procedure/API |
| --- | --- | --- | --- | --- |
| AUDIT-061 / ITEM-002 | ROLE-002；打开本人物品详情 | 生命周期和所有权历史与数据库一致；PASS | `AUDIT-061-item-lifecycle.png`、`AUDIT-061-db.txt`；客户端/服务端日志 | `items.lifecycle` |
| AUDIT-062 / BUY-001 | ROLE-002；打开固定价旧物详情 | 整元价格和购买入口显示正确；PASS | `AUDIT-062-fixed-price.png`、对应 UI XML；客户端/服务端日志 | `listings.detail` |
| AUDIT-063 / BUY-002 | ROLE-002；确认立即购买并重复点击 | 只生成一个 pending_payment 订单；PASS | `AUDIT-063-order-created.png`、`AUDIT-063-db-after.txt`；客户端/服务端日志 | `listings.buyNow` |
| AUDIT-064 / SWAP-001 | ROLE-002；在 `/swaps/create` 选择候选物并提交 | 初始 FAIL：点击候选卡跳到详情，无法选择；修复后只创建一条置换请求；PASS_AFTER_FIX | 初始 `AUDIT-064-swap-create.png`；回归 `AUDIT-064-after-fix-created.png`、`AUDIT-064-after-fix-db.txt`；客户端/服务端日志 | `swaps.create` |
| AUDIT-065 / SWAP-002 | ROLE-002；双方打开置换详情 | 双方物品、参与者和状态正确；PASS | `AUDIT-065-swap-detail.png`、对应 UI XML；客户端/服务端日志 | `swaps.detail` |
| AUDIT-066 / SWAP-003 | ROLE-002；对方接受置换 | 置换进入 accepted，物品锁定关系正确；PASS | `AUDIT-066-accepted.png`、`AUDIT-066-db.txt`；客户端/服务端日志 | `swaps.respond` |
| AUDIT-067 / SWAP-004 | ROLE-002；取消另一条待处理置换 | 状态 cancelled，双方物品锁释放；PASS | `AUDIT-067-cancelled.png`、`AUDIT-067-db.txt`；客户端/服务端日志 | `swaps.cancel` |
| AUDIT-068 / SWAP-005 | ROLE-002；双方依次确认已接受置换 | 只完成一次，双向所有权转移和历史完整；PASS | `AUDIT-068-completed.png`、`AUDIT-068-db.txt`；客户端/服务端日志 | `swaps.confirm` |
| AUDIT-069 / REC-001 | ROLE-002；发布回收询价并重复点击 | 仅创建一条 open 回收请求；PASS | `AUDIT-069-created.png`、`AUDIT-069-db-after.txt`；客户端/服务端日志 | `recycling.create` |
| AUDIT-070 / REC-002 | ROLE-002；打开我的回收并刷新 | 新询价及状态正确显示；PASS | `AUDIT-070-my-recycling.png`、对应 UI XML；客户端/服务端日志 | `recycling.myRequests` |
| AUDIT-071 / REC-003 | ROLE-006；受控回收商提交报价 | 只生成一条合法报价，金额与详情一致；PASS | `AUDIT-071-quote-submitted.png`、`AUDIT-071-db.txt`；客户端/服务端日志 | `recycling.submitQuote` |
| AUDIT-072 / REC-004 | ROLE-002；询价人选择回收报价 | 请求进入 matched 并生成一个待确认订单；PASS | `AUDIT-072-selected.png`、`AUDIT-072-db.txt`；客户端/服务端日志 | `recycling.selectQuote` |
| AUDIT-073 / CHAT-001 | ROLE-002；从订单进入消息列表 | 受控会话只出现一次，关联订单正确；PASS | `AUDIT-073-conversation-list.png`、对应 UI XML；客户端/服务端日志 | `messagesRouter.conversations` |
| AUDIT-074 / CHAT-002 | ROLE-002；打开会话并刷新 | 消息列表、参与者和读取状态正常；PASS | `AUDIT-074-chat-detail.png`、`AUDIT-074-db-before-send.txt`；客户端/服务端日志 | `messagesRouter.messages`、`receipts`、`markConversationRead` |
| AUDIT-075 / CHAT-003 | ROLE-002；弹出键盘、输入并发送消息 | 初始 FAIL：Android IME 覆盖输入栏；修复后输入栏可见且消息只写一次；PASS_AFTER_FIX | 初始 `AUDIT-075-message-typed.xml`；回归 `AUDIT-075-after-fix2-sent.png`、`AUDIT-075-after-fix2-db.txt`；客户端/服务端日志 | `messagesRouter.send` |

## 16. AUDIT-076～090 逐项结果

| Audit / Feature | 角色、前置数据与真机步骤 | 初始实际结果 / 最终结果 | 证据 | Procedure/API |
| --- | --- | --- | --- | --- |
| AUDIT-076 / CHAT-004 | ROLE-002；收件方打开同一会话 | delivered/read 时间持久化且重复读取幂等；PASS | `AUDIT-076-receipt-read.png`、`AUDIT-076-db-after.txt`；客户端/服务端日志 | `messagesRouter.receipts`、`markConversationRead` |
| AUDIT-077 / CHAT-005 | ROLE-002；断开 MySQL 后发送，恢复后点击同一失败消息重试 | 初始 FAIL：基础认证错误被降级为匿名并清除会话；修复后失败明确、会话保留、恢复后同一 client id 只写一次；PASS_AFTER_FIX | 初始 `AUDIT-077-real-failed.png`；回归 `AUDIT-077-after-auth-fix-retried2.png`、对应 DB 证据；客户端/服务端日志 | `messagesRouter.send`、`/api/auth/me` |
| AUDIT-078 / NOTICE-001 | ROLE-002；准备多条受控通知并打开列表 | 通知标题、类别和未读状态正确；PASS | `AUDIT-078-notifications.png`、`AUDIT-078-080-db-before.txt`；客户端/服务端日志 | `messagesRouter.notifications`、`unreadCount` |
| AUDIT-079 / NOTICE-002 | ROLE-002；点击一条未读通知 | 仅目标通知 isRead 更新，重复打开幂等；PASS | `AUDIT-079-081-mark-read-and-jump.png`、`AUDIT-079-081-db.txt`；客户端/服务端日志 | `messagesRouter.markRead` |
| AUDIT-080 / NOTICE-003 | ROLE-002；点击“全部已读” | 全部受控通知已读，未读数归零；PASS | `AUDIT-080-all-read.png`、`AUDIT-080-db.txt`；客户端/服务端日志 | `messagesRouter.markRead` |
| AUDIT-081 / NOTICE-004 | ROLE-002；点击带订单引用的通知 | 正确跳到关联订单详情，无越权或错误路由；PASS | `AUDIT-079-081-mark-read-and-jump.png`、对应 DB 证据；客户端/服务端日志 | `messagesRouter.notifications`、`markRead` |
| AUDIT-082 / VERIFY-001 | ROLE-002；打开认证中心和个人页 | 当前认证状态明确显示；PASS | `AUDIT-082-verifications.png`、`AUDIT-082-085-db.txt`；客户端/服务端日志 | `verifications.mine` |
| AUDIT-083 / VERIFY-002 | ROLE-002；提交工程师申请并刷新认证状态 | 初始 FAIL：UI 宣称自动通过，但数据库为 pending；修复后显示“已提交、人工审核”，数据库仍为 pending；PASS_AFTER_FIX | 初始 `AUDIT-083-engineer-approved.png`；回归 `AUDIT-083-after-fix-pending.png`、`AUDIT-083-db.txt`；客户端/服务端日志 | `profile.applyEngineer` |
| AUDIT-084 / VERIFY-003 | ROLE-002；提交商家申请并刷新 | 明确显示人工审核 pending，未提前开放接单；PASS | `AUDIT-084-merchant-submitted.png`、`AUDIT-084-db.txt`；客户端/服务端日志 | `profile.applyMerchant` |
| AUDIT-085 / VERIFY-004 | ROLE-002；打开信用页 | 分数、事件和评价空态正常；PASS | `AUDIT-085-credits.png`、`AUDIT-082-085-db.txt`；客户端/服务端日志 | `credits.me` |
| AUDIT-086 / SET-001 | ROLE-002；打开设置并检查 Push 注册状态 | 基础信息、权限和 Token 状态一致；PASS | `AUDIT-086-087-settings.png`、对应 UI XML；客户端/服务端日志 | `registerPushToken`、`unregisterPushToken` |
| AUDIT-087 / SET-002 | ROLE-002；查看 Android 通知权限 | 准确显示 denied 和未注册状态；PASS | `AUDIT-086-087-settings.png`、对应 UI XML；客户端日志 | Android notification permission |
| AUDIT-088 / SET-003 | ROLE-002；请求通知权限并在系统弹窗拒绝 | App 明确提示权限未开启，不伪报成功；PASS | `AUDIT-088-permission-denied-feedback.png`、对应 UI XML；客户端日志 | Android notification permission |
| AUDIT-089 / SET-004 | ROLE-002；断开 MySQL 打开信用页，再恢复数据库点击重试 | 初始 FAIL：请求失败被显示为“暂无信用数据”；修复后显示可重试错误，恢复后同一会话加载成功；PASS_AFTER_FIX | 初始 `AUDIT-089-weak-network-error.png`；回归 `AUDIT-089-error-after-fix.png`、`AUDIT-089-recovered-after-retry.png`；客户端/服务端日志 | `credits.me`、`/api/auth/me` |
| AUDIT-090 / UX-001 | ROLE-002；从首页进入信用页，按 Android 硬件返回键 | 正常返回首页，无崩溃、静默失败或业务写入；PASS | `AUDIT-090-before-back.png`、`AUDIT-090-after-back.png`、对应 UI XML；客户端日志 | Android back navigation |

## 17. 第三批缺陷闭环

### V324-AND-004 / P1 / AUDIT-064

- 初始结果与复现：在置换创建页正常点击候选物品，页面进入物品详情而不选中候选，导致主流程无法继续。
- 根因：外层选择 `Pressable` 包裹了自身带详情导航 `Pressable` 的 `ListingCard`，Android 命中内层导航。
- 修改文件：`app/swaps/create.tsx`、`components/cards.tsx`。
- 自动化测试：`tests/v324-android-validation.test.ts` 锁定单一点击区和选择回调；完整单测及集成回归通过。
- 修复提交：`9287fa2`；真机回归：候选边框选中、提交只生成一条置换请求；最终 PASS_AFTER_FIX。

### V324-AND-005 / P1 / AUDIT-075

- 初始结果与复现：进入聊天页聚焦输入框，Android 软键盘覆盖消息输入栏，无法稳定输入和发送。
- 根因：`KeyboardAvoidingView` 在 Android 上未设置 behavior，聊天区域未随 IME 缩短。
- 修改文件：`app/chat/[id].tsx`。
- 自动化测试：锁定 Android `height` behavior 与 96px offset；完整单测及集成回归通过。
- 修复提交：`cacf5a3`；真机回归：输入栏位于键盘上方，消息只写入一次；最终 PASS_AFTER_FIX。

### V324-AND-006 / P1 / AUDIT-077

- 初始结果与复现：保持登录后断开隔离数据库，在聊天中发送消息；请求失败被当作未登录并清除本地会话，数据库恢复后无法直接重试。
- 根因：tRPC context 和 `/api/auth/me` 捕获了所有认证异常，把基础设施错误错误降级为匿名/401。
- 修改文件：`server/_core/context.ts`、`server/_core/auth.ts`。
- 自动化测试：`tests/session.test.ts` 新增数据库异常必须向上抛出的用例；auth session recovery、runtime、WebSocket 和 health/ready 全部通过。
- 修复提交：`151d49f`；真机回归：断服显示失败但会话保留，恢复后同一失败消息安全重试且数据库仅一条；最终 PASS_AFTER_FIX。

### V324-AND-007 / P1 / AUDIT-083

- 初始结果与复现：提交工程师申请后页面显示“已通过/自动通过”，但数据库和认证中心均为 pending；商家页存在同类错误文案。
- 根因：申请页仍保留早期演示环境自动通过文案，已与当前人工审核状态机不一致。
- 修改文件：`app/engineer-apply.tsx`、`app/merchant-apply.tsx`。
- 自动化测试：锁定“已提交/人工审核”文案并禁止“自动通过”；完整回归通过。
- 修复提交：`dbdc1ad`；真机回归：两类申请均明确显示 pending 人工审核，未提前开放能力；最终 PASS_AFTER_FIX。

### V324-AND-008 / P2 / AUDIT-089

- 初始结果与复现：断开隔离数据库后打开信用中心，查询失败被显示为“暂无信用数据”，没有重试入口。
- 根因：`app/credits.tsx` 在 loading 后直接用 `!data.data` 判空，未先处理 `data.isError`。
- 修改文件：`app/credits.tsx`。
- 自动化测试：锁定 error 分支必须先于 empty 分支并提供 `refetch`；完整回归通过。
- 修复提交：`9c7ae61`；真机回归：断服显示错误和“重新加载”，恢复数据库后同一会话重试成功；最终 PASS_AFTER_FIX。

测试增量统一提交：`ab30ceb`。第三批初始 PASS 55、PASS_AFTER_FIX 5、FAIL 0、BLOCKED 0、NOT_REQUIRED 0；P0 0、P1 4、P2 1。

## 18. 第三批统一自动化与构建结果

| 项目 | 实际结果 |
| --- | --- |
| `pnpm validate:product-specs` | PASS；139 features、144 audits、123 MUST_PASS；0 warning / 0 failure |
| `pnpm check` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` | PASS；12 files、66 tests；无删除或 skip |
| `pnpm test:integration:v32` | PASS；MySQL 18、历史升级 9 variants、health/ready 3、WebSocket 6、文件安全 7 |
| `pnpm build` | PASS；`dist/index.mjs` 398.5 kB |
| `pnpm build:web` | PASS；1548 modules、19 assets；仅 caniuse-lite 数据陈旧提示 |
| `git diff --check` | PASS |
| 安全扫描 | PASS；跟踪 diff 无本机绝对路径、局域网地址、`.env`、Token、Secret、私钥、真实数据库连接串或 `artifacts/` |

## 19. 第三批阶段性停止点（历史记录）

- 第三批提交时已完成并阶段性停止于 `AUDIT-090`；随后从冻结起点 `be7cc259945dbce7ef0e182b44c58471fba83c45` 开始的最终批次记录见第 20～27 节。
- 所有 FROZEN 正式规范均保持未修改，`v3.2.4-spec-freeze` 未移动或重建。
- `artifacts/v3.2.4-android-validation/batch3-audit-031-090/` 仅保存本地验收证据并保持未跟踪。
- 正式支付、生产 Push、正式云存储、真实病毒扫描和其他 NOT_REQUIRED 能力均未激活。

## 20. 最终批次执行约定与统计

- 范围：`AUDIT-091`～`AUDIT-144`，共 54 个编号。其中冻结清单明确保留 `AUDIT-099`～`AUDIT-107` 为 retired ID，不存在可执行 Feature 定义，本报告逐项记为 NOT_REQUIRED，未猜测或复用编号。
- 结果：初始 PASS 33、PASS_AFTER_FIX 1、NOT_REQUIRED 20、FAIL 0、BLOCKED 0。
- FULL_FLOW 项统一使用隔离 MySQL、受控演示账号和受控业务数据；真机执行正常路径、重复点击/请求、角色边界、非法状态、服务失败、恢复重试，并以页面刷新、数据库状态和审计记录交叉核对。没有写入生产数据。
- READ_ONLY_PLUS_AUTOMATION 项统一检查真机可达、加载/空态/错误/恢复、返回键、键盘、安全区与滚动，并与 API 和自动化结果核对。
- STATIC_AND_CONTRACT 项只检查页面现状、路由、Procedure 权限、输入输出、状态/幂等和审计契约，没有新增后台入口或执行业务写入。
- 客户端证据为 `artifacts/v3.2.4-android-validation/final-audit-091-144/` 内同名 PNG/XML；服务端证据为该目录 `server-final.stdout.log`、`server-final.stderr.log`；数据库汇总为 `final-database-summary.json`。这些文件保持未跟踪。

## 21. AUDIT-091～108 逐项结果

| Audit / Feature | 门槛 / 深度；路由 / Procedure | 角色、前置数据与真机步骤 | 预期、初始实际结果与最终结果 | 证据、日志、数据库与缺陷 |
| --- | --- | --- | --- | --- |
| AUDIT-091 / UX-002 | MUST_PASS / READ_ONLY_PLUS_AUTOMATION；搜索输入 | ROLE-001/002；打开搜索、聚焦输入、弹出/关闭 IME、返回 | 键盘不遮挡输入与结果；初始符合；PASS | `AUDIT-091-keyboard-visible.*`；客户端 UI 证据；无业务写入 |
| AUDIT-092 / UX-003 | MUST_PASS / READ_ONLY_PLUS_AUTOMATION；多页面 | ROLE-001/002；检查顶/底安全区、滚动到底和返回 | 无裁切、异常留白或系统栏覆盖；初始符合；PASS | 真机页面与基线截图；客户端日志；无业务写入 |
| AUDIT-093 / UX-004 | MUST_PASS / READ_ONLY_PLUS_AUTOMATION；信用页 | ROLE-002；数据库中断时打开页面并观察请求阶段 | 加载态可见且不会静默变空；初始符合；PASS | `AUDIT-093-loading-state.png`；客户端/服务端日志；无部分写入 |
| AUDIT-094 / UX-005 | MUST_PASS / READ_ONLY_PLUS_AUTOMATION；搜索与空列表 | ROLE-001/002；使用无结果关键词并返回 | 空态明确、可恢复且保留导航；初始符合；PASS | `AUDIT-094-empty-search.*`；客户端日志；无业务写入 |
| AUDIT-095 / UX-006 | MUST_PASS / READ_ONLY_PLUS_AUTOMATION；信用页 | ROLE-002；停止数据库、确认错误态，恢复后点重试 | 非 401 不丢会话，错误明确且恢复成功；初始符合；PASS | `AUDIT-095-error-state.*`、`AUDIT-095-recovered.*`；客户端/服务端日志；ready 断库行为由集成测试覆盖 |
| AUDIT-096 / OPS-001 | CURRENT_STATE_ONLY / STATIC_AND_CONTRACT；`/admin/complaints` / `adminComplaints.*` | ROLE-007/011 契约审查；普通账号真机直达 | 无权访问明确拒绝，权限/状态/审计可追踪且不写数据；初始符合；PASS | `AUDIT-096-unauthorized.*`；`v321-security.test.ts`；数据库无变化 |
| AUDIT-097 / OPS-002 | CURRENT_STATE_ONLY / STATIC_AND_CONTRACT；`/admin/finance` / `adminFinance.*` | ROLE-009/011 契约审查；普通账号真机直达 | 无权访问明确拒绝，退款/结算权限和审计契约成立；初始符合；PASS | `AUDIT-097-unauthorized.*`；V3.1.1/1.2 MySQL 集成；数据库无变化 |
| AUDIT-098 / OPS-003 | CURRENT_STATE_ONLY / STATIC_AND_CONTRACT；`/admin/audit-logs`、`/admin/platform-operations` / `auditLogs.*`、`platformOperations.*` | ROLE-010/011 契约审查；普通账号依次直达两个页面 | 初始 FAIL：平台运行页把 FORBIDDEN 查询当空列表；修复后明确“无权访问”且可重试；PASS_AFTER_FIX | 初始 `AUDIT-098b-unauthorized.*`，回归 `AUDIT-098-V324-AND-009-pass-after-fix.png`；V324-AND-009/P1；提交 `22f0041`；专项 6/6 |
| AUDIT-099 / retired | 无冻结 Feature/路由/Procedure | 不执行；确认编号在冻结清单中被退休 | 不复用、不猜测；NOT_REQUIRED | 冻结清单结构与规格校验；无日志/写入/缺陷 |
| AUDIT-100 / retired | 无冻结 Feature/路由/Procedure | 同 AUDIT-099 | NOT_REQUIRED | 同 AUDIT-099 |
| AUDIT-101 / retired | 无冻结 Feature/路由/Procedure | 同 AUDIT-099 | NOT_REQUIRED | 同 AUDIT-099 |
| AUDIT-102 / retired | 无冻结 Feature/路由/Procedure | 同 AUDIT-099 | NOT_REQUIRED | 同 AUDIT-099 |
| AUDIT-103 / retired | 无冻结 Feature/路由/Procedure | 同 AUDIT-099 | NOT_REQUIRED | 同 AUDIT-099 |
| AUDIT-104 / retired | 无冻结 Feature/路由/Procedure | 同 AUDIT-099 | NOT_REQUIRED | 同 AUDIT-099 |
| AUDIT-105 / retired | 无冻结 Feature/路由/Procedure | 同 AUDIT-099 | NOT_REQUIRED | 同 AUDIT-099 |
| AUDIT-106 / retired | 无冻结 Feature/路由/Procedure | 同 AUDIT-099 | NOT_REQUIRED | 同 AUDIT-099 |
| AUDIT-107 / retired | 无冻结 Feature/路由/Procedure | 同 AUDIT-099 | NOT_REQUIRED | 同 AUDIT-099 |
| AUDIT-108 / NR-001 | NOT_REQUIRED / STATIC_AND_CONTRACT；`/payments/[orderId]` | ROLE-002；打开受控订单支付页，只检查现状 | 页面明确 sandbox、不涉及真实资金；正式支付未激活；NOT_REQUIRED | `AUDIT-108-sandbox-payment.*`；Provider/配置静态审查；无生产操作 |

## 22. AUDIT-109～126 逐项结果

| Audit / Feature | 门槛 / 深度；路由 / Procedure | 角色、前置数据与真机步骤 | 预期、初始实际结果与最终结果 | 证据、日志、数据库与缺陷 |
| --- | --- | --- | --- | --- |
| AUDIT-109 / NR-002 | NOT_REQUIRED / STATIC_AND_CONTRACT；金额迁移 | 平台契约审查 | 不启动下一阶段全链路金额迁移；NOT_REQUIRED | schema/README 范围审查；无写入 |
| AUDIT-110 / NR-003 | NOT_REQUIRED / STATIC_AND_CONTRACT；云部署 | 平台配置审查 | 未部署或改动生产环境；NOT_REQUIRED | 配置与文档审查；无生产日志 |
| AUDIT-111 / NR-004 | NOT_REQUIRED / STATIC_AND_CONTRACT；云存储 | 平台 Provider 审查 | local 开发 Provider 保持，正式云存储未激活；NOT_REQUIRED | 文件安全集成 7 项；无生产访问 |
| AUDIT-112 / NR-005 | NOT_REQUIRED / STATIC_AND_CONTRACT；`/notifications`、`/settings` | ROLE-002；检查设置/通知现状 | 仅基础 Push 能力，未激活生产 Push；NOT_REQUIRED | 前批真机证据、V3.2 Push 集成；无生产 Token |
| AUDIT-113 / NR-006 | NOT_REQUIRED / STATIC_AND_CONTRACT；赠送范围项 | 按冻结 NR 定义仅审查范围 | 不把此 NR 项解释为新增生产能力；NOT_REQUIRED | 规格范围审查；无写入 |
| AUDIT-114 / FUT-001 | NOT_REQUIRED / STATIC_AND_CONTRACT；捐赠 | 静态审查 | 未激活、未新增入口；NOT_REQUIRED | 路由/菜单审查；无写入 |
| AUDIT-115 / FUT-002 | NOT_REQUIRED / STATIC_AND_CONTRACT；租借 | 静态审查 | 未激活、未新增入口；NOT_REQUIRED | 路由/菜单审查；无写入 |
| AUDIT-116 / FUT-003 | NOT_REQUIRED / STATIC_AND_CONTRACT；拍卖 | 静态审查 | 未激活、未新增入口；NOT_REQUIRED | 路由/菜单审查；无写入 |
| AUDIT-117 / FUT-004 | NOT_REQUIRED / STATIC_AND_CONTRACT；新品共创 | 静态审查 | 未激活、未新增入口；NOT_REQUIRED | 路由/菜单审查；无写入 |
| AUDIT-118 / AUTH-006 | MUST_PASS / FULL_FLOW；`/profile` / `profile.switchRole` | ROLE-002；受控用户切换 merchant，重复操作并刷新 | 仅已获批身份可切换，状态持久；初始符合；PASS | `AUDIT-118-role-switched.*`；DB currentRole=merchant、merchant active；客户端/服务端日志 |
| AUDIT-119 / NEED-009 | MUST_PASS / FULL_FLOW；`/needs/[id]` / `needs.close` | ROLE-002；本人 open 需求，确认关闭并重复点击 | 仅 owner 可关闭且只变化一次；初始符合；PASS | `AUDIT-119-*`；DB need #3 closed；审计/服务端日志 |
| AUDIT-120 / NEED-010 | MUST_PASS / FULL_FLOW；`/needs/[id]` / `needs.markSolved` | ROLE-002；本人需求标记解决并重复确认 | 状态 solved 持久、重复操作安全；初始符合；PASS | `AUDIT-120-*`；DB need #2 solved；客户端/服务端日志 |
| AUDIT-121 / QUOTE-006 | MUST_PASS / READ_ONLY_PLUS_AUTOMATION；`/` / `quotes.myQuotes` | ROLE-004；打开工程师报价概览、刷新与返回 | 报价数据/空态/跳转明确；初始符合；PASS | `AUDIT-121-engineer-quotes.*`；API 与真机一致；无写入 |
| AUDIT-122 / PROJ-010 | MUST_PASS / FULL_FLOW；`/projects/[id]` / `projects.confirm` | ROLE-002/004；双方确认；确认前停服，恢复后安全重试并重复点击 | 失败无部分确认，恢复后双方只确认一次并进入 pending_payment；初始符合；PASS | `AUDIT-122-*`；DB project #2 双方 confirmed；服务失败/恢复日志 |
| AUDIT-123 / PROJ-011 | MUST_PASS / FULL_FLOW；`/project-files/[projectId]` / `projects.disableFile` | ROLE-002/004；受控非正式文件由上传者停用，重复点击并校验越权 | 仅合法参与者可停用且审计一次；初始符合；PASS | `AUDIT-123-*`；DB project_file #1 disabled、审计存在；文件安全集成 |
| AUDIT-124 / LIST-008 | MUST_PASS / FULL_FLOW；`/listings/create` / `listings.createDraft` | ROLE-002；填写草稿，保存时重复点击，返回列表再打开 | 只创建一条 draft，字段与关联 item 持久；初始符合；PASS | `AUDIT-124-*`；DB listing #5 draft、item #7；客户端/服务端日志 |
| AUDIT-125 / ITEM-003 | MUST_PASS / FULL_FLOW；`/items/[id]` / `items.addService` | ROLE-002；本人 item 添加服务记录并重复点击 | 仅 owner 可追加且记录一次；初始符合；PASS | `AUDIT-125-*`；DB service record 一条；V3.2 MySQL 集成 |
| AUDIT-126 / BUY-003 | MUST_PASS / FULL_FLOW；`/listings/[id]` / `listings.makeOffer` | ROLE-002；非 owner 对接受报价 listing 出价并重复提交 | 正金额、权限和状态合法，只有一条 submitted offer；初始符合；PASS | `AUDIT-126-*`；DB listing #6 offer 一条；客户端/服务端日志 |

## 23. AUDIT-127～144 逐项结果

| Audit / Feature | 门槛 / 深度；路由 / Procedure | 角色、前置数据与真机步骤 | 预期、初始实际结果与最终结果 | 证据、日志、数据库与缺陷 |
| --- | --- | --- | --- | --- |
| AUDIT-127 / BUY-004 | MUST_PASS / FULL_FLOW；`/listings/[id]` / `listings.acceptOffer` | ROLE-002 owner；接受 #6 offer 并重复确认 | listing/item reserved、offer accepted、仅一个 pending_payment order；初始符合；PASS | `AUDIT-127-*`；DB 幂等计数 1；客户端/服务端日志 |
| AUDIT-128 / GIVE-001 | MUST_PASS / FULL_FLOW；`/listings/[id]` / `listings.applyGiveaway` | ROLE-002 非 owner；申请受控赠送并重复点击 | 只生成一条 submitted application；初始符合；PASS | `AUDIT-128-*`；DB application 计数 1；客户端/服务端日志 |
| AUDIT-129 / GIVE-002 | MUST_PASS / FULL_FLOW；`/listings/[id]` / `listings.selectGiveaway` | ROLE-002 owner；选择申请人并重复确认 | listing/item reserved、申请 selected、仅一个 pending_delivery 零价赠送订单；初始符合；PASS | `AUDIT-129-*`；DB order 计数 1；客户端/服务端日志 |
| AUDIT-130 / SWAP-006 | MUST_PASS / READ_ONLY_PLUS_AUTOMATION；`/swaps` / `swaps.list` | ROLE-002；打开置换列表并刷新 | completed/cancelled 状态与 API 一致；初始符合；PASS | `AUDIT-130-swaps-list.*`；V3.2 并发/生命周期集成 |
| AUDIT-131 / REC-007 | MUST_PASS / READ_ONLY_PLUS_AUTOMATION；`/recycling/[id]` / `recycling.detail` | ROLE-002；打开受控回收详情、订单入口并返回 | merchant、报价和订单关联一致；初始符合；PASS | `AUDIT-131-recycling-detail.*`；API/数据库一致 |
| AUDIT-132 / ORDER-008 | MUST_PASS / FULL_FLOW；`/orders/[id]` / `orders.review` | ROLE-002 buyer；评价完成订单并重复提交 | 只写一条评价、buyerReviewed=true、评分持久；初始符合；PASS | `AUDIT-132-*`；DB review 计数 1；V3.1.1 集成 |
| AUDIT-133 / CHAT-006 | MUST_PASS / FULL_FLOW；订单等详情 / `messagesRouter.start` | ROLE-002；从订单联系卖家并重复点击 | 只创建/返回一个与订单关联的 conversation；初始符合；PASS | `AUDIT-133-*`；DB conversation 计数 1；消息幂等集成 |
| AUDIT-134 / VERIFY-005 | MUST_PASS / FULL_FLOW；`/verifications` / `verifications.submitIdentity` | ROLE-002；受控虚构实名字段提交，重复操作并刷新 | 状态 submitted；证件号仅摘要和尾号，不保存明文；初始符合；PASS | `AUDIT-134-*`；DB identity 一条、digest 长度 64；安全测试 |
| AUDIT-135 / VERIFY-006 | MUST_PASS / FULL_FLOW；`/verifications` / `verifications.uploadDocument` | ROLE-002；从 Android 文档选择器选择受控 PDF 并上传 | 材料 available、owner/type 正确且私有访问受控；初始符合；PASS | `AUDIT-135-*`；DB verification_document 一条；文件安全集成 |
| AUDIT-136 / COM-001 | MUST_PASS / READ_ONLY_PLUS_AUTOMATION；`/complaints` / `complaints.list` | ROLE-002；投诉前打开空列表、刷新和返回 | 空态明确且可进入真实创建路径；初始符合；PASS | `AUDIT-136-complaints-list.*`；API 与 DB 一致 |
| AUDIT-137 / COM-002 | MUST_PASS / FULL_FLOW；`/complaints/create` / `complaints.create` | ROLE-002 项目参与者；从项目详情创建投诉并重复点击 | 一条 active complaint；项目 disputed，所有关联 escrow/settlement frozen，锁/快照/审计完整；初始符合；PASS | `AUDIT-137-*`、`final-database-summary.json`；DB complaint/lock/snapshot 各 1；V3.1/V3.2 集成 |
| AUDIT-138 / COM-003 | MUST_PASS / READ_ONLY_PLUS_AUTOMATION；`/complaints/[id]` / `complaints.detail` | ROLE-002 complainant；打开详情、刷新、返回 | 状态、时间线、资金记录和证据区与 API 一致；初始符合；PASS | `AUDIT-138-complaint-detail.png`；客户端/服务端日志；DB under_review 流程前态可追踪 |
| AUDIT-139 / COM-004 | MUST_PASS / FULL_FLOW；`/complaints/[id]` / `complaints.respond` | ROLE-002 respondent；提交正式回应并重复点击 | 仅 respondent 可回应；状态 waiting_response→under_review，statement/action 各一次；初始符合；PASS | `AUDIT-139-responded.png`；DB statement 一条、status logs 2；客户端/服务端日志 |
| AUDIT-140 / COM-005 | MUST_PASS / FULL_FLOW；`/complaints/[id]` / `complaints.addEvidence` | ROLE-002 respondent；补充事实说明并重复点击 | 合法参与者只新增一条证据并即时回显；初始符合；PASS | `AUDIT-140-evidence-added.png`；DB evidence 一条、action 总数 3；客户端/服务端日志 |
| AUDIT-141 / OPS-004 | CURRENT_STATE_ONLY / STATIC_AND_CONTRACT；`/admin/verifications` / `adminVerifications.*` | ROLE-008/011 契约审查；普通/工程师账号真机直达 | 明确“无权访问”；审核、撤销、材料访问权限与敏感审计成立，不执行业务写；初始符合；PASS | `AUDIT-141-admin-verifications-denied.png`；`v321-security.test.ts`；DB 无变化 |
| AUDIT-142 / OPS-005 | CURRENT_STATE_ONLY / STATIC_AND_CONTRACT；`/admin` / `admin.menu` | ROLE-011 契约审查；非管理员真机直达 | 明确“无管理端访问权限”；菜单权限单一且无越权入口；初始符合；PASS | `AUDIT-142-admin-menu-denied.png`；权限矩阵/安全测试；DB 无变化 |
| AUDIT-143 / HELP-001 | MUST_PASS / READ_ONLY_PLUS_AUTOMATION；`/help` | ROLE-001/002；真机打开帮助页、滚动、返回 | FAQ、支持方式和投诉说明可读，无崩溃或业务写入；初始符合；PASS | `AUDIT-143-help.png`；客户端 UI 证据；无 Procedure/DB 写入 |
| AUDIT-144 / DEV-001 | NOT_REQUIRED / EXCLUDED；`/dev/theme-lab` | ROLE-011；只审查路由与正式菜单，不激活页面 | 开发实验页未进入正式发布路径，范围和排除理由可追踪；NOT_REQUIRED | `FEATURE_ACCEPTANCE_MATRIX`、`ROUTE_API_TRACEABILITY` 静态审查；无生产入口/写入 |

## 24. V324-AND-009 缺陷闭环

- Audit：AUDIT-098 / OPS-003；等级：P1；初始结果：FAIL。
- 复现：以非管理员登录，直接进入 `/admin/platform-operations`。两个受权限保护的查询返回 FORBIDDEN，但页面把 `undefined` 数据映射为空数组并显示“暂无记录”，没有明确拒绝。
- 根因：`app/admin/platform-operations.tsx` 只有 loading 和 data/empty 分支，未在空态前处理两个 query 的 `isError`。
- 修改：`app/admin/platform-operations.tsx` 增加组合错误分支，识别 FORBIDDEN/permission 错误为“无权访问”，其他基础设施错误显示可重试加载失败；`tests/v324-android-validation.test.ts` 锁定错误分支顺序、权限识别和双查询 refetch。
- 自动化：专项 1 文件 6 测试通过；完整 TypeScript、Lint、67 单测及全部 MySQL/Runtime 回归通过。
- 修复提交：`22f0041`。
- 真机回归：同一非管理员再次进入页面，明确显示“无权访问”，错误详情与“重新加载”可见；最终 PASS_AFTER_FIX。初始失败证据未覆盖。

## 25. 8 个无 UI 写 Procedure 最终审查

| Procedure | 权限、契约、审计与 UI 结论 | 结果 |
| --- | --- | --- |
| `admin.changeRole` | 管理权限写 Procedure 保留服务端边界；无冻结 UI 入口，未新增后台操作页 | PASS（STATIC_AND_CONTRACT） |
| `engineers.setAccepting` | 工程师本人/状态约束和写契约可追踪；无冻结 UI 入口 | PASS（STATIC_AND_CONTRACT） |
| `listings.create` | 旧兼容写契约受权限约束；正式页面使用当前草稿/保存流程，未暴露重复入口 | PASS（STATIC_AND_CONTRACT） |
| `orders.pay` | 支付写入受订单参与者、金额、状态和幂等约束；页面走当前 finance 流程，不增加旧入口 | PASS（STATIC_AND_CONTRACT） |
| `projects.pay` | 项目支付受参与者、状态和幂等约束；未新增直接写入口 | PASS（STATIC_AND_CONTRACT） |
| `quotes.reject` | 需求 owner 和报价状态约束可追踪；无冻结 UI 入口 | PASS（STATIC_AND_CONTRACT） |
| `verifications.submitEngineer` | 认证写契约、材料和人工审核状态受控；当前用户流程不新增旧 Procedure 入口 | PASS（STATIC_AND_CONTRACT） |
| `verifications.submitMerchant` | 商家认证写契约、材料和人工审核状态受控；当前用户流程不新增旧 Procedure 入口 | PASS（STATIC_AND_CONTRACT） |

规格校验再次输出上述恰好 8 个名称，0 warning、0 failure；逐项确认均有服务端权限/输入契约及相关自动化或状态审查，且本轮没有为其新增 UI。

## 26. 最终完整自动化、迁移与构建结果

| 项目 | 实际结果 |
| --- | --- |
| `pnpm validate:product-specs` | PASS；139 features、144 audits、138 procedures、123 MUST_PASS；0 warning / 0 failure |
| `pnpm check` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` | PASS；12 files、67 tests；无删除或 skip |
| `pnpm test:integration:mysql` | PASS；V3.1.1 10 组、V3.1.2 9 组 |
| `pnpm test:integration:v32` | PASS；MySQL 18 项、历史升级 9 variants、health/ready 3、WebSocket 6、文件安全 7 |
| `pnpm test:migrations:empty` | PASS；14 个 Drizzle 迁移在空库连续执行两次 |
| `pnpm test:seed:idempotent` | PASS；隔离新库连续 seed 两次无重复 |
| `/api/health` | 实际 200；`alive` |
| `/api/ready` | 实际 200；configuration/database/storage 均 `ok`；断库非 200 由 V3.1.2/Runtime 集成实测 |
| `pnpm build` | PASS；后端 `dist/index.mjs` 398.5 kB |
| `pnpm build:web` | PASS；1548 modules、19 assets，导出到忽略目录 `web-dist` |
| Android bundle | PASS；1764 modules、25 assets、Hermes bundle 5.21 MB，输出到未跟踪 evidence 目录 |
| `git diff --check` / `git diff --cached --check` | PASS |
| 安全扫描 | PASS；跟踪 diff 无本机绝对路径、局域网地址、`.env`、凭据、私钥、真实数据库连接串或 `artifacts/` |

## 27. 累计结论与严格停止点

- AUDIT-001～144：初始 PASS 115、PASS_AFTER_FIX 9、NOT_REQUIRED 20、FAIL 0、BLOCKED 0。
- 累计缺陷：P0 0、P1 7、P2 2；本批新增 P0 0、P1 1、P2 0。所有 9 个缺陷均保留初始失败并已真机回归。
- 三个最终检查点索引和 139 个本地 evidence 文件均位于 `artifacts/v3.2.4-android-validation/final-audit-091-144/`，保持未跟踪、不提交。
- 所有 FROZEN 正式规范保持未修改；`v3.2.4-spec-freeze` 仍指向原冻结提交，未移动、删除或重建。
- 未升级 package/app 版本和 Android versionCode；未创建正式标签；未合并 main；未发布 APK/AAB；未激活生产 Push、正式支付、正式云存储、生产病毒扫描或生产 HTTPS。
- 结论：代码、真机业务路径、权限契约、迁移与构建已具备进入“V3.2.4 发布准备阶段”的技术条件；本报告不授权也未执行任何正式发布动作。
