# 职业智能筛选与 Release 双源内置工作记录

## Start

- 开始：用户反馈当前在 `K:\FFXIV Tools\石之家招募筛选` 使用 `0.1.6`，希望继续优化“我的职业可进”。
- 追加：所有 Release 包都应该内置国内外两个更新源地址，让 GitHub 下载包和国内镜像下载包行为一致。

## Requirement Alignment

- “我的职业可进”不仅看 `need_job`，也要看空缺位置：
  - MT / ST 对应所有防护职业。
  - H1 / H2 对应治疗职业；白魔法师、占星术士更偏 H1，学者、贤者更偏 H2。
  - 近战职业可匹配 D1 / D2。
  - 远程物理职业可匹配 D3。
  - 远程魔法职业可匹配 D4。
- DPS 位置不能过度严格：远敏、法系、近战在招募里可能混打，不能因为默认位置习惯完全过滤掉可进队伍。
- “我的职业可选”排序调整为：
  - 智能分类
  - 防护职业（T）
  - 治疗职业（奶）
  - 近战职业（近战）
  - 远程物理职业（远敏）
  - 远程魔法职业（法系）
- GitHub Actions Release 构建也要注入国内镜像配置；真实镜像地址作为 GitHub Secret，不写入公开源码。

## Implementation

- GitHub 仓库 Secret 已配置 `RISINGSTONES_UPDATE_GITEE_REPO`，用于 Release workflow 构建时注入国内镜像更新源。
- Release workflow 对 Node 便携包和 Tauri 桌面便携包设置 `RISINGSTONES_REQUIRE_DUAL_UPDATE_SOURCES=true`。
- `scripts/build-portable.mjs` 和 `scripts/package-tauri-portable.mjs` 在 Release 双源要求开启且缺少国内镜像配置时直接失败，避免产出单源包。
- `jobCanEnter(...)` 在 `need_job` 未命中时，根据当前队伍空缺位置做智能兜底：
  - 防护职业匹配 MT / ST / T。
  - 治疗职业匹配 H1 / H2 / H。
  - DPS 职业宽松匹配 D1 / D2 / D3 / D4。
- 24 人团队的职业兜底会尊重用户选择的 A/B/C 团队。
- “我的职业可选”分组排序调整为智能分类、防护、治疗、近战、远敏、法系，并隐藏重复的“进攻职业”汇总组。
- “空缺位置”移动到“我的职业可进”上方；团队筛选也随空缺位置一起前置。
- 版本升级为 `0.1.7`，用于发布职业智能筛选和双源 Release 包策略。

## Verification

- `npm test`：16 tests passed。
- `npm run build`：通过。
- 使用 `RISINGSTONES_REQUIRE_DUAL_UPDATE_SOURCES=true` 构建 `npm run build:portable`：通过，Node 便携包 manifest 同时包含 `github` 和国内镜像键。
- 使用 `RISINGSTONES_REQUIRE_DUAL_UPDATE_SOURCES=true` 构建 `npm run package:desktop:portable`：通过，Tauri 桌面便携包 manifest 同时包含 `github` 和国内镜像键。
- Tauri 桌面便携 EXE 短启动：进程保持运行，窗口标题为 `FF14 副本招募筛选器`。
- GitHub Secret：`RISINGSTONES_UPDATE_GITEE_REPO` 已配置。
- GitHub Actions `Release / v0.1.7`：通过。
- 从 GitHub `v0.1.7` Release 重新下载并拆包检查：
  - 桌面便携包 manifest 版本为 `0.1.7`，更新源键包含 `github` 和国内镜像键。
  - Node 便携包 manifest 版本为 `0.1.7`，更新源键包含 `github` 和国内镜像键。

## End

- GitHub `v0.1.7` Release 已发布成功，资产包含桌面便携包、Node 便携包和各自 `.sha256`。
- 本机当前 Codex 会话没有 `GITEE_ACCESS_TOKEN` 环境变量，因此未代为上传国内镜像 Release 资产。
- 国内镜像发布应在发布机本地设置有效 `GITEE_ACCESS_TOKEN` 后运行 `npm run release:gitee`；建议分别上传桌面便携包和 Node 便携包，确保两个节点资产齐全。
