# V3.3-B2.1 Backend Report

## 复用和新增的数据结构
- 复用：`projects`、`project_memberships`、`project_membership_roles`、`project_roles`、`milestones`、`project_files`、`stored_files`、`notifications`
- 扩展：`milestones` 新增 `milestoneType`、`prototypeTaskType`、`startedAt`、`startedByProjectMembershipId`
- 新增：`design_versions`
- 新增：`design_version_files`
- 新增：`milestone_deliverable_submissions`
- 新增：`milestone_deliverable_submission_files`

## 迁移 0031
- 需要新增迁移：`drizzle/0031_v33_b2_design_prototype.sql`
- 原因：现有 `project_files` 只能表达单文件版本，`milestones` 只能表达当前里程碑状态，无法准确表达“设计版本”与“版本化成果提交”
- 迁移范围仅限 B2.1 所需最小追加，没有引入 B3 验收/返工争议字段，也没有创建第二套项目成员体系
- 迁移同时追加 B2.1 capability 码到 `capabilities`

## Service 和 Router
- 新增 Service：[project-design-prototype-service.ts](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/server/services/project-design-prototype-service.ts)
- 新增 Router：[project-design-prototype-router.ts](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/server/routers/project-design-prototype-router.ts)
- 新增 `designVersions.*`
  - `createDraft`
  - `updateDraft`
  - `list`
  - `detail`
  - `uploadFile`
  - `disableFile`
  - `submit`
  - `withdraw`
  - `fileAccess`
- 新增 `prototypeMilestones.*`
  - `create`
  - `update`
  - `assign`
  - `start`
  - `list`
  - `detail`
  - `submitDeliverable`
  - `deliverableFileAccess`

## 状态机
- 设计版本状态：`draft -> submitted -> superseded`，以及 `draft/submitted -> withdrawn`
- 设计版本规则：
  - `draft` 可修改
  - `submitted` 不可原地编辑
  - 新版本提交后旧 `submitted` 版本改为 `superseded`
  - `withdrawn` 不可重新提交
- 原型里程碑存储复用 `milestones.status`
  - 存储态：`pending -> in_progress -> submitted`
  - 对外语义：`planned -> in_progress -> submitted`
- 里程碑成果提交状态：`submitted -> superseded`

## Authorization
- 新增并接入的 capability：
  - `project.design_version.create`
  - `project.design_version.edit`
  - `project.design_version.submit`
  - `project.design_version.view`
  - `project.design_file.upload`
  - `project.design_file.download`
  - `project.milestone.create`
  - `project.milestone.edit`
  - `project.milestone.assign`
  - `project.milestone.start`
  - `project.milestone.submit_deliverable`
- 接入点：`server/authorization/drizzle-data-source.ts`
- 说明：
  - `currentRole` 不参与 allow
  - 仍以实时 `project_memberships` / `project_membership_roles` 为准
  - 对 legacy 普通项目，在 Service 内按需补齐兼容 membership 映射，不复制第二套成员体系

## 文件撤权
- 新增受控访问入口：[projectDesignPrototypeFileAccess.ts](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/server/_core/projectDesignPrototypeFileAccess.ts)
- 新增 token：[project-delivery-file-access-token.ts](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/server/storage/project-delivery-file-access-token.ts)
- 令牌绑定：
  - `accountId`
  - `projectId`
  - `designVersionId` 或 `milestoneSubmissionId`
  - `projectFileId`
  - `fileId`
  - `purpose`
  - `project authorizationVersion`
  - `entity authorizationVersion`
  - `entityFile accessPolicyVersion`
  - `projectFile accessPolicyVersion`
  - `storedFile accessPolicyVersion`
  - `expires`
  - `nonce`
- 以下变化会使旧令牌失效：
  - 项目授权版本变化
  - 设计版本撤回
  - 成果提交被 superseded
  - 设计版本文件或成果文件 link 被禁用
  - `project_files` 被禁用
  - `stored_files` 被禁用

## 通知
- 复用现有 `notifications`
- 新增通知事件：
  - 设计版本已提交
  - 新设计版本替代旧版本
  - 原型里程碑已创建
  - 原型里程碑已指派
  - 原型里程碑已启动
  - 原型成果已提交
- 通知发送失败不会回滚事务

## 测试结果
- `pnpm check`: PASS
- `pnpm lint`: PASS
- `pnpm check:money:v330`: PASS
- `pnpm test:v33-b1-idea-service`: PASS，MySQL `BLOCKED_BY_ENVIRONMENT`
- `pnpm test:v33-b1-idea-routes`: PASS，MySQL `BLOCKED_BY_ENVIRONMENT`
- `pnpm test:v33-b1-idea-app`: PASS
- `pnpm test:v33-b1-1-collaborator-search`: PASS，19/19
- `pnpm test:v33-b2-1-design-prototype-backend`: PASS，24/24
- `pnpm test:v33-a3-authorization`: PASS
- `pnpm test:v33-a3-routes`: PASS，DB 集成 `BLOCKED_BY_ENVIRONMENT`
- `pnpm build`: PASS

## MySQL 环境
- MySQL 集成继续为 `BLOCKED_BY_ENVIRONMENT`
- 未连接生产或共享数据库

## Commit SHA
- B2 分支起点：`0320f4fc430e8c81e21b55d18c71463765c57d08`
- 本轮交付提交：以本次 `feat(v3.3-b2): add design versions and prototype delivery backend` 提交 SHA 为准

## B2.2 App 待办
- 项目详情中的设计版本列表与详情 UI
- 设计版本创建/编辑/提交页
- 原型里程碑列表与详情页
- 里程碑创建/指派/启动交互
- 成果提交 UI 与文件上传绑定
- 设计文件与原型成果文件受控访问前端接入
