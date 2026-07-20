# V3.3 RC1.2 Android Validation Report

## Git 基线
- 分支：`codex/v3.3-rc1-validation`
- 起始 HEAD：`4c02e5f407729d4e5966033dd11309a6b891cd06`
- 任务范围：仅执行 Android 本地环境、真机链路验证、必要窄修和发布候选结论；未开发新业务，未创建 EAS 云构建，未连接生产数据库。

## Android SDK 与 adb
- 结果：`PASS`
- `adb` 初始状态：未安装到 PATH
- 处理：安装官方 Android SDK `platform-tools` 到用户目录 `C:\Users\chejun\AppData\Local\Android\Sdk\platform-tools`
- `adb version`：`1.0.41` / `37.0.0-14910828`
- `adb devices -l`：`device`
- 设备：
  - 品牌 / 型号：`Redmi 23049RAD8C`
  - Android：`13`
  - API Level：`33`
  - ABI：`arm64-v8a`
  - 分辨率：`1080x2400`
  - 密度：`440`
- 已安装应用：
  - `com.shenghuobang.app`
  - versionName `3.2.4`
  - versionCode `324`
- 证据：
  - `artifacts/v3.3-rc1/android/rc12-launch.png`
  - `artifacts/v3.3-rc1/android/rc12-expo-go.png`

## 网络与后端连接
- 结果：`BLOCKED`
- 开发机局域网 IPv4：`192.168.147.92`
- 设备 WLAN 路由：`192.168.147.106/24`
- 隔离后端：
  - `http://127.0.0.1:3000/api/health`：`PASS`
  - `http://127.0.0.1:3000/api/ready`：`PASS`
  - `http://192.168.147.92:3000/api/health`：开发机自测 `PASS`
  - `http://192.168.147.92:3000/api/ready`：开发机自测 `PASS`
- 运行方式：
  - 后端使用 RC1.1 已验证的隔离库 `shenghuobang_v33_rc1`
  - 移动端 `.env.local` 指向 `EXPO_PUBLIC_API_BASE_URL=http://192.168.147.92:3000`
  - Expo 启动命令：`expo start --dev-client --lan --port 8081`
- 实际阻塞：
  - 真机启动已进入应用，但首页显示“无法连接生活帮服务，请检查网络和 API 地址后重试”
  - Expo Go 可被 `exp://192.168.147.92:8081` 唤起，但 Metro 未产生设备附着日志，未形成可验证的当前 bundle 加载闭环
  - 当前执行环境无权限新增 Windows 入站防火墙规则，无法排除/修复开发机对手机的 `3000/8081` 局域网入站阻塞
- 结论：真机无法稳定连到当前 RC1.2 的后端 / Metro，不能继续声称完成真实业务链路验收。

## MySQL 隔离环境
- 结果：`PASS`
- 数据库：`shenghuobang_v33_rc1`
- MySQL：`8.0.45`
- 连接方式：仅使用本地隔离实例 `127.0.0.1:3307`
- 密码未写入报告与日志正文。

## 测试账号
- 结果：`BLOCKED`
- 原因：真机到后端 LAN 链路未打通，未进入可执行的登录与业务流阶段，因此未在本轮报告中登记/使用新的测试账号集。

## 75 项业务测试
- 结果：`BLOCKED`
- 已确认：
  - 真机可通过 `adb` 检测与启动 App
  - 设备上存在 `com.shenghuobang.app`
  - App 首页可启动，但当前表现为网络失败页
- 未完成：
  - A. 登录与身份 `1/6`
  - B. 创意 `0/7`
  - C. 协作者 `0/8`
  - D. NDA 与附件 `0/9`
  - E. 创意转项目 `0/5`
  - F. 设计版本 `0/9`
  - G. 原型里程碑 `0/8`
  - H. 验收与返工 `0/11`
  - I. 项目意向 `0/12`
- 统计：
  - 通过：`0`
  - 失败：`0`
  - 阻断：`75`

## Android 行为测试
- 结果：`BLOCKED`
- 原因：未进入当前 RC1.2 bundle 的稳定业务态，无法对返回键、前后台切换、离线重试、上传离页、文件返回 App、长列表加载、403/404/409 页面等行为给出真实结论。

## 数据库对账
- 结果：`BLOCKED`
- 原因：未形成真机写入链路，因此不存在本轮 Android 业务操作对应的 MySQL 对账数据。

## 安全验证
- 结果：`BLOCKED`
- 已知前提：
  - RC1.1 数据库、受控文件、token 版本和隔离 MySQL 验证已通过
  - 当前未发现生产数据库连接或敏感凭据泄露
- 本轮未能完成的真机安全项：
  - 客户端伪造 `currentRole` / `accountId` / `membershipId` / `versionNo`
  - 跨 idea / 项目 / submission 访问受控文件
  - token 过期与 policyVersion 变化撤权
  - private / NDA 资源 ID 枚举
  - 意向接口私密项目探测

## 修复清单
- 已完成环境窄修：
  - 安装官方 Android SDK `platform-tools`
  - 仅在当前终端启用 `adb`
  - 记录设备与应用版本信息
  - 为本轮真机验证创建本地 `.env.local`，将移动端 API/WS 指向开发机局域网地址
  - 启动真实后端并确认 `health` / `ready` 与隔离数据库均正常
- 未完成修复：
  - Windows 局域网入站端口 `3000/8081` 放行
  - 真实 Metro LAN 附着与当前 bundle 加载

## 自动化回归
- 结果：`BLOCKED`
- 原因：RC1.2 的停止条件已触发，未继续执行本轮要求的回归串行复跑。
- 参考基线：
  - RC1.1 非真机全量门禁为 `PASS`
  - 本轮未对业务代码做新的 Git 内代码修改

## P0 / P1 / P2
- `P1`：真机无法通过局域网连接当前 RC1.2 后端 / Metro，导致 V3.3 核心链路无法开始执行
- 未新增代码级 P0/P2 修复提交

## 未解决问题
- 当前执行环境无权限新增 Windows 防火墙规则，无法放行私有网络上的 `3000/8081`
- 真机虽与开发机同网段，但 RC1.2 bundle 与后端链路未打通
- 在此状态下继续声称通过 75 项业务测试会构成伪造真机结果

## 结论
- 是否允许创建 PR：`否`
- 是否允许合并 main：`否`
- 是否允许打 V3.3 标签：`否`
- 阻断原因：
  - 真机核心业务链无法开始执行
  - Android 真机 75 项业务测试全部处于阻断状态
  - MySQL Android 对账与真机安全验证均未完成

## 建议下一步
- 以管理员权限临时放行开发机私有网络 TCP `3000` / `8081`，或由用户手动完成等价放行
- 重新验证真机对 `http://192.168.147.92:3000` 与 `exp://192.168.147.92:8081` 的可达性
- 在 LAN 链路打通后，重新执行 RC1.2 的 75 项业务链路、Android 行为测试、安全验证与自动化回归

## RC1.2 USB Reverse 复测
- 复测基线：
  - 分支：`codex/v3.3-rc1-validation`
  - HEAD：`1fe749a561fd4eb133d8816cbb97394cd7d8c4b3`
  - 工作区：Git 干净；`artifacts/v3.3-rc1/android/` 未被 Git 跟踪
  - 数据库：`shenghuobang_v33_rc1`
  - MySQL：`8.0.45`
- `adb reverse`：
  - `adb reverse --remove-all`
  - `adb reverse tcp:3000 tcp:3000`
  - `adb reverse tcp:8081 tcp:8081`
  - `adb reverse --list` 结果：
    - `UsbFfs tcp:3000 tcp:3000`
    - `UsbFfs tcp:8081 tcp:8081`
- API 地址切换：
  - 本地未跟踪 `.env.local` 已从 `http://192.168.147.92:3000`
  - 切换为 `http://127.0.0.1:3000`
  - WebSocket 同步切换为 `ws://127.0.0.1:3000`

### 后端结果
- 结果：`PASS`
- 启动方式：真实后端 + RC1 隔离数据库
- `http://127.0.0.1:3000/api/health`：`PASS`
- `http://127.0.0.1:3000/api/ready`：`PASS`
- 启动日志：`server.listening`，端口 `3000`，未输出数据库密码、token 或 `storageKey`

### Metro 与当前 V3.3 Bundle
- 结果：`BLOCKED`
- 尝试 1：
  - `pnpm exec expo start --dev-client --localhost --port 8081 --clear`
  - 使用 `exp+shenghuobang://expo-development-client/?url=http://127.0.0.1:8081`
  - 现有 `com.shenghuobang.app` 被 brought to front，但未出现当前 bundle 附着证据
  - 页面仍停留在旧的“首页加载失败 / 无法连接生活帮服务”状态
- 尝试 2：
  - `pnpm exec expo start --go --localhost --port 8081 --clear`
  - 使用 `exp://127.0.0.1:8081`
  - Expo Go 进入错误页，并可查看到明确错误日志
- 关键证据：
  - Expo Go 错误：`Uncaught Error: java.io.IOException: Failed to download remote update`
  - Metro 输出：
    - `Networking has been disabled`
    - `Skipping dependency validation in offline mode`
    - `Waiting on http://localhost:8081`
  - 主机本地探针：
    - `http://127.0.0.1:8081/status`：`packager-status:running`
    - `http://127.0.0.1:8081/index.bundle?platform=android&dev=true&minify=false`：`404`
    - Expo Go manifest 风格请求：超时或 `404`
- 结论：
  - USB Reverse 已成功建立
  - 但当前 RC1.2 的 V3.3 Metro bundle 仍无法通过 `127.0.0.1:8081` 正常提供给真机
  - 这已命中本轮停止条件：`当前 V3.3 Metro bundle 无法加载`

### 冒烟门禁
- 1. `adb reverse --list` 显示 `3000/8081`：`PASS`
- 2. 真机成功加载当前 Metro bundle：`BLOCKED`
- 3. 首页不再显示“无法连接生活帮服务”：`BLOCKED`
- 4. 登录接口能够到达真实后端：`BLOCKED`
- 5. 后端日志出现来自当前真机流程的请求：`BLOCKED`
- 6. App 能读取 `/api/health` 或等价启动数据：`BLOCKED`
- 7. 当前 bundle 能打开 V3.3 页面：`BLOCKED`
- 8. 无 `CLEARTEXT communication not permitted`：`PASS`
- 9. 无 `Network request failed`：`BLOCKED`
- 10. 无旧 bundle 缓存误加载：`BLOCKED`

### 75 项复测结果
- 结果：`BLOCKED`
- 原因：冒烟门禁未通过，未进入可验证的当前 V3.3 bundle
- 统计：
  - 通过：`0`
  - 失败：`0`
  - 阻断：`75`

### Android 行为结果
- 结果：`BLOCKED`
- 原因：当前 V3.3 bundle 未成功附着，无法对返回键、前后台切换、离线重试、文件打开后返回 App、长列表、403/404/409 等行为给出真实结论

### MySQL 对账
- 结果：`BLOCKED`
- 原因：真机未形成可追踪的当前 V3.3 业务写入链路

### 安全验证
- 结果：`BLOCKED`
- 已排除项：
  - 未出现 `CLEARTEXT communication not permitted`
  - 后端仍使用 RC1 隔离库，未连接生产或共享数据库
- 未完成项：
  - 客户端伪造字段、跨资源 token、撤权失效、private/NDA 枚举、意向可见性等真机安全验证

### 修复项
- 本轮未修改业务代码
- 本轮仅做本地环境窄修：
  - 建立 `adb reverse`
  - 切换本地未跟踪 `.env.local` 到 `127.0.0.1`
  - 用 `--localhost` 重启后端与 Metro

### 自动化回归
- 结果：`BLOCKED`
- 原因：USB Reverse 后的冒烟门禁未通过，不满足继续执行全量回归的前置条件

### 最终 PR / main / tag 结论
- 是否允许创建 PR：`否`
- 是否允许合并 main：`否`
- 是否允许打 V3.3 标签：`否`
- 最终阻断原因：
  - `adb reverse` 已成功
  - 但当前 V3.3 Metro bundle 仍无法被真机加载
  - 因此 75 项 Android 验收、MySQL 对账和安全验证无法继续
