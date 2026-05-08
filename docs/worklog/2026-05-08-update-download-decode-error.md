# 一键更新包读取失败修复记录

## Start

- 开始：用户在本地 `0.1.6` 桌面便携包中收到更新后点击“一键更新”，报错 `更新包读取失败：error decoding response body`。
- 初步定位：错误来自 Tauri 桌面端 `download_update_file()` 中 `response.bytes()` 读取更新 zip 的阶段。

## Requirement Alignment

- 一键更新下载的是 Release zip，不能复用普通 API 请求的短超时策略。
- 更新包下载需要更适合二进制文件：
  - 更长超时。
  - 禁止压缩响应编码，避免 zip 被误解码。
  - 临时网络错误可重试。
  - 保持现有只允许 GitHub/Gitee 受信任下载源的安全边界。
- Node 便携版下载链路也同步加基本重试，避免两种运行形态行为差异过大。
- 如果用户选择 GitHub 下载，优先使用当前 Windows 系统代理设置；国内镜像继续保持直接下载。
- “下载成功但没有安装”的反馈说明覆盖脚本需要留日志和失败痕迹，避免静默失败。

## Implementation

- Tauri 桌面版：
  - 新增更新下载专用客户端，超时从普通 API 的 25 秒提高到 10 分钟。
  - 下载请求加入 `Accept: application/octet-stream, application/zip, */*` 和 `Accept-Encoding: identity`。
  - 更新 zip 下载增加 3 次重试，临时链路失败时自动再试。
  - GitHub 更新包下载启用 `reqwest` 的 Windows/macOS 系统代理读取；普通官方接口和非 GitHub 更新源不改走系统代理。
  - 自更新 PowerShell 脚本写入 `apply-update.log`，覆盖、解压、重启失败会留下本地诊断信息。
- Node 便携版：
  - 下载更新包时加入同样的二进制响应头。
  - 增加 3 次重试，最终失败时保留“更新包读取失败”上下文。
  - Windows 下 GitHub 更新包先通过 PowerShell `Invoke-WebRequest` 下载，以复用系统代理设置；失败后回退 Node `fetch`。
  - 自更新 PowerShell 脚本同样写入 `apply-update.log`。
- 轻量 updater 评估：
  - 现阶段不新增独立 updater exe，先把现有“临时 PowerShell updater”做成带日志、可重试、可定位失败的轻量更新器。
  - 如果 `0.1.8` 后仍出现覆盖失败，可基于日志再升级为单独 sidecar updater。
- 版本升级为 `0.1.8`，用于发布更新下载加固。

## Verification

- `npm test`：通过，16 个测试通过。
- `npm run build`：通过，前端生产构建完成。
- `npm run build:server`：通过，Node 服务 bundle 生成成功。
- `npm run package:desktop:portable`：通过，生成 `release/risingstones-partyfinder-helper-v0.1.8-desktop-win-x64-portable.zip`。
- `npm run build:portable`：通过，生成 `release/risingstones-partyfinder-helper-v0.1.8-win-x64.zip`。
- zip manifest 检查：Node 便携包和 Tauri 桌面便携包均内置 `github,gitee` 两个更新源 key。
- GitHub Actions：
  - `Release / v0.1.8`：通过，已发布桌面便携包、Node 便携包和对应 `.sha256`。
  - `CI / main`：通过。
- GitHub Release 回拉验证：
  - 桌面便携包下载成功，manifest 更新源 key 为 `github,gitee`。
  - Node 便携包资产已发布；本机回拉大包时网络超时，本地构建包已完成 manifest 双源检查。
- SHA256：
  - Node 便携包：`66393A46A9175A3132D56CF229920433CF0D0346A4E270C9A99C6F04E0527CA8`
  - Tauri 桌面便携包：`FFC27FB09B21E39ACBE61120833C8AAD4CCA1F409D6CB3A4AC9C1C0443865FF5`

## End

- 完成：`0.1.8` 已修复更新包读取链路、GitHub 下载系统代理、覆盖脚本日志，并完成两种便携包本机构建验收和 GitHub Release 发布。
- 注意：已经安装的 `0.1.6` 客户端本身没有这些修复；如果它的一键更新仍因旧下载器/旧覆盖脚本失败，需要手动替换到 `0.1.8` 一次，之后再走新版一键更新链路。
