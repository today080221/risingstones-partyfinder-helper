# 更新状态镜像滞后显示修复记录

## Start

- 开始：用户反馈 GitHub 下载的 `0.1.8` 客户端在国内镜像尚未发布 `0.1.8` 时，显示“当前 0.1.8 与 gitee 最新 Release v0.1.7 对齐”。
- 初步定位：前端只用 `isNewer === false` 判断绿色对齐，没有区分“远端版本等于当前版本”和“当前版本高于所选下载节点最新版本”。

## Requirement Alignment

- 当前版本高于所选节点最新 Release 时，不应显示“Release 对齐”。
- 国内镜像落后于 GitHub 主发布源时，应明确提示“该节点尚未同步”，用户可以切换节点或等待镜像发布。
- 更新状态灯继续保持低干扰：镜像滞后属于黄色提示，不是红色强制更新。

## Implementation

- 新增 `src/lib/update-status.ts`，集中处理更新状态灯级别、文案和版本关系比较。
- 当前版本高于所选节点最新 Release 时返回黄色状态，并显示“节点待同步”。
- `UpdateStatusBanner` 和更新卡片改用统一 helper，避免再把 `isNewer === false` 直接等同于对齐。
- 更新卡片增加黄色提示样式，镜像滞后时不再显示“已是最新版本/当前客户端已经与最新 Release 对齐”。
- 新增 `src/lib/update-status.test.ts`，覆盖镜像滞后、版本对齐和重大版本落后。
- 版本升级为 `0.1.9`，用于发布该前端显示修复。

## Verification

- `npm test`：通过，2 个测试文件、19 个测试通过。
- `npm run build`：通过，前端生产构建完成。
- `npm run build:server`：通过，Node 服务 bundle 生成成功。
- `npm run package:desktop:portable`：通过，生成 `release/risingstones-partyfinder-helper-v0.1.9-desktop-win-x64-portable.zip`。
- `npm run build:portable`：通过，生成 `release/risingstones-partyfinder-helper-v0.1.9-win-x64.zip`。
- zip manifest 检查：Node 便携包和 Tauri 桌面便携包版本均为 `0.1.9`，更新源 key 均为 `github,gitee`。
- SHA256：
  - Node 便携包：`23BAE6D7F21F52B33C93452F00CA67A5308F12CF3C0FF62F86BBB8F31D89A75A`
  - Tauri 桌面便携包：`6DEAEBEED505947393168288137D2841E14B9D46B3D8EFE0E6D50A770E91F763`

## End

- 待补：提交、推送和 GitHub Release 发布验证。
