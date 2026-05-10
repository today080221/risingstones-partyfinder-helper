# 品牌化 Release 资产命名

## 开始状态

- 当前分支：`main`。
- 开始前 `git status --short --branch`：干净，`main` 与 `origin/main` 同步。
- 已执行 `git fetch origin`。
- 目标：让后续打出来的 zip 包名和 zip 内应用程序名更符合商品名“阿谢姆水晶（Azem's Crystal）”。

## 范围

- 只调整发布/打包脚本、更新资产校验兼容和发布文档。
- 不修改招募筛选、NGA WebView、石之家缓存、AppAPI 或浏览器伴侣等功能代码。
- 不修改 npm package name、仓库名、Tauri identifier 或更新源仓库配置。

## 计划

- 抽出脚本共用的发布命名常量，避免桌面包和 Node 便携包各自硬编码旧英文文件名。
- 桌面便携 zip 改为品牌化文件名，仍保留 `desktop-win-x64-portable` 目标后缀，便于更新逻辑识别。
- zip 内桌面 exe 改为品牌化文件名。
- Node 便携包同步使用品牌化 zip 和 exe 名，保持备用包命名一致。
- 更新校验兼容旧英文 slug 和新品牌资产名，避免后续一键更新拒绝新命名资产。
- 重新构建并检查 zip 内容、SHA256 和相关验证。

## 风险

- 旧版本一键更新曾要求资产名以 `risingstones-partyfinder-helper-v` 开头；若只改资产名不改校验，会导致后续更新被拒绝。
- GitHub/Gitee Release 可以上传 Unicode 文件名，但脚本、PowerShell 和校验文件必须正确处理中文、全角括号和英文撇号。
- 当前已发布的 `v1.0.0` tag 不应在未明确要求时重写；本轮先保证后续构建产物命名正确。

## 实现

- 新增 `scripts/release-names.mjs`，统一定义产品展示名、发布包目录/zip 名和包内 exe 名。
- 桌面便携包命名改为：
  - `阿谢姆水晶（Azem's Crystal）-v1.0.0-desktop-win-x64-portable.zip`
  - 包内主程序：`阿谢姆水晶（Azem's Crystal）.exe`
- Node 备用便携包命名改为：
  - `阿谢姆水晶（Azem's Crystal）-v1.0.0-win-x64.zip`
  - 包内主程序：`阿谢姆水晶（Azem's Crystal）.exe`
- `release-manifest.json` 新增 `displayName` 和 `executableName` 字段，保留原 `name`、`target`、`runtime` 和更新源字段。
- `publish-gitee-release.mjs` 的默认 zip 路径同步到品牌化 Node 便携包名；桌面包仍可通过 `RELEASE_ZIP` 指定。
- Tauri 桌面端和 Node 备用便携包的一键更新校验兼容旧英文 slug 与新品牌资产名，同时继续要求 zip、运行形态后缀和受信下载域名。
- README、release 文档和代码签名说明同步品牌化 zip/exe 名。

## 验证

- `node --check scripts/release-names.mjs scripts/package-tauri-portable.mjs scripts/build-portable.mjs scripts/publish-gitee-release.mjs`：通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`：通过。
- `npm test`：7 个测试文件、167/167 通过。
- `npm run build`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `npm run package:desktop:portable`：通过，生成品牌化桌面 zip。
- `npm run build:portable`：通过，生成品牌化 Node 备用 zip。
- `cargo test --manifest-path src-tauri/Cargo.toml`：16/16 通过。
- 解包核验：
  - 桌面 zip 根目录包含 `阿谢姆水晶（Azem's Crystal）.exe`。
  - Node 备用 zip 根目录包含 `阿谢姆水晶（Azem's Crystal）.exe`。
  - 两份 `release-manifest.json` 均包含 `displayName` 和 `executableName`。
  - 两份 `.zip.sha256` 均写入品牌化 zip 文件名。
  - 从桌面 zip 内 exe 提取到的关联图标仍为橙色晶体。
- 本机产物：
  - `release/阿谢姆水晶（Azem's Crystal）-v1.0.0-desktop-win-x64-portable.zip`
  - SHA256：`AB81DE3176BBD308FE4C8DD7263DAA502D1343B1B7954C7DE10D99ABBE439EAC`
  - `release/阿谢姆水晶（Azem's Crystal）-v1.0.0-win-x64.zip`
  - SHA256：`508CB15F687ED9A3432D2B06BAABE6BBC9AE3DAD05854E6715274F09B75989D9`

## 遗留说明

- 本轮没有重写已发布的 `v1.0.0` tag。
- 如果要把 GitHub/Gitee 当前 `v1.0.0` Release 资产也替换成品牌化命名，应单独执行 Release 资产替换，并确认是否保留旧英文资产作为下载兼容入口。
