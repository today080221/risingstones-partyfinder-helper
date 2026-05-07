# 第三方依赖说明

本项目源码和发布包会使用以下第三方组件。具体版本以 `package-lock.json` 为准。

## 运行时依赖

- `express`：本地 HTTP 代理和静态文件服务。
- `react` / `react-dom`：前端界面。
- `lucide-react`：前端图标。

## 开发和构建依赖

- `vite` / `@vitejs/plugin-react`：前端开发服务器和 production build。
- `typescript`：类型检查。
- `tsx`：开发期运行 TypeScript 服务端。
- `vitest`：单元测试。
- `concurrently`：并行启动开发服务。
- `esbuild`：发布包后端打包。
- `postject`：为 Windows 便携版生成 Node.js SEA 启动 EXE。
- `@tauri-apps/*`：Tauri 桌面客户端原型。
- `@types/*`：TypeScript 类型声明。

## Windows 便携包运行时

`npm run build:portable` 会尝试从 Node.js 官方发布地址下载 Windows x64 Node.js 运行时，并将基于 Node.js SEA 的 `RisingStones-PartyFinder.exe`、备用 `node.exe` 和 Node.js 许可文件放入便携包。

如果官方下载失败，脚本会退回复制当前构建环境的 `node.exe`。公开发布前请确认发布包中的 `runtime/LICENSE-Node.js.txt` 存在；若不存在，应手动补充对应 Node.js 版本的许可文本后再发布。

## 许可

本项目自身代码采用 MIT License。第三方组件保留其各自许可，发布和再分发时应遵守对应项目的许可条款。
