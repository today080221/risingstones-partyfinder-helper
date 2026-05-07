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
  Tauri 桌面客户端原型、命令层、前置环境和后续更新方案。

- `userscripts/tampermonkey.md`
  官方页面手动响应助手脚本的安装、使用和安全边界。

- `worklog/2026-05-07-ff14-partyfinder-helper.md`
  本轮实现的启动、需求对齐、实施与验收记录。

- `worklog/2026-05-08-tauri-desktop-prototype.md`
  Tauri 桌面客户端原型工作记录。

- `../ROADMAP.md`
  后续功能路线图；当前优先项是 GitHub/Gitee 等发布源的检查更新能力。

## Maintenance Rule

每次正式工作都要至少检查本入口；当需求、架构、接口、验收结果或约束发生变化时，同步更新对应功能文档和工作记录。
