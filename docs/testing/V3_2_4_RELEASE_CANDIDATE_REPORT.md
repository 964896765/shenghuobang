Document Status: RELEASE BLOCKED
Updated At: 2026-07-18
Code Baseline: a3051149ced87eb4e92024c2f6d595b6f1dfca84 plus closure branch

# V3.2.4 Release Candidate 报告

## 判定

本轮没有可正式指定的最终 RC APK。所有已完成构建只保留为历史验证记录；已取消构建、临时隧道和 Preview 临时变量均已止损，不再续建或复用。下一次 RC 只在稳定测试环境、最新 PR CI 和 MySQL 门禁通过后进行。

## EAS Build 记录（UTC）

| Build ID | 状态 | Commit | API Host 类型 |
|---|---|---|---|
| 64c5cc36-e1a2-4b28-9c2c-b04cc8545cd8 | FINISHED | 2d908c3 | 未配置 |
| b7e03f53-ce49-449a-8a8e-e21ce08c0a11 | FINISHED | 2d908c3 | localhost 回环地址 |
| f09850ff-18de-41e0-8957-3396c21e2c01 | CANCELED | 2d908c3 | lvh.me 回环地址 |
| 01086d7c-4426-4ef9-9a9f-88d96d2e214f | FINISHED | a305114 | lvh.me / 明文 HTTP |
| 5359a642-5273-4a9c-ac7e-45b3a35de097 | FINISHED | a305114 | trycloudflare.com（已过期） |
| 0a70c700-55af-4fab-829f-402c78edbfd1 | FINISHED | a305114 | loca.lt（临时） |
| 64f7d542-a0a6-4715-939e-3001ee8ad9f1 | CANCELED | a305114 | localhost.run |
| 6e657c1d-e653-4d39-b908-05847f0e423c | CANCELED | a305114 | pinggy |

## 已知 APK

| 文件 | 大小 | SHA-256 前缀 | 判定 |
|---|---:|---|---|
| rc.apk | 67,882,272 | 8c06a934 | 可解析，但 API 未配置 |
| rc-a305114.apk | 67,883,040 | db2a5450 | 可解析，但使用 lvh.me HTTP/WS |
| rc-https.apk | 67,883,088 | 368ca0bd | 可解析，但临时 HTTPS 已过期 |
| rc-final.apk | 48,824,320 | 65a48705 | 损坏/无效 |

## 真机状态

已有 Android 验证证据继续保留，但不存在“最新最终 RC + 稳定 API”条件下完整、连续的 21 项冒烟，因此不得把旧证据拼接成最终通过。最终报告必须记录 APK 哈希、Commit、API 环境、设备、21 项逐项结果和失败复验。
