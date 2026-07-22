Document Status: ACTIVE
Spec Version: 1.0.0
Updated At: 2026-07-22
Source: 《生活帮：高可信产品全生命周期平台总体规划 V1.0》+ 用户内容生态补充要求

# 内容创作、发现分发与创作者生态蓝图

## 1. 系统定位

内容生态是与需求、创意、新品筹措、产品追溯、商城和服务同级的核心业务系统，不是一个简单的信息流页面。

它由四个边界清晰、共享同一内容事实源的部分组成：

1. **内容创作系统**：生产、编辑、预览、审核和发布内容；
2. **发现系统**：搜索、推荐、关注、频道和附近分发；
3. **统一发布中心**：业务发布与内容创作的共同入口；
4. **创作者中心**：作品、草稿、互动管理和业务转化数据。

核心转化链：

```text
需求 / 创意 / 筹措 / 产品 / ProductUnit / Listing / 服务与循环业务
  -> 内容创作
  -> 发现 / 推荐 / 搜索 / 关注 / 附近
  -> 点赞 / 收藏 / 评论 / 分享 / 关注 / 举报
  -> 进入关联业务对象
  -> 意向 / 协作 / 服务咨询 / 商城订单 / 可信记录
```

## 2. 统一内容模型

内容类型使用统一 `content_posts` 主表和可扩展类型目录，不为图文、视频、文章、问答、测评、教程和项目动态复制互不相容的主表。

首批必须可表达：

- 图文、短视频、长文章、问答；
- 产品测评、产品教程、开箱和产品对比；
- 创意展示、创意进展、新品筹措动态；
- 维修教程、真实维修案例；
- 捐赠故事、回收改造和再利用内容；
- 产品发布、召回、维修和回收公告。

内容与业务对象通过 `content_relations` 多态关联，首批关系类型：

- `demand`、`idea`、`funding_project`；
- `product`、`product_unit`、`listing`；
- `repair`、`service`、`donation`、`recycling`；
- `account`、`organization`。

多态关系必须由服务端白名单、目标存在性和查看权限校验保护；不得仅凭 `relationType + relationId` 直接信任客户端。

## 3. 目标数据对象

以下是目标数据字典输入，不代表允许在当前批次一次性建表：

| 对象 | 责任 | 关键约束 |
|---|---|---|
| `content_posts` | 内容事实、作者、类型、可见范围、来源和状态 | 软删除；发布和审核走状态机；`authorAccountId` 不等于公开作者身份 |
| `content_media` | 图片、视频、封面、字幕和排序 | 引用统一 `stored_files`；安全状态合格才可公开 |
| `content_relations` | 内容与业务对象关联 | 内容、类型、对象、关系唯一；服务端验证目标和权限 |
| `content_tags` / `content_tag_links` | 标签目录与关联 | 规范化代码；禁止用标签代替业务关系 |
| `content_interactions` | 点赞、收藏、分享和业务点击 | 用户动作幂等；浏览/曝光单独聚合防刷 |
| `content_comments` | 评论与回复 | 树深受限；作者删除和平台处置留状态历史 |
| `content_follows` | 关注作者或组织 | 主体/目标唯一；停用可恢复，不重复计数 |
| `content_reports` | 用户举报 | 同一主体同一理由幂等；进入治理案件 |
| `content_moderation_records` | 审核、限制推荐、下架和封禁记录 | 追加式；稳定 `reasonCode`；高风险操作审计 |
| `content_metrics` | 浏览、互动和转化聚合 | 原始事件与聚合分离；不把相关性伪装成确定归因 |
| `content_drafts` | 草稿、自动保存和预览版本 | 仅作者/授权协作者可见；并发版本保护 |
| `creator_profiles` | 创作者公开资料和创作设置 | 复用 Account/Identity/Organization，不新建账号体系 |

`content_posts` 至少预留：`authorAccountId`、`authorIdentityId`、`authorOrganizationId`、`contentType`、`title`、`summary`、`body`、`coverFileId`、`visibility`、`locationMode`、`cityCode`、`status`、`sourceType`、`aiAssisted`、`aiConfirmedAt`、`publishedAt`、`createdAt`、`updatedAt`、`deletedAt` 和乐观锁版本。

## 4. 可信来源与 AI 边界

产品相关内容必须显示来源类型：

- `personal_experience`：个人体验；
- `organization_official`：企业/组织官方说明；
- `service_case`：服务商案例；
- `platform_verified`：平台核验资料；
- `external_public`：外部公开资料；
- `ai_assisted`：AI 辅助整理；
- `unverified_claim`：未经验证的用户声明。

来源类型、作者认证徽章和业务对象可信等级是三个不同概念。用户声明不得升级为平台核验事实；组织官方也不自动等于平台验证。

AI 可以生成标题、整理正文、推荐标签、提炼卖点、生成视频简介、总结产品参数、整理维修案例和创意进展，并提示夸大宣传、隐私、侵权和虚假产品风险。

AI 不得自动发布、修改追溯事实、生成虚假证明、确认产品真实性、删除内容或处罚信用。AI 结果必须标记 `aiAssisted=true`，并在用户确认后记录 `aiConfirmedAt` 才能发布。

## 5. 状态机

```text
draft -> ready_to_publish -> reviewing -> published
  |             |              |           |
  +-> deleted   +-> draft      +-> rejected+-> recommendation_limited
                                            +-> unpublished
                                            +-> author_deleted
                                            +-> platform_banned
```

- 状态变化只能由服务端命令执行，客户端不能任意提交最终 `status`；
- `published` 前必须通过作者权限、媒体安全、关联对象权限、来源声明和 AI 确认门禁；
- `recommendation_limited` 仍可按规则直接访问，但不进入普通推荐；
- 下架、封禁和恢复必须写审核记录、操作者、原因、证据和审计；
- 作者删除不物理删除举报、审核、互动聚合和必要审计证据。

## 6. 能力与授权

首批能力命名空间：

- `content.create`、`content.edit_own`、`content.publish_own`、`content.delete_own`；
- `content.view_public`、`content.view_restricted`；
- `content.relation.attach`、`content.relation.detach`；
- `content.comment.create`、`content.comment.moderate_own`；
- `content.interact`、`content.follow`、`content.report`；
- `content.moderation.review`、`content.moderation.limit`、`content.moderation.unpublish`、`content.moderation.ban`；
- `creator.analytics.view_self`、`creator.analytics.view_organization`。

授权必须同时检查账号状态、有效业务身份/组织成员关系、资源所有权、关联业务对象权限、内容状态、可见范围、位置用途、媒体状态和职责分离。组织内容要求有效组织岗位；服务案例要求服务商可访问对应真实工单，但公开内容不得泄露客户、地址、报价和完整工单。

## 7. 字段脱敏与位置

- 公开内容只显示城市或模糊地区，不返回发布者精确坐标、住址或履约地址；
- 产品生命周期事件只有明确 `public` 视图才能生成公开动态；所有者视图、交易双方视图和内部事件不得自动发布；
- 维修案例公开前移除客户姓名、联系方式、地址、设备账号、序列号敏感部分和非公开报价；
- 创意/NDA/项目私密标题、附件名和成员不得通过内容关系或推荐理由泄露；
- 创作者分析只返回本人或本组织汇总，不公开具体访问者或买家身份。

## 8. App 信息架构

### 统一发布中心

业务发布与内容创作分组展示。内容创作至少包含：图文、视频、文章、问答、产品测评、使用教程、创意进展、筹措动态和维修案例。创作页支持草稿、预览、标题、正文、图片/视频、封面、标签、模糊位置、@用户、关联对象、可见范围、评论设置和 AI 辅助。

### 发现

频道至少包含：推荐、关注、产品、创意、经验、视频、问答、附近。发现只负责展示和分发，不能成为内容事实源。

### 内容详情

显示作者及有效身份/组织标识、信用摘要、来源类型、发布时间、模糊位置、正文/媒体、标签、互动、举报和关联对象卡片。关联卡片只展示调用者有权看到的字段。

### 创作者中心

包含作品、草稿、评论管理、关注与粉丝、创作收藏和数据表现。首批指标：浏览、点赞、收藏、评论、关注增长、产品点击、创意点击、需求响应、服务咨询、意向和订单转化。

建议路由能力（具体路径服从现有 Expo Router）：

```text
/content                  /content/create
/content/[id]             /content/edit/[id]
/discover                 /discover/following
/discover/products        /discover/ideas
/discover/experience      /discover/videos
/discover/questions       /discover/nearby
/creator                  /creator/drafts
/creator/posts            /creator/analytics
/creator/comments
```

## 9. 分批实施

不得把全部内容生态作为一条无限任务。按以下批次逐批退出：

1. C1 规格与威胁模型：数据字典、状态机、能力、脱敏、路由和测试矩阵；
2. C2 追加迁移：核心内容、媒体、关系、互动、评论、举报和审核表；
3. C3 服务端核心：草稿、发布、详情、关系校验、互动、举报和审核；
4. C4 App 最小闭环：统一发布、产品测评、发现、详情和创作者作品；
5. C5 AI 与可信内容：用户确认、来源展示、风险提示和媒体安全；
6. C6 转化与频道：产品/创意/服务跳转、关注、附近和可解释分发；
7. C7 MySQL、越权、弱网、真机和交付。

## 10. 最小验收链

第一条必须真实跑通：登录 -> 发布产品测评 -> 关联产品 -> AI 辅助标题 -> 用户确认 -> 上传媒体 -> 发布 -> 发现展示 -> 点赞/收藏/评论 -> 查看关联产品与追溯 -> 进入 Listing/下单。

随后分别跑通：创意发起人发布进展 -> 创意频道 -> 创意详情 -> 意向；服务商发布维修案例 -> 真实工单关系 -> 经验频道 -> 服务商 -> 创建维修需求。

验收必须使用真实 MySQL、真实 tRPC API 和 App 页面；静态示例数据、内存数组或仅视觉页面不算完成。
