-- V3.3-A / A2.1 frozen directory seed baseline
-- manifestVersion: v3.3-a2-seed-1
-- migrationVersion: v3.3-a2.0.0
-- canonicalJsonSha256: 95d0178c6e304247b4ba9d7370f21831026e7b6e08e93aaec7bebd9ecb2fb983
-- seedDataSha256: bcf102f7d379424bba5e8dd025c3e5563531111489097c162716c6b3b4a348bb
-- expectedCounts: identity_types=10, certification_types=3, capabilities=68, project_roles=9
-- Duplicate codes are accepted only when every published semantic field is identical.
-- A semantic drift deliberately attempts to write NULL to the NOT NULL code and aborts.

INSERT INTO `identity_types` (`code`, `name`, `description`, `requiresCertification`, `isSystem`, `status`, `deletedAt`) VALUES
  ('consumer', '普通用户', '平台默认消费与需求发布身份', 0, 1, 'active', NULL),
  ('designer', '设计师', '提供设计方案与设计协作的专业身份', 1, 0, 'active', NULL),
  ('engineer', '工程师', '提供工程技术服务的专业身份', 1, 0, 'active', NULL),
  ('merchant', '商家', '提供商品或商业服务的经营身份', 1, 0, 'active', NULL),
  ('repair_provider', '维修服务商', '提供维修与维护服务的专业身份', 1, 0, 'active', NULL),
  ('manufacturer', '制造商', '承担产品制造与交付的组织或专业身份', 1, 0, 'active', NULL),
  ('supplier', '供应商', '提供材料、设备或配套服务的身份', 1, 0, 'active', NULL),
  ('inspection_provider', '检验服务商', '提供独立检验与质量验证的专业身份', 1, 0, 'active', NULL),
  ('recycler', '回收服务商', '提供回收、再利用与处置服务的身份', 1, 0, 'active', NULL),
  ('enterprise_representative', '企业代表', '代表已授权企业参与平台业务的身份', 1, 0, 'active', NULL) AS new
ON DUPLICATE KEY UPDATE `code` = IF(
      BINARY `identity_types`.`name` <=> BINARY new.`name`
      AND BINARY `identity_types`.`description` <=> BINARY new.`description`
      AND BINARY `identity_types`.`requiresCertification` <=> BINARY new.`requiresCertification`
      AND BINARY `identity_types`.`isSystem` <=> BINARY new.`isSystem`
      AND BINARY `identity_types`.`status` <=> BINARY new.`status`
      AND BINARY `identity_types`.`deletedAt` <=> BINARY new.`deletedAt`,
      `identity_types`.`code`,
      NULL
    );
--> statement-breakpoint
INSERT INTO `certification_types` (`code`, `name`, `subjectType`, `reviewMode`, `validityDays`, `sensitiveLevel`, `requirements`, `status`, `deletedAt`) VALUES
  ('real_name', '实名认证', 'identity', 'single', NULL, 'sensitive', NULL, 'active', NULL),
  ('engineer_basic', '工程师基础认证', 'identity', 'two_stage', NULL, 'high_sensitive', NULL, 'active', NULL),
  ('merchant_business_license', '商家营业执照认证', 'either', 'two_stage', NULL, 'high_sensitive', NULL, 'active', NULL) AS new
ON DUPLICATE KEY UPDATE `code` = IF(
      BINARY `certification_types`.`name` <=> BINARY new.`name`
      AND BINARY `certification_types`.`subjectType` <=> BINARY new.`subjectType`
      AND BINARY `certification_types`.`reviewMode` <=> BINARY new.`reviewMode`
      AND BINARY `certification_types`.`validityDays` <=> BINARY new.`validityDays`
      AND BINARY `certification_types`.`sensitiveLevel` <=> BINARY new.`sensitiveLevel`
      AND BINARY `certification_types`.`requirements` <=> BINARY new.`requirements`
      AND BINARY `certification_types`.`status` <=> BINARY new.`status`
      AND BINARY `certification_types`.`deletedAt` <=> BINARY new.`deletedAt`,
      `certification_types`.`code`,
      NULL
    );
--> statement-breakpoint
INSERT INTO `capabilities` (`code`, `domain`, `name`, `description`, `riskLevel`, `defaultAuditMode`, `status`, `replacementCode`, `deletedAt`) VALUES
  ('account.profile.view_self', 'account', '查看本人账号资料', '查看本人账号资料', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('account.profile.update_self', 'account', '修改本人非安全关键资料', '修改本人非安全关键资料', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('identity.list_self', 'identity', '查看本人业务身份', '查看本人业务身份', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('identity.profile.update_self', 'identity', '修改本人业务身份展示/接单资料', '修改本人业务身份展示/接单资料', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('identity.directory.view_public', 'identity', '查看专业身份公开目录/名片', '查看专业身份公开目录/名片', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('identity.create', 'identity', '创建可选业务身份', '创建可选业务身份', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('identity.switch', 'identity', '选择身份工作台偏好', '选择身份工作台偏好', 'normal', 'deny', 'active', NULL, NULL),
  ('identity.suspend', 'identity', '主动停用本人身份', '主动停用本人身份', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('certification.submit_self', 'certification', '提交/补件本人身份认证', '提交/补件本人身份认证', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('certification.view_self', 'certification', '查看本人认证及材料', '查看本人认证及材料', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('organization.create', 'organization', '创建组织并成为首位 owner', '创建组织并成为首位 owner', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('organization.view', 'organization', '查看组织资料', '查看组织资料', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('organization.update', 'organization', '修改组织资料', '修改组织资料', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('organization.member.list', 'organization', '查看成员及岗位', '查看成员及岗位', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('organization.member.invite', 'organization', '发组织邀请', '发组织邀请', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('organization.invitation.accept', 'organization', '接受发给本人的组织邀请', '接受发给本人的组织邀请', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('organization.member.suspend', 'organization', '暂停成员', '暂停成员', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('organization.member.restore', 'organization', '恢复成员', '恢复成员', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('organization.member.remove', 'organization', '移除成员', '移除成员', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('organization.member.leave', 'organization', '主动退出', '主动退出', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('organization.member.assign_position', 'organization', '分配/撤销成员岗位', '分配/撤销成员岗位', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('organization.position.manage', 'organization', '建立岗位及能力模板', '建立岗位及能力模板', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('organization.owner.transfer', 'organization', '所有权二次确认转让', '所有权二次确认转让', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('project.view', 'project', '查看项目详情和允许字段', '查看项目详情和允许字段', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('project.member.list', 'project', '查看项目成员', '查看项目成员', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('project.member.invite', 'project', '邀请项目成员', '邀请项目成员', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('project.invitation.accept', 'project', '接受发给本人/组织的项目邀请', '接受发给本人/组织的项目邀请', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('project.member.remove', 'project', '移除项目成员', '移除项目成员', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('project.role.assign', 'project', '分配项目角色', '分配项目角色', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('project.requirement.edit', 'project', '编辑/确认需求版本', '编辑/确认需求版本', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('project.file.upload', 'project', '上传项目文件', '上传项目文件', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('project.file.view', 'project', '查看文件元数据/预览', '查看文件元数据/预览', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('project.file.download', 'project', '下载项目文件', '下载项目文件', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('project.file.disable', 'project', '禁用本人文件或管理文件', '禁用本人文件或管理文件', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('project.milestone.start', 'project', '开始被分配里程碑', '开始被分配里程碑', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('project.milestone.submit', 'project', '提交交付申请验收', '提交交付申请验收', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('project.milestone.accept', 'project', '验收交付', '验收交付', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('project.milestone.request_revision', 'project', '要求返工', '要求返工', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('project.change.propose', 'project', '发起范围/工期/金额变更', '发起范围/工期/金额变更', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('project.change.approve', 'project', '同意对方变更', '同意对方变更', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('project.finance.view', 'project', '查看项目账本摘要', '查看项目账本摘要', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('project.payment.create', 'project', '从兼容项目入口创建统一支付意图', '从兼容项目入口创建统一支付意图', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('need.view_public', 'need', '查看公开需求摘要', '查看公开需求摘要', 'normal', 'deny', 'active', NULL, NULL),
  ('need.view_owned', 'need', '查看本人完整需求', '查看本人完整需求', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('need.create', 'need', '创建需求草稿', '创建需求草稿', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('need.update', 'need', '修改/发布/关闭本人需求', '修改/发布/关闭本人需求', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('quote.view', 'quote', '查看本人提交或收到的报价', '查看本人提交或收到的报价', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('quote.submit', 'quote', '提交解决方案/报价', '提交解决方案/报价', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('quote.accept', 'quote', '选择报价并创建项目', '选择报价并创建项目', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('quote.reject', 'quote', '拒绝本人收到的报价', '拒绝本人收到的报价', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('message.start', 'message', '基于有权资源发起会话', '基于有权资源发起会话', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('message.read', 'message', '读取参与会话', '读取参与会话', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('message.send', 'message', '向参与会话发消息', '向参与会话发消息', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('file.access', 'file', '通用文件预览/下载基础能力', '通用文件预览/下载基础能力', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('platform.workspace.access', 'platform', '进入最小平台工作台', '进入最小平台工作台', 'sensitive', 'allow_and_deny', 'active', NULL, NULL),
  ('platform.certification.queue_read', 'platform', '查看分配认证队列', '查看分配认证队列', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('platform.certification.document_read', 'platform', '查看认证材料', '查看认证材料', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('platform.certification.review_initial', 'platform', '认证初审', '认证初审', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('platform.certification.review_final', 'platform', '认证复审/终审', '认证复审/终审', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('platform.certification.revoke', 'platform', '撤销有效认证', '撤销有效认证', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('platform.complaint.read', 'platform', '查看被分配投诉', '查看被分配投诉', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('platform.complaint.investigate', 'platform', '调查、补证和协商', '调查、补证和协商', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('platform.complaint.decide', 'platform', '作出投诉裁定', '作出投诉裁定', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('platform.finance.read', 'platform', '查看分配财务记录', '查看分配财务记录', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('platform.finance.review', 'platform', '审核退款/结算', '审核退款/结算', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('platform.funds.execute', 'platform', '执行退款/释放', '执行退款/释放', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('platform.audit.read', 'platform', '读取安全/权限审计', '读取安全/权限审计', 'high', 'allow_and_deny', 'active', NULL, NULL),
  ('platform.permission.manage', 'platform', '分配/撤销平台职务与授权', '分配/撤销平台职务与授权', 'high', 'allow_and_deny', 'active', NULL, NULL) AS new
ON DUPLICATE KEY UPDATE `code` = IF(
      BINARY `capabilities`.`domain` <=> BINARY new.`domain`
      AND BINARY `capabilities`.`name` <=> BINARY new.`name`
      AND BINARY `capabilities`.`description` <=> BINARY new.`description`
      AND BINARY `capabilities`.`riskLevel` <=> BINARY new.`riskLevel`
      AND BINARY `capabilities`.`defaultAuditMode` <=> BINARY new.`defaultAuditMode`
      AND BINARY `capabilities`.`status` <=> BINARY new.`status`
      AND BINARY `capabilities`.`replacementCode` <=> BINARY new.`replacementCode`
      AND BINARY `capabilities`.`deletedAt` <=> BINARY new.`deletedAt`,
      `capabilities`.`code`,
      NULL
    );
--> statement-breakpoint
INSERT INTO `project_roles` (`code`, `name`, `description`, `isSystem`, `status`, `deletedAt`) VALUES
  ('initiator', '发起人', '项目创建与业务发起责任角色', 1, 'active', NULL),
  ('project_lead', '项目负责人', '负责项目协调、成员与交付推进', 1, 'active', NULL),
  ('design_lead', '设计负责人', '负责设计方案与设计协作', 1, 'active', NULL),
  ('engineer', '工程师', '承担工程技术与实施任务', 1, 'active', NULL),
  ('supplier', '供应商', '承担材料、设备或配套供应', 1, 'active', NULL),
  ('manufacturer', '制造商', '承担产品制造与生产交付', 1, 'active', NULL),
  ('inspector', '检验员', '承担独立检验与质量检查', 1, 'active', NULL),
  ('reviewer', '验收人', '承担独立审查与交付验收', 1, 'active', NULL),
  ('viewer', '只读成员', '仅按授权查看项目允许信息', 1, 'active', NULL) AS new
ON DUPLICATE KEY UPDATE `code` = IF(
      BINARY `project_roles`.`name` <=> BINARY new.`name`
      AND BINARY `project_roles`.`description` <=> BINARY new.`description`
      AND BINARY `project_roles`.`isSystem` <=> BINARY new.`isSystem`
      AND BINARY `project_roles`.`status` <=> BINARY new.`status`
      AND BINARY `project_roles`.`deletedAt` <=> BINARY new.`deletedAt`,
      `project_roles`.`code`,
      NULL
    );
--> statement-breakpoint
CREATE TEMPORARY TABLE `_v33_a2_seed_count_guard` (
  `ok` tinyint NOT NULL,
  CONSTRAINT `_v33_a2_seed_count_guard_ck` CHECK (`ok` = 1)
);
--> statement-breakpoint
INSERT INTO `_v33_a2_seed_count_guard` (`ok`)
SELECT IF(
  (SELECT COUNT(*) FROM `identity_types`) = 10
  AND (SELECT COUNT(*) FROM `certification_types`) = 3
  AND (SELECT COUNT(*) FROM `capabilities`) = 68
  AND (SELECT COUNT(*) FROM `project_roles`) = 9,
  1,
  0
);
--> statement-breakpoint
DROP TEMPORARY TABLE `_v33_a2_seed_count_guard`;
