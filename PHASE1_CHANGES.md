# 第一阶段改造记录

## 目标

将 Manus 导出的功能原型改造成可以独立继续开发的代码基线，不改变现有核心页面和业务方向。

## 已完成

1. 删除 Manus OAuth、Runtime、Forge 存储及相关专属文件。
2. 新增手机号密码注册与登录页面。
3. 后端新增独立注册、登录、退出和当前用户接口。
4. 使用 Node.js Scrypt 保存密码，不保存明文密码。
5. 使用独立 JWT 认证，Web 与移动端均支持 Bearer Token。
6. 用户表新增手机号、密码哈希和账号状态。
7. 为手机号以及“我也需要”关系增加数据库唯一约束。
8. AI 改为通用 OpenAI 兼容配置，默认适配 DeepSeek。
9. AI 未配置时自动使用本地整理结果，需求发布不中断。
10. 文件存储改为本地 `uploads` 目录基础实现。
11. App 包名改为 `com.shenghuobang.app`，Scheme 改为 `shenghuobang`。
12. 增加 MySQL Docker Compose、环境变量示例和启动文档。
13. 修复 Metro / NativeWind 配置，Web 导出已通过。
14. 新增密码和 JWT 自动化测试。

## 数据库迁移

新增：

```text
drizzle/0002_bizarre_rachel_grey.sql
```

执行：

```bash
pnpm db:migrate
```

## 验证结果

- TypeScript：通过
- ESLint：通过
- 自动化测试：通过
- 后端构建：通过
- 后端健康检查：通过
- Expo Web 导出：通过

## 下一阶段建议

优先完成工程服务闭环：

```text
报价版本
→ 正式需求版本
→ 项目文件中心
→ 项目变更单
→ 验收记录
→ 争议入口
```
