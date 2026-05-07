# Windows 代码签名准备说明

## 目标

代码签名用于让 Windows 和浏览器更容易识别发布者身份，降低“未知发布者”“不常见下载”“危险文件”等提示概率。签名不能保证零提示，但它是让软件建立信誉的基础。

## 当前结论

- `v0.1.2` 先发布未签名 EXE 便携包。
- 后续签名目标优先级：
  1. `RisingStones-PartyFinder.exe`
  2. 未来的安装器，例如 Tauri NSIS installer
  3. 更新包校验文件，例如 `SHA256SUMS.txt`
- `v0.1.2` 开始随 zip 生成并发布 `.zip.sha256`，作为签名前的基础完整性校验。
- 当前 zip 仍可能被 Chrome/Windows 标记为未知或不常见下载；真正缓解需要签名证书和下载信誉积累。

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

无论哪种方式，都不要把私钥、PFX 密码或签名服务凭据写入仓库。

### 3. Windows 签名工具链

本地签名通常需要：

- Windows 10/11 或 Windows Server 构建机。
- Windows SDK 中的 `signtool.exe`。
- 时间戳服务 URL。

示例命令形态：

```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a .\RisingStones-PartyFinder.exe
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

1. 先继续发布 `v0.1.2` 未签名 EXE 便携包，确认一键启动体验。
2. 采购或开通代码签名方案。
3. 本地用 `signtool verify /pa` 验证签名。
4. 构建脚本增加可选签名步骤：
   - 检测 `WINDOWS_SIGNING_ENABLED=true`。
   - 对 `RisingStones-PartyFinder.exe` 签名。
   - 生成 `SHA256SUMS.txt`。
5. 下一版 Release 开始发布签名 EXE。

## 验收

- `RisingStones-PartyFinder.exe` 右键属性显示有效数字签名。
- `signtool verify /pa .\RisingStones-PartyFinder.exe` 通过。
- Release 页面提供 zip SHA256。
- 下载后校验哈希与 Release 说明一致。
