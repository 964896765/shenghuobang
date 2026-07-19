Document Status: RELEASE CANDIDATE
Spec Version: 1.0
Updated At: 2026-07-17
Code Baseline Commit: 05c0a9751978760448174cc1b7f8b5638358c8af
Approved By: Pending User Approval

# V3.2.4 GitHub 仓库清理报告

## 1. 扫描结论

- 清理前：282 个跟踪文件、20 个 `docs/**` 文件、34 个跟踪 Markdown。
- 跟踪文件中没有 `.txt`、`.log`、`.zip`、`.apk` 或 `.aab`。
- 根目录 13 个 Markdown 均为当前工程规则、入口说明、设计/TODO 或历史阶段交付记录；没有安全证据证明可直接删除。
- 本地存在 6 个未跟踪 PDF，已由本地 `.git/info/exclude` 排除，不属于 GitHub 仓库，本轮未读取、删除或提交。
- 新增位置规范、R2 修订、清理报告、发布说明和 RC 报告后，最终为 39 个跟踪 Markdown；增加来自正式交付，不是残留文件。
- 实际删除：0；实际移动：0。保守保留避免破坏 README、AGENTS、任务、迁移及历史审计引用。

## 2. 候选分类

| 文件路径 | 当前用途 | 仍被引用 | 脚本/CI 使用 | 重复情况 | 建议动作 | 风险 | 替代文件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `README.md` | 项目入口、启动与能力边界 | 是 | 间接 | 无 | KEEP | 删除会失去工程入口 | 无 |
| `AGENTS.md` | 仓库工程规则和完成定义 | 是 | Codex 工作流 | 无 | KEEP | 删除会失去开发约束 | 无 |
| `todo.md` | 当前完成与待办状态 | 是 | AGENTS/任务引用 | 少量与 README 重叠 | KEEP | 移动会破坏固定入口 | 无 |
| `design.md` | 早期架构与设计背景 | 是 | AGENTS/任务引用 | 与 product 文档部分重叠 | REVIEW_REQUIRED | 合并可能丢失历史设计依据 | `docs/product/*` |
| `PHASE1_CHANGES.md` | V1 历史交付记录 | 否 | 否 | 不重复 | ARCHIVE | 有历史审计价值，不直接删除 | 未来 `docs/archive/` |
| `PHASE2_CHANGES.md` | V2 历史交付记录 | README | 否 | 不重复 | KEEP | 移动需同步稳定链接 | 无 |
| `PHASE3_1_CHANGES.md` | V3.1 发布与迁移说明 | README/AGENTS | 否 | 不重复 | KEEP | 数据库升级资料禁止删除 | 无 |
| `PHASE3_1_1_CHANGES.md` | V3.1.1 修复与迁移说明 | README/AGENTS | 否 | 不重复 | KEEP | 数据库升级资料禁止删除 | 无 |
| `PHASE3_1_2_CHANGES.md` | V3.1.2 修复与迁移说明 | README/AGENTS | 否 | 不重复 | KEEP | 数据库升级资料禁止删除 | 无 |
| `PHASE3_2_CHANGES.md` | V3.2 基础说明 | AGENTS | 否 | 不重复 | KEEP | 仍是稳定基线背景 | 无 |
| `PHASE3_2_1_CHANGES.md` | V3.2.1 稳定性说明 | README | 否 | 不重复 | KEEP | 文件/WebSocket/CI 审计价值 | 无 |
| `PHASE3_2_2_CHANGES.md` | V3.2.2 产品收口说明 | README | 否 | 不重复 | KEEP | 业务迁移与验证资料 | 无 |
| `PHASE3_2_3_CHANGES.md` | V3.2.3 移动端说明 | README | 否 | 不重复 | KEEP | EAS/Push/真机历史资料 | 无 |
| `docs/tasks/*.md` | 已执行任务原文与验收依据 | 是 | AGENTS 约定 | 不重复 | ARCHIVE | 仍有审计价值，本轮保留原路径 | 未来 `docs/archive/tasks/` |
| `docs/testing/V3_2_4_INITIAL_GAP_ANALYSIS.md` | 冻结前差距分析 | 是 | 规格追踪 | 与最终报告阶段不同 | KEEP | 删除会隐藏历史差距 | 最终报告不完全替代 |
| `docs/testing/V3_2_4_ANDROID_VALIDATION_REPORT.md` | 144 项真机正式记录 | 是 | 发布门槛 | 无 | KEEP | 明确禁止删除或改写历史 | 无 |
| `expo-env.d.ts` | Expo 自动类型入口 | `tsconfig.json` | TypeScript | 生成但仍被显式 include | KEEP | 删除会影响全新 checkout 类型检查 | Expo 重新生成但 CI 时机不保证 |

## 3. 忽略规则收口

`.gitignore` 已明确覆盖：`artifacts/`、APK/AAB、keystore/JKS、`.env`/`.env.*`（保留 `.env.example`）、日志、ZIP、Web/Expo/原生生成输出。正式源码、迁移、测试和规范未被忽略。

## 4. REVIEW_REQUIRED

- `design.md`：与正式 product 文档存在部分重叠，但仍被 AGENTS 和历史任务直接引用；建议后续独立文档迁移 PR 合并，不在 RC 分支处理。
- `PHASE1_CHANGES.md` 与 `docs/tasks/*.md`：适合未来归档，但仍具有审计价值；本轮不移动，避免扩大链接变更。

## 5. 安全与断链

- 新增 `pnpm check:markdown-links` 检查所有跟踪 Markdown 的本地相对链接。
- 提交前扫描本机绝对路径、局域网 IP、工作树路径、数据库变量、Token、私钥和构建产物。
- `artifacts/` 和 RC 二进制只保留本地，不提交。
