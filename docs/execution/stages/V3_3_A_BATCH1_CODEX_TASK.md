Document Status: READY_TO_EXECUTE
Spec Version: 1.0.0
Updated At: 2026-07-19
Parent Stage: V3.3-A

# Codex 任务：V3.3-A / A1 规格与权限威胁模型

## 任务目标

只完成身份、认证、组织、项目成员、平台职务和授权模型的规格冻结。不得创建迁移，不得修改业务接口和页面。

## 必须检查

- `drizzle/schema.ts`
- `server/routers.ts`
- `server/auth/permissions.ts`
- `server/_core/trpc.ts`
- `server/_core/fileRoutes.ts`
- `lib/role-context.tsx`
- 认证、项目、消息、后台和文件访问相关页面/测试
- 当前 V3.2.4 冻结文档，只读参考

## 必须输出

建议在 `docs/execution/v3.3-a-a1/` 中形成以下独立文件，避免把所有规格塞进一个报告：

- `DATA_DICTIONARY.md`
- `LEGACY_MIGRATION_MATRIX.md`
- `CAPABILITY_CATALOG.md`
- `AUTHORIZATION_DECISION_MATRIX.md`
- `FIELD_MASKING_MATRIX.md`
- `STATE_MACHINES.md`
- `ROUTE_MIGRATION_INVENTORY.md`
- `SECURITY_TEST_MATRIX.md`
- `A1_EXECUTION_REPORT.md`

内容必须覆盖：

1. V3.3-A 数据字典：每张新增表、字段、索引、唯一约束、外键和删除策略。
2. 旧字段迁移矩阵：来源、目标、回填规则、冲突规则、回滚方法。
3. 能力目录第一版：能力代码、资源类型、默认数据范围、可授予主体。
4. 授权决策表：身份、组织、项目、资源所有权、状态、保密级别和职责分离。
5. 字段脱敏矩阵：个人信息、报价、图纸、财务、质检和历史所有者数据。
6. 状态机：身份、认证、组织、成员、邀请、项目成员和平台职务。
7. 第一批路由改造清单，逐接口标注当前判断、目标能力和风险。
8. 测试矩阵，至少覆盖跨组织、非成员、停职、离职、NDA、职责分离和并发邀请。
9. A1 执行报告，明确未修改业务代码和下一批 A2 输入。

## 约束

- 不增加几十种固定角色。
- 不以客户端 currentRole 作为权限依据。
- 不删除旧表或旧字段。
- 不修改 V3.2.4 冻结证据。
- 不开始创意、生产、生命周期或回收业务开发。
- 不提交、推送或创建 PR，除非用户随后明确要求。

## 验证

```bash
pnpm validate:product-specs
pnpm check:markdown-links
git diff --check
```

如现有冻结校验不允许新增 ACTIVE 规划文档，应调整校验范围而不是篡改冻结状态。

## 停止点

完成文档和验证后立即停止，报告新增文件、变更文件、未决设计问题和 A2 是否具备输入条件。不得自动进入 A2。
