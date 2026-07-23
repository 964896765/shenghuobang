# V3.3-B3.2 App Report

## 范围
- 任务：原型成果验收、返工与项目意向 App 落地。
- 分支：`codex/v3.3-b3-acceptance-intent`
- 约束：不修改 `0000`—`0032`、不改 Schema / journal、不进入 RFQ / BOM / 生产 / 支付。

## 项目意向可见性窄修
- 新增统一判断：`resolveProjectIntentionEligibility(accountId, projectId)`。
- 允许事实仅包含：
  - 当前账号是项目有效成员；
  - 项目明确来源于 `public idea`；
  - 项目关联的 `need` 当前仍为公开可见；
  - `AuthorizationService` 以 `PUBLIC` scope 判定允许公开查看。
- `register`、`summary`、`listProject` 统一复用同一 eligibility resolver。
- 默认拒绝普通项目的状态猜测公开性；删除“active/completed 即可登记”的宽规则。
- `listMine` 对后来转为不可见的项目做安全遮罩，仅保留历史占位；`listProject` 不再返回意向主键。

## 验收状态页面
- 新增页面：`app/projects/prototype-acceptance/[milestoneId].tsx`
- 接入：
  - `prototypeAcceptances.status`
  - `prototypeAcceptances.accept`
  - `prototypeMilestones.detail`
  - `prototypeMilestones.deliverableFileAccess`
- 展示当前提交版本、轮次、状态、提交说明、验收意见、返工摘要与受控成果文件。
- 验收通过采用二次确认，提交者本人不显示验收按钮，重复点击复用稳定 `requestId`。

## 验收历史
- 新增页面：`app/projects/prototype-acceptance-history/[milestoneId].tsx`
- 接入：
  - `prototypeAcceptances.history`
- 以时间线展示每轮 `submissionVersion`、`roundNo`、状态、验收意见与返工原因。
- 历史只读，不提供编辑或覆盖入口。

## 返工要求
- 新增页面：
  - `app/projects/prototype-revision-request-edit.tsx`
  - `app/projects/prototype-revision-request/[milestoneId].tsx`
- 接入：
  - `prototypeAcceptances.requestRevision`
  - `prototypeAcceptances.revisionRequest`
- 返工原因必填，执行人仅能从当前项目有效成员中选择，可选结构化 `dueAt`。

## 返工重提
- 扩展页面：`app/projects/prototype-deliverable-submit.tsx`
- 复用：
  - `prototypeMilestones.submitDeliverable`
- 页面同时识别：
  - 初次 `in_progress` 提交；
  - `revision_requested` + `open revision request` 的返工重提。
- 重提成功后刷新：
  - `prototypeMilestones.detail`
  - `prototypeAcceptances.status`
  - `prototypeAcceptances.history`
  - `prototypeAcceptances.revisionRequest`

## 意向登记
- 新增页面：`app/projects/project-intention/[projectId].tsx`
- 接入：
  - `projectIntentions.register`
  - `projectIntentions.withdraw`
  - `projectIntentions.listMine`
  - `projectIntentions.summary`
- 支持类型：
  - `follow`
  - `trial`
  - `purchase_interest`
  - `collaboration_interest`
- 前端预检手机号、邮箱、证件格式；备注超限或敏感内容直接阻断。
- 页面显式声明：
  - 购买意向不是订单；
  - 不触发付款或库存锁定；
  - 试用意向不构成交付承诺；
  - 合作意向不会自动成为项目成员。

## 我的意向
- 新增页面：`app/projects/my-intentions.tsx`
- 接入：
  - `projectIntentions.listMine`
  - `projectIntentions.withdraw`
- 对后来不可见的项目显示安全历史占位，不暴露项目私密详情。
- 在 `app/(tabs)/profile.tsx` 增加“我的项目意向”入口。

## 负责人统计和名单
- 新增页面：`app/projects/project-intentions/[projectId].tsx`
- 接入：
  - `projectIntentions.listProject`
  - `projectIntentions.summary`
- 统计只展示四类意向计数。
- 名单仅展示后端允许的必要公开字段，不展示手机号、邮箱、证件、`accountId`、`identityId` 或数据库主键。

## 文件访问
- 继续复用 `prototypeMilestones.deliverableFileAccess` 和前端 `ControlledAccessTracker`。
- Web 使用内存态临时访问路径；页面退出时清理临时资源。
- 不写 `AsyncStorage`、不暴露 `storageKey`、不落日志。

## 项目详情与里程碑入口
- 扩展 `app/projects/[id].tsx`
  - 新增“原型验收”“项目意向”“我的意向状态”“意向统计名单”入口。
- 扩展 `app/projects/prototype-milestone/[milestoneId].tsx`
  - 新增验收状态入口；
  - 在 `revision_requested` 时提供重提入口；
  - 显示当前验收状态标签。

## 测试结果
- `pnpm check`：PASS
- `pnpm lint`：PASS
- `pnpm check:money:v330`：PASS
- `pnpm test:v33-b1-idea-service`：PASS（34 cases）
- `pnpm test:v33-b1-idea-routes`：PASS（26/26）
- `pnpm test:v33-b1-idea-app`：PASS（16/16）
- `pnpm test:v33-b1-1-collaborator-search`：PASS（19/19）
- `pnpm test:v33-b2-1-design-prototype-backend`：PASS（24/24）
- `pnpm test:v33-b2-2-design-prototype-app`：PASS（20/20）
- `pnpm test:v33-b3-1-acceptance-intent-backend`：PASS（28/28）
- `pnpm test:v33-b3-2-acceptance-intent-app`：PASS（28/28）

## Web Build
- `pnpm build`：PASS
- `pnpm build:web`：PASS

## MySQL 环境
- 状态：`BLOCKED_BY_ENVIRONMENT`
- 未连接生产或共享数据库。

## Commit SHA
- `31650a9b7c92e1f48a23709d7be45a7ced60c936`

## 剩余环境验收项
- MySQL 集成验证继续受 `BLOCKED_BY_ENVIRONMENT` 阻断。
- Android / iOS 真机文件打开与清理仍待环境验收。
