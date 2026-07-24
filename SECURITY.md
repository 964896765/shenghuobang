# Security Policy

## Reporting

- 请不要在公开 Issue、公开 PR 或公开讨论中提交密钥、Token、数据库连接串、真实手机号、真实地址或其他个人信息。
- 发现漏洞后，请通过仓库所有者可控的私密渠道报告；如果当前没有公开安全邮箱，请先使用 GitHub 私有沟通能力或受限协作渠道联系维护者。
- 报告时请尽量提供：影响版本、复现步骤、影响范围、是否需要鉴权、最小 PoC 和建议缓解方式。

## Supported Versions

| Version | Status |
| --- | --- |
| `main` after `v4.0.0-alpha` | Supported for Alpha stabilization |
| `v4.0.0-alpha` | Supported as historical alpha baseline |
| `V3.2.4` stable baseline | Supported for historical upgrade and compatibility checks |

## Priority

- P0：Session 撤销失效、越权、支付/资金、文件访问、身份权限绕过、数据泄露。
- P1：登录爆破、演示 Seed 越权执行、Release 启动导致安全边界失效、迁移完整性破坏。
- P2：日志脱敏、限流绕过、开发配置暴露、文档中出现敏感信息。

## Scope Boundaries

- 当前支付仅允许 `sandbox`，不得声称已接入真实支付。
- 当前 LAN Demo 仅用于受控开发环境，不是公开生产发布。
- Session、支付、文件访问、身份/组织/能力权限相关漏洞优先级高于普通 UI 缺陷。
- 对外报告时仅提交最小必要信息，不附带本地 `.env`、APK/AAB、数据库文件或 `artifacts/`。
