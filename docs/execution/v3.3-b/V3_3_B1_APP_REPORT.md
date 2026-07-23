# V3.3-B1 App 实施报告

## 页面

- 创意发现：公开列表、稳定游标加载更多、刷新、分类/标签/状态及 loading/empty/error/retry。
- 我的创意：草稿、已发布、协作中、已转项目、已归档筛选及创建入口。
- 创建/编辑：真实业务身份选择，标题、简介、描述、分类、标签、public/private/nda、附件、保存草稿与发布。
- 创意详情：有限摘要、完整内容、受控附件、NDA、邀请、归档、转项目及项目详情跳转。
- 协作邀请：收到/发出邀请，接受、拒绝、撤销、过期状态和 NDA 入口。
- 邀请协作者：账号、有效身份、designer/engineer/viewer、消息、NDA 与过期时间。
- NDA：版本化条款、可接受状态、接受时间和失效状态。

## 导航入口

- 发现页新增“创意协作”入口，没有更改底部导航结构。
- 发布中心新增“发布创意”，保留需求、物品、维修回收等原入口。
- “我的”新增“我的创意”和“协作邀请”，保留项目、组织、身份与工作台入口。

## API 接入

App 已接入 `ideas` Router 的全部 B1 接口：`createDraft`、`updateDraft`、`publish`、`listPublic`、`listMine`、`detail`、`archive`、`uploadAttachment`、`disableAttachment`、`inviteCollaborator`、`listInvitations`、`acceptInvitation`、`declineInvitation`、`revokeInvitation`、`getNda`、`acceptNda`、`getNdaStatus`、`convertToProject` 和 `attachmentAccess`。所有写入使用稳定 `requestId`；操作完成前的网络重试复用同一 ID，提交中按钮禁用，成功后刷新相关查询。

## 身份选择

- 创建创意只从 `identity.listMine` 的 active 身份中选择 `creatorIdentityId`，不提交 `creatorAccountId`。
- 邀请端提交明确账号和身份 ID，由服务端再次校验归属、状态、类型与认证；`currentRole` 不参与 allow/deny。
- 当前 B1 后端未提供可安全枚举陌生账号及其身份的候选搜索接口，因此邀请页采用明确 ID 输入，不使用静态候选或假数据。后续如增加隐私安全的联系人搜索 API，可替换为选择器而不改变授权规则。

## 附件交互

- 先调用现有文件上传接口取得 `fileId`，再调用 `ideas.uploadAttachment`；客户端不提交 `storageKey` 或永久 URL。
- 查看时按次调用 `ideas.attachmentAccess`，使用返回的短期受控路径。Web 使用带认证请求的临时 object URL；Android 下载到缓存并转换为临时 `content://` URI。
- 短期路径和认证 token 不写入组件状态、错误信息或日志。访问失败、邀请撤销、NDA 失效或附件禁用后刷新详情并停止展示。

## 状态处理

- 页面覆盖 loading、refreshing、empty、network error、forbidden、NDA required、invitation expired、concurrent modification、archived、converted 和 retry。
- 401/403/404/409 及稳定 reasonCode 映射为不泄露资源事实的用户提示。
- 转项目展示已接受协作者数量与 viewer 只读规则，二次确认、防重复点击，并始终按服务端返回的 `projectId` 跳转，包括幂等返回的既有项目。

## 测试结果

| 门禁 | 结果 |
| --- | --- |
| `pnpm check` | PASS |
| `pnpm lint` | PASS，0 warning |
| `pnpm check:money:v330` | PASS，30/30 |
| `pnpm test:v33-b1-idea-service` | PASS，34/34 |
| `pnpm test:v33-b1-idea-routes` | PASS，26/26 |
| `pnpm test:v33-b1-idea-app` | PASS，16/16 |
| `pnpm build` | PASS |
| `pnpm build:web` | PASS |

## Web build

Expo Web 导出成功，产物位于被 Git 忽略的 `web-dist`，未纳入提交。Android/真机交互未在本机设备环境执行，代码通过 TypeScript、lint 和 Web bundle 编译。

## MySQL 环境

`DATABASE_URL` 未设置。Service 与 Router 专项测试明确报告 `BLOCKED_BY_ENVIRONMENT`；本轮未连接未知、共享或生产数据库，也未伪造 MySQL 通过结果。

## 提交

- App 实现提交：`60e70a2`（`feat(v3.3-b1): add idea collaboration app experience`）。
- 分支：`codex/v3.3-b-idea-prototype`。

## B1 剩余问题

- 待在明确安全的 MySQL 8 隔离库执行后端集成验证。
- 待 Android 真机验证文件打开、离线重试、系统返回和不同尺寸布局。
- 邀请候选的隐私安全账号/身份搜索 API 不在现有 B1 后端范围内；当前使用服务端强校验的明确 ID 输入。
- 本轮未创建 PR、未合并 main、未打 tag，也未进入 B2。
