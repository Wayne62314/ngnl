# NoGameNoLife

把人生做成一张 RPG 角色面板。你做的每件真实的事都会变成角色的经验和属性；目标、人物、经历和想法，都是同一张地图上可以互相连起来的节点。

- **今日**：今天的任务和习惯、逾期任务一键处理、心情、随手记、该联系的人
- **角色**：六维属性雷达（智识/体魄/创造/社交/事业/心境）、等级、档案、心情曲线、成就
- **任务**：难度决定经验，可挂到目标下、可设前置任务
- **习惯**：按星期安排，连续天数与 18 周打卡热力图
- **愿景树**：从终极目标往回倒推，不知道的步骤先留「？」
- **人物**：以你为中心的亲密度同心圆，按亲密度提醒联系
- **经历**：时间轴，支持记录抉择（选项、选择、原因）
- **灵感与情报**：灵感看板、情报标签库，可一键转为任务或目标
- 任何条目都能互相**关联**；`Ctrl+K` 全局搜索与新建

**在线使用：<https://wayne62314.github.io/ngnl/>**（数据只保存在你自己的浏览器里）

产品思路与取舍见 [docs/PRODUCT.md](docs/PRODUCT.md)。

## 隐私

**没有服务器。** 这是一个纯前端网页应用：程序可以公开发布，但每个人的数据只保存在自己浏览器的本地存储（IndexedDB）里，不会上传到任何地方，开发者也看不到。

- 在「设置与备份」里导出 / 导入 JSON 备份；换电脑、换浏览器或清除浏览器数据前请先导出
- 两周没备份且有改动时，今日页会提醒
- 支持离线使用；Chrome / Edge 地址栏可以「安装为应用」，手机浏览器可以「添加到主屏幕」

## AI 助手（MCP，电脑版）

可以让 Claude Desktop、Claude Code 等支持 [MCP](https://modelcontextprotocol.io/) 的 AI 助手直接读写你的数据，例如"给我写这周的周报""把逾期任务改到明天""最近该联系谁"。

1. 安装 Node.js 18+，在应用的「设置与备份 → AI 助手」里下载 `ngnl-mcp.mjs`（就是本仓库的 [`public/ngnl-mcp.mjs`](public/ngnl-mcp.mjs)，单文件、零依赖）
2. 加到 AI 助手里：`claude mcp add ngnl -- node /path/to/ngnl-mcp.mjs`，或在 Claude Desktop 配置里加 `{"mcpServers":{"ngnl":{"command":"node","args":["/path/to/ngnl-mcp.mjs"]}}}`
3. 在应用里打开「连接 AI 助手」，保持页面开着。Chrome / Edge 第一次会询问是否允许本页面访问这台电脑上的应用，选允许

工作方式：`ngnl-mcp` 只在 `127.0.0.1` 上监听，网页连上它之后，AI 的每次工具调用都转交给网页执行（数据不经过任何服务器，也不会被这个程序保存），并显示在设置页的操作记录里。可以关闭「允许 AI 修改数据」变成只读。手机浏览器无法运行该程序，所以只支持电脑。自己部署在其他网址时，用环境变量 `NGNL_ORIGINS` 加入你的网址。

## 运行

需要 [Node.js](https://nodejs.org/) 20 或更高版本（只用于构建）。

```bash
npm install
npm run dev        # 开发：http://localhost:5173
npm run build      # 构建到 dist/，可以直接放到任何静态网站托管（GitHub Pages、Cloudflare Pages…）
npm run preview    # 本地预览构建结果：http://localhost:4173
npm test           # 单元测试
node scripts/make-demo.mjs   # 生成一年的模拟数据 data/demo-1year.json，可在设置里「从备份恢复」导入
```

构建产物使用相对路径和 hash 路由，放在任何子目录下都能用，不需要服务器端配置。

## 代码结构

- `src/lib/repo.ts`：数据模型与所有修改操作（级联删除、关联、导入校验）
- `src/lib/storage.ts`：IndexedDB 持久化、存储保护、多标签页同步
- `src/lib/api.ts`：把两者组合起来，供 Pinia store 使用
- `src/lib/game.ts`：经验、等级、连续打卡、成就等规则，全部由真实记录推导
- `public/sw.js`：离线缓存（构建时由 `vite.config.ts` 写入文件清单）
- `public/ngnl-mcp.mjs`：MCP server（stdio）+ 本机 WebSocket 桥；`src/lib/mcpTools.ts` 是工具在网页端的实现，`src/stores/mcp.ts` 管理连接
