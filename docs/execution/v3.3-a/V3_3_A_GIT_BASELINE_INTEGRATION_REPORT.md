# V3.3-A Git 基线归位与整合报告

日期：2026-07-19  
状态：**完成（未 commit、未 push、未创建 PR）**

## 1. 真实仓库、remote、分支和基线

| 项目 | 实际值 |
| --- | --- |
| 真实仓库路径 | `C:\Users\chejun\Documents\生活帮\shenghuobang` |
| origin | `https://github.com/964896765/shenghuobang.git` |
| 远程默认分支 | `origin/main` |
| 整合前分支 | `main` |
| 当前本地分支 | `codex/v3.3-a-identity-authorization` |
| 基线 SHA | `b50e198c19bda33a8c88ab903375c4e1958af71a` |
| origin/main SHA | `b50e198c19bda33a8c88ab903375c4e1958af71a` |
| package version | `3.2.4` |

远程核验通过：本地 main、origin/main 和 origin/HEAD 指向同一 SHA。整合分支从该 SHA 创建，未推送。

### 历史边界说明

恢复后的正式仓库只有一个提交：

```text
b50e198 Initial commit
```

该提交创建于 2026-07-19 17:21（Asia/Shanghai），已经包含 A2—A5、95 张表、0000—0029、授权内核、身份/组织服务和移动端页面。仓库没有 V3.2.4 tag，也没有独立的“纯 V3.2.4 → V3.3-A”提交边界。

因此本轮可以确认“当前 HEAD 的 package 基线为 3.2.4 且包含完整 V3.3-A 工作树”，但不能伪造一个不存在的历史迁移 diff。若后续审计必须逐提交比较 V3.2.4 与 V3.3-A，需要从可信备份导入旧 commit/tag；本轮未改写 main 历史。

## 2. 来源目录和目标目录

`.git` 恢复在原成果目录内，因此来源与真实 Git 工作树为同一目录：

```text
来源：C:\Users\chejun\Documents\生活帮\shenghuobang
目标：C:\Users\chejun\Documents\生活帮\shenghuobang
```

恢复后 `git status` 干净，HEAD 树与当前 A2—A5 文件完全一致。为避免重复覆盖，实际复制文件为 **0**。

## 3. 实际同步文件

没有执行文件复制、覆盖或删除。以下成果已由恢复后的 HEAD 跟踪：

- A2：Schema、0015—0029、migration runner/reporter/CLI/测试和实施报告；
- A3：`server/authorization/`、高风险路由接入和专项测试；
- A4：identity、certification、organization 服务、路由、移动端入口和测试；
- A5：workspace service、工作台/组织页面、角色上下文接入和测试；
- V3.3-A 规范与执行报告。

本轮唯一产生的工作区修改是把此前的“未找到 `.git`”阻断报告更新为本正式整合报告。

## 4. Git 差异统计

创建分支时：

```text
git diff main...codex/v3.3-a-identity-authorization
```

结果为空，因为 A2—A5 已经在 main 的 Initial commit 中。

报告更新后的建议提交范围：

```text
M docs/execution/v3.3-a/V3_3_A_GIT_BASELINE_INTEGRATION_REPORT.md
```

- 新增业务/Schema/迁移文件：0（已由 HEAD 跟踪）；
- 修改业务/Schema/迁移文件：0；
- 删除文件：0；
- Schema diff：空；
- 迁移和 journal diff：空；
- package.json diff：空。

## 5. Schema、迁移与兼容核验

| 检查 | 结果 |
| --- | --- |
| Schema 表数 | 95 |
| SQL 迁移数 | 30 |
| 迁移范围 | 0000—0029 |
| journal 项数 | 30 |
| A3 AuthorizationService | 存在 |
| A4 identity/certification/organization service | 存在 |
| A5 workspace/mobile | 存在 |
| 旧 verification fallback | 保留 |
| projects.ownerId/engineerId 兼容字段 | 保留 |
| 历史迁移工作区修改 | 无 |
| 金额注册表 | 30/30，通过 |

## 6. 文件与敏感信息审计

未跟踪以下构建或本地产物：

```text
.expo/
artifacts/
dist/
node_modules/
web-dist/
```

它们均显示为 ignored，不在 `git ls-tree HEAD` 中。

受控环境模板 `.env.example` 被跟踪；源码归档测试确认它没有被当作秘密文件。Git 跟踪树未检出私钥头、GitHub personal token、AWS access key 或硬编码数据库凭证。

绝对本机路径只出现在执行报告中，用于记录来源/目标路径；未在业务代码、配置、Schema 或迁移中检出。没有复制其他仓库的 `.git`，没有数据库 dump、日志或临时文件进入建议提交范围。

## 7. 依赖处理

`node_modules` 和现有 lockfile 均可用，TypeScript 可以直接执行。依据“只有依赖缺失时才执行 pnpm install”，本轮跳过安装，未升级依赖、未改 lockfile。

## 8. 全部门禁真实结果

| 命令 | 结果 |
| --- | --- |
| `pnpm check` | PASS |
| `pnpm lint` | PASS，0 warning |
| `pnpm check:money:v330` | PASS，30/30 |
| `pnpm validate:product-specs` | PASS |
| `pnpm check:markdown-links` | PASS，105 files / 108 links |
| `pnpm test:v33-a2-backfill` | PASS；数据库集成环境阻断 |
| `pnpm test:v33-a3-authorization` | PASS，18 cases |
| `pnpm test:v33-a3-routes` | PASS，16 cases；数据库集成环境阻断 |
| `pnpm test:v33-a3-integration-fixes` | PASS，13 groups；数据库集成环境阻断 |
| `pnpm test:v33-a4-identity-organization` | PASS，13 cases；数据库集成环境阻断 |
| `pnpm test:v33-a5-workspace-mobile` | PASS，13 cases；数据库集成环境阻断 |
| `pnpm test` | PASS，15 files / 80 tests |
| `pnpm build` | PASS |
| `pnpm build:web` | PASS |

## 9. `.git` 测试恢复

此前失败的源码交付测试现已恢复：

```text
git ls-tree -r --name-only HEAD
```

可以正常读取 447 个跟踪文件，`tests/source-archive.test.ts` 的 2 个测试全部通过。全量结果从 79/80 恢复为 **80/80**。

## 10. 数据库环境

未设置或猜测 `DATABASE_URL`，未连接共享库或生产库。A2/A3/A4/A5 MySQL 集成继续明确标记：

```text
BLOCKED_BY_ENVIRONMENT
```

本轮只运行合成、静态和无数据库门禁。

## 11. 建议提交和排除清单

### 当前建议提交

由于 A2—A5 已在 main/HEAD 中，当前分支实际只建议提交：

```text
docs/execution/v3.3-a/V3_3_A_GIT_BASELINE_INTEGRATION_REPORT.md
```

建议提交说明：

```text
docs(v3.3-a): record restored git baseline and validation evidence
```

### 必须排除

- `.expo/`
- `artifacts/`
- `dist/`
- `node_modules/`
- `web-dist/`
- `.env` 和任何真实环境配置
- token、证书、SSH key、数据库 dump/volume
- 日志、缓存、临时文件和无法解释的构建产物
- 从其他仓库复制的 `.git` 元数据

本轮未 commit、未 push、未创建 PR。

## 12. V3.3-B 结论

当前正式 Git checkout、origin、HEAD、整合分支和 80/80 测试已经恢复，A2—A5 代码事实完整，**具备在 `codex/v3.3-a-identity-authorization` 上正式开始 V3.3-B 开发的代码条件**。

限制是仓库缺少独立 V3.2.4 历史 commit/tag，无法生成纯 V3.2.4 到 V3.3-A 的逐提交差异；这不阻断后续开发，但在最终发布审计前应从可信备份补充历史证据或书面接受该基线限制。数据库集成仍需在明确隔离的 MySQL 8.0.34+ 环境补跑。

本轮按要求停止，不启动 V3.3-B。
