Document Status: RELEASE BLOCKED
Spec Version: 1.0
Updated At: 2026-07-18
Code Baseline Commit: a3051149ced87eb4e92024c2f6d595b6f1dfca84 plus closure branch
Approved By: Pending User Approval

# V3.2.4 Release Candidate 说明

## 主要内容

- 保留 AUDIT-001～144 Android 验证记录和既有缺陷闭环证据；最终 RC 仍需独立完成 21 项冒烟。
- 增加用户主动触发的前台位置权限、手动地区和附近距离排序。
- 服务端只保存约 1 公里精度偏好，公开响应只返回区域或整数公里近似距离。
- 新增 `user_location_preferences` 和 Drizzle 迁移 `0014_tense_luckman.sql`。
- 新增位置权限、隐私、越权、幂等和数据库回滚自动化。
- 完成仓库跟踪文件分类、忽略规则、安全扫描与 Markdown 断链检查。
- 完成依赖安全、账号切换缓存隔离、位置异步失效保护和附近排序修复。

## 已知限制

- 不使用后台定位或轨迹。
- 没有位置偏好的历史内容继续按城市/原顺序展示。
- 反向地理编码失败时仍可按坐标距离排序，地区标签可能为空。
- 正式支付、正式 Push、正式云存储和生产病毒扫描均未激活。
- `v3.2.4-spec-freeze-r2`、正式 `v3.2.4` 标签、GitHub Release 和商店发布均等待用户批准。
- 最新提交的 PR/CI、MySQL 全门禁、稳定测试环境、最终 RC APK 和 21 项真机冒烟尚未完成，因此当前不得发布。

## 回滚

- 客户端可回滚到 V3.2.3，新增表不会改变旧接口和旧记录。
- 服务端回滚时保留 `user_location_preferences` 表即可，旧代码不会读取它。
- 不回写或删除旧迁移，不移动 `v3.2.4-spec-freeze`。
