# Docs Chain

## Purpose

本目录是 `risingstones-partyfinder-helper` 的项目级文档链。后续实现、验收、结构调整都应能从这里追溯到对应代码和工作记录。

## Entries

- `collaboration/harness-engineering.md`
  本项目采用的 Harness 工程协作规则，包括开始工作、需求对齐、结束工作时的文档更新要求。

- `features/partyfinder-helper.md`
  FF14 副本招募筛选工具的需求、接口、筛选语义和响应招募边界。

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

- `../ROADMAP.md`
  后续功能路线图；当前优先项是 GitHub/Gitee 等发布源的检查更新能力。

## Maintenance Rule

每次正式工作都要至少检查本入口；当需求、架构、接口、验收结果或约束发生变化时，同步更新对应功能文档和工作记录。
