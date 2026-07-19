Document Status: PLANNED
Spec Version: 1.0.0
Updated At: 2026-07-19
Parent Stage: V3.3-A
Depends On: A1 approved

# V3.3-A / A2 数据库迁移与兼容回填任务

## 目标

只实现追加表、索引、约束和旧数据回填。不得切断旧角色/认证/项目字段，不开发 UI。

## 必须完成

1. 根据 A1 数据字典建立迁移；
2. 建立 capability seed，能力代码不可由客户端任意创建；
3. 每个现有账号幂等回填 consumer identity；
4. engineer/merchant profile 与 verification 回填身份、资料和认证；
5. users.role 后台值回填 platform staff assignment；
6. projects.ownerId/engineerId 回填 project members；
7. currentRole 回填 workspace preference；
8. 输出冲突、缺失、无法确定和重复记录报告；
9. 提供空库、V3.2.4 升级、重复运行和备份恢复测试。

## 禁止

- 删除旧列/旧表；
- 修改业务路由读取；
- 自动把个人商家强制迁为组织；
- 跳过冲突并静默猜测。

## 停止点

迁移和回填验证完成后停止，列出 A3 兼容适配需要处理的旧字段。
