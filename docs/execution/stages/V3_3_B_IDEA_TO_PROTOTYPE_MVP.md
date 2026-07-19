Document Status: PLANNED
Spec Version: 2.0.0
Updated At: 2026-07-19
Depends On: V3.3-A completed

# V3.3-B 创意落地最小闭环

## 1. 用户可见结果

普通用户进入“创意专区”后，可以创建创意，设置公开/私密/NDA，可邀请设计师和工程师加入，形成项目，提交设计版本和原型成果，由独立验收人验收，最后开放意向登记。

## 2. 业务流程

草稿创意 → 发布范围设置 → 意向验证 → 邀请协作者 → 接受邀请/NDA → 创意转项目 → 设计版本 → 原型里程碑 → 成果提交 → 验收/返工 → 开放意向登记

## 3. 数据增量

建议新增：

- `ideas`
- `idea_visibility_grants`
- `idea_collaboration_invitations`
- `confidentiality_agreements`
- `idea_interest_registrations`
- `design_version_metadata`（实际文件继续复用 project_files）

项目、里程碑、正式需求、变更、文件、验收、消息、通知、投诉和信用继续复用现有表，并接入 V3.3-A 项目成员权限。

## 4. 可见范围

- public：公开摘要和允许公开附件
- private：仅发起人和明确授权成员
- nda：可看公开摘要；签署并通过授权后查看保密内容

保密权限可撤销；已下载行为保留审计。任何搜索和通知结果都不得泄露私密标题、附件名或参与人。

## 5. 角色与职责

- 发起人：编辑创意、邀请、转项目、指定验收人
- 项目负责人：成员、里程碑和进度管理
- 设计师：设计任务和设计版本
- 工程师：工程任务、原型和测试交付
- 受邀查看者：只读被授权范围
- 验收人：不能是当前交付提交者

## 6. 页面

- 创意列表/详情/创建编辑
- 可见范围和 NDA 设置
- 协作者邀请与成员列表
- 创意转项目确认
- 设计版本列表与差异摘要
- 原型里程碑和交付验收
- 意向登记人数和匿名统计
- 我的创意/参与创意工作台

## 7. API

`ideas.create/update/publish/detail/list`、`ideas.visibility.*`、`ideas.invitation.*`、`ideas.nda.*`、`ideas.convertToProject`、`ideas.interest.register/cancel/stats`，以及扩展后的 project member/design/milestone API。

## 8. 验收门禁

- 非授权账号无法通过列表、搜索、通知、文件签名或直接 ID 获得私密内容。
- NDA 状态和撤权即时影响访问。
- 创意转项目幂等，不重复创建项目或成员。
- 设计版本追加，不静默覆盖历史。
- 提交者不能自验收；返工形成新提交记录。
- 意向登记不等于付款、订单或众筹承诺。
- 普通用户旧流程不回归。
