# V3.3-B2.2 App Report

## 页面
- 项目详情入口扩展：[projects/[id].tsx](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/app/projects/[id].tsx)
- 设计版本列表：[design-versions/[projectId].tsx](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/app/projects/design-versions/[projectId].tsx)
- 设计版本详情：[design-version/[designVersionId].tsx](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/app/projects/design-version/[designVersionId].tsx)
- 设计草稿创建/编辑：[design-version-edit.tsx](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/app/projects/design-version-edit.tsx)
- 原型里程碑列表：[prototype-milestones/[projectId].tsx](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/app/projects/prototype-milestones/[projectId].tsx)
- 原型里程碑详情：[prototype-milestone/[milestoneId].tsx](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/app/projects/prototype-milestone/[milestoneId].tsx)
- 原型里程碑创建/编辑：[prototype-milestone-edit.tsx](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/app/projects/prototype-milestone-edit.tsx)
- 原型成果提交：[prototype-deliverable-submit.tsx](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/app/projects/prototype-deliverable-submit.tsx)

## 项目入口
- 在现有项目详情中新增“设计版本”“原型里程碑”两个区域，没有重做项目详情整体结构
- 保留原有项目文件、变更、争议、聊天、里程碑、支付与验收链路
- 入口对普通项目和创意转项目统一生效，没有增加 idea-only 条件
- 当前成员列表与当前成员 capability 通过 `projects.detail` 最小扩展返回，支撑 assignee 选择和按钮显隐

## API 接入
- 设计版本：
  - `designVersions.createDraft`
  - `designVersions.updateDraft`
  - `designVersions.list`
  - `designVersions.detail`
  - `designVersions.uploadFile`
  - `designVersions.disableFile`
  - `designVersions.submit`
  - `designVersions.withdraw`
  - `designVersions.fileAccess`
- 原型里程碑：
  - `prototypeMilestones.create`
  - `prototypeMilestones.update`
  - `prototypeMilestones.assign`
  - `prototypeMilestones.start`
  - `prototypeMilestones.list`
  - `prototypeMilestones.detail`
  - `prototypeMilestones.submitDeliverable`
  - `prototypeMilestones.deliverableFileAccess`
- 复用项目文件上传：
  - `projects.uploadFile`
- 新增前端 contract/helper：
  - [project-design-prototype-app-contract.ts](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/lib/project-design-prototype-app-contract.ts)
  - [project-design-prototype-app.ts](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/lib/project-design-prototype-app.ts)

## 设计文件
- 设计草稿保存后即可上传设计文件，并绑定 `designVersionId`
- 文件角色支持：`source`、`preview`、`reference`、`specification`、`other`
- 文件打开走 `designVersions.fileAccess` 返回的短期受控路径
- Web 端通过临时 `object URL` 打开，Android/iOS 通过临时缓存文件/`content URI` 打开
- 页面退出时清理临时资源，不持久化令牌，不展示 `storageKey`、永久 URL 或内部 token
- 文件被禁用后立即切换为只读/隐藏可打开操作

## 成果文件
- 成果提交流程复用 `projects.uploadFile` 上传正式交付文件，并通过 `prototypeMilestones.submitDeliverable` 绑定本次提交版本
- 成果文件打开走 `prototypeMilestones.deliverableFileAccess`
- 仅 `in_progress` 里程碑显示成果提交流程，`submitted` 后不显示验收或返工按钮
- 成果提交使用稳定 `requestId`，重复点击时复用同一操作标识

## 页面状态
- 已覆盖 `loading`、`empty`、`error`、`retry`
- 已覆盖 `draft`、`submitted`、`superseded`、`withdrawn`
- 已覆盖 `planned`、`in_progress`、`submitted`
- 权限不足使用安全错误文案，不暴露内部表名、SQL、主键或堆栈
- `projects.detail` 最小扩展返回 `members`、`myMembershipId`、`myRoleCodes`、`myCapabilityCodes`
- 由于 B2.1 Router 未提供结构化计划时间字段，App 端将“计划开始/计划结束/备注”以描述附加段落形式通过真实 API 持久化，未修改 Schema 或 migration

## 测试结果
- `pnpm check`: PASS
- `pnpm lint`: PASS
- `pnpm check:money:v330`: PASS
- `pnpm test:v33-b1-idea-service`: PASS，MySQL `BLOCKED_BY_ENVIRONMENT`
- `pnpm test:v33-b1-idea-routes`: PASS，MySQL `BLOCKED_BY_ENVIRONMENT`
- `pnpm test:v33-b1-idea-app`: PASS
- `pnpm test:v33-b1-1-collaborator-search`: PASS，19/19
- `pnpm test:v33-b2-1-design-prototype-backend`: PASS，24/24
- `pnpm test:v33-b2-2-design-prototype-app`: PASS，20/20
- `pnpm build`: PASS

## Web Build
- `pnpm build:web`: PASS
- 输出目录：`web-dist`

## MySQL 环境
- MySQL 集成继续为 `BLOCKED_BY_ENVIRONMENT`
- 未连接生产或共享数据库

## Commit SHA
- B2.2 开发基线：`9f9912e3da011f4fb24cf9d0d6a86761693dddbc`
- B2.2 App 提交：`af305f4560ff82c7eba42ccb0f0b20c77120317f`

## B3 待办
- 里程碑成果验收与通过/拒绝
- 返工请求与验收争议
- 用户意向登记
- RFQ / BOM / 生产 / 预售与资金业务
