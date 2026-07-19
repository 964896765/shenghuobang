Document Status: ACTIVE
Spec Version: 1.0.0
Updated At: 2026-07-19

# 本地开发与交付工作流

## 1. 目录建议

```text
生活帮/
├─ baseline/
│  └─ shenghuobang-v3.2.4-source/       # 只读历史基线
├─ work/
│  └─ shenghuobang/                     # 唯一日常开发目录
├─ releases/
│  ├─ v3.3.0-phase1/
│  ├─ v3.3.0-phase2/
│  └─ ...
└─ database-backups/                    # 不放入源码包
```

不要反复解压多个相似项目后同时修改。日常只编辑 `work/shenghuobang`。

## 2. 本地 Git 而非强制 GitHub

GitHub 上传不是开发前置条件，但建议在 `work/shenghuobang` 中保留本地 Git：

```bash
git init
git add .
git commit -m "chore: establish local v3.3 baseline"
```

每个实施批次完成后做一次本地提交。只有以下情况再上传 GitHub：

- 一个完整版本通过全部门禁。
- 需要远程协作、CI 或代码审查。
- 准备正式发布和创建 Release。

## 3. 每阶段操作

1. 阅读执行总索引和当前任务书。
2. 记录开始基线和数据库备份标识。
3. 完成一个实施批次，不跨阶段顺手开发。
4. 运行该批次和全局门禁。
5. 更新任务书、报告和问题清单。
6. 本地提交。
7. 阶段全部完成后运行 `pnpm source:archive`。
8. 把源码 zip、执行报告和数据库迁移报告放入对应 `releases/` 目录。

## 4. 交付包命名

```text
shenghuobang-v3.3.0-phase2-source.zip
V3_3_0_PHASE2_REPORT.md
V3_3_0_PHASE2_ISSUES.md
V3_3_0_PHASE2_MIGRATION_REPORT.md
SHA256SUMS.txt
```

源码 zip 不包含数据库备份。数据库备份单独加密保存。

## 5. 禁止事项

- 不把 `node_modules`、`.git`、`dist`、`web-dist`、`.expo`、uploads 或真实 `.env` 打包。
- 不通过复制整个 100MB 以上目录作为日常版本控制。
- 不修改已执行的 Drizzle 迁移。
- 不在一个阶段未验收时同时开发多个高风险领域。
- 不把“代码写完”当成阶段完成，迁移、测试、报告和回滚缺一不可。
