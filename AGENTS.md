# 生活帮 Codex 开发规则

## 项目技术栈

- Expo 54 / React Native 0.81 / Expo Router
- TypeScript
- Express + tRPC
- MySQL 8 + Drizzle ORM
- TanStack Query
- NativeWind
- pnpm

禁止更换为 NestJS、PostgreSQL、Prisma 或其他技术栈，除非任务文档明确要求。

## 稳定基线

当前本地稳定业务基线为 V3.2.4。产品主线为 V3.3-A 身份组织权限底座，金额迁移作为跨阶段技术专项按资金门禁推进。

开始任务前必须阅读：

- docs/strategy/SHENGHUOBANG_FINAL_PRODUCT_FORM.md
- docs/architecture/IDENTITY_ORGANIZATION_PERMISSION_ARCHITECTURE.md
- docs/execution/DEVELOPMENT_EXECUTION_INDEX.md
- docs/execution/SHENGHUOBANG_MASTER_DEVELOPMENT_BLUEPRINT.md
- docs/execution/V3_3_TO_V4_SYSTEMATIC_DEVELOPMENT_PLAN.md
- docs/execution/MASTER_STAGE_DELIVERY_MATRIX.md
- docs/strategy/END_STATE_APP_INFORMATION_ARCHITECTURE.md
- docs/architecture/CORE_DOMAIN_INTEGRATION_BLUEPRINT.md
- 当前阶段及当前批次任务书
- README.md
- todo.md
- design.md
- PHASE3_1_CHANGES.md
- PHASE3_1_1_CHANGES.md
- PHASE3_1_2_CHANGES.md
- PHASE3_2_CHANGES.md
- package.json
- drizzle/schema.ts


## 当前任务边界

当前唯一允许启动的是 `V3.3-A / A1`。A1 只产出数据字典、迁移矩阵、能力目录、授权决策、脱敏矩阵、状态机、路由清单和测试矩阵。不得创建迁移、修改业务接口、开发创意页面或自动进入 A2。

旧的 V3.3.0 Phase 2、V3.3.1 云平台、V3.3.2 身份安全等 1.0 版阶段文件仅作历史参考，不是当前执行入口。

## 身份权限规则

- 账号不等于业务身份。
- 身份不等于认证。
- 组织岗位不等于项目角色。
- 平台后台职务不等于普通业务身份。
- 权限采用 RBAC + ABAC + Data Scope + Field Mask。
- 客户端工作台只控制导航，服务端授权才是安全边界。
- 新行业参与者通过身份类型、组织类型、认证类型和能力扩展，不向 `users.role` 无限增加枚举。
- 所有高风险拒绝使用稳定 reasonCode；敏感允许/拒绝和权限变化写审计。

## 开发规则

- GitHub 不是本地开发前置条件，但必须保留本地 Git 或等价的可追溯提交记录。
- 不直接修改稳定基线；每个阶段使用独立本地分支或独立提交序列。
- 不删除已有迁移。
- 不修改已经发布迁移的内容。
- Schema 变化必须生成新的 Drizzle 迁移。
- 不使用前端隐藏按钮代替后端权限。
- 不允许直接修改订单、支付、项目或投诉的最终状态。
- 资金、信用和审计必须保留不可静默覆盖的记录。
- 正式业务不能只保存在聊天消息中。
- 不使用大量 any。
- 不把密钥、Token、密码或真实 .env 提交到 Git。
- 不提交 node_modules、dist、web-dist、.expo、uploads 或缓存。

## 金额规则

当前历史系统使用整元 INT 和部分 DECIMAL 账本。

V3.3.0 第一阶段已经建立金额迁移前置契约，但旧业务列仍保持原语义。除非当前任务明确进入影子列或切换阶段，否则：

- 不允许引入小数业务金额。
- 不允许静默混用元、分和 DECIMAL。
- 所有金额必须经过后端校验。

## 外部服务

没有真实账号、证书或密钥时：

- 可以实现 Provider、适配器、沙箱和 Stub。
- 必须明确标注尚未连接生产服务。
- 不得声称真实支付、推送、核验或病毒扫描已完成。

## 必须验证

每次任务至少运行：

```bash
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm build:web
```

涉及数据库、支付、投诉、物品、消息、文件或 WebSocket 时，还必须运行对应的 MySQL 集成脚本。V3.2.1 的完整命令为：

```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm test:integration:mysql
pnpm test:integration:v32
pnpm test:migrations:empty
```

## 仓库结构与启动方式

- `app/`：Expo Router 页面。
- `components/`、`hooks/`、`lib/`：客户端组件、Hooks 和基础设施。
- `server/`：Express、tRPC、领域服务、Provider 和 WebSocket。
- `drizzle/`：数据库 Schema、不可变迁移和元数据。
- `scripts/`：种子、管理员和可重复集成验证脚本。
- `tests/`：Vitest 单元测试。
- `docs/tasks/`：阶段任务原文；执行前必须完整阅读对应文档。

本地完整启动使用 `pnpm dev`；仅后端使用 `pnpm dev:server`；仅 Web 使用 `pnpm dev:metro`。生产验证必须先 `pnpm build`，再用完整生产测试环境变量执行 `pnpm start`。

## 什么算完成

- 任务文档的开发、迁移、测试、构建、文档和交付项均有实际结果。
- TypeScript、ESLint、全部既有测试、相关 MySQL 集成测试、后端构建和 Web 导出通过。
- 空库迁移和指定旧版本升级均通过，迁移脚本已提交且旧迁移未被改写。
- `/api/health`、`/api/ready` 和任务涉及的主要运行路径已实际检查。
- README、todo、阶段变更说明与真实实现一致；Stub 和未接外部服务明确列为未完成。
- 工作树不包含密钥、`.env`、依赖目录、构建产物、上传文件或缓存。
- 阶段必须本地提交并生成干净源码归档；只有任务明确要求远程协作或发布时才推送并创建 PR，未经授权不得自动合并或发布 Release。
