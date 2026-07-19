Document Status: FROZEN
Spec Version: 0.6.0
Updated At: 2026-07-15
Code Baseline Commit: 34f96defd6fa82274730fcb22ae8aeca560353f5
Approved By: User Approved
Replaces: Previous role matrix without permission item IDs
Change Summary: 按审查清单重建角色到 Audit 的双向映射，修复审核角色与商家/回收方审查覆盖
Revision Addendum: R2 CANDIDATE（前台位置最小权限与隐私边界）
Revision Baseline Commit: 05c0a9751978760448174cc1b7f8b5638358c8af

# 角色权限矩阵

## 1. 说明

- 本矩阵保持 11 个角色 / 权限项，不新增业务范围，只补齐编号和反向引用能力。
- 权限以后端为准，前端显隐只作为辅助，不能替代后端校验。

## 2. 角色矩阵

| 权限项编号 | 角色 | 页面访问 | 列表查看 | 详情查看 | 创建 | 修改 | 删除 | 提交报价 | 接受报价 | 项目操作 | 物品管理 | 置换 | 回收报价 | 订单操作 | 退款 | 投诉 | 文件访问 | 后台操作 | 后端权限依据 | 当前实现状态 | 对应审查编号 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ROLE-001 | 未登录访客 | 公开页 | 可 | 可 | 不可 | 不可 | 不可 | 不可 | 不可 | 不可 | 不可 | 不可 | 不可 | 不可 | 不可 | 不可 | 不可 | 不可 | publicProcedure；定位仅客户端内存或手动地区，不能写服务端偏好 | 已实现 | AUDIT-001; AUDIT-003; AUDIT-004; AUDIT-005; AUDIT-006; AUDIT-011; AUDIT-012; AUDIT-013; AUDIT-014; AUDIT-015; AUDIT-016; AUDIT-017; AUDIT-018; AUDIT-019; AUDIT-020; AUDIT-021; AUDIT-022; AUDIT-023; AUDIT-024; AUDIT-025; AUDIT-090; AUDIT-091; AUDIT-092; AUDIT-093; AUDIT-094; AUDIT-095; AUDIT-143; AUDIT-154; AUDIT-155; AUDIT-156 |
| ROLE-002 | 普通用户 | 公开页 + 个人中心 | 可 | 可 | 可 | 可 | 受限 | 不可 | 可 | 仅本人参与项目 | 可 | 可 | 不可 | 参与方可 | 可申请 | 可 | 受权限控制 | 不可 | protectedProcedure + 归属校验；位置偏好只允许本人写入，公开查询不返回坐标 | 已实现待验证 | AUDIT-001; AUDIT-002; AUDIT-007; AUDIT-008; AUDIT-009; AUDIT-010; AUDIT-026; AUDIT-027; AUDIT-028; AUDIT-029; AUDIT-030; AUDIT-031; AUDIT-032; AUDIT-033; AUDIT-034; AUDIT-035; AUDIT-036; AUDIT-037; AUDIT-038; AUDIT-039; AUDIT-040; AUDIT-041; AUDIT-042; AUDIT-043; AUDIT-044; AUDIT-045; AUDIT-046; AUDIT-047; AUDIT-048; AUDIT-049; AUDIT-050; AUDIT-051; AUDIT-052; AUDIT-053; AUDIT-054; AUDIT-055; AUDIT-056; AUDIT-057; AUDIT-058; AUDIT-059; AUDIT-060; AUDIT-061; AUDIT-062; AUDIT-063; AUDIT-064; AUDIT-065; AUDIT-066; AUDIT-067; AUDIT-068; AUDIT-069; AUDIT-070; AUDIT-072; AUDIT-073; AUDIT-074; AUDIT-075; AUDIT-076; AUDIT-077; AUDIT-078; AUDIT-079; AUDIT-080; AUDIT-081; AUDIT-082; AUDIT-083; AUDIT-084; AUDIT-085; AUDIT-086; AUDIT-087; AUDIT-088; AUDIT-089; AUDIT-090; AUDIT-091; AUDIT-092; AUDIT-093; AUDIT-094; AUDIT-095; AUDIT-118; AUDIT-119; AUDIT-120; AUDIT-121; AUDIT-122; AUDIT-123; AUDIT-124; AUDIT-125; AUDIT-126; AUDIT-127; AUDIT-128; AUDIT-129; AUDIT-130; AUDIT-131; AUDIT-132; AUDIT-133; AUDIT-134; AUDIT-135; AUDIT-136; AUDIT-137; AUDIT-138; AUDIT-139; AUDIT-140; AUDIT-145; AUDIT-146; AUDIT-147; AUDIT-148; AUDIT-149; AUDIT-150; AUDIT-151; AUDIT-152; AUDIT-153; AUDIT-154; AUDIT-155; AUDIT-156; AUDIT-157; AUDIT-158 |
| ROLE-003 | 工程师申请中 | 同普通用户 | 可 | 可 | 可 | 可 | 受限 | 不可 | 可看但不可正式提交 | 不可正式履约 | 可 | 可 | 不可 | 参与方可 | 可申请 | 可 | 受权限控制 | 不可 | engineerStatus != active 时禁止正式工程师动作 | 部分实现 | AUDIT-083 |
| ROLE-004 | 已认证工程师 | 工程师相关页面 | 可 | 可 | 可 | 可 | 受限 | 可 | 不可 | 可履约、交付、提交里程碑 | 可 | 可 | 不可 | 参与方可 | 可申请 | 可 | 项目成员可 | 不可 | assertEngineerApproved + 项目成员校验 | 部分实现 | AUDIT-034; AUDIT-035; AUDIT-036; AUDIT-037; AUDIT-038; AUDIT-039; AUDIT-040; AUDIT-041; AUDIT-042; AUDIT-043; AUDIT-044; AUDIT-045; AUDIT-046; AUDIT-121; AUDIT-122; AUDIT-123 |
| ROLE-005 | 商家申请中 | 同普通用户 | 可 | 可 | 可 | 可 | 受限 | 不可 | 不可 | 不可 | 可 | 可 | 不可 | 参与方可 | 可申请 | 可 | 受权限控制 | 不可 | merchantStatus != active 时禁止商家动作 | 部分实现 | AUDIT-084 |
| ROLE-006 | 已认证商家/回收方 | 商家相关页面 | 可 | 可 | 可 | 可 | 受限 | 不可 | 不可 | 不可 | 可 | 可 | 可 | 参与方可 | 可申请 | 可 | 相关文件可 | 不可 | assertMerchantApproved + 归属校验 | 部分实现 | AUDIT-071 |
| ROLE-007 | 运营角色 | 后台投诉等入口 | 可 | 可 | 可发运营动作 | 可 | 受限 | 不适用 | 不适用 | 可处理投诉相关流程 | 不适用 | 不适用 | 不适用 | 可看相关单据 | 可看 | 可处理 | 可按权限看 | 可 | permissionProcedure(complaint.*) | 部分实现 | AUDIT-096 |
| ROLE-008 | 审核角色 | 后台认证入口 | 可 | 可 | 可发审核动作 | 可 | 受限 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 可按权限查看认证文件 | 可 | permissionProcedure(verification.*) | 部分实现 | AUDIT-141 |
| ROLE-009 | 财务角色 | 后台财务入口 | 可 | 可 | 可发退款 / 结算动作 | 可 | 受限 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 可处理订单相关财务动作 | 可处理 | 可看 | 可按权限看 | 可 | permissionProcedure(finance.*) | 部分实现 | AUDIT-097 |
| ROLE-010 | 审计角色 | 后台审计入口 | 可 | 可 | 不可 | 不可 | 不可 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 不适用 | 只读 | 只读 | 只读 | 可按权限看 | 可 | permissionProcedure(audit.read) | 部分实现 | AUDIT-098 |
| ROLE-011 | 管理员 | 全部后台页 | 可 | 可 | 可 | 可 | 受限高风险 | 视业务身份而定 | 视业务身份而定 | 视业务成员与后台权限而定 | 视业务归属而定 | 视业务归属而定 | 视业务归属而定 | 可看财务与投诉 | 可 | 可 | 可 | 可 | adminProcedure + ROLE_PERMISSIONS.admin | 部分实现 | AUDIT-096; AUDIT-097; AUDIT-098; AUDIT-141; AUDIT-142; AUDIT-144 |
