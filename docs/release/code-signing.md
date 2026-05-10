# Windows 代码签名准备说明

## 目标

代码签名用于让 Windows 和浏览器更容易识别发布者身份，降低“未知发布者”“不常见下载”“危险文件”等提示概率。签名不能保证零提示，但它是让软件建立信誉的基础。

## 当前结论

- `v0.1.2` 已先发布未签名 Node EXE 便携包。
- `v0.1.5` 桌面便携包改为 Tauri EXE 并加入一键更新，仍需要签名来降低 SmartScreen 提示。
- `v1.0.1` 仍是未签名发布包；Release 页面和 README 已补充官方下载来源、SHA256 校验和 Windows/Chrome 风险提示。
- 后续签名目标优先级：
  1. `阿谢姆水晶（Azem's Crystal）.exe`（Tauri 桌面便携包）
  2. `阿谢姆水晶（Azem's Crystal）.exe`（Node 备用便携包）
  3. 未来的安装器，例如 Tauri NSIS installer
  4. 更新包校验文件，例如 `SHA256SUMS.txt`
- `v0.1.2` 开始随 zip 生成并发布 `.zip.sha256`，作为签名前的基础完整性校验。
- 当前 zip 仍可能被 Chrome/Windows 标记为未知或不常见下载；真正缓解需要签名证书和下载信誉积累。
- 自签名证书不适合作为公开下载的可信度方案；它可以验证“同一把私钥签过”，但不能证明发布者是受信 CA 验证过的主体，也很难改善普通用户看到的未知发布者提示。

## 现在能立刻做的免费措施

这些措施不能替代代码签名，但可以降低用户困惑：

- Release 说明中列出官方 GitHub/Gitee 下载页、tag commit、资产文件名和 SHA256。
- 同时上传 `.zip.sha256` 和桌面 zip 内主程序的 `.exe.sha256`。
- README 顶部只指向官方 Release 页，并提醒不要从二次打包来源下载。
- 告知用户 Windows/Chrome 可能因为新发布、低下载量、未签名而提示风险；不要引导用户关闭安全保护。

可继续调研的低成本路线：

- SignPath Foundation 面向符合条件的开源项目提供免费签名服务，但需要申请和流程接入，不是“今天立刻生效”的本地证书。
- Microsoft Store 分发可降低安装信任成本，但需要额外打包、审核和商店账号流程。

## 需要准备什么

### 1. 发布者身份

需要决定证书主体是谁：

- 个人开发者：个人实名证书，成本较低，但展示的是个人名称。
- 公司/组织：OV 或 EV 代码签名证书，展示公司/组织名称，可信度更高。

如果准备长期公开分发，推荐公司/组织主体；如果只是个人开源工具，可先用个人/OV 证书。

### 2. 代码签名证书

可选路线：

- 传统代码签名证书：从受信 CA 购买，拿到证书后用 `signtool.exe` 签名。
- Azure Trusted Signing：微软提供的云端签名服务，证书和密钥托管在 Azure，适合后续接 CI。
- 开源托管签名：例如 SignPath Foundation，适合符合条件的开源项目，但需要申请和 CI 集成。

无论哪种方式，都不要把私钥、PFX 密码或签名服务凭据写入仓库。

OV 与 EV 的区别：

- OV 证书会验证组织/个人主体，成本通常低于 EV；新证书和新文件仍需要逐步积累下载与信誉。
- EV 证书验证更严格，私钥保护要求更高，传统上更容易建立发行者信誉；但不应承诺“购买 EV 后 SmartScreen 永不提示”，微软当前文档也明确 EV 不再默认授予即时信誉。

### 3. Windows 签名工具链

本地签名通常需要：

- Windows 10/11 或 Windows Server 构建机。
- Windows SDK 中的 `signtool.exe`。
- 时间戳服务 URL。

示例命令形态：

```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a '.\阿谢姆水晶（Azem''s Crystal）.exe'
```

实际命令会根据证书来源变化，例如使用证书存储、PFX 文件或 Azure Trusted Signing。

### 4. 发布流程里的密钥管理

本地签名：

- PFX 文件放在发布机本地安全目录。
- PFX 密码用本地密钥管理器或环境变量临时注入。
- 不提交 PFX、密码、证书私钥或签名日志中的敏感内容。

GitHub Actions 签名：

- 使用 GitHub Secrets 保存必要凭据。
- 推荐先手动本地签名跑通，再接入 CI。
- 如果使用 Azure Trusted Signing，需要准备 Azure 租户、订阅、签名账号和证书配置文件。

## 建议路线

1. 先发布 `v0.1.5` 未签名 Tauri 桌面便携包，确认桌面窗口和一键更新体验。
2. 采购或开通代码签名方案。
3. 本地用 `signtool verify /pa` 验证签名。
4. 构建脚本增加可选签名步骤：
   - 检测 `WINDOWS_SIGNING_ENABLED=true`。
   - 对 Tauri 桌面便携包和备用 Node 便携包内的 `阿谢姆水晶（Azem's Crystal）.exe` 签名。
   - 生成 `SHA256SUMS.txt`。
5. 下一版 Release 开始发布签名 EXE。

Tauri 接入点：

- 优先使用 Tauri v2 的 Windows 签名配置或 `bundle.windows.signCommand`，让 `desktop:build` / `desktop:build:portable` 在产出 EXE 后调用统一签名命令。
- 本地先用 `signtool sign` 跑通，再把签名命令抽成脚本，避免把证书路径、PFX 密码或云签名凭据写入仓库。
- CI 接入时只通过 GitHub Secrets 或云签名身份读取凭据，并保留未配置签名时的无签名构建路径。

## 参考

- Microsoft SmartScreen reputation: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- Microsoft SignTool: https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool
- Tauri Windows signing: https://v2.tauri.app/distribute/sign/windows/
- Chrome 下载警告说明: https://support.google.com/chrome/answer/6261569

## 验收

- `阿谢姆水晶（Azem's Crystal）.exe` 右键属性显示有效数字签名。
- `signtool verify /pa '.\阿谢姆水晶（Azem''s Crystal）.exe'` 通过。
- Release 页面提供 zip SHA256。
- 下载后校验哈希与 Release 说明一致。
