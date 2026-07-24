## V4 Discover Mall Implementation Plan

- Baseline Branch: `codex/v4-discover-mall-publish-redesign`
- Baseline Commit: `9982e7defaeaac77f16f50d36bc3a834c9e43c31`
- Scope Rule: This plan lists only executable delivery steps and review boundaries.

### Commit 1

- Goal: 删除首页 Tab，默认进入发现。
- 修改文件:
  - `app/_layout.tsx`
  - `app/(tabs)/_layout.tsx`
  - `app/(tabs)/index.tsx`
  - `app/login.tsx`
  - `app/(tabs)/profile.tsx`
  - `components/auth-gate.tsx`
  - `app/coming-soon.tsx`
  - `shared/navigation/appNavigation.ts`
  - `tests/navigation-contract.test.ts`
  - `tests/runnable-prototype-navigation.test.ts`
- 不修改文件:
  - `app/(tabs)/discover.tsx`
  - `app/(tabs)/publish.tsx`
  - `app/(tabs)/messages.tsx`
  - `app/products/**`
  - `server/**`
  - `drizzle/**`
- 路由变化:
  - 根入口 `/` 进入 `discover`
  - 删除首页 Tab 展示
  - 旧 `app/(tabs)/index.tsx` 仅保留轻量重定向职责
- 数据源变化:
  - 无
- 测试范围:
  - 默认路由
  - Tabs 顺序
  - 登录后跳转
  - 退出登录回到公开发现
  - 旧首页兼容重定向
- 回滚点:
  - 单独回滚本提交即可恢复首页 Tab 和旧默认入口
- 验收标准:
  - 底部导航不再出现首页
  - 根入口进入发现
  - Android 返回键不会回到旧首页

### Commit 2

- Goal: 新增商城 Tab 壳层并接入现有产品目录能力。
- 修改文件:
  - `app/(tabs)/marketplace.tsx`
  - `app/products/index.tsx`
  - 共享商城目录组件文件
  - `shared/navigation/appNavigation.ts`
  - 相关导航测试
- 不修改文件:
  - `app/products/[publicCode].tsx`
  - `app/cart.tsx`
  - `server/routers.ts`
  - `drizzle/**`
- 路由变化:
  - 新增一级路由 `/(tabs)/marketplace`
  - 现有 `/products` 保持兼容
- 数据源变化:
  - 继续复用 `trpc.productModels.publicList`
- 测试范围:
  - 商城 Tab 可进入
  - 商城非空白
  - `/products` 与商城复用同一目录实现
- 回滚点:
  - 单独回滚本提交即可移除商城 Tab 壳层
- 验收标准:
  - 商城 Tab 进入真实目录能力
  - 购物车和详情链路不受影响

### Commit 3

- Goal: 重构发现页头部和横向频道栏。
- 修改文件:
  - `app/(tabs)/discover.tsx`
  - 发现页头部/频道相关组件
  - 相关样式与测试
- 不修改文件:
  - `app/(tabs)/marketplace.tsx`
  - `app/(tabs)/publish.tsx`
  - `app/(tabs)/profile.tsx`
  - `server/**`
- 路由变化:
  - 无新增路由
- 数据源变化:
  - 继续复用 `trpc.content.discover`
- 测试范围:
  - 频道切换
  - 头部结构
  - 公开访问
- 回滚点:
  - 单独回滚本提交即可恢复旧发现页头部
- 验收标准:
  - 发现页新头部和频道栏可稳定切换

### Commit 4

- Goal: 实现发现双列图文瀑布流。
- 修改文件:
  - `app/(tabs)/discover.tsx`
  - 发现卡片与瀑布流组件
  - 相关测试
- 不修改文件:
  - `app/(tabs)/marketplace.tsx`
  - `app/(tabs)/publish.tsx`
  - `server/**`
  - `drizzle/**`
- 路由变化:
  - 无
- 数据源变化:
  - 继续复用内容发现接口
- 测试范围:
  - 双列布局
  - 列表刷新
  - 空态/错误态
- 回滚点:
  - 单独回滚本提交即可退回单列列表
- 验收标准:
  - 瀑布流可滚动、可刷新、不卡死

### Commit 5

- Goal: 重做商城页面。
- 修改文件:
  - 商城 Tab 页面
  - 商城相关组件
  - 商品目录表现层测试
- 不修改文件:
  - `/products` 详情与购物车后端接口
  - `server/**`
  - `drizzle/**`
- 路由变化:
  - 商城 Tab 页面结构调整
  - `/products` 兼容入口保留
- 数据源变化:
  - 继续复用产品目录、购物车和详情查询
- 测试范围:
  - 商品列表
  - 入口跳转
  - 购物车入口
- 回滚点:
  - 单独回滚本提交即可恢复阶段 2 商城壳层
- 验收标准:
  - 商城页面完成一级视觉重构且链路可用

### Commit 6

- Goal: 重做发布页。
- 修改文件:
  - `app/(tabs)/publish.tsx`
  - 发布相关组件
  - 发布入口测试
- 不修改文件:
  - 真实业务表单路由
  - `server/**`
  - `drizzle/**`
- 路由变化:
  - 无新增业务路由
  - 继续接入已有发布入口
- 数据源变化:
  - 无新增数据源
- 测试范围:
  - 发布入口分组
  - 中间强调入口
  - 已有表单可达
- 回滚点:
  - 单独回滚本提交即可恢复旧发布页
- 验收标准:
  - 发布页视觉重构完成且不影响已有表单

### Commit 7

- Goal: 整理我的页面。
- 修改文件:
  - `app/(tabs)/profile.tsx`
  - 我的页面相关组件
  - 个人中心测试
- 不修改文件:
  - 认证、会话、权限服务端逻辑
  - `server/**`
  - `drizzle/**`
- 路由变化:
  - 无新增路由
- 数据源变化:
  - 继续复用个人资料、工作台和能力数据
- 测试范围:
  - 四区分组
  - 工作台入口
  - 设置入口
- 回滚点:
  - 单独回滚本提交即可恢复旧我的页面
- 验收标准:
  - 我的页面四区结构清晰且现有入口可达

### Commit 8

- Goal: 修复位置字段和错误展示。
- 修改文件:
  - `app/location/**`
  - `components/foreground-location-card.tsx`
  - `hooks/use-foreground-location.ts`
  - `shared/location.ts`
  - `server/routers.ts`
  - 位置相关测试
- 不修改文件:
  - 发现/商城/发布视觉文件
  - `drizzle/**`
- 路由变化:
  - 无
- 数据源变化:
  - 调整位置 payload 与校验映射
- 测试范围:
  - 手动城市
  - 定位模式
  - 用户可见错误信息
- 回滚点:
  - 单独回滚本提交即可恢复旧位置行为
- 验收标准:
  - 手动城市模式只要求 `cityName`
  - Release UI 不展示原始校验 JSON

### Commit 9

- Goal: 统一产品护照视觉。
- 修改文件:
  - `app/products/passport/**`
  - 产品护照视觉组件
  - 相关测试
- 不修改文件:
  - 产品护照事件数据模型
  - `server/**`
  - `drizzle/**`
- 路由变化:
  - 无
- 数据源变化:
  - 继续复用现有产品护照查询
- 测试范围:
  - 护照页视觉
  - 入口跳转
  - 公开访问与详情展示
- 回滚点:
  - 单独回滚本提交即可恢复旧护照视觉
- 验收标准:
  - 产品护照视觉统一且不改变可信事件链逻辑
