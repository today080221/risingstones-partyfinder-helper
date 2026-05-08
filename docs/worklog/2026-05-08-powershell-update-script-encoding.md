# PowerShell 自更新脚本编码修复记录

## Start

- 开始：用户反馈 `0.1.8` 桌面版能检测并下载 `0.1.9`，但没有覆盖安装，也没有重启；重启后仍是 `0.1.8`。
- 现场检查：临时目录中存在更新 zip 和 `apply-update.ps1`，但没有 `apply-update.log`，说明脚本未进入第一条日志。
- 定位结果：失败脚本为无 BOM UTF-8；Windows PowerShell 5.1 按系统 ANSI 解析，遇到中文字符串或中文安装路径时语法解析失败。将同一脚本重新保存为带 UTF-8 BOM 后，PowerShell AST 解析通过。

## Requirement Alignment

- 不是下载失败，也不是覆盖重试失败；需要修复“生成的 ps1 在 Windows PowerShell 5.1 下无法可靠解析”的根因。
- Tauri 桌面版和 Node 便携版都要修，因为二者都生成 `apply-update.ps1`。
- GitHub/Gitee 更新源都受影响，因为问题发生在下载后的本地安装脚本阶段。
- 已发布的 `0.1.8` / `0.1.9` 自更新器无法通过远端包修复自身；需要用户手动替换到修复版一次。

## Implementation

- Tauri 桌面版：
  - `apply-update.ps1` 改为通过 `write_powershell_script()` 写入，文件前缀 UTF-8 BOM。
  - 启动 PowerShell 前先写入 `apply-update.log` 准备记录，脚本未启动时也能留下证据。
- Node 便携版：
  - `apply-update.ps1` 和 GitHub 系统代理下载用的 `download-update.ps1` 都改为带 UTF-8 BOM 写入。
  - 同步在启动覆盖脚本前写入准备日志。
- 版本升级为 `0.1.10`，用于发布自更新脚本编码修复。

## Verification

- 现场复现验证：
  - 原失败目录存在 `apply-update.ps1` 和更新 zip，但没有 `apply-update.log`。
  - Windows PowerShell AST 解析原无 BOM 脚本失败。
  - 将同一脚本写为 UTF-8 BOM 后，Windows PowerShell AST 解析通过。
- `npm test`：通过，2 个测试文件、19 个测试通过。
- `npm run build`：通过，前端生产构建完成。
- `npm run build:server`：通过，Node 服务 bundle 生成成功。
- `npm run package:desktop:portable`：通过，生成 `release/risingstones-partyfinder-helper-v0.1.10-desktop-win-x64-portable.zip`。
- `npm run build:portable`：通过，生成 `release/risingstones-partyfinder-helper-v0.1.10-win-x64.zip`。
- zip manifest 检查：Node 便携包和 Tauri 桌面便携包版本均为 `0.1.10`，更新源 key 均为 `github,gitee`。
- GitHub Actions：
  - `Release / v0.1.10`：通过，已发布桌面便携包、Node 便携包和对应 `.sha256`。
  - `CI / main`：通过。
- GitHub Release 资产检查：
  - Release 已创建且不是草稿/预发布。
  - 资产包含 `risingstones-partyfinder-helper-v0.1.10-desktop-win-x64-portable.zip`、`risingstones-partyfinder-helper-v0.1.10-win-x64.zip` 和两份 `.sha256`。
- SHA256：
  - Node 便携包：`A8DEED9020FAA5083D974533EF94F131650EA207E15153A05E332B3E8742B0C8`
  - Tauri 桌面便携包：`A594383EEA4453B49768A2DFDFFBB8CC9B25B0E6CF2E228B6C0C36577741F325`

## End

- 完成：`0.1.10` 已修复 PowerShell 自更新脚本编码问题，并完成本地验证、双远端推送和 GitHub Release 发布。
- 注意：`0.1.8` / `0.1.9` 的旧自更新器会继续生成无 BOM 脚本，因此需要用户手动解压替换到 `0.1.10` 一次；之后的自更新链路才会使用修复后的脚本写入方式。
- 国内镜像 Release 资产仍需发布机使用本地 Gitee 令牌执行 `npm run release:gitee` 上传。
