# V3.3-B3.1 Backend Report

## 复用和新增结构
- 复用：
  - `projects`
  - `project_memberships`
  - `project_membership_roles`
  - `milestones`
  - `milestone_deliverable_submissions`
  - `milestone_deliverable_submission_files`
  - `project_files`
  - `notifications`
  - `AuthorizationService`
  - `prototypeMilestones.deliverableFileAccess` 既有受控文件撤权链路
- 新增最小结构：
  - `milestone_acceptance_rounds`
  - `milestone_revision_requests`
  - `project_intentions`
- 旧 `project_acceptances` 保持不动，继续服务旧项目验收链路；B3.1 新增“submission 级轮次化验收”没有创建第二套项目、成员、文件或通知体系

## 是否新增 0032
- 已新增：
  - [0032_v33_b3_acceptance_intent.sql](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/drizzle/0032_v33_b3_acceptance_intent.sql)
- 已同步 schema：
  - [schema.ts](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/drizzle/schema.ts)
- 未修改 `0000`—`0031`
- 未改旧 journal

## 验收状态机
- 目标对象从“里程碑”细化为“具体 deliverable submission”
- 每次新成果提交都会创建独立 `pending_review` 验收轮次
- 当前允许链路：
  - `submitted deliverable -> pending_review -> accepted`
  - `submitted deliverable -> pending_review -> revision_requested -> 新 submission -> 新 pending_review -> accepted`
- 约束：
  - 仅最新 `submitted` submission 可验收
  - 提交者不能自验
  - 每个 submission 仅对应一个当前验收轮次
  - 历史验收与历史成果不会被覆盖或删除
  - `accepted` 后不再允许对同一 submission 发起返工
- 实现位置：
  - [project-design-prototype-service.ts](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/server/services/project-design-prototype-service.ts)
  - [project-acceptance-intention-router.ts](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/server/routers/project-acceptance-intention-router.ts)

## 返工与重新提交
- 新增接口：
  - `prototypeAcceptances.status`
  - `prototypeAcceptances.history`
  - `prototypeAcceptances.accept`
  - `prototypeAcceptances.requestRevision`
  - `prototypeAcceptances.revisionRequest`
- 对 `prototypeMilestones.submitDeliverable` 做窄扩展：
  - `in_progress` 时保持 B2.1 初次提交流程
  - `submitted + latest acceptance = revision_requested` 时允许返工后重提
  - 新 submission 原子递增 `submissionVersion`
  - 旧 submission 保留历史，并通过既有版本撤权机制使旧文件令牌失效
  - 新 submission 成功后，当前 open revision request 变为 `resubmitted`
  - 新 submission 自动生成新的 `pending_review` 验收轮次
- B3 不解析 B2.2 描述附加段落作为权限、超期、返工截止或状态机事实

## 意向登记
- 新增接口：
  - `projectIntentions.register`
  - `projectIntentions.withdraw`
  - `projectIntentions.listMine`
  - `projectIntentions.listProject`
  - `projectIntentions.summary`
- 支持最小枚举：
  - `follow`
  - `trial`
  - `purchase_interest`
  - `collaboration_interest`
- 约束：
  - 仅登录用户可登记
  - `purchase_interest` 不创建订单或支付
  - `trial` 不创建交付承诺
  - `collaboration_interest` 不创建 membership
  - 同账号/项目/类型仅一个 active 意向
  - `withdraw` 幂等
  - 备注做长度和敏感内容校验，不允许手机号、邮箱、证件类内容
- 说明：
  - 当前项目模型没有独立“公开项目可见性”字段，B3.1 采用现有项目状态可用性做最小可登记判断，并继续对不可用项目返回防枚举响应

## Authorization
- 新增 capability：
  - `project.prototype_acceptance.view`
  - `project.prototype_acceptance.review`
  - `project.prototype_acceptance.accept`
  - `project.prototype_acceptance.request_revision`
  - `project.prototype_revision.submit`
  - `project.intention.register`
  - `project.intention.withdraw`
  - `project.intention.view_project`
- 接入位置：
  - [drizzle-data-source.ts](file:///c:/Users/chejun/Documents/生活帮/shenghuobang/server/authorization/drizzle-data-source.ts)
- 规则：
  - `currentRole` 不增权
  - 项目成员实时有效才有项目级验收/查看权限
  - 提交返工成果的 capability 与初次提交分离
  - 意向登记/撤回采用账号自有 capability；项目负责人查看名单走项目级 capability

## 文件访问
- 继续复用 `prototypeMilestones.deliverableFileAccess` 和既有 content 端点
- 未新增永久 URL
- 仍按项目权限、submission 状态、policyVersion、membership 与项目状态重新校验
- `revision_requested` 后旧 submission 文件仍可做历史审计
- 新 submission 产生后，旧 submission 被置为 `superseded`，既有旧令牌按业务版本失效

## 通知
- 已新增或扩展通知事件：
  - 成果等待验收
  - 原型成果验收通过
  - 成果要求返工
  - 返工成果已重新提交
  - 用户登记试用意向
  - 用户登记购买意向
  - 用户登记合作意向
  - 用户撤回意向
- follow 意向不主动广播，避免通知风暴
- 高价值意向仅通知负责人/管理角色
- 通知失败不回滚业务事务

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
- `pnpm test:v33-b3-1-acceptance-intent-backend`: PASS，25/25
- `pnpm test:v33-a3-authorization`: PASS
- `pnpm build`: PASS

## MySQL 环境
- MySQL 继续为 `BLOCKED_BY_ENVIRONMENT`
- 未连接生产或共享数据库

## Commit SHA
- B3.1 开发基线：`23857830db51387ea8fb3e950f5ae2a1b529ede5`
- B3.1 后端提交：`TO_BE_FILLED_AFTER_COMMIT`

## B3.2 App 待办
- 原型验收状态页与历史页
- 返工要求详情与重提入口
- 用户意向登记与撤回页面
- 负责人意向名单与统计视图
