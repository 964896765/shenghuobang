Document Status: ACTIVE
Spec Version: 1.0.0
Updated At: 2026-07-19
Parent Stage: V3.3-A / A2.0
Source Baseline: V3.2.4 schema and migrations 0000-0014

# V3.3-A / A2.0 数据库事实扫描与迁移实施设计

## 1. 审查结论

结论：**STATIC_FACT_SCAN_PASS_WITH_BLOCKERS**。

静态源码事实、15 个历史迁移的字节级基线、A1.1 差异、12 个后续迁移单元、备份/恢复边界和只读预检脚本均已形成。本轮没有修改 `drizzle/schema.ts`、0000—0014、业务/API/页面，也没有执行数据库写入或历史回填。

A2.1 尚不应启动，原因如下：

1. 本机虽有 3306 监听和 MySQL 8.0.41 客户端，但任务环境没有 `DATABASE_URL`/`MYSQL_INTEGRATION_URL`，无密码只读连接被拒绝；实际 server patch、数据库对象、数据分布和 ALTER 规模尚未实测。
2. 当前依赖运行时不完整，`pnpm exec tsx`/`mysql2` 运行入口不可用；本轮按禁止扩张原则没有安装依赖。
3. `project_acceptances.submittedBy` 的真实写入语义与 A1.1 的 reviewer 回填禁令存在事实冲突。A2 仍必须执行 A1.1：历史 reviewer 保持 `NULL` 并写 anomaly；若要改变，必须单独修订 A1.1，不能由 A2 推断。

## 2. 扫描方法与证据边界

- 唯一规范输入为 [A1.1 数据字典](../v3.3-a-a1/DATA_DICTIONARY.md)、[迁移矩阵](../v3.3-a-a1/LEGACY_MIGRATION_MATRIX.md)及同目录其余冻结文件和专项脚本。
- 源码事实来自 `drizzle/schema.ts`、`drizzle/meta/_journal.json`、0000—0014、`drizzle.config.ts`、`package.json`、数据库/测试脚本和只与 `submittedBy` 语义直接相关的当前写路径。
- SQL 文件以原始字节计算 SHA-256；未规范化换行、未重写内容。
- 未取得数据库认证，因此所有 information_schema、行数、孤儿、状态分布和 ALTER 实际耗时结论均标为 **NOT_EXECUTED**。
- 报告不包含数据库凭证、个人信息、地址、文件名、storageKey 或业务正文。

## 3. 当前 Schema 总体事实

| 项目 | 静态事实 |
|---|---|
| 应用表 | 69 张 `mysqlTable`；历史迁移也恰有 69 个 `CREATE TABLE` |
| Drizzle journal | `drizzle/meta/_journal.json` 有 15 条，idx 0—14；实际数据库应另有 `__drizzle_migrations`，但未连接验证 |
| 主键 | 除 `app_schema_versions.version VARCHAR(32)` 外，Schema 表均使用 `INT` 自增 `id` |
| 外键 | 历史 SQL 共 82 个命名 FK；新旧早期表有部分关系只存 INT、Schema 未声明 FK |
| 索引 | Schema 声明 75 个 index/uniqueIndex；最长 45 字符；历史 FK 名最长 58 字符，均低于 MySQL 64 字符上限 |
| 枚举 | 68 个 `mysqlEnum` 列；65 个内联数组，3 个 verification 表共享 `verificationStatuses` |
| 时间列 | 128 个 `timestamp()`；全部为默认秒精度，0 个显式 fsp |
| JSON 列 | 20 个 `json()`；无数据库 JSON 默认值 |
| CHECK | Schema 和 0000—0014 均无 CHECK 约束先例 |
| 命名 | 索引通常 `<table>_<purpose>_idx/unique`；FK 通常 `<child>_<column>_<parent>_<column>_fk` |
| 当前 Schema SHA-256 | `41a0d9856125bce7594c207d10923e5f13723238eef79dac9fe88d08522737f0` |

### 3.1 A2 重点现有表真实字段

| 表 | 当前事实 |
|---|---|
| `users` | `id INT AUTO_INCREMENT PK`；`openId VARCHAR(96) UNIQUE NOT NULL`；phone/email 等列；`accountStatus` 与 6 值旧后台 `role` ENUM；phone 唯一索引 |
| `projects` | `id/needId/quoteId/ownerId/engineerId INT`；owner/engineer 均 NOT NULL；totalAmount INT；15 列；未在 Drizzle 声明这些关系的 FK/索引 |
| `milestones` | 12 列：`id/projectId/title/description/amount/sortOrder/status/deliveryNote/revisionReason/submittedAt/acceptedAt/createdAt`；无现有索引/FK |
| `project_files` | 16 列；`projectId/milestoneId/uploadedBy INT`；`fileName VARCHAR(255)`、`storageKey VARCHAR(500)`；category/status ENUM；唯一 `(fileGroupId,versionNo)` |
| `project_acceptances` | 7 列：`id/projectId/milestoneId/result/comment/submittedBy/createdAt`；`submittedBy INT NOT NULL`；无现有 FK/索引 |
| `stored_files` | 14 列；`ownerId INT FK users.id`；provider/privacy/scan/status ENUM；`storageKey VARCHAR(500) UNIQUE`；SHA 和 owner 索引 |
| `conversations` | 8 列：`id/userAId/userBId/refType/refId/lastMessage/lastMessageAt/createdAt`；无现有 FK/索引 |
| `migration_anomalies` | 已存在，见第 5 节 |

### 3.2 `submittedBy` 真实语义证据

Schema 只声明 `project_acceptances.submittedBy INT NOT NULL`，列名没有 FK 和注释。当前写路径提供了更强事实：

- 验收通过事务写 `submittedBy: ownerId`。
- 退修事务同样写 `submittedBy: ownerId`。
- 交付提交事务只更新 milestone 的提交状态和 note，不创建 acceptance。

因此当前业务代码中的 `project_acceptances.submittedBy` 实际是“提交验收/退修决定的 owner actor”，而不是交付提交者。尽管如此，A1.1 已明确 `submittedBy -> reviewerProjectMembershipId = FORBIDDEN`，A2 不得自行改写该语义。最小实现保持 reviewer 为 `NULL`、生成 `MIG-REVIEWER-UNKNOWN`，并把本事实冲突交由单独规范修订决定。

## 4. 当前数据库对象清单（69 张）

“关键外键/索引”以当前 Drizzle Schema 为准；`-` 表示 Schema 未声明，不代表业务代码没有关系假设。

| 对象 | Schema 位置 | 首次迁移 | PK | 关键外键 | 关键索引/唯一 | A2 影响 |
|---|---:|---|---|---|---|---|
| `users` | `schema.ts:18` | `0000` | `id` | - | `openId`、phone unique | 只读来源/新 FK 父表 |
| `user_profiles` | `schema.ts:53` | `0001` | `id` | - | `userId` unique | 只读预检/回填来源 |
| `user_location_preferences` | `schema.ts:71` | `0014` | `id` | `userId -> users` | user unique、region idx | 无直接 DDL |
| `engineer_profiles` | `schema.ts:88` | `0001` | `id` | - | `userId` unique | 只读预检/回填来源 |
| `merchant_profiles` | `schema.ts:111` | `0001` | `id` | - | `userId` unique | 只读预检/回填来源 |
| `needs` | `schema.ts:128` | `0001` | `id` | - | - | 无直接 DDL |
| `need_supports` | `schema.ts:175` | `0001` | `id` | - | need+user unique | 无直接 DDL |
| `need_comments` | `schema.ts:189` | `0001` | `id` | - | - | 无直接 DDL |
| `solutions` | `schema.ts:198` | `0001` | `id` | - | - | 无直接 DDL |
| `quotes` | `schema.ts:212` | `0001` | `id` | - | - | 无直接 DDL |
| `projects` | `schema.ts:242` | `0001` | `id` | - | - | 追加 `authorizationVersion`；新组合 FK 父范围 |
| `milestones` | `schema.ts:275` | `0001` | `id` | - | - | 追加 3 列、索引和 2 个组合 FK |
| `quote_versions` | `schema.ts:303` | `0003` | `id` | - | quote+version unique | 无直接 DDL |
| `project_requirements` | `schema.ts:325` | `0003` | `id` | - | project+version unique | 无直接 DDL |
| `project_files` | `schema.ts:345` | `0003` | `id` | - | group+version unique | 追加 5 列和索引 |
| `project_changes` | `schema.ts:368` | `0003` | `id` | - | - | 无直接 DDL |
| `project_acceptances` | `schema.ts:387` | `0003` | `id` | - | - | 追加 2 列、索引和 reviewer 组合 FK |
| `complaints` | `schema.ts:399` | `0003` | `id` | - | - | 无直接 DDL |
| `complaint_evidence` | `schema.ts:427` | `0003` | `id` | - | - | 无直接 DDL |
| `listings` | `schema.ts:439` | `0001` | `id` | - | - | 无直接 DDL |
| `offers` | `schema.ts:466` | `0001` | `id` | - | - | 无直接 DDL |
| `giveaway_applications` | `schema.ts:478` | `0001` | `id` | - | - | 无直接 DDL |
| `recycling_requests` | `schema.ts:488` | `0001` | `id` | `itemId -> items` | item idx | 只读 anomaly/孤儿证据 |
| `recycling_quotes` | `schema.ts:505` | `0001` | `id` | - | - | 无直接 DDL |
| `orders` | `schema.ts:521` | `0001` | `id` | - | related/status idx | 无直接 DDL |
| `order_status_logs` | `schema.ts:556` | `0001` | `id` | - | - | 无直接 DDL |
| `swap_requests` | `schema.ts:566` | `0012` | `id` | listings/users/orders | active unique、actor idx | 无直接 DDL |
| `conversations` | `schema.ts:589` | `0001` | `id` | - | - | 追加 status/version/index |
| `messages` | `schema.ts:602` | `0001` | `id` | - | sender+client unique、order idx | 无直接 DDL |
| `notifications` | `schema.ts:616` | `0001` | `id` | - | user+dedupe unique、read idx | 无直接 DDL |
| `reviews` | `schema.ts:635` | `0001` | `id` | - | - | 无直接 DDL |
| `credit_events` | `schema.ts:648` | `0001` | `id` | - | - | 无直接 DDL |
| `items` | `schema.ts:662` | `0007` | `id` | `ownerId -> users` | owner+status idx | 无直接 DDL |
| `item_media` | `schema.ts:680` | `0007` | `id` | `itemId -> items` | - | 无直接 DDL |
| `item_defects` | `schema.ts:691` | `0007` | `id` | `itemId -> items` | - | 无直接 DDL |
| `item_accessories` | `schema.ts:701` | `0007` | `id` | `itemId -> items` | - | 无直接 DDL |
| `item_ownership_history` | `schema.ts:709` | `0007` | `id` | items/users/orders | item+time idx | 无直接 DDL |
| `item_service_history` | `schema.ts:720` | `0007` | `id` | items/users | - | 无直接 DDL |
| `item_status_logs` | `schema.ts:730` | `0007` | `id` | items/users | - | 无直接 DDL |
| `listing_modes` | `schema.ts:740` | `0007` | `id` | `listingId -> listings` | listing+mode unique | 无直接 DDL |
| `stored_files` | `schema.ts:749` | `0007` | `id` | `ownerId -> users` | storageKey unique、SHA/owner idx | 追加 policy version/index |
| `file_access_logs` | `schema.ts:770` | `0007` | `id` | stored_files/users | file+time idx | 无直接 DDL |
| `message_receipts` | `schema.ts:784` | `0007` | `id` | messages/users | message+user unique | 无直接 DDL |
| `notification_deliveries` | `schema.ts:792` | `0007` | `id` | notifications/device tokens | retry idx | 无直接 DDL |
| `device_push_tokens` | `schema.ts:810` | `0007` | `id` | `userId -> users` | token unique、user idx | 无直接 DDL |
| `migration_anomalies` | `schema.ts:827` | `0008` | `id` | - | version+code idx | 增量安全升级 |
| `app_schema_versions` | `schema.ts:838` | `0008` | `version` | - | PK | 只读基线证据 |
| `payments` | `schema.ts:845` | `0004` | `id` | orders/users | payment/idempotency/provider unique | 无直接 DDL |
| `payment_attempts` | `schema.ts:870` | `0004` | `id` | payments | payment/provider request unique | 无直接 DDL |
| `payment_events` | `schema.ts:887` | `0004` | `id` | payments | event/provider unique | 无直接 DDL |
| `refunds` | `schema.ts:901` | `0004` | `id` | payments/orders/users | refund/idempotency/provider unique | 无直接 DDL |
| `refund_attempts` | `schema.ts:931` | `0006` | `id` | refunds/users | request unique、status idx | 无直接 DDL |
| `escrow_records` | `schema.ts:953` | `0004` | `id` | payments/orders/projects/users | escrow/payment unique、project idx | 无直接 DDL |
| `settlements` | `schema.ts:980` | `0004` | `id` | projects/milestones/users | settlement/milestone/idempotency unique | 无直接 DDL |
| `settlement_items` | `schema.ts:1004` | `0004` | `id` | settlements/milestones/orders | settlement idx | 无直接 DDL |
| `escrow_releases` | `schema.ts:1017` | `0004` | `id` | escrow/settlements/users | release/idempotency/settlement unique | 无直接 DDL |
| `identity_verifications` | `schema.ts:1042` | `0004` | `id` | users | user+status idx | 只读预检/回填来源 |
| `engineer_verifications` | `schema.ts:1061` | `0004` | `id` | users | user+status idx | 只读预检/回填来源 |
| `merchant_verifications` | `schema.ts:1081` | `0004` | `id` | users | user+status idx | 只读预检/回填来源 |
| `verification_documents` | `schema.ts:1101` | `0004` | `id` | `ownerId -> users` | verification/owner idx | 只读预检/回填来源 |
| `verification_actions` | `schema.ts:1118` | `0004` | `id` | `actorId -> users` | verification idx | 只读预检/回填来源 |
| `complaint_business_snapshots` | `schema.ts:1134` | `0005` | `id` | complaints/projects/milestones | complaint unique、project idx | 无直接 DDL |
| `complaint_active_locks` | `schema.ts:1150` | `0005` | `id` | complaints/projects/milestones | complaint/project/milestone unique | 无直接 DDL |
| `complaint_actions` | `schema.ts:1162` | `0004` | `id` | complaints/users | complaint idx | 无直接 DDL |
| `complaint_decisions` | `schema.ts:1172` | `0004` | `id` | complaints/users | complaint/decision unique | 无直接 DDL |
| `complaint_status_logs` | `schema.ts:1189` | `0004` | `id` | complaints/users | complaint idx | 无直接 DDL |
| `complaint_fund_actions` | `schema.ts:1199` | `0004` | `id` | complaints/escrow/settlement/refund/release | complaint idx | 无直接 DDL |
| `complaint_credit_actions` | `schema.ts:1212` | `0004` | `id` | complaints/users | complaint idx | 无直接 DDL |
| `audit_logs` | `schema.ts:1223` | `0004` | `id` | `actorId -> users` | actor/resource/action idx | 只读事实；不回写 |

## 5. `migration_anomalies` 真实基线

首次建立于 `0008_confused_orphan.sql`，当前 Schema 与 SQL 一致：

```text
id INT AUTO_INCREMENT PRIMARY KEY
migrationVersion VARCHAR(32) NOT NULL
entityType VARCHAR(64) NOT NULL
entityId INT NULL
code VARCHAR(64) NOT NULL
detail JSON NULL
resolvedAt TIMESTAMP NULL
createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
INDEX migration_anomalies_version_idx(migrationVersion, code)
```

当前没有 `migrationRunId`、checkpoint、severity、handling、fingerprint、status、detailChecksum、resolver FK 或唯一去重约束。静态源码发现四种旧代码：

| 旧代码 | 来源 | A2 升级映射 |
|---|---|---|
| `orphan_user` | 0009 | BLOCKING / ABORT_RUN / open |
| `cancelled_default_idle` | 0009 | INFO / CONTINUE / resolved；保留已应用安全默认事实 |
| `missing_valid_mode` | 旧修复 runner | WARNING / MIN_PRIVILEGE / open |
| `missing_item` | 旧修复 runner | BLOCKING / ABORT_RUN / open |
| 其他未知旧代码 | 实库预检可能发现 | BLOCKING / ABORT_RUN / open，禁止静默给默认严重度 |

升级必须先建 `migration_runs`，插入专用 legacy import run，再给旧 anomaly 填 runId、映射字段、fingerprint 和 detailChecksum；最后才增加非空、FK、CHECK 和唯一约束。不得重建/替换原表，也不得丢失原 `id/code/detail/createdAt/resolvedAt`。

## 6. 历史迁移事实与 SHA-256

15 个文件顺序与 journal idx 0—14 一致；无文件引用在后续迁移才首次创建的表。聚合 `sourceChecksum`（`path|bytes|sha256` 按路径排序、LF 连接）为：

`ab799d4d12573da833d484492385425758f0f954a50c2dd1a9abeba7122b9952`

| 文件 | bytes | SHA-256 | DDL/对象 | DML 与可重复性 | 索引/FK | 风险/旧冲突 |
|---|---:|---|---|---|---|---|
| `0000_elite_eternals.sql` | 483 | `814a08e40d7fc2bcfd458759d18319198ca8ae394f2fa15617a78678e9c9c93b` | 建 `users` | 无 DML | inline unique | 无后续表引用 |
| `0001_neat_omega_flight.sql` | 11696 | `76f5aa8066254b130a12e71fa15aef2c011f82c884aaf19381d0c3f31ec70e04` | 建 23 张早期业务表 | 无 DML | 早期关系多数无 FK | 项目只有 owner/engineer；A1.1 的主要旧模型来源 |
| `0002_bizarre_rachel_grey.sql` | 684 | `207eff80183ad3eba52933fbf6d63f6157f928cb0eeb37076dac799afd3bcf97` | alter users/need_supports | 无 DML | phone/openId unique | `MODIFY COLUMN` 隐式提交 |
| `0003_spotty_captain_flint.sql` | 6675 | `39c7eb00cdf8d7e85fb33c961f4b2d920934072eb6358754003263e6cd72adf1` | 建 7 表；alter projects/quotes | 4 条回填；NOT EXISTS/COALESCE，整文件重放逻辑趋于幂等 | inline unique | 建立 acceptance 的 `submittedBy`，无 FK |
| `0004_yummy_storm.sql` | 28308 | `9c2ee5d9d88bda0fe6f1840af309c6e18226fbbf34575f7270c9b579a6a0d6f7` | 建 19 表；修改 users/complaints；大量 FK | 6 条 NOT EXISTS 回填 | 19 indexes、46 FKs | 最大历史文件；DDL 自动提交；旧角色和三套认证来源 |
| `0005_silky_squadron_supreme.sql` | 5497 | `070fcd660730ffa3489c84c80609aefca25e07beca4ab939b285228c886603be` | 建 2 张投诉锁/快照表 | 2 条 NOT EXISTS 回填 | 1 index、6 FKs | 长查询/行数依赖；逻辑幂等 |
| `0006_steady_wild_child.sql` | 6491 | `d58ee7e02b0485ba3516f0cc5f2e0d0db65820b6c78e983f8475bf46c90bc004` | 建 refund_attempts；修改投诉/订单 | 8 条临时表驱动 DML | 1 index、2 FKs | **不可安全逐语句重放**：日志 insert 与后续状态 update 间崩溃可重复写 |
| `0007_purple_prowler.sql` | 12248 | `e6cc01514da36baa81385415ce1f4a0dc62d5310e77b5a4743327de677bdc9dd` | 建 13 表；alter listings；最终 drop helper column | 4 条旧物回填 | 4 indexes、21 FKs | helper column 删除不可逆；insert 与关联 update 间有 crash window |
| `0008_confused_orphan.sql` | 2928 | `9c11d5e2c0c517a0e78aed3149b52d22acdc0acb7d9cea478822497aeda655b0` | 建 app version/anomaly；alter 4 表 | 1 条 `messages` 条件 update | 9 indexes | 建立当前简版 anomaly；无唯一去重 |
| `0009_vengeful_sentinel.sql` | 2205 | `940262f0f43335085b09bf44f56cc5ef1b1a6de49540545bde659a7efac17b47` | alter recycling/items；drop helper column | 6 条 DML | 1 FK | **不可安全手工重放**：helper 删除、anomaly 无唯一、insert/update crash window |
| `0010_boring_groot.sql` | 79 | `b6d6382c02d52ad4160abd9a52084e6665be04066b9e13786b13ddb6407e5c0a` | 仅加 recycling item index | 无 DML | 1 index | DDL 非可重复 |
| `0011_melted_mac_gargan.sql` | 426 | `3fa542e03c11c3e046100e5dcf5313ff9dcc589ad750f65c2c3c3aa6eacfb5ca` | alter notification delivery | app version UPSERT，可重复 | 1 FK | DDL 非可重复 |
| `0012_lumpy_molecule_man.sql` | 2334 | `805d029eaf6a7287807b64995586f1d2102fb437686dbddf994db99a948f8ca1` | 建 swap_requests；modify listings/orders | 无 DML | 2 indexes、5 FKs | ENUM modify 可能重建表 |
| `0013_gorgeous_gargoyle.sql` | 289 | `38210df3cf917f8412d7e19580de6fad94687f5e3c6e06ce018c5f1089745fbe` | alter device tokens | 无 DML | - | ADD COLUMN DDL |
| `0014_tense_luckman.sql` | 882 | `b3b867e4685790ec0ba5fe0d7c310d0ab86a3f8e25cff3347e72036842d796e2` | 建 location preferences | 无 DML | 1 index、1 FK | 当前最后迁移 |

### 6.1 历史迁移执行结论

- 0000—0014 都没有通用 `IF NOT EXISTS`，其“重复执行”依赖 `__drizzle_migrations` journal，而不是 SQL 自身可重复。
- `drizzle-kit migrate` 是标准入口；应用启动不会自动 migrate。
- 升级测试另有手工 runner：按文件名排序、去除 statement breakpoint、使用多语句连接依次执行；它证明支持多文件顺序，但不是生产恢复工具。
- 现有修复 runner 会写 anomaly/items 等数据，不是只读工具，也没有反向 recovery。
- 禁止为了 A2 手工重放单个历史文件，尤其是 0006/0007/0009。

## 7. 当前 ENUM、时间和 JSON 实现

68 个 ENUM 列均为物理 MySQL ENUM。重复的 `status` 是各表独立定义，不是数据库级共享类型。

| 域/表 | 枚举值 |
|---|---|
| users.accountStatus | active, restricted, suspended, closed |
| users.role | user, admin, verification_reviewer, complaint_operator, finance_operator, customer_service |
| user_profiles | currentRole=user/engineer/merchant；engineerStatus、merchantStatus=none/pending/active/rejected |
| user_location_preferences.source | device, manual |
| engineer_profiles.verificationLevel | none, basic, professional |
| needs | visibility=public/private；status=draft/pending_review/published/collecting_solutions/selecting_quote/project_created/solved/closed/rejected |
| solutions | providerType=user/engineer/ai；status=submitted/visible/withdrawn/selected/not_selected/removed |
| quotes.status | submitted, viewed, negotiating, accepted, rejected, withdrawn, expired, not_selected |
| projects.status | pending_confirmation, pending_agreement, pending_payment, in_progress, waiting_acceptance, revision, paused, disputed, completed, cancelled, refunded, closed |
| milestones.status | pending, in_progress, submitted, waiting_acceptance, revision_required, accepted, overdue, disputed, cancelled |
| project_requirements.status | pending_confirmation, effective, superseded, rejected |
| project_files | category=requirement/design/delivery/test/agreement/other；status=available/superseded/disabled |
| project_changes.status | pending_confirmation, approved, rejected, withdrawn, disputed |
| project_acceptances.result | accepted, revision_required, disputed |
| complaints | relatedType=project/milestone/order/listing/recycling/message；status=submitted/waiting_response/under_review/waiting_evidence/negotiating/decision_pending/resolved/rejected/withdrawn/closed |
| listings.status | draft, published, reserved, completed, closed, deleted |
| offers.status | submitted, negotiating, accepted, rejected, withdrawn, expired, not_selected |
| giveaway_applications.status | submitted, selected, rejected, withdrawn |
| recycling_requests.status | quoting, quoted, selected, inspecting, completed, cancelled |
| recycling_quotes.status | submitted, selected, not_selected, withdrawn, adjusted, confirmed |
| orders | orderType=listing/project/recycling/swap；status=pending_confirmation/pending_payment/paid/pending_delivery/pending_acceptance/completed/cancelled/refunding/partially_refunded/refunded/disputed/closed |
| swap_requests.status | submitted, awaiting_confirmations, rejected, cancelled, completed |
| notifications.category | system, need, project, order |
| items.status | in_use, idle, listed, reserved, sold, swapped, given_away, recycling, recycled, under_repair, archived |
| item_media | mediaType=image/video；purpose=cover/detail/defect |
| item_defects.severity | minor, moderate, major |
| item_ownership_history.transferType | created, sold, swapped, given_away, recycled, admin_correction |
| item_service_history.serviceType | repair, maintenance, inspection, refurbishment, upgrade |
| listing_modes.modeCode | fixed_price, accept_offers, swap, giveaway, recycle, rental |
| stored_files | provider=local/s3；privacyLevel=public/business/sensitive/high_sensitive；virusScanStatus=pending/clean/rejected/unavailable；status=uploading/available/disabled/archived |
| file_access_logs | action=upload/download/preview/disable；result=success/denied/failed |
| notification_deliveries | channel=in_app/push；status=pending/sent/failed/skipped |
| device_push_tokens.platform | ios, android, web |
| payments.status | created, pending, success, failed, closed, refunding, partially_refunded, refunded |
| payment_attempts/payment_events | attempt status=pending/success/failed；event type 为 varchar |
| refunds.status | draft, submitted, under_review, approved, processing, success, rejected, cancelled, failed |
| refund_attempts.status | pending, success, failed |
| escrow_records.status | pending, funded, partially_released, released, frozen, partially_refunded, refunded, closed |
| settlements.status | pending, under_review, approved, processing, settled, rejected, frozen |
| escrow_releases.status | pending, processing, success, failed, cancelled |
| 三套 verification.status | draft, submitted, under_review, additional_info_required, approved, rejected, expired, revoked |
| verification_documents | verificationType=identity/engineer/merchant；status=available/superseded/disabled |
| verification_actions | verificationType=identity/engineer/merchant；action=submit/resubmit/start_review/approve/request_info/reject/revoke |
| complaint_actions.actorType | user, admin, system |
| complaint_decisions.result | dismiss, continue_performance, redeliver, full_refund, partial_refund, release_all, partial_release |
| complaint_fund_actions | action=freeze/unfreeze/refund/partial_refund/release/partial_release；status=pending/success/failed |
| complaint_credit_actions | action=warning/credit_deduction/restrict_orders/suspend_account；status=pending/applied/reverted |
| audit_logs | result=success/denied/failed；riskLevel=normal/sensitive/high |

所有现有 `timestamp()` 都是秒精度，使用 `.defaultNow()`/`.onUpdateNow()`；没有 `TIMESTAMP(3)` 先例。JSON 使用原生 `json()`，没有 default；A2 不应为 JSON 引入字面默认值，空对象由写入端显式提供或保持 NULL。

## 8. A1.1 与真实 Schema 差异

| 项目 | 判定 | 事实与最小实现调整 |
|---|---|---|
| 24+3+6 计数 | MATCH | 24 业务基础表；2 新 infrastructure；现有 anomaly 升级；6 现有业务表追加 |
| `migration_anomalies` 存在性 | MINOR_ADJUSTMENT | A1.1 已识别；A2 必须 ALTER，不得 CREATE 同名表 |
| anomaly 旧代码 | IMPLEMENTATION_DECISION_REQUIRED | 采用第 5 节冻结映射；未知旧代码默认 BLOCKING，不能给宽松默认 |
| INT 主键/FK | MATCH | `users.id`、`projects.id`、相关现有 ID 均为 signed INT；A2 新关系 ID 必须同型 |
| TIMESTAMP 精度 | MINOR_ADJUSTMENT | 现有全部秒精度；infra 的毫秒时间需显式 `fsp:3`，业务新增时间默认保持秒精度 |
| JSON 默认值 | MATCH | 当前无 JSON default；A2 继续 NULL/显式写入，避免表达式默认兼容问题 |
| ENUM 实现 | MINOR_ADJUSTMENT | 当前是物理 ENUM；A2 新列/表可沿用，但所有值和默认必须显式冻结，不能复用 TS 数组后悄然扩值 |
| CHECK | IMPLEMENTATION_DECISION_REQUIRED | 当前没有先例；MySQL 8.0.34 可执行，但必须在 DB-EMPTY/样本库验证 enforcement 和命名 |
| 组合唯一键 | IMPLEMENTATION_DECISION_REQUIRED | 所需父列均为 INT，静态可建立；必须先建显式 parent unique，不能依赖 id PK 自动满足组合引用 |
| 13 条组合 FK | IMPLEMENTATION_DECISION_REQUIRED | 静态列型兼容；真实孤儿和 collation/engine 需 preflight 后才能确认 |
| 可空 FK | MATCH | InnoDB 对含 NULL 的组合 FK 不验证，符合 sourceInvitation/reviewer 的可空语义 |
| FK 添加顺序 | MATCH | org/project invitation 来源形成循环，必须 Phase D；其他关系可按父表先后建立 |
| 索引/FK 名长度 | MINOR_ADJUSTMENT | 当前 max index 45、FK 58；A2 使用本报告短名，均不超过 47 |
| `activeDedupeKey VARCHAR(191)` | MATCH | utf8mb4 最多 764 bytes，MySQL 8 InnoDB 3072-byte key 内；值已规范为小写 ASCII |
| 实际 charset/collation | IMPLEMENTATION_DECISION_REQUIRED | compose 声明 utf8mb4_unicode_ci，但实库未认证，必须查询 information_schema |
| `resourceId VARCHAR(64)` | MINOR_ADJUSTMENT | 现有 INT ID 用无前导零十进制字符串规范化；多态列不建 FK，不允许隐式数值比较 |
| `permission_audit_events` 增长 | IMPLEMENTATION_DECISION_REQUIRED | 追加 JSON + 5 个二级索引可能放大写入；A2.1 需容量估算、慢查询和索引大小门禁，不在本轮改语义/分区 |
| `project_acceptances.submittedBy` | BLOCKING_CONFLICT | 当前写路径是 owner 验收/退修 actor，但 A1.1 禁止映射 reviewer；A2.3 前保持 NULL+anomaly，改变需单独修订 A1.1 |
| MySQL 最低版本 | IMPLEMENTATION_DECISION_REQUIRED | 本机客户端 8.0.41、3306 有 listener；实际 server 未认证。必须在精确 8.0.34 或更高 8.0.x 实测 |

### 8.1 六张现有表追加兼容性

| 表 | 追加 | 静态兼容性 | ALTER 风险 |
|---|---|---|---|
| `projects` | `authorizationVersion INT NOT NULL DEFAULT 1` + index | 类型兼容 | 加列通常可 INSTANT；加 index 需 metadata lock/扫描 |
| `milestones` | 两个 nullable membership INT + auth version | 与 project_memberships INT 同型 | 先加列；回填后再加索引/CFK-11/12；FK 校验会扫描 |
| `project_files` | confidentiality ENUM、NDA bool、policy version、disabledAt/By | 无重名；默认值可表达 | 5 列和复合 index；潜在最大/最敏感 ALTER，必须按真实行数拆分 |
| `project_acceptances` | nullable reviewer membership、submission version | DDL 可兼容 | reviewer 不回填；组合 FK 仍可对新记录生效；先建 index 后加 FK |
| `stored_files` | accessPolicyVersion INT default 1 + index | 与现有相关实体列兼容 | 文件表可能较大；加 index 有长扫描风险 |
| `conversations` | status ENUM default active、auth version、ref index | 现有 refType/refId 可直接索引 | 需先确认 ref 分布和表量；非空默认列与 index 分开 |

任何“通常可 INSTANT”都不是实测结论。A2 SQL 应显式声明期望的 `ALGORITHM`/`LOCK`，在样本克隆失败时停止，而不是让 MySQL 静默降级为 COPY。

## 9. 13 条组合 FK 可实施设计

| ID | 显式约束名 | 子列 -> 父列 | 静态结论 | 添加阶段 |
|---|---|---|---|---|
| CFK-01 | `org_inv_inviter_membership_fk` | org invitation `(organizationId,inviterMembershipId)` -> membership `(organizationId,id)` | INT/INT 可行 | M04 |
| CFK-02 | `org_membership_source_invitation_fk` | membership `(organizationId,sourceInvitationId)` -> invitation `(organizationId,id)` | nullable、循环 | M11 |
| CFK-03 | `org_member_position_membership_fk` | member position `(organizationId,membershipId)` -> membership `(organizationId,id)` | 可行 | M04 |
| CFK-04 | `org_member_position_position_fk` | member position `(organizationId,positionId)` -> position `(organizationId,id)` | 可行 | M04 |
| CFK-05 | `position_capability_position_fk` | position capability `(organizationId,positionId)` -> position `(organizationId,id)` | 可行 | M04 |
| CFK-06 | `org_owner_transfer_from_membership_fk` | transfer `(organizationId,fromMembershipId)` -> membership `(organizationId,id)` | 可行 | M04 |
| CFK-07 | `org_owner_transfer_to_membership_fk` | transfer `(organizationId,toMembershipId)` -> membership `(organizationId,id)` | 可行 | M04 |
| CFK-08 | `project_inv_inviter_membership_fk` | project invitation `(projectId,inviterMembershipId)` -> membership `(projectId,id)` | 可行 | M05 |
| CFK-09 | `project_membership_source_invitation_fk` | membership `(projectId,sourceInvitationId)` -> invitation `(projectId,id)` | nullable、循环 | M11 |
| CFK-10 | `project_member_role_membership_fk` | membership role `(projectId,projectMembershipId)` -> membership `(projectId,id)` | 可行 | M05 |
| CFK-11 | `milestone_assignee_project_membership_fk` | milestone `(projectId,assigneeProjectMembershipId)` -> membership `(projectId,id)` | 现有表；nullable | M11 |
| CFK-12 | `milestone_submitter_project_membership_fk` | milestone `(projectId,lastSubmittedByProjectMembershipId)` -> membership `(projectId,id)` | 现有表；nullable | M11 |
| CFK-13 | `acceptance_reviewer_project_membership_fk` | acceptance `(projectId,reviewerProjectMembershipId)` -> membership `(projectId,id)` | 现有表；nullable且历史全 NULL | M11 |

所有名字少于 64 字符。父表先增加显式 `(scopeId,id)` UNIQUE；子表先建立相同列序的 index。M11 添加前执行 anti-join=0；任何非零写 `MIG-CROSS-SCOPE-RELATION` 并停止。`FOREIGN_KEY_CHECKS` 不得关闭。

## 10. DDL 风险登记

| 风险 | 等级 | 控制 |
|---|---|---|
| MySQL DDL 隐式提交，不能由普通事务回滚 | 高 | 每个迁移单元先/后 checkpoint；失败走新补偿迁移或整库恢复，不声称事务回滚 DDL |
| anomaly 从 nullable 过渡到 NOT NULL/FK/unique | 高 | add nullable → legacy run → 分批回填 → 验证 → 收紧；每步独立文件/门禁 |
| 6 张现有表加索引/FK | 高 | 先真实表量；列与索引拆分；样本克隆测 lock；设置 5 秒等待并停止降级 |
| 13 个组合 FK 全表验证 | 高 | M11 单独执行；逐条 anti-join、逐条 checkpoint，不放入建表大文件 |
| `permission_audit_events` JSON + 多索引增长 | 中高 | 估算写放大、索引大小、月增长；A2 只建必要索引，不预设分区 |
| utf8mb4 191 唯一键 | 中 | 强制 ASCII canonical key；确认 row format 与实际 collation |
| CHECK 从无先例到启用 | 中 | DB-EMPTY 直接 SQL 负例；SHOW CREATE TABLE 确认 enforced |
| ENUM/非空默认列 | 中 | 只增加新列，不改旧 ENUM；先验证默认回填和 INSTANT 能力 |
| 循环 FK | 中 | M04/M05 先不挂 CFK-02/09，M11 后加 |
| 历史 0006/0007/0009 手工重放 | 禁止 | 只通过完整备份恢复 + journal 重建测试，不单文件重放 |

## 11. 后续迁移拆分（12 个单元）

不得把 27 张契约表放入一个 SQL。文件名由 A2.1 按 journal 的下一个连续编号生成；本表的 M01—M12 是稳定逻辑编号。

| 单元 | 对象/动作 | 前置 | DDL/DML | 长锁风险 | 可重跑 | 失败处理 | checkpoint | 安全测试 | 生产允许 |
|---|---|---|---|---|---|---|---|---|---|
| A2-M01 migration infrastructure | 新建 runs/checkpoints；anomaly 分步安全升级；legacy import run | 备份、实库 preflight、source checksum | DDL+受控 DML | anomaly 收紧为高 | SQL 不直接重放；run/checkpoint 幂等 | 每步停止；DDL 失败补偿或整库恢复；BLOCKING 不 completed | `schema|migration_infrastructure|000000|BEGIN` | SEC-039/046/047 | 仅 DB-EMPTY/SAMPLE 通过后 |
| A2-M02 directory tables | identity_types、certification_types、capabilities、project_roles | M01 | DDL | 低（新表） | journal 防重 | 删除未被引用的新空表或整库恢复 | `schema|directory_tables|000000|BEGIN` | SEC-039/048 | 条件允许 |
| A2-M03 identities and profiles | business_identities、identity_profiles | M01/M02 | DDL | 低 | journal 防重 | 新表为空时补偿；不回填 | `schema|identity_tables|000000|BEGIN` | SEC-038/039 | 条件允许 |
| A2-M04 organizations/relations | organizations、memberships、invitations、positions、member positions、position capabilities、owner transfers；除 CFK-02 | M01/M02/M03 | DDL | 低；新表 FK metadata | journal 防重 | 停在具体对象 checkpoint；不写业务数据 | `schema|organization_tables|000000|BEGIN` | SEC-036/037/040/044 | 条件允许 |
| A2-M05 project memberships/roles | project memberships/invitations/membership roles/role capabilities；除 CFK-09 | M01/M02/M03 | DDL | 低；新表 FK metadata | journal 防重 | 同上 | `schema|project_relation_tables|000000|BEGIN` | SEC-018/040/045 | 条件允许 |
| A2-M06 certifications | certifications/documents/review actions | M01/M02/M03/M07 staff FK可延后 | DDL | 低 | journal 防重 | 审核职务 FK 可延后 M11 | `schema|certification_tables|000000|BEGIN` | SEC-024/027/040 | 条件允许 |
| A2-M07 platform/grants/preferences/audit | platform positions、grants、workspace preferences、permission audit | M01—M06 | DDL | audit 多索引，中 | journal 防重 | 新表无回填时补偿；循环普通 FK 延后 | `schema|authorization_tables|000000|BEGIN` | SEC-021/022/030/031/040 | 条件允许 |
| A2-M08 existing-table additive columns | 6 表先加列，再分文件加非循环 index；不加 CFK-11—13 | M03/M05/M07、实表量/备份 | DDL | **高** | journal 防重；SQL 不直接重放 | lock 超时立即停；禁止静默 COPY；必要时整库恢复 | `schema|existing_additive_columns|000000|BEGIN` | SEC-005/006/009/035/043 | 需维护窗和克隆实测 |
| A2-M09 seed manifest | 校验 canonical manifest；种 10 identity types、3 certification types、68 capabilities、9 project roles及冻结映射 | M01/M02 | DML | 低 | 通过 code unique + manifest hash 可重跑 | hash 不符 BLOCKING；不更新已发布含义 | `seed|catalogs|000000|BEGIN` | SEC-038/048 | 条件允许 |
| A2-M10 deterministic legacy backfill | consumer/identity/profile/certification/project membership/role/staff/workspace，500 行批次 | M01—M09、DB-SAMPLE 通过 | DML | 中；批次行锁 | checkpoint/legacy key 幂等 | 单批事务回滚；resume/rerun；BLOCKING 停 run | `backfill|<entity>|000000|<cursor>` | SEC-038/040/043/046/047 | 冲突库行为正确后 |
| A2-M11 deferred composite/cyclic FKs | 13 CFK、审核/工作台普通循环 FK、父 unique/子 index | M10 全量 anti-join=0 | DDL | **高**：全表验证/metadata lock | journal 防重；逐条 checkpoint | 任一失败保持未加状态；不关闭 FK；修数据后新 run | `schema|deferred_fk_<id>|000000|BEGIN` | SEC-044/045/046/047 | 需维护窗和恢复演练 |
| A2-M12 validation/completion | SHOW/anti-join/计数/checksum；仅更新 run/checkpoint 完成状态 | M01—M11 | 只读验证 + infra DML | 低 | 可重跑验证 | 不闭合则 run failed；不得 completed | `validate|final|000000|BEGIN` | SEC-039—048 中全部 A2 项 | 全部门禁通过后 |

### 11.1 A2.1—A2.5 归属

- A2.1：M01、M02、M09，只建立迁移基础设施、目录和 manifest；不得历史回填。
- A2.2：M03—M08，只建 24 张业务基础表与 6 表安全追加；不得加循环组合 FK、不得历史回填。
- A2.3：M10，实现 runner/checkpoint/anomaly/report，在 DB-V324-SAMPLE 验证；不切 API。
- A2.4：M11 及 resume/rerun/recovery/冲突库验证。
- A2.5：M12 与全部 A2 所属安全测试、最终计数；A3 单独审查。

## 12. 迁移执行方式事实

| 项目 | 当前实现 | A2 设计结论 |
|---|---|---|
| Drizzle config | `schema=./drizzle/schema.ts`、`out=./drizzle`、dialect=mysql、要求 DATABASE_URL | A2 继续使用 journal 连续追加；不得改变 0000—0014 |
| 命令 | `db:generate`、`db:migrate`；`db:push` 会 generate+migrate | A2 禁止使用 `db:push` 直连生产；先审 SQL，再 migrate |
| journal | meta journal 静态 15 条；实库应有 `__drizzle_migrations` | preflight 校验 count/hash 后才运行 |
| 自动执行 | 应用启动只懒加载 Drizzle 连接，不自动 migrate | 部署必须有独立、单实例 migration job |
| 手工 SQL runner | 升级测试可按文件名多文件顺序执行；另有写入型 repair runner | 仅测试证明；A2 正式 runner 需 run/checkpoint/锁，不复用 repair 脚本 |
| 空库测试 | 现有脚本会 DROP/CREATE 专用测试库并 migrate 两次 | 属写操作，本轮未运行；A2 测试需隔离账号和显式 DB 名 allowlist |
| 恢复 | 无 A2 所需反向恢复脚本 | 按备份计划和 M01 provenance 新建，不声称历史 runner 可恢复 |
| 本地环境 | 3306 listener；MySQL client 8.0.41；无认证 URL；Docker server 不可确认；tsx 不可执行 | NOT_EXECUTED；先恢复依赖和提供最小权限测试凭证 |

## 13. 只读存量预检

新增 `scripts/preflight-v33-a2.mjs`，其 SQL 守卫只允许 SELECT/SHOW/DESCRIBE，连接禁用多语句；默认同时输出 JSON 与 Markdown 到 stdout，不写数据库或本地报告文件。输出仅含聚合计数、代码/枚举分布和 information_schema 元数据。

覆盖项：

- 精确 MySQL 版本、charset/collation/sql_mode/row format；
- 69 张 Schema 表与列、journal 15 条及 hash；
- users/旧角色/currentRole 分布；profile、verification、document、project、file uploader 孤儿/冲突；
- owner=engineer 数量；acceptance actor 与 owner/engineer 的聚合关系；
- anomaly 当前列/数量/代码分布；
- 6 张 ALTER 表的估算行数、data/index bytes 和 collation。

本轮结果：**NOT_EXECUTED**。原因是无数据库凭证，且只读无密码连接返回 access denied；不得把本机客户端版本或 3306 listener 冒充实际数据库版本/数据结果。脚本已通过 `node --check` 和 `--help`，未执行任何查询。

## 14. 测试数据库与夹具设计

### DB-EMPTY

- 独立 MySQL 8.0.34 基线容器或实例，固定 utf8mb4、collation 和 sql_mode；禁止使用生产 hostname/schema。
- 依次应用 0000—0014，核对 69 应用表 + journal；再按 M01—M12 逐单元应用。
- 覆盖第二次 migrate、SHOW CREATE TABLE、CHECK 负例、27 表计数和空数据恢复。

### DB-V324-SAMPLE

使用不可识别的合成 actor key，不使用真实联系资料：

- 普通账号、工程师、商家及 currentRole 组合；
- 三套 verification 的 draft/pending/approved/rejected/revoked；
- 普通 owner/engineer 项目与 owner=engineer 项目；
- 正常 project file、milestone submission、acceptance；
- 旧高权角色的每种代码各一组；
- 预期 consumer、membership、role、certification 和 anomaly 计数写入 fixture manifest。

### DB-V324-CONFLICT

按独立 fixture case 建立，不混用真实数据：

| Fixture | 预期 |
|---|---|
| profile 指向缺失 user | BLOCKING，禁止生成身份 |
| active profile 无 approved verification | WARNING + MIN_PRIVILEGE |
| verification document 指向不存在申请 | BLOCKING |
| 合法 JSON 列中的结构不符 schema | WARNING/SKIP_ENTITY；MySQL 原生 JSON 无法存语法非法文本 |
| 未知旧后台 role（通过受控旧结构/模拟输入） | WARNING，不授高权 |
| project owner/engineer 缺失 | BLOCKING |
| submittedBy 有值但无 A1 允许 reviewer 事实 | reviewer NULL + `MIG-REVIEWER-UNKNOWN` |
| 预构造跨范围关系 | `MIG-CROSS-SCOPE-RELATION` BLOCKING；FK 添加前停止 |
| 重复开放业务键 | `MIG-DUPLICATE-OPEN-RELATION` BLOCKING |
| anomaly detail 含禁止类别的合成标记 | detail 被拒绝，安全摘要 + BLOCKING；不保存原值 |

## 15. 批次停止门禁

### A2.1 完成条件

- runs/checkpoints 建立；现有 anomaly 保留 ID/数据并安全升级；legacy code 映射闭合。
- 4 张目录表与 canonical seed manifest 建立；manifest SHA-256 匹配。
- DB-EMPTY 上 M01/M02/M09 和重复 migrate 通过；未执行历史回填。

### A2.2 完成条件

- 24 张业务基础表全部建立；6 张现有表只有冻结的追加列/索引。
- 无循环组合 FK、无历史回填、无 API 切换；SHOW CREATE TABLE 与字典一致。

### A2.3 完成条件

- 500 行 runner、checkpoint、anomaly、JSON/Markdown 报告实现。
- DB-V324-SAMPLE 计数闭合；submittedBy 不回填 reviewer；不切 API。

### A2.4 完成条件

- 13 条组合 FK 建立；anti-join=0。
- resume/rerun/checkpoint recovery/整库恢复通过；冲突库 BLOCKING/WARNING 行为正确。

### A2.5 完成条件

- 48 项安全矩阵中标记 A2 的全部用例通过；最终 checksum/计数闭合。
- A3 是否开工另行审查，不自动进入。

## 16. A2.1 开工判定

**NOT_READY**。静态实施设计已经可执行，但在以下证据齐全前不得开始 A2.1：

1. 恢复 package lock 对应依赖运行时，不改依赖版本；
2. 提供只读基线 URL，成功执行 preflight；
3. 提供隔离、可写、精确版本已记录的 DB-EMPTY；
4. 完成迁移前备份/校验清单；
5. 对实际 legacy anomaly code 映射和 submittedBy 冲突作书面确认（保持 A1.1 即可，无需改变其语义）。

本报告完成后停止，不创建迁移、不执行 A2.1。

## 17. A2.0 校验结果

| 检查 | 结果 |
|---|---|
| `node scripts/check-v33-a1-specs.mjs` | PASS：24+3+6、6 ADK、6 Mode A、13 CFK、48 tests、0 issue |
| `pnpm validate:product-specs` | PASS：144 features、149 audits、54 routes、141 procedures、18 states、11 roles；0 mismatch |
| `pnpm check:markdown-links` | PASS：98 Markdown、89 本地链接、0 断链 |
| `pnpm check:money:v330` | PASS：30/30；missing/stale/duplicate 均 0 |
| `node --check scripts/preflight-v33-a2.mjs` | PASS |
| A2 文档结构检查 | PASS：69 对象、15 migrations、12 migration units、13 CFK；0 绝对本地路径、0 credential URL |
| 修改范围检查 | PASS：本轮只有 2 份 A2.0 文档和 1 个只读脚本发生变化；Schema/SQL/业务/API/页面/package 未改 |
| `git status` | NOT AVAILABLE：当前源码包没有 `.git` 元数据 |
