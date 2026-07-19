Document Status: ACTIVE
Spec Version: 2.0.0
Updated At: 2026-07-19
Parent Stage: V3.3-A / A1

# V3.3-A / A1 能力目录

## 1. 规则

- 首批冻结 68 个能力代码。代码使用完整领域名，禁止 `org.*`、页面名或 `isAdmin` 别名。
- 角色/岗位只是能力模板；最终决策还必须检查账号、身份、认证、成员状态、资源关系、数据范围、业务状态、保密级别和职责分离。
- “默认拥有者”不是自动放行；所有能力默认拒绝，只有有效模板映射或有效 `capability_grants` 才进入 ABAC 判定。
- 数据范围：`SELF`、`OWNED_RESOURCE`、`ORGANIZATION`、`PROJECT`、`ASSIGNED_RESOURCE`、`CITY_OR_REGION`、`PUBLIC`、`INVITED_RESOURCE`、`PLATFORM_ASSIGNED`、`PLATFORM_ALL`。
- 表中“认证/组织/项目”列的“条件”表示仅当资源或动作声明该条件时要求；“是”表示始终要求。

## 2. 账号、身份与认证（10）

| 能力代码 | 业务含义 | 默认拥有者 | 数据范围 | 认证 | 组织 | 项目 | 状态限制 | 敏感 | 职责分离 |
|---|---|---|---|---|---|---|---|---|---|
| `account.profile.view_self` | 查看本人账号资料 | 已登录账号 | SELF | 否 | 否 | 否 | account=active/restricted | 是 | 否 |
| `account.profile.update_self` | 修改本人非安全关键资料 | 已登录账号 | SELF | 否 | 否 | 否 | account=active | 是 | 否 |
| `identity.list_self` | 查看本人业务身份 | 已登录账号 | SELF | 否 | 否 | 否 | account!=closed | 是 | 否 |
| `identity.profile.update_self` | 修改本人业务身份展示/接单资料 | 身份本人 | SELF | 条件 | 否 | 否 | identity=active；认证条件满足 | 是 | 否 |
| `identity.directory.view_public` | 查看专业身份公开目录/名片 | 任意主体 | PUBLIC/CITY_OR_REGION | 否 | 否 | 否 | identity active；公开策略允许 | 是 | 否 |
| `identity.create` | 创建可选业务身份 | 已登录账号 | SELF | 条件 | 否 | 否 | identity type active；不得重复 | 是 | 否 |
| `identity.switch` | 选择身份工作台偏好 | 身份本人 | SELF | 条件 | 否 | 否 | identity=active | 否 | 否 |
| `identity.suspend` | 主动停用本人身份 | 身份本人；平台治理另走职务能力 | SELF | 否 | 否 | 否 | 无活动强依赖任务或先交接 | 是 | 否 |
| `certification.submit_self` | 提交/补件本人身份认证 | 身份本人 | SELF | 否 | 否 | 否 | type active；状态允许 | 高敏 | 否 |
| `certification.view_self` | 查看本人认证及材料 | 身份/组织材料所有者 | SELF/OWNED_RESOURCE | 否 | 条件 | 否 | 主体有效；材料 available | 高敏 | 否 |

## 3. 组织（13）

| 能力代码 | 业务含义 | 默认拥有者 | 数据范围 | 认证 | 组织 | 项目 | 状态限制 | 敏感 | 职责分离 |
|---|---|---|---|---|---|---|---|---|---|
| `organization.create` | 创建组织并成为首位 owner | 已登录账号 | OWNED_RESOURCE | 条件 | 否 | 否 | account=active；类型有效 | 是 | 否 |
| `organization.view` | 查看组织资料 | owner/admin/viewer；公开摘要 | ORGANIZATION/PUBLIC | 条件 | 是(私密) | 否 | org=active/suspended(只读) | 是 | 否 |
| `organization.update` | 修改组织资料 | owner/admin | ORGANIZATION | 条件 | 是 | 否 | org=active；membership=active | 是 | 否 |
| `organization.member.list` | 查看成员及岗位 | owner/admin；本人看自己 | ORGANIZATION/SELF | 否 | 是 | 否 | membership=active | 是 | 否 |
| `organization.member.invite` | 发组织邀请 | owner/admin | ORGANIZATION | 条件 | 是 | 否 | org/member active | 是 | 否 |
| `organization.invitation.accept` | 接受发给本人的组织邀请 | 被邀请账号 | INVITED_RESOURCE | 否 | 否 | 否 | invitation pending/未过期/主体匹配 | 是 | 否 |
| `organization.member.suspend` | 暂停成员 | owner/admin | ORGANIZATION | 条件 | 是 | 否 | 目标 active；不得停最后 owner | 是 | 否 |
| `organization.member.restore` | 恢复成员 | owner/admin | ORGANIZATION | 条件 | 是 | 否 | 目标 suspended | 是 | 否 |
| `organization.member.remove` | 移除成员 | owner/admin | ORGANIZATION | 条件 | 是 | 否 | 目标 active/suspended；不得移除最后 owner | 是 | 否 |
| `organization.member.leave` | 主动退出 | 当前成员 | SELF/ORGANIZATION | 否 | 是 | 否 | 不得为最后 owner；任务先交接 | 是 | 否 |
| `organization.member.assign_position` | 分配/撤销成员岗位 | owner/admin | ORGANIZATION | 条件 | 是 | 否 | 双方 active；岗位 active | 是 | 禁止自授超管等价能力 |
| `organization.position.manage` | 建立岗位及能力模板 | owner/admin | ORGANIZATION | 条件 | 是 | 否 | org/member active | 是 | 禁止授平台范围；自授权受限 |
| `organization.owner.transfer` | 所有权二次确认转让 | 当前 owner | ORGANIZATION | 条件 | 是 | 否 | 两成员 active；双确认；无并发转让 | 高敏 | 发起人与接收人均确认并审计 |

## 4. 项目（19）

| 能力代码 | 业务含义 | 默认拥有者 | 数据范围 | 认证 | 组织 | 项目 | 状态限制 | 敏感 | 职责分离 |
|---|---|---|---|---|---|---|---|---|---|
| `project.view` | 查看项目详情和允许字段 | 所有有效项目成员 | PROJECT/INVITED_RESOURCE | 条件 | 条件 | 是 | member active；项目非隐藏终态 | 是 | 否 |
| `project.member.list` | 查看项目成员 | initiator/project_lead/viewer | PROJECT | 否 | 否 | 是 | member active | 是 | 否 |
| `project.member.invite` | 邀请项目成员 | initiator/project_lead | PROJECT | 条件 | 条件 | 是 | 项目允许协作；邀请唯一有效 | 是 | 否 |
| `project.invitation.accept` | 接受发给本人/组织的项目邀请 | 被邀请主体 | INVITED_RESOURCE | 条件 | 条件 | 否 | invitation pending；NDA/主体/项目有效 | 是 | 否 |
| `project.member.remove` | 移除项目成员 | initiator/project_lead | PROJECT | 条件 | 否 | 是 | 目标非最后负责人；任务交接 | 是 | 禁止自移除绕过责任 |
| `project.role.assign` | 分配项目角色 | initiator/project_lead | PROJECT | 条件 | 否 | 是 | 成员/角色 active | 是 | 禁止自授验收绕过 |
| `project.requirement.edit` | 编辑/确认需求版本 | initiator/project_lead/engineer | PROJECT | 条件 | 否 | 是 | 非冻结/终态；版本 CAS | 是 | 发起方/执行方分别确认 |
| `project.file.upload` | 上传项目文件 | initiator/project_lead/engineer | PROJECT | 条件 | 否 | 是 | 项目允许；扫描可用；成员 active | 高敏 | 否 |
| `project.file.view` | 查看文件元数据/预览 | 按角色和 clearance | PROJECT/INVITED_RESOURCE | 条件 | 否 | 是/邀请 | 文件 available；保密级别不高于 clearance | 高敏 | 否 |
| `project.file.download` | 下载项目文件 | 按角色和 clearance | PROJECT/INVITED_RESOURCE | 条件 | 否 | 是/邀请 | NDA/状态/短签名/实时复核 | 高敏 | 否 |
| `project.file.disable` | 禁用本人文件或管理文件 | 上传者/project_lead | PROJECT | 条件 | 否 | 是 | 文件 available；非冻结证据 | 高敏 | 禁止篡改审计/争议证据 |
| `project.milestone.start` | 开始被分配里程碑 | assignee | ASSIGNED_RESOURCE/PROJECT | 条件 | 否 | 是 | milestone=pending | 是 | 否 |
| `project.milestone.submit` | 提交交付申请验收 | assignee/engineer/project_lead | ASSIGNED_RESOURCE/PROJECT | 条件 | 否 | 是 | in_progress/revision_required；有正式文件 | 高敏 | 提交者不能成为同次独立验收者 |
| `project.milestone.accept` | 验收交付 | initiator/reviewer | PROJECT/ASSIGNED_RESOURCE | 条件 | 否 | 是 | waiting_acceptance；满足独立验收 | 高敏 | 禁止自验收；无独立人时拒绝 |
| `project.milestone.request_revision` | 要求返工 | initiator/reviewer | PROJECT | 条件 | 否 | 是 | waiting_acceptance | 高敏 | 同上 |
| `project.change.propose` | 发起范围/工期/金额变更 | initiator/project_lead/engineer | PROJECT | 条件 | 否 | 是 | 项目非终态；无同类开放变更 | 高敏 | 否 |
| `project.change.approve` | 同意对方变更 | 非发起方负责人 | PROJECT | 条件 | 否 | 是 | pending；版本 CAS | 高敏 | 发起人不得批准自己的变更 |
| `project.finance.view` | 查看项目账本摘要 | 付款方/收款方授权成员 | PROJECT | 条件 | 条件 | 是 | 有效成员；资金记录存在 | 高敏 | 技术 viewer 默认不可见结算账号 |
| `project.payment.create` | 从兼容项目入口创建统一支付意图 | 项目付款方 | PROJECT | 条件 | 条件 | 是 | 项目待支付；金额合同有效 | 高敏 | 不得绕过财务账本和幂等 |

## 5. 当前需求与报价兼容域（8）

| 能力代码 | 业务含义 | 默认拥有者 | 数据范围 | 认证 | 组织 | 项目 | 状态限制 | 敏感 | 职责分离 |
|---|---|---|---|---|---|---|---|---|---|
| `need.view_public` | 查看公开需求摘要 | 任意主体 | PUBLIC/CITY_OR_REGION | 否 | 否 | 否 | need public + 可见状态 | 否 | 否 |
| `need.view_owned` | 查看本人完整需求 | 创建者 | OWNED_RESOURCE | 否 | 否 | 否 | 非删除 | 是 | 否 |
| `need.create` | 创建需求草稿 | 已登录账号 | OWNED_RESOURCE | 否 | 否 | 否 | account=active | 是 | 否 |
| `need.update` | 修改/发布/关闭本人需求 | 创建者 | OWNED_RESOURCE | 否 | 否 | 否 | 当前状态允许 | 是 | 否 |
| `quote.view` | 查看本人提交或收到的报价 | 报价方/需求创建者 | OWNED_RESOURCE/ASSIGNED_RESOURCE | 条件 | 条件 | 否 | 报价存在且关系匹配 | 高敏 | 供应商间隔离 |
| `quote.submit` | 提交解决方案/报价 | 有效专业身份/组织 | OWNED_RESOURCE/ASSIGNED_RESOURCE | 是 | 条件 | 否 | 需求开放；认证有效 | 高敏 | 不得读取竞争报价 |
| `quote.accept` | 选择报价并创建项目 | 需求创建者 | OWNED_RESOURCE | 否 | 否 | 否 | 报价有效；需求可选择 | 高敏 | 不得接受自己伪造的对手报价 |
| `quote.reject` | 拒绝本人收到的报价 | 需求创建者 | OWNED_RESOURCE | 否 | 否 | 否 | 报价 submitted；需求未终结 | 高敏 | 不得影响其他需求/报价 |

## 6. 消息与文件（4）

| 能力代码 | 业务含义 | 默认拥有者 | 数据范围 | 认证 | 组织 | 项目 | 状态限制 | 敏感 | 职责分离 |
|---|---|---|---|---|---|---|---|---|---|
| `message.start` | 基于有权资源发起会话 | 资源参与者 | OWNED_RESOURCE/PROJECT/ORGANIZATION/ASSIGNED_RESOURCE | 条件 | 条件 | 条件 | 资源关系有效；非拉黑/撤权 | 是 | 否 |
| `message.read` | 读取参与会话 | 会话参与者 | SELF/PROJECT/ORGANIZATION | 否 | 条件 | 条件 | 参与关系和资源授权仍有效 | 是 | 否 |
| `message.send` | 向参与会话发消息 | 会话参与者 | SELF/PROJECT/ORGANIZATION | 否 | 条件 | 条件 | 会话 active；资源未撤权 | 是 | 否 |
| `file.access` | 通用文件预览/下载基础能力 | 文件所有者或资源授权主体 | OWNED_RESOURCE/PROJECT/ORGANIZATION/PUBLIC | 条件 | 条件 | 条件 | file available；安全扫描；保密检查 | 高敏 | 安全审计证据只读 |

## 7. 平台职务（14）

| 能力代码 | 业务含义 | 默认职务 | 数据范围 | 认证 | 组织 | 项目 | 状态限制 | 敏感 | 职责分离 |
|---|---|---|---|---|---|---|---|---|---|
| `platform.workspace.access` | 进入最小平台工作台 | 任一有效平台职务 | PLATFORM_ASSIGNED | 否 | 否 | 否 | position active/未过期 | 是 | 否 |
| `platform.certification.queue_read` | 查看分配认证队列 | 初审/复审 | PLATFORM_ASSIGNED | 否 | 否 | 否 | 案件分配有效 | 高敏 | 只看分配案件 |
| `platform.certification.document_read` | 查看认证材料 | 初审/复审 | PLATFORM_ASSIGNED | 否 | 否 | 否 | 访问目的+短签名+水印 | 高敏 | 访问审计；不得导出原件 |
| `platform.certification.review_initial` | 认证初审 | 初审员 | PLATFORM_ASSIGNED | 否 | 否 | 否 | pending；案件分配 | 高敏 | 与 final reviewer 不同 |
| `platform.certification.review_final` | 认证复审/终审 | 复审员 | PLATFORM_ASSIGNED | 否 | 否 | 否 | 初审完成；案件分配 | 高敏 | 与 initial reviewer 不同 |
| `platform.certification.revoke` | 撤销有效认证 | 认证治理授权职务 | PLATFORM_ASSIGNED | 否 | 否 | 否 | approved；有证据和二次确认 | 高敏 | 不得撤销自己审批以掩盖记录 |
| `platform.complaint.read` | 查看被分配投诉 | 客服/调查/裁定 | PLATFORM_ASSIGNED | 否 | 否 | 否 | 案件分配有效 | 高敏 | 最小字段 |
| `platform.complaint.investigate` | 调查、补证和协商 | 调查员 | PLATFORM_ASSIGNED | 否 | 否 | 否 | under_review 等 | 高敏 | 原则上不得裁定同案 |
| `platform.complaint.decide` | 作出投诉裁定 | 裁定员 | PLATFORM_ASSIGNED | 否 | 否 | 否 | decision_pending；证据完备 | 高敏 | 与调查员不同，例外需双人复核 |
| `platform.finance.read` | 查看分配财务记录 | 财务审核/资金执行 | PLATFORM_ASSIGNED | 否 | 否 | 否 | 案件分配有效 | 高敏 | 执行人只看必要字段 |
| `platform.finance.review` | 审核退款/结算 | 财务审核员 | PLATFORM_ASSIGNED | 否 | 否 | 否 | pending review；二次确认 | 高敏 | 不得执行同一资金动作 |
| `platform.funds.execute` | 执行退款/释放 | 资金执行员 | PLATFORM_ASSIGNED | 否 | 否 | 否 | 已由他人审核；幂等键有效 | 高敏 | 与 reviewer 不同 |
| `platform.audit.read` | 读取安全/权限审计 | security_auditor | PLATFORM_ASSIGNED/PLATFORM_ALL(极少) | 否 | 否 | 否 | 职务有效；只读 | 高敏 | 不得修改被审计记录 |
| `platform.permission.manage` | 分配/撤销平台职务与授权 | permission_administrator | PLATFORM_ASSIGNED | 否 | 否 | 否 | 二次确认；目标范围不高于本人 | 高敏 | 禁止自授 super admin/PLATFORM_ALL |

## 8. 职务最小模板与显式拒绝

| 职务 | 默认能力 | 明确不拥有 |
|---|---|---|
| `customer_service` | workspace access, complaint read | 调查、裁定、财务、认证材料、权限管理 |
| `certification_initial_reviewer` | queue/document read, review initial | review final |
| `certification_final_reviewer` | queue/document read, review final | review initial |
| `complaint_investigator` | complaint read/investigate | complaint decide |
| `complaint_decider` | complaint read/decide | complaint investigate |
| `finance_reviewer` | finance read/review | funds execute |
| `funds_executor` | finance read/funds execute | finance review |
| `security_auditor` | workspace access/audit read | 所有被审计业务写能力 |
| `permission_administrator` | workspace access/permission manage | 自授 `super_administrator` 或 `PLATFORM_ALL` |
| `super_administrator` | 目录管理及紧急授权入口 | 仍受职责分离、资源状态、保密和审计约束 |

未注册能力、deprecated 且无替代映射的能力、或无法解析数据范围的请求一律 `DEFAULT_DENY`。
