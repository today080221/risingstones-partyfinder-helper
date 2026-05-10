# Docs Chain

## Purpose

本目录是“阿谢姆水晶（Azem's Crystal）”即 `risingstones-partyfinder-helper` 的项目级文档链。后续实现、验收、结构调整都应能从这里追溯到对应代码和工作记录。

## Entries

- `collaboration/harness-engineering.md`
  本项目采用的 Harness 工程协作规则，包括开始工作、需求对齐、结束工作时的文档更新要求。

- `features/partyfinder-helper.md`
  阿谢姆水晶（Azem's Crystal）的需求、接口、筛选语义和响应招募边界。

- `features/nga-public-aggregation.md`
  NGA 本地招募聚合的需求、合规边界、样本字段、Parser 训练式工作流和 Parser v1 边界。

- `architecture.md`
  本地前端、本地代理、官方接口和 Tampermonkey 脚本的数据流与安全边界。

- `release/portable-package.md`
  Windows 便携包的构建、内容、发布和验收说明。

- `release/desktop-tauri.md`
  Tauri 桌面客户端、便携包构建、命令层、前置环境和后续更新方案。

- `release/code-signing.md`
  Windows 代码签名证书、SignTool、密钥管理和后续 CI 签名准备说明。

- `userscripts/tampermonkey.md`
  官方页面手动响应助手脚本的安装、使用和安全边界。

- `worklog/2026-05-07-ff14-partyfinder-helper.md`
  本轮实现的启动、需求对齐、实施与验收记录。

- `worklog/2026-05-08-tauri-desktop-prototype.md`
  Tauri 桌面客户端原型工作记录。

- `worklog/2026-05-08-exe-portable.md`
  EXE 便携版一键启动入口工作记录。

- `worklog/2026-05-08-v0.1.2-release.md`
  v0.1.2 Release 发布和签名准备工作记录。

- `worklog/2026-05-08-tauri-build-run.md`
  Tauri 桌面便携版实机构建、启动验收和 NSIS 打包状态记录。

- `worklog/2026-05-08-gitee-update-source-config.md`
  国内镜像更新源配置注入与 Tauri 读取修复记录。

- `worklog/2026-05-08-v0.1.5-self-update.md`
  v0.1.5 一键更新、主按钮视觉修复和本机发布脚本加固记录。
- `worklog/2026-05-08-v0.1.6-tauri-release.md`
  v0.1.6 Tauri 桌面便携包 127.0.0.1 refused 修复和发布记录。
- `worklog/2026-05-08-github-asset-mirror-diagnosis.md`
  GitHub 下载包国内镜像未配置的 manifest 差异诊断记录。
- `worklog/2026-05-08-job-filter-and-release-source.md`
  职业智能筛选优化和 Release 双更新源内置记录。
- `worklog/2026-05-08-update-download-decode-error.md`
  一键更新包读取失败的下载链路修复记录。
- `worklog/2026-05-08-update-status-mirror-lag.md`
  更新状态在镜像节点落后时误显示对齐的修复记录。
- `worklog/2026-05-08-powershell-update-script-encoding.md`
  PowerShell 自更新脚本无 BOM 导致覆盖安装不执行的修复记录。
- `worklog/2026-05-08-tauri-official-detail-opener.md`
  Tauri 桌面端官方详情外链无法打开系统浏览器的修复记录。

- `worklog/2026-05-08-nga-login-aggregation.md`
  NGA 本地 WebView 招募读取早期工作记录；文件名保留历史分支口径，现行产品口径以公开招募页读取为主。

- `worklog/2026-05-09-nga-parser-handoff.md`
  NGA Parser v1 当前实现、验证结果和新 thread 接手入口。

- `worklog/2026-05-09-nga-sidebar-and-regions.md`
  NGA 提取器侧栏遮挡修复、欧区/大洋洲区/美区招募板入口补充和验证记录。

- `worklog/2026-05-09-aggregate-search-nga-compact.md`
  聚合检索入口、结果来源多选、侧栏顺序二次 compact、NGA 继续浏览页等待、cache-first 快扫、归档清理和标题清洗改造记录。

- `worklog/2026-05-09-parser-carry-license.md`
  `装甲车过本看不到我` Parser 极性修正、curated harness 覆盖和 MIT 许可归属更新记录。

- `worklog/2026-05-10-nga-cache-merge-precheck.md`
  NGA metadata 快扫、cache 生命周期、0 主题翻页保护和 merge/release 前 final QA 预检记录。

- `worklog/2026-05-10-pr-review-public-aggregation.md`
  PR review 后的公开招募聚合口径、继续浏览页辅助处理显式授权、Tauri 取消/并发加固和验证记录。

- `worklog/2026-05-10-official-cache-nga-public-fetch.md`
  石之家 15 分钟轻缓存、NGA 默认 WebView 读取、公开页面快速读取下线、stale 静默刷新、统一读取锁、应用图标和当前零式别名筛选收口记录。

- `worklog/2026-05-10-v1.0.0-release.md`
  v1.0.0 首个正式版的版本同步、最终验证、tag 和 GitHub Release 发布记录。

- `../ROADMAP.md`
  后续功能路线图；当前优先项是 GitHub/Gitee 等发布源的检查更新能力。

## Maintenance Rule

每次正式工作都要至少检查本入口；当需求、架构、接口、验收结果或约束发生变化时，同步更新对应功能文档和工作记录。
