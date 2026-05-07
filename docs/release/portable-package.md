# Windows 便携包发布说明

## 目标

便携包面向普通使用者：解压后双击启动，不要求用户安装 Node.js、npm 或项目依赖。

源码仓库仍然保持标准前端项目结构，方便开发者审计、测试和贡献。

## 生成命令

```powershell
npm ci
npm run build:portable
```

产物位置：

```text
release/risingstones-partyfinder-helper-v0.1.0-win-x64.zip
```

## 发布包内容

```text
risingstones-partyfinder-helper-v0.1.0-win-x64/
  app/
    dist/               已构建前端
    server.cjs          已打包本地代理
  runtime/
    node.exe            Windows x64 Node.js 运行时
    LICENSE-Node.js.txt Node.js 许可文件
  userscripts/          Tampermonkey 响应助手
  docs/                 中文项目文档
  start-windows.bat     启动脚本
  README-使用说明.txt   普通用户说明
  LICENSE
  NOTICE.md
  THIRD_PARTY_NOTICES.md
  CONTRIBUTING.md
  ROADMAP.md
  release-manifest.json
```

## 启动方式

用户双击：

```text
start-windows.bat
```

启动脚本会：

1. 设置默认端口 `8797`。
2. 使用包内 `runtime/node.exe` 启动 `app/server.cjs`。
3. 让 Express 在同一个端口提供 API 和前端静态页面。
4. 自动打开 `http://127.0.0.1:8797`。

端口被占用时，可以先设置环境变量：

```powershell
$env:PORT = "8897"
.\start-windows.bat
```

## 更新检查

便携包内置更新检查面板：

- 更新源可选 `GitHub` 或 `国内镜像`。
- GitHub 主仓库：`today080221/risingstones-partyfinder-helper`。
- 国内镜像仓库地址不写入公开源码或文档；发布时通过环境变量或 `config/release.local.json` 注入到便携包 manifest。
- 加载前端时会做一次 GeoIP 检测：中国大陆或检测失败默认国内镜像；如果发布包未配置国内镜像，则回退 GitHub。
- 可以勾选“启动时检查更新”。
- 检查结果会展示当前版本、最新版本、发布页和附件下载入口。
- 结果状态区下方会显示更新状态灯：绿灯为当前版本对齐，黄灯为有非重大版本更新，红灯为跨重大版本落后。

更新检查只读取公开 Release 信息，不静默替换本地文件，也不执行下载后的 zip。是否下载、解压和替换由用户手动决定。

## 本机敏感配置

如果需要在便携包中启用国内镜像节点，请在发布机本地设置环境变量：

```powershell
$env:RISINGSTONES_UPDATE_GITEE_REPO = "owner/repo"
```

也可以创建未提交文件：

```text
config/release.local.json
```

内容参考：

```json
{
  "updateRepositories": {
    "github": "today080221/risingstones-partyfinder-helper",
    "gitee": "owner/repo"
  }
}
```

`config/release.local.json` 已加入 `.gitignore`，不得提交。

## 国内镜像 Release

Gitee 如果作为国内下载节点，建议也创建同名 Release 并上传同一个 Windows 便携包 zip，否则国内镜像只能用 tag 做版本对齐。

SSH 公钥只用于 `git push` 等 Git 传输，不能代替 Gitee Release API 的访问令牌。发布 Gitee Release 时需要在发布机本地配置新的个人令牌；令牌一旦被贴到聊天、日志或公开位置，应立即撤销并重新生成。

脚本：

```powershell
$env:GITEE_ACCESS_TOKEN = "<本机令牌>"
$env:RISINGSTONES_UPDATE_GITEE_REPO = "owner/repo"
npm run release:gitee
```

其中 `owner/repo` 是占位写法，实际执行时要替换为真实仓库坐标，且不要带尖括号。例如填写 `some-owner/some-repo` 或完整仓库 URL。

如果发布机已经配置了 `gitee` remote，也可以在 PowerShell 中从本地 Git 配置读取：

```powershell
$env:RISINGSTONES_UPDATE_GITEE_REPO = (git remote get-url gitee)
```

令牌只保存在发布机本地环境或本地密钥管理器中，不写入仓库、文档或聊天记录。

## Node 运行时

`scripts/build-portable.mjs` 会优先从 Node.js 官方发布地址下载当前构建环境对应版本的 Windows x64 zip，并复制：

- `node.exe`
- `LICENSE`

如果下载失败，脚本会退回复制当前构建进程的 `process.execPath`。这种情况下公开发布前需要人工确认 `runtime/LICENSE-Node.js.txt` 是否存在；如果不存在，请补齐对应 Node.js 版本许可。

## GitHub Release

仓库提供 `.github/workflows/release.yml`。推送 `v*` 标签时，GitHub Actions 会在 Windows runner 上执行：

```powershell
npm ci
npm run release:check
```

然后上传 `release/*.zip` 到对应 GitHub Release。

如果希望 GitHub Actions 构建出的公开便携包也内置国内镜像节点，需要在 GitHub 仓库 Secrets 中配置：

```text
RISINGSTONES_UPDATE_GITEE_REPO
```

该 Secret 不会写入源码；但只要便携包需要直连国内镜像，最终发布包 manifest 中就必须包含可请求的镜像仓库路径。若需要完全隐藏国内镜像地址，需要另建中转服务或自有域名。

## 验收清单

发布前建议确认：

- `npm test` 通过。
- `npm run build` 通过。
- `npm run build:portable` 通过。
- 解压 zip 后双击 `start-windows.bat` 能打开本地页面。
- `/api/health` 返回 `ok=true`。
- 选择副本后能拉取招募分页。
- `runtime/LICENSE-Node.js.txt` 存在。
- 文档没有写入账号、Cookie、Token 或私人联系信息。
