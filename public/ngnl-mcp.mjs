#!/usr/bin/env node
// NoGameNoLife MCP server — lets an AI assistant (Claude Desktop, Claude Code, …)
// read and update your NoGameNoLife data.
//
// Your data lives only in your browser. This program never stores it: it opens a
// local connection (127.0.0.1 only) that the NoGameNoLife page joins when you turn
// on "连接 AI 助手" in its settings, and passes each tool call to that page.
//
// Requirements: Node.js 18+. No npm packages needed.
// Usage (Claude Code):     claude mcp add ngnl -- node /path/to/ngnl-mcp.mjs
// Usage (Claude Desktop):  { "mcpServers": { "ngnl": { "command": "node", "args": ["/path/to/ngnl-mcp.mjs"] } } }
// Env: NGNL_ORIGINS — extra allowed page origins, comma-separated (for self-hosted copies).

import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'

const VERSION = '1.2.0'
const PORTS = [5311, 5312, 5313, 5314, 5315]
const ORIGINS = new Set([
  'https://wayne62314.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
  ...(process.env.NGNL_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
])
const CALL_TIMEOUT = 20_000
const log = (...a) => console.error('[ngnl-mcp]', ...a)

// ---------------------------------------------------------------- tools

const str = (description) => ({ type: 'string', description })
const DATE = 'YYYY-MM-DD'

const ITEM_TYPES = ['task', 'habit', 'goal', 'person', 'event', 'note', 'asset', 'ledger', 'segment']

const TOOLS = [
  {
    name: 'get_overview',
    description: '角色总览：名字、等级与称号、六维属性等级、今天的任务与习惯完成情况、今日经验、连续活跃天数、各类条目数量。开始分析前先调用它。',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_tasks',
    description: '列出任务。bucket 可选：overdue 逾期 / today 今天 / doing 进行中 / upcoming 之后 / someday 无日期 / closed 已完成或放下 / open（除 closed 外全部，默认）。',
    inputSchema: {
      type: 'object',
      properties: {
        bucket: { type: 'string', enum: ['open', 'overdue', 'today', 'doing', 'upcoming', 'someday', 'closed', 'all'] },
        goalId: str('只看挂在这个目标（含子目标）下的任务'),
        limit: { type: 'number', description: '最多返回多少条，默认 100' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_habits',
    description: '列出习惯：安排在星期几、当前连续天数、最长连续、近四周完成率、今天是否已打卡、最近 28 天打卡日期。',
    inputSchema: { type: 'object', properties: { includePaused: { type: 'boolean' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_goals',
    description: '愿景树：所有目标的树形结构（终极目标在根部），含状态和由任务汇总的进度。状态 unknown 表示用户还不知道这一步是什么（显示为「？」）。',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_people',
    description: '人物：关系、亲密度(1-5)、生日与倒数、怎么认识的、印象、上次联系、是否该联系了、最近的往来记录（含备注）、认识的人。',
    inputSchema: { type: 'object', properties: { recentContacts: { type: 'number', description: '每人返回最近几条往来记录，默认 5' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_activity',
    description: '最近 N 天的活动：每天获得的经验（按属性）、完成的任务、习惯打卡数、心情(1-5)与备注、联系过的人。适合做周报、月报和趋势分析。',
    inputSchema: { type: 'object', properties: { days: { type: 'number', description: '天数，默认 7，最多 365' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'search',
    description: '按关键词搜索所有条目（任务、习惯、目标、人物、经历、灵感、情报、资产、收支、处境、推演图），返回 id、类型和标题。',
    inputSchema: { type: 'object', properties: { query: str('关键词'), type: { type: 'string', enum: [...ITEM_TYPES, 'sim'] } }, required: ['query'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_item',
    description: '读取一个条目的全部字段，以及与它关联的条目。',
    inputSchema: { type: 'object', properties: { id: str('条目 id') }, required: ['id'] },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create_item',
    description:
      '新建条目。常用字段：task {title, attr, difficulty 1|2|3, due ' + DATE + ', goalId, notes}；habit {title, attr, days [0-6, 0=周日]}；goal {title, status unknown|todo|doing|done, parentId}；person {title 名字, relation, closeness 1-5, birthday MM-DD 或 YYYY-MM-DD, met, traits}；event {title, date, kind event|milestone|decision, notes}；note {title, kind idea|intel, notes, tags}；' +
      'asset {title, category item|cred|fame|finance|debt, status owned|wanted|lost|sold, value 元, saved 元(想要的东西已经攒了多少), acquired ' + DATE + '}；' +
      'ledger {title, flow income|expense, amount 元, repeat none|week|month|year, date ' + DATE + ' 首次日期, until, category}；' +
      'segment {title, lane home|work|love|health|money 或自定义轨道, start ' + DATE + ', end}。',
    inputSchema: {
      type: 'object',
      properties: { type: { type: 'string', enum: ITEM_TYPES }, fields: { type: 'object', description: '条目字段' } },
      required: ['type', 'fields'],
    },
  },
  {
    name: 'update_item',
    description: '修改条目字段（只改给出的字段，值为 null 表示删除该字段）。完成任务：{status: "done"}；改期：{due: "' + DATE + '"}；放下：{status: "dropped"}。',
    inputSchema: { type: 'object', properties: { id: str('条目 id'), fields: { type: 'object' } }, required: ['id', 'fields'] },
  },
  {
    name: 'checkin_habit',
    description: '给习惯打卡或取消打卡。',
    inputSchema: { type: 'object', properties: { habitId: str('习惯 id'), date: str(DATE + '，默认今天'), done: { type: 'boolean', description: '默认 true' } }, required: ['habitId'] },
  },
  {
    name: 'log_contact',
    description: '记录一次和某人的联系，可附一句备注（聊了什么）。',
    inputSchema: { type: 'object', properties: { personId: str('人物 id'), date: str(DATE + '，默认今天'), note: str('备注') }, required: ['personId'] },
  },
  {
    name: 'link_items',
    description: '关联两个条目（例如人物与经历、灵感与目标；两个人物关联表示他们互相认识）。unlink 为 true 时取消关联。',
    inputSchema: { type: 'object', properties: { a: str('条目 id'), b: str('条目 id'), unlink: { type: 'boolean' } }, required: ['a', 'b'] },
  },
  {
    name: 'set_portrait',
    description:
      '设置角色卡上的立绘。可以传 svg（你画的一张 SVG 立绘：viewBox 建议 0 0 320 420 的竖版半身像，带背景，风格与人物的属性和档案相符；不要用 <script>、外链图片或字体），或 preset（内置角色之一：scholar 学者 / warrior 战士 / artisan 工匠 / envoy 使者 / merchant 商人 / hermit 隐士），或 reset: true 恢复默认。画之前可以先用 get_overview 了解角色。',
    inputSchema: {
      type: 'object',
      properties: {
        svg: str('完整的 <svg>…</svg> 源码，最大 200KB'),
        preset: { type: 'string', enum: ['scholar', 'warrior', 'artisan', 'envoy', 'merchant', 'hermit'] },
        reset: { type: 'boolean' },
      },
    },
  },
  {
    name: 'list_assets',
    description: '资产与收支：净资产、本月收入/支出/结余、每件资产（拥有的、想要的及价格和已攒金额）、每条收支（含重复周期和折合每月）。',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_sim_guide',
    description:
      '推演图（只读计算画布）的说明：所有节点种类及其输入/输出端口和类型。传 itemIds 可以查看这些条目放上画布后能输出哪些值（例如习惯的完成率、平均每天几次，资产的价格、已攒，收支的折合每天，自定义数字字段）。搭图前先调用它。',
    inputSchema: { type: 'object', properties: { itemIds: { type: 'array', items: { type: 'string' }, description: '想放上画布的条目 id' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_sims',
    description: '列出用户的推演图及结论（能/不能、预计日期等）。传 id 返回这张图每个节点算出的值。',
    inputSchema: { type: 'object', properties: { id: str('推演图 id，可选') } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'save_sim',
    description:
      '新建或覆盖一张推演图，用来回答"我能不能在某天前买得起 X""照现在的习惯多久能达成 Y"这类问题。' +
      'nodes: [{id 自己起的短名, kind, data, x?, y?, off?}]，edges: [{from 节点id, fromPort, to 节点id, toPort}]。不给坐标会自动排版。' +
      '端口和类型先用 get_sim_guide 查。保存后返回每个节点算出的值，可据此向用户解释结论。传 id 表示覆盖已有的图；pinned: true 会把结论固定到今日页。',
    inputSchema: {
      type: 'object',
      properties: {
        id: str('要覆盖的推演图 id，可选'),
        title: str('图的名字，例如 年底前买 Switch 2'),
        nodes: { type: 'array', items: { type: 'object' } },
        edges: { type: 'array', items: { type: 'object' } },
        pinned: { type: 'boolean' },
      },
      required: ['title', 'nodes', 'edges'],
    },
  },
  {
    name: 'set_mood',
    description: '记录某天的心情 1-5（1 很糟 … 5 很棒）和一句备注。',
    inputSchema: { type: 'object', properties: { date: str(DATE + '，默认今天'), mood: { type: 'number', minimum: 1, maximum: 5 }, note: str('备注') }, required: ['mood'] },
  },
]
for (const t of TOOLS) if (!t.annotations) t.annotations = { readOnlyHint: false, destructiveHint: false }

const INSTRUCTIONS = `NoGameNoLife 是用户的"人生 RPG 面板"：任务、习惯、目标（愿景树）、人物、经历、灵感都会为六维属性积累经验。
数据只保存在用户的浏览器里；工具调用由用户打开着的 NoGameNoLife 网页执行。
分析时先调用 get_overview；需要趋势时用 get_activity。修改数据前先向用户确认意图，日期使用用户本地日期（YYYY-MM-DD）。
游戏规则：任务按难度 10/25/50 经验，习惯打卡 +5，联系一个人 +5 社交，记录心情 +2 心境。不做惩罚。`

// ---------------------------------------------------------------- page bridge (minimal WebSocket server)

const pages = new Set() // connected sockets, newest last
const pending = new Map() // call id -> { resolve, reject, timer }

function wsSend(sock, obj) {
  const data = Buffer.from(JSON.stringify(obj))
  const len = data.length
  const head = len < 126 ? Buffer.from([0x81, len]) : len < 65536 ? Buffer.from([0x81, 126, len >> 8, len & 255]) : Buffer.concat([Buffer.from([0x81, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(len)); return b })()])
  sock.write(Buffer.concat([head, data]))
}

function wsControl(sock, opcode, payload = Buffer.alloc(0)) {
  sock.write(Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload]))
}

function attach(sock) {
  let buf = Buffer.alloc(0)
  let parts = []
  pages.add(sock)
  log(`page connected (${pages.size})`)
  const drop = () => {
    if (!pages.delete(sock)) return
    log(`page disconnected (${pages.size})`)
  }
  sock.on('close', drop)
  sock.on('error', drop)
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk])
    for (;;) {
      if (buf.length < 2) return
      const fin = buf[0] & 0x80
      const op = buf[0] & 0x0f
      const masked = buf[1] & 0x80
      let len = buf[1] & 0x7f
      let off = 2
      if (len === 126) {
        if (buf.length < 4) return
        len = buf.readUInt16BE(2)
        off = 4
      } else if (len === 127) {
        if (buf.length < 10) return
        len = Number(buf.readBigUInt64BE(2))
        off = 10
      }
      if (len > 16 * 1024 * 1024) return sock.destroy()
      const need = off + (masked ? 4 : 0) + len
      if (buf.length < need) return
      let payload = buf.subarray(off + (masked ? 4 : 0), need)
      if (masked) {
        const mask = buf.subarray(off, off + 4)
        payload = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]))
      }
      buf = buf.subarray(need)
      if (op === 0x8) {
        wsControl(sock, 0x8)
        sock.end()
        drop()
        return
      }
      if (op === 0x9) {
        wsControl(sock, 0xa, payload)
        continue
      }
      if (op === 0x1 || op === 0x0) {
        parts.push(payload)
        if (!fin) continue
        const text = Buffer.concat(parts).toString('utf8')
        parts = []
        onPageMessage(sock, text)
      }
    }
  })
}

function onPageMessage(sock, text) {
  let msg
  try {
    msg = JSON.parse(text)
  } catch {
    return
  }
  if (msg.type === 'hello') {
    // Newest page wins: move it to the end of the set.
    pages.delete(sock)
    pages.add(sock)
    wsSend(sock, { type: 'welcome', server: 'ngnl-mcp', version: VERSION, client: clientName })
    return
  }
  if (msg.type === 'result' && pending.has(msg.id)) {
    const p = pending.get(msg.id)
    pending.delete(msg.id)
    clearTimeout(p.timer)
    msg.ok ? p.resolve(msg.data) : p.reject(new Error(msg.error || '网页执行失败'))
  }
}

function callPage(tool, args) {
  const sock = [...pages].at(-1)
  if (!sock)
    return Promise.reject(
      new Error('没有连接到 NoGameNoLife 网页。请在电脑浏览器中打开 NoGameNoLife（https://wayne62314.github.io/ngnl/），进入「设置与备份 → AI 助手」，打开「连接 AI 助手」，然后重试。'),
    )
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('网页没有响应（超时）。请确认 NoGameNoLife 页面仍然开着。'))
    }, CALL_TIMEOUT)
    pending.set(id, { resolve, reject, timer })
    wsSend(sock, { type: 'call', id, tool, args, client: clientName })
  })
}

function startBridge(i = 0) {
  if (i >= PORTS.length) {
    log(`ports ${PORTS[0]}-${PORTS.at(-1)} are all in use; the page cannot reach this server.`)
    return
  }
  const port = PORTS[i]
  const http = createServer((req, res) => {
    // A plain GET lets the page (or you) check that the server is running.
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
    res.end(JSON.stringify({ server: 'ngnl-mcp', version: VERSION }))
  })
  http.on('upgrade', (req, sock) => {
    const origin = req.headers.origin
    const key = req.headers['sec-websocket-key']
    if (req.url !== '/ngnl' || !key || (origin && !ORIGINS.has(origin))) {
      log(`rejected connection from origin ${origin ?? '(none)'}`)
      sock.end('HTTP/1.1 403 Forbidden\r\n\r\n')
      return
    }
    const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
    sock.setNoDelay(true)
    attach(sock)
  })
  http.on('error', (e) => {
    if (e.code === 'EADDRINUSE') startBridge(i + 1)
    else log('bridge error', e.message)
  })
  http.listen(port, '127.0.0.1', () => log(`waiting for the NoGameNoLife page on 127.0.0.1:${port}`))
}

// ---------------------------------------------------------------- MCP over stdio (JSON-RPC, one message per line)

let clientName = 'AI 助手'
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
const fail = (id, code, message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')

async function handle(msg) {
  const { id, method, params } = msg
  if (method === 'initialize') {
    if (params?.clientInfo?.name) clientName = params.clientInfo.name
    return reply(id, {
      protocolVersion: params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'ngnl', title: 'NoGameNoLife', version: VERSION },
      instructions: INSTRUCTIONS,
    })
  }
  if (method === 'ping') return reply(id, {})
  if (method === 'tools/list') return reply(id, { tools: TOOLS })
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === params?.name)
    if (!tool) return fail(id, -32602, `Unknown tool: ${params?.name}`)
    try {
      const data = await callPage(tool.name, params.arguments ?? {})
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] })
    } catch (e) {
      return reply(id, { content: [{ type: 'text', text: e.message }], isError: true })
    }
  }
  if (id !== undefined && id !== null) return fail(id, -32601, `Method not found: ${method}`)
  // Notifications (e.g. notifications/initialized) need no reply.
}

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  input += chunk
  let nl
  while ((nl = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, nl).trim()
    input = input.slice(nl + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      fail(null, -32700, 'Parse error')
      continue
    }
    handle(msg).catch((e) => log('handler error', e))
  }
})
process.stdin.on('end', () => process.exit(0))

startBridge()
log(`NoGameNoLife MCP server ${VERSION} started`)
