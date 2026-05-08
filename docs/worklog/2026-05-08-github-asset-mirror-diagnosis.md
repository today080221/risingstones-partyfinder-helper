# GitHub 下载包国内镜像未配置诊断记录

## Start

- 开始：用户反馈开发机从 GitHub 下载的桌面便携包显示“国内镜像 尚未配置发布源”，但另一台电脑下载后可以连接国内镜像源。
- 目标：确认不同机器是否拿到了不同的 `release-manifest.json`，并解释 GitHub 包与国内镜像包的行为差异。

## Requirement Alignment

- 国内镜像真实仓库坐标仍不写入公开源码、README 或 docs。
- 诊断只说明 manifest 是否包含国内镜像键，不在公开文档记录真实镜像地址。
- 如果 GitHub Release 包也要内置国内镜像源，必须接受“下载包 manifest 中可见镜像坐标”的取舍，或另做中转服务。

## Investigation

- 本地带发布环境变量构建的 `v0.1.6` 桌面便携包：`release-manifest.json` 同时包含 `github` 和国内镜像键。
- 从 GitHub `v0.1.6` Release 重新下载桌面便携 zip 并拆包：`release-manifest.json` 只包含 `github` 键。
- Tauri 更新检查逻辑会优先读取运行环境变量，再读取 EXE 同目录或当前目录的 `release-manifest.json`；缺少国内镜像键时会返回“国内镜像 尚未配置发布源”。

## End

- 结论：开发机从 GitHub 下载的包显示未配置，是因为 GitHub Actions 构建出的公开 Release 资产没有注入国内镜像源。
- 另一台电脑能连接国内镜像，通常说明它运行的是本机带发布配置构建的包、国内镜像 Release 包，或运行环境额外设置了镜像仓库环境变量。
- 修复选择：
  - 若希望 GitHub 下载包也能直接检查国内镜像，需要在 GitHub 仓库 Secret 中配置镜像仓库坐标后重发 Release。
  - 若希望继续隐藏国内镜像坐标，则 GitHub 下载包保持仅 GitHub，国内用户从国内镜像 Release 下载带镜像配置的包。
