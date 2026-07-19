Document Status: FINAL
Spec Version: 1.0.0
Updated At: 2026-07-19
Source Baseline: V3.2.4 stable business baseline + V3.3.0 amount foundation

# V3.3 产品主路线系统重构报告

## 1. 重构原因

旧规划以金额迁移、云环境和支付为版本主顺序，未充分呈现生活帮最终产品形态，也未解决多身份、组织、项目成员、数据隔离和专业工作台承载问题。

本次按用户确认的顺序重构为：

身份与组织权限底座 → 创意落地最小闭环 → 生产协作 → 产品数字档案与流转 → 回收材料闭环。

## 2. 本次完成

- 冻结生活帮最终正式定位、三层产品结构、用户群体、三大闭环和品牌表达；
- 明确一个 App、统一账号、多身份、多组织和多工作台的最终客户端形态；
- 建立 Account、Business Identity、Qualification、Organization、Project Role、Platform Staff Assignment 六层参与者模型；
- 建立 RBAC + ABAC + Data Scope + Field Mask 权限模型；
- 将现有 needs、quotes、projects、files、items、listings、orders、资金、消息、投诉和审计映射到最终平台；
- 将产品主路线统一为 V3.3-A、V3.3-B、V4.1、V4.2、V4.3；
- 为五个主阶段建立逐批数据、API、页面、测试、真机和交付矩阵；
- 为 V3.3-A A1-A7 建立独立任务卡；
- 将金额、云环境、支付、安全、AI、位置和发布质量改为跨阶段技术轨；
- 把旧 1.0 阶段文件统一标记为 SUPERSEDED_FOR_EXECUTION，避免工具误启动旧任务；
- 将当前唯一启动任务锁定为 V3.3-A / A1。

## 3. 未修改

- 未修改业务代码；
- 未创建数据库迁移；
- 未修改 V3.2.4 冻结规范和验收证据；
- 未执行 V3.3-A A1 的具体规格产出；
- 未开始 A2 或创意、生产、生命周期、回收模块开发；
- 未接正式支付或生产外部服务。

## 4. 当前唯一下一步

执行 `docs/execution/stages/V3_3_A_BATCH1_CODEX_TASK.md`。

A1 完成后必须先检查：数据字典、迁移矩阵、能力目录、授权决策、字段脱敏、状态机、路由改造和安全测试矩阵，再决定是否进入 A2。

## 5. 验证结果

- Markdown 相对链接检查通过；
- 产品规范校验通过；
- 冻结规范统计保持：144 features、149 audits、54 routes、141 procedures；
- 无重复 ID、反向映射错误或 ACTIVE 文档元数据缺失。
