# V3.3-B1.1 Collaborator Search Report

## 新增搜索接口
- 新增 `ideas.searchCollaborators`
- 输入：`ideaId`、`query`、`requestedRole`、`cityCode?`、`categoryCode?`、`limit?`、`cursor?`
- 输出仅包含：`displayName`、`avatarUrl`、`identityType`、`professionalTitle`、`publicSkills`、`publicCategory`、`cityName`、`certificationBadge`、`invitationTargetToken`
- 不返回总数，不支持空查询枚举，`query` 少于 2 字符直接拒绝
- 手机号、邮箱、证件号格式搜索拒绝，并写脱敏审计
- 搜索仅返回 `active account`、`active identity`、公开 identity profile，且排除当前操作者与同创意同角色已生效邀请

## Token 绑定
- 新增短期 `invitationTargetToken`
- 绑定：`searcherAccountId`、`targetAccountId`、`targetIdentityId`、`requestedRole`、`ideaId`
- 同时绑定：`identityStatus`、`identityVersion`、`certificationStatus`、`certificationVersion`
- 包含：`expiresAt`、`nonce`
- 有效期：10 分钟
- 仅保存在邀请页内存，不写 AsyncStorage，不记录到日志
- 邀请接口解析 token 后重新校验操作者、创意、目标账号、身份、认证、能力、版本和过期时间

## App 页面
- `app/ideas/invite.tsx` 已移除账号 ID / 身份 ID 文本输入
- 改为：搜索框、角色筛选、城市和分类可选筛选、候选卡片、加载更多、loading/empty/error、已发出邀请区
- 仅在当前页面状态中保存 `invitationTargetToken`
- 邀请成功后刷新 `sent` 邀请列表

## 隐私字段清单
- 搜索结果禁止暴露：`accountId`、`identityId`、`phone`、`email`、证件号、企业注册号、精确地址、经纬度、认证材料、`storageKey`、审核备注、内部数据库主键
- 客户端邀请提交不再使用 `invitedAccountId`、`invitedIdentityId`
- 分页游标复用短期 token，不直接暴露内部 ID

## Authorization
- 新增 `idea.collaborator.search` 授权入口
- 运行时兼容映射到现有 `idea.collaborator.invite` 能力数据，不修改 Schema
- 搜索结果本身不授予协作权限，最终邀请仍走 `idea.collaborator.invite`

## 测试结果
- `pnpm check`: PASS
- `pnpm lint`: PASS
- `pnpm check:money:v330`: PASS
- `pnpm test:v33-b1-idea-service`: PASS
- `pnpm test:v33-b1-idea-routes`: PASS
- `pnpm test:v33-b1-idea-app`: PASS
- `pnpm test:v33-b1-1-collaborator-search`: PASS（19/19）
- `pnpm build`: PASS
- `pnpm build:web`: PASS

## Web Build
- `expo export --platform web` 通过
- 输出目录：`web-dist`

## MySQL 环境
- MySQL 集成验证继续为 `BLOCKED_BY_ENVIRONMENT`
- 未连接生产或共享数据库

## Commit SHA
- 开发起点：`4fd5fcd62758bd4c1430e73d170979f4b4895379`
- 交付提交 SHA：`815cfa0f8d5d7a033bf21ad874c32e8865caae63`
