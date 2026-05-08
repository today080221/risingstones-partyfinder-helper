# Harness Engineering

## Scope

本项目按轻量 Harness 工程方式推进：先建立文档链和可验证边界，再实现功能；所有关键需求、接口、安全边界和验收结果都要落在仓库文档中。

## Work Protocol

- 开始工作：更新或创建工作记录，写明目标、当前状态、待确认风险。
- 需求对齐后：更新功能文档，记录已确认需求、默认假设、明确排除项。
- 实现过程中：如果接口、筛选语义、安全边界或目录结构变化，同步更新对应文档。
- 结束工作：更新工作记录中的实现摘要、验证结果、遗留风险和下一步建议。

## Docs Chain Expectations

- `docs/README.md` 是文档入口。
- 每个功能至少有一份 `docs/features/*.md` 说明需求、接口、数据流和验收标准。
- 每轮较完整的实现工作至少有一份 `docs/worklog/*.md` 记录。
- 面向用户安装和运行的信息保留在根目录 `README.md`。

## Remote And Release Maintenance

- GitHub 主仓库：`https://github.com/today080221/risingstones-partyfinder-helper`。
- 国内镜像 remote 名称：`gitee`。真实 URL 属于本机发布敏感配置，不写入公开源码、README 或 docs。
- 本项目每次发布源码提交时，同时推送 `origin` 和 `gitee` 两个 remote。
- 每次发布版本标签时，同时推送 GitHub 和 Gitee。
- GitHub Releases 是主发布源；国内镜像 Release 由本机配置 `RISINGSTONES_UPDATE_GITEE_REPO` / `GITEE_ACCESS_TOKEN` 或 `config/release.local.json` 发布。
- 从 `v0.1.7` 起，所有正式 Release 包都应同时内置 GitHub 与国内镜像更新源；GitHub Actions 使用 `RISINGSTONES_UPDATE_GITEE_REPO` Secret 注入国内镜像，发布构建开启 `RISINGSTONES_REQUIRE_DUAL_UPDATE_SOURCES=true` 防止产出单源包。
- 前端更新检查默认根据 GeoIP 推荐下载节点：中国大陆或检测失败走国内镜像，海外走 GitHub。

## Safety Defaults

- 不保存用户账号、Cookie、Token 或官方站点登录态。
- 不自动提交会影响账号状态的请求。
- 对官方接口加分页范围、请求间隔、取消和错误提示，避免无界批量请求。
- 文档中不得写入任何密钥、令牌、Cookie 或私人联系信息。
