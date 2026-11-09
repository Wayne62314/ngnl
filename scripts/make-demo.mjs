// Generates a year of realistic NoGameNoLife data as a backup file you can import
// (设置与备份 → 从备份恢复). Deterministic: the same seed gives the same data,
// shifted so that the last day is "today".
//
//   node scripts/make-demo.mjs [out.json] [days=365] [seed=7]

import { writeFileSync } from 'node:fs'

const OUT = process.argv[2] ?? 'data/demo-1year.json'
const DAYS = Number(process.argv[3] ?? 365)
let seed = Number(process.argv[4] ?? 7)

// ---------------------------------------------------------------- helpers
const rnd = () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (a) => a[Math.floor(rnd() * a.length)]
const chance = (p) => rnd() < p
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const TODAY = key(new Date())
const add = (k, n) => {
  const [y, m, d] = k.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return key(dt)
}
const START = add(TODAY, -(DAYS - 1))
const dayIndex = (k) => Math.round((new Date(k) - new Date(START)) / 86400000)
const wd = (k) => new Date(k + 'T00:00:00').getDay()
const NOW = new Date().toISOString()
// Never in the future: a future updatedAt would beat real edits when devices merge.
const iso = (k, h = 9) => {
  const t = `${k}T${pad(h)}:${pad(int(0, 59))}:00.000Z`
  return t > NOW ? NOW : t
}
let n = 0
const id = (p) => `${p}-${(++n).toString(36)}`

const items = []
const links = []
const checkins = []
const moods = []
const link = (a, b) => a !== b && links.push(a < b ? [a, b] : [b, a])
const item = (type, created, x) => {
  const it = { id: id(type[0]), type, createdAt: iso(created), updatedAt: iso(created, 20), ...x }
  items.push(it)
  return it
}

// ---------------------------------------------------------------- goals (愿景树)
const goal = (title, status, parent, created = START) => item('goal', created, { title, status, ...(parent ? { parentId: parent.id } : {}) })
const gDev = goal('成为独立游戏开发者', 'doing')
const gGodot = goal('学会 Godot', 'done', gDev)
const gTut = goal('完成官方 2D 教程', 'done', gGodot)
const gDemos = goal('做 3 个小 Demo', 'done', gGodot)
const gShip = goal('发布第一款小游戏《灯塔守夜人》', 'doing', gDev, add(START, 90))
const gProto = goal('确定玩法原型', 'done', gShip, add(START, 90))
const gArt = goal('定下美术风格', 'doing', gShip, add(START, 150))
const gStore = goal('上架 itch.io 和 Steam', 'todo', gShip, add(START, 200))
goal('', 'unknown', gDev, add(START, 210))
const gMoney = goal('攒够一年生活费（12 万）', 'doing', gDev, add(START, 30))
const gHealth = goal('保持健康的身体', 'doing')
const gHalf = goal('跑完一次半马', 'done', gHealth)
const gFat = goal('体脂降到 18%', 'doing', gHealth, add(START, 120))
const gEng = goal('英语能流利沟通', 'doing', null, add(START, 10))
const gIelts = goal('雅思 7 分', 'todo', gEng, add(START, 10))
goal('', 'unknown', gIelts, add(START, 60))
const gFamily = goal('多陪伴家人', 'doing', null, add(START, 40))
const gTrip = goal('带爸妈去一次日本', 'todo', gFamily, add(START, 180))

// ---------------------------------------------------------------- tasks
const T = {
  mind: ['读《游戏设计艺术》第 {n} 章', '看完 GDC 演讲：{t}', '学习 GDScript 信号系统', '整理读书笔记', '背雅思词汇 List {n}', '做一套雅思听力', '写一篇英文日记', '读完《人类简史》', '学习线性代数第 {n} 讲', '研究着色器入门'],
  body: ['晨跑 {n} 公里', '去健身房练腿', '体检预约', '游泳 1 小时', '拉伸 20 分钟', '买护膝', '爬梧桐山', '做一顿减脂餐'],
  craft: ['画角色草图 #{n}', '做灯塔关卡 {n}', '修复跳跃手感 bug', '写游戏开发日志', '录一段 Demo 视频', '做 UI 原型', '给 Demo 配音效', '设计第 {n} 个谜题', '重构存档系统', '画像素风格测试图'],
  social: ['给{p}打电话', '约{p}吃饭', '给{p}挑生日礼物', '参加同学聚会', '回复{p}的消息', '帮{p}改简历', '周末和{p}看电影'],
  career: ['周报', '准备季度述职', '整理理财账户', '研究指数基金定投', '更新简历', '和主管 1on1', '修复线上 bug #{n}', '代码评审', '交房租', '报销差旅费'],
  spirit: ['写周记', '整理房间', '一个人去公园走走', '断舍离一个抽屉', '复盘这个月', '早点睡觉', '冥想课程第 {n} 课'],
}
const TALKS = ['做出有趣的小游戏', 'Celeste 的手感设计', '独立游戏的营销', '关卡设计 101']
const ATTR_W = [['mind', 22], ['body', 14], ['craft', 22], ['social', 10], ['career', 22], ['spirit', 10]]
const pickAttr = () => {
  let r = rnd() * 100
  for (const [a, w] of ATTR_W) if ((r -= w) < 0) return a
  return 'mind'
}
const GOAL_FOR = { mind: [gTut, gIelts, gGodot], body: [gFat, gHalf], craft: [gDemos, gProto, gArt, gStore], career: [gMoney], social: [gFamily, gTrip], spirit: [] }

// ---------------------------------------------------------------- people
const P = (title, relation, closeness, x = {}) => item('person', x.since ?? START, { title, relation, closeness, ...x })
const people = [
  P('妈妈', '家人', 5, { birthday: '1968-03-21', met: '出生就认识', traits: '爱操心，做饭好吃' }),
  P('爸爸', '家人', 5, { birthday: '1966-09-02', traits: '话少，喜欢钓鱼' }),
  P('林夏', '伴侣', 5, { birthday: '1997-06-18', met: '2021 年朋友聚会', traits: '温柔、爱画画' }),
  P('外婆', '家人', 4, { birthday: '1942-12-08', traits: '记性越来越差，但最疼我' }),
  P('表妹何小雨', '表妹', 3, { birthday: '2006-04-30', traits: '高三，想学设计' }),
  P('陈默', '大学同学', 4, { birthday: '1996-11-25', met: '大学同一个宿舍', traits: '靠谱，爱爬山' }),
  P('周周', '挚友', 4, { birthday: '1997-01-14', met: '高中同桌', traits: '鬼点子多' }),
  P('老王', '大学室友', 3, { birthday: '1996-08-08', traits: '在北京做产品经理' }),
  P('刘思远', '大学同学', 2, { met: '社团', traits: '去了上海' }),
  P('赵老师', '导师', 3, { birthday: '1975-05-05', met: '本科毕设导师', traits: '严格但会帮你' }),
  P('Kevin', '同事', 3, { birthday: '1993-02-27', met: '入职同一天', traits: '后端大佬，爱打羽毛球' }),
  P('李姐', '主管', 3, { traits: '目标感很强' }),
  P('阿杰', '同事', 2, { traits: '一起吃午饭' }),
  P('小美', '同事', 2, { birthday: '1998-10-01' }),
  P('张总', '前领导', 2, { traits: '给过很多职业建议' }),
  P('苏晴', '游戏开发群友', 3, { since: add(START, 80), met: 'Godot 中文社区', traits: '做像素美术，合作意向' }),
  P('Mark', '网友', 2, { since: add(START, 120), met: 'itch.io 评论区', traits: '英国独立开发者' }),
  P('大鹏', '朋友', 3, { birthday: '1995-07-19', traits: '一起跑步' }),
  P('跑团队长阿峰', '跑友', 2, { since: add(START, 30), traits: '半马 1 小时 35' }),
  P('邻居孙阿姨', '邻居', 1, {}),
  P('房东吴先生', '房东', 1, { traits: '回消息很慢' }),
  P('高中班主任', '老师', 2, { birthday: '1970-09-10' }),
  P('堂哥', '家人', 3, { birthday: '1990-03-03', traits: '在老家开店' }),
  P('舅舅', '家人', 2, {}),
  P('小鱼', '朋友', 3, { birthday: '1998-12-24', met: '桌游店', traits: '桌游高手' }),
  P('Lily', '英语角朋友', 2, { since: add(START, 40), met: '英语角', traits: '雅思 8 分' }),
  P('健身教练 Tony', '教练', 2, { since: add(START, 100) }),
  P('猫咖老板', '朋友', 1, { since: add(START, 200) }),
  P('陈默的女朋友小安', '朋友', 2, { since: add(START, 150) }),
  P('前同事 Eric', '前同事', 2, { birthday: '1994-04-12', traits: '去了腾讯' }),
  P('学弟小何', '学弟', 2, { since: add(START, 60) }),
  P('游戏策划 Ada', '游戏开发群友', 2, { since: add(START, 220), met: '线下 Game Jam' }),
  P('心理咨询师', '咨询师', 2, { since: add(START, 170) }),
  P('姑姑', '家人', 2, { birthday: '1972-01-20' }),
]
const byName = Object.fromEntries(people.map((p) => [p.title, p]))
const knows = [
  ['妈妈', '爸爸'], ['妈妈', '外婆'], ['爸爸', '外婆'], ['妈妈', '林夏'], ['妈妈', '表妹何小雨'], ['堂哥', '舅舅'], ['妈妈', '姑姑'], ['爸爸', '堂哥'],
  ['陈默', '老王'], ['陈默', '刘思远'], ['老王', '刘思远'], ['陈默', '周周'], ['陈默', '陈默的女朋友小安'], ['陈默', '赵老师'], ['学弟小何', '赵老师'],
  ['Kevin', '李姐'], ['Kevin', '阿杰'], ['阿杰', '小美'], ['李姐', '张总'], ['Kevin', '前同事 Eric'],
  ['苏晴', 'Mark'], ['苏晴', '游戏策划 Ada'], ['大鹏', '跑团队长阿峰'], ['小鱼', '周周'], ['林夏', '小鱼'], ['林夏', '周周'], ['Lily', '林夏'],
]
for (const [a, b] of knows) link(byName[a].id, byName[b].id)

// Contacts: more often for closer people, with a note now and then.
const NOTES = ['视频聊了半小时', '一起吃了火锅', '聊了最近的工作', '他说想换工作', '帮忙搬家', '发消息问候', '周末一起爬山', '给我推荐了一本书', '聊了游戏的进展，给了很多建议', '约好下个月再见', '她最近压力很大，听她吐槽了一晚上', '一起跑了 10 公里', '打了一下午羽毛球', '一起看了展', '寄了家乡特产']
const EVERY = [0, 120, 60, 25, 10, 4]
for (const p of people) {
  const from = p.createdAt.slice(0, 10)
  const c = []
  const notes = {}
  for (let k = from; k <= TODAY; k = add(k, 1)) {
    if (chance(1 / EVERY[p.closeness])) {
      c.push(k)
      if (chance(0.35)) notes[k] = pick(NOTES)
    }
  }
  // A few people slip through the cracks lately, so reminders show up.
  if (['老王', '外婆', '赵老师', '大鹏'].includes(p.title)) while (c.length && c.at(-1) > add(TODAY, -45)) c.pop()
  if (c.length) p.contacts = c
  const kept = Object.fromEntries(Object.entries(notes).filter(([d]) => c.includes(d)))
  if (Object.keys(kept).length) p.contactNotes = kept
}

// ---------------------------------------------------------------- tasks over the year
const fill = (s) =>
  s.replace('{n}', int(1, 12)).replace('{t}', pick(TALKS)).replace('{p}', pick(people.filter((p) => p.closeness >= 3)).title.replace(/^.*?(?=\S{1,4}$)/, ''))
let overdueLeft = 4
for (let k = START; k <= add(TODAY, 21); k = add(k, 1)) {
  const future = k > TODAY
  const perDay = future ? (chance(0.35) ? 1 : 0) : wd(k) === 0 || wd(k) === 6 ? int(0, 2) : int(1, 2)
  for (let i = 0; i < perDay; i++) {
    const attr = pickAttr()
    const created = future ? TODAY : add(k, -int(0, 5)) < START ? START : add(k, -int(0, 5))
    const t = item('task', created, { title: fill(pick(T[attr])), attr, difficulty: chance(0.15) ? 3 : chance(0.45) ? 2 : 1, status: 'todo' })
    if (chance(0.75)) t.due = k
    const goals = GOAL_FOR[attr]
    if (goals.length && chance(0.3)) t.goalId = pick(goals).id
    if (!future) {
      const r = rnd()
      if (r < 0.84) {
        t.status = 'done'
        t.doneAt = add(k, chance(0.8) ? 0 : int(1, 3)) > TODAY ? TODAY : add(k, chance(0.8) ? 0 : int(1, 3))
      } else if (r < 0.95) t.status = 'dropped'
      else if (k > add(TODAY, -10) && overdueLeft-- > 0) t.status = 'todo'
      else t.status = 'done', (t.doneAt = k)
    }
    if (t.title.startsWith('给') && attr === 'social') {
      const p = people.find((x) => t.title.includes(x.title.slice(-2)))
      if (p) link(t.id, p.id)
    }
  }
}
// A small chain with prerequisites for the game.
const ship1 = item('task', add(TODAY, -5), { title: '做完游戏第一关的完整流程', attr: 'craft', difficulty: 3, status: 'doing', due: add(TODAY, 4), goalId: gArt.id })
const ship2 = item('task', add(TODAY, -5), { title: '找 10 个人试玩并收集反馈', attr: 'social', difficulty: 2, status: 'todo', due: add(TODAY, 12), goalId: gStore.id, prereqIds: [ship1.id] })
item('task', add(TODAY, -5), { title: '做 Steam 商店页', attr: 'career', difficulty: 3, status: 'todo', due: add(TODAY, 30), goalId: gStore.id, prereqIds: [ship2.id] })
link(ship2.id, byName['苏晴'].id)
// Today's plate.
item('task', TODAY, { title: '和苏晴确认美术外包报价', attr: 'career', difficulty: 2, status: 'todo', due: TODAY, goalId: gArt.id })
item('task', TODAY, { title: '晚上跑 5 公里', attr: 'body', difficulty: 2, status: 'todo', due: TODAY, goalId: gFat.id })
item('task', TODAY, { title: '雅思口语 Part 2 练习', attr: 'mind', difficulty: 1, status: 'todo', due: TODAY, goalId: gIelts.id })

// ---------------------------------------------------------------- habits with realistic ups and downs
const habits = [
  { title: '背 30 个单词', attr: 'mind', days: [0, 1, 2, 3, 4, 5, 6], start: 0, rate: (i) => (i > 150 && i < 185 ? 0.25 : 0.82) },
  { title: '跑步', attr: 'body', days: [0, 1, 3, 5], start: 30, rate: (i) => (i > 280 && i < 300 ? 0.1 : 0.72) },
  { title: '写游戏开发日志', attr: 'craft', days: [1, 2, 3, 4, 5], start: 60, rate: () => 0.66 },
  { title: '冥想 10 分钟', attr: 'spirit', days: [0, 1, 2, 3, 4, 5, 6], start: 0, rate: (i) => 0.45 + (0.4 * i) / DAYS },
  { title: '记账', attr: 'career', days: [0, 1, 2, 3, 4, 5, 6], start: 120, rate: () => 0.9 },
  { title: '23:30 前睡觉', attr: 'body', days: [0, 1, 2, 3, 4, 5, 6], start: 0, rate: () => 0.38, stopAt: 200 },
  { title: '每周给家里打电话', attr: 'social', days: [0], start: 14, rate: () => 0.85 },
]
for (const h of habits) {
  const from = add(START, h.start)
  const it = item('habit', from, { title: h.title, attr: h.attr, days: h.days, ...(h.stopAt ? { archived: true } : {}) })
  for (let k = from; k <= TODAY; k = add(k, 1)) {
    const i = dayIndex(k)
    if (h.stopAt && i > h.stopAt) break
    if (!h.days.includes(wd(k))) continue
    if (k === TODAY && chance(0.6)) continue // today isn't over
    // Streaky behaviour: yesterday's success makes today's more likely.
    const prev = checkins.length && checkins.at(-1).habitId === it.id && checkins.at(-1).date >= add(k, -2)
    if (chance(Math.min(0.97, h.rate(i) + (prev ? 0.1 : -0.08)))) checkins.push({ habitId: it.id, date: k })
  }
  // Make sure the main habit has a nice current streak.
  if (h.title === '背 30 个单词') for (let d = 1; d <= 18; d++) if (!checkins.some((c) => c.habitId === it.id && c.date === add(TODAY, -d))) checkins.push({ habitId: it.id, date: add(TODAY, -d) })
}

// ---------------------------------------------------------------- moods
const MOOD_NOTES = ['加班到很晚', '和林夏去海边了', '游戏终于能跑起来了！', '有点焦虑，钱不太够', '跑步破了个人记录', '下雨天，什么都不想做', '被李姐表扬了', '和爸妈视频', '失眠', '周末睡到自然醒', 'Demo 被群里夸了', '体检结果不错', '项目延期，烦', '读完一本好书']
let level = 3.4
for (let k = START; k < TODAY; k = add(k, 1)) {
  level = Math.max(1.6, Math.min(4.6, level + (rnd() - 0.5) * 0.6 + (3.5 - level) * 0.08))
  if (!chance(0.82)) continue
  const mood = Math.max(1, Math.min(5, Math.round(level + (rnd() - 0.5) * 1.6)))
  moods.push({ date: k, mood, note: chance(0.22) ? pick(MOOD_NOTES) : '' })
}

// ---------------------------------------------------------------- experiences
const ev = (title, date, kind, x = {}) => item('event', date < START ? START : date, { title, date, kind, feeling: 'good', ...x })
ev('大学毕业', '2019-06-28', 'milestone', { notes: '计算机专业，毕设做了一个小游戏引擎' })
ev('第一份工作：深圳某互联网公司', '2019-07-15', 'milestone')
ev('选择留在深圳', '2019-05-20', 'decision', { options: '回老家考公 / 去北京 / 留深圳', choice: '留深圳', reason: '想做互联网，机会多', feeling: 'neutral' })
ev('认识林夏', '2021-04-10', 'milestone', { feeling: 'good' })
ev('跳槽到现在的公司', '2022-03-01', 'decision', { options: '留下升职 / 跳槽涨薪 40%', choice: '跳槽', reason: '想做更大规模的系统' })
ev('外公去世', '2023-01-17', 'event', { feeling: 'bad', notes: '没能赶回去见最后一面' })
const evs = [
  ['第一次跑完 10 公里', 40, 'milestone', ['大鹏']],
  ['参加 Godot 线下交流会', 85, 'event', ['苏晴']],
  ['决定开始做《灯塔守夜人》', 92, 'decision', [], { options: '继续做小 Demo / 开一个完整项目', choice: '开完整项目', reason: '小 Demo 学不到发布的经验' }],
  ['和林夏去厦门旅行', 130, 'event', ['林夏']],
  ['半马完赛 2:05', 160, 'milestone', ['跑团队长阿峰', '大鹏']],
  ['项目延期，被李姐批评', 175, 'event', ['李姐'], { feeling: 'bad' }],
  ['开始看心理咨询', 172, 'decision', ['心理咨询师'], { options: '自己扛 / 找专业帮助', choice: '找专业帮助', reason: '连续失眠两个月', feeling: 'neutral' }],
  ['外婆住院', 205, 'event', ['外婆', '妈妈'], { feeling: 'bad' }],
  ['第一次参加 Game Jam', 222, 'milestone', ['游戏策划 Ada', '苏晴']],
  ['陈默订婚', 250, 'event', ['陈默', '陈默的女朋友小安']],
  ['《灯塔守夜人》Demo 在群里获得好评', 290, 'milestone', ['苏晴', 'Mark']],
  ['是否辞职全职做游戏', 330, 'decision', ['林夏'], { options: '马上辞职 / 攒够一年生活费再辞', choice: '攒够钱再辞', reason: '现在存款只够半年', feeling: 'neutral' }],
]
for (const [title, day, kind, who, x] of evs) {
  const e = ev(title, add(START, day), kind, x)
  for (const w of who) link(e.id, byName[w].id)
}

// ---------------------------------------------------------------- ideas & intel
const ideas = ['做一个用真实生活喂养的养成游戏', '灯塔守夜人加入天气系统', '用 AI 生成 NPC 对话', '一款关于外婆记忆的叙事小游戏', '桌游改编：卡牌版灯塔', '做一个 Godot 中文教程视频系列', '周末摆摊卖手作', '给爸妈做一个家庭相册网站', '写一本独立开发日记', '在 B 站直播开发过程', '组织一次线下桌游夜', '学做陶艺']
ideas.forEach((t, i) => {
  const n = item('note', add(START, int(0, DAYS - 10)), { title: t, kind: 'idea', status: i < 3 ? 'growing' : i < 5 ? 'done' : i < 9 ? 'seed' : 'dropped' })
  if (t.includes('灯塔')) link(n.id, gShip.id)
  if (t.includes('外婆')) link(n.id, byName['外婆'].id)
})
const intel = [
  ['Godot 4 性能优化清单', ['godot', '性能']], ['Steam 上架流程与费用', ['steam', '发行']], ['itch.io 定价策略讨论', ['发行', '定价']], ['像素美术调色板推荐', ['美术', '像素']],
  ['雅思口语高频话题 2026', ['英语', '雅思']], ['半马训练计划 12 周', ['跑步']], ['指数基金定投入门', ['理财']], ['独立游戏营销：发售前 6 个月', ['发行', '营销']],
  ['睡眠卫生的 10 条建议', ['健康', '睡眠']], ['深圳租房避坑', ['生活']], ['关卡设计：教学关怎么做', ['设计']], ['GDScript 和 C# 性能对比', ['godot']],
  ['游戏音效免费素材站', ['音频', '素材']], ['如何写一份好的游戏设计文档', ['设计']], ['程序员职业发展路线', ['职业']],
]
intel.forEach(([t, tags]) => {
  const n = item('note', add(START, int(0, DAYS - 5)), { title: t, kind: 'intel', tags, source: 'https://example.com/' + encodeURIComponent(t) })
  if (tags.includes('发行')) link(n.id, gStore.id)
  if (tags.includes('godot')) link(n.id, gGodot.id)
})

// ---------------------------------------------------------------- trajectory (situation tracks)
const PL = (name, lat, lng) => ({ name, lat, lng })
const GZ = PL('赣州', 25.92, 114.95), WH = PL('武汉', 30.582, 114.268), SZ = PL('深圳', 22.554, 114.12), HZ = PL('杭州', 30.252, 120.168)
const XM = PL('厦门', 24.48, 118.09), TK = PL('东京', 35.687, 139.749)
const seg = (lane, title, start, end, place, x = {}) =>
  item('segment', start < START ? START : start, { lane, title, start, ...(end ? { end } : {}), ...(place ? { place } : {}), ...x })
seg('home', '赣州老家', '1997-03-01', '2015-08-31', GZ)
seg('home', '武汉 · 大学宿舍', '2015-09-01', '2019-06-30', WH)
seg('home', '深圳 · 南山合租', '2019-07-01', '2022-02-28', SZ)
seg('home', '深圳 · 南山整租一室一厅', '2022-03-01', undefined, SZ)
seg('home', '搬去杭州？', add(TODAY, 220), undefined, HZ, { goalId: gDev.id })
seg('work', '武汉大学 · 计算机', '2015-09-01', '2019-06-30', WH)
seg('work', 'A 公司 · 前端', '2019-07-15', '2022-02-28', SZ)
seg('work', 'B 公司 · 后端 ＋ 业余做游戏', '2022-03-01', undefined, SZ)
seg('work', '全职独立开发', add(TODAY, 220), undefined, HZ, { goalId: gDev.id })
seg('love', '单身', '2015-09-01', '2021-04-09')
seg('love', '和林夏在一起', '2021-04-10', undefined, SZ)
seg('health', '失眠期', add(START, 150), add(START, 200), undefined, { feeling: 'bad' })
seg('health', '坚持跑步，体脂下降', add(START, 200), undefined, undefined, { feeling: 'good' })
seg('money', '还助学贷款', '2019-07-01', '2022-06-30')
seg('money', '攒钱 · 目标一年生活费', '2022-07-01', undefined, undefined, { goalId: gMoney.id })
for (const e of items.filter((i) => i.type === 'event')) {
  if (e.title.includes('厦门')) e.place = XM
  else if (e.title === '大学毕业') e.place = WH
  else if (e.date >= '2019-07-01') e.place = SZ
}
item('event', add(START, 60), { title: '东京出差一周', date: add(START, 60), kind: 'event', feeling: 'good', place: TK })

// ---------------------------------------------------------------- custom fields, assets, ledger
const fieldDef = (title, kind, unit) => item('field', START, { title, kind, ...(unit ? { unit } : {}) })
const fLife = fieldDef('使用年限', 'number', '年')
const fPrice = fieldDef('购入价格', 'money')
const fSave = fieldDef('每次省下', 'money')
const fIncome = fieldDef('每次收入', 'money')
const asset = (title, category, status, value, x = {}) => item('asset', START, { title, category, status, ...(value ? { value } : {}), ...x })
asset('活期存款', 'finance', 'owned', 60000)
asset('指数基金定投', 'finance', 'owned', 45000, { goalId: gMoney.id })
asset('MacBook Pro 14', 'item', 'owned', 11000, { acquired: '2023-06-18', fields: { [fLife.id]: 5, [fPrice.id]: 15000 } })
asset('索尼相机', 'item', 'owned', 6000, { acquired: '2024-09-01', fields: { [fLife.id]: 6, [fPrice.id]: 8000 } })
asset('公路车', 'item', 'owned', 3500, { acquired: add(START, 35), fields: { [fLife.id]: 8, [fPrice.id]: 5000 } })
asset('机械键盘等杂物', 'item', 'owned', 4000)
asset('计算机本科学位', 'cred', 'owned', 0, { acquired: '2019-06-28' })
asset('半马完赛证书', 'cred', 'owned', 0, { acquired: add(START, 160) })
asset('Godot 社区 1.2k 关注', 'fame', 'owned', 0)
asset('《灯塔守夜人》Demo', 'fame', 'owned', 0, { acquired: add(START, 290) })
asset('林夏画的肖像', 'item', 'owned', 0, { acquired: '2024-06-18' })
asset('信用卡分期', 'debt', 'owned', 5000)
const switch2 = asset('Switch 2', 'item', 'wanted', 2600, { saved: 1200 })
link(switch2.id, byName['林夏'].id)
asset('带爸妈去日本', 'item', 'wanted', 30000, { saved: 10500, goalId: gTrip.id })
asset('雅思 7 分证书', 'cred', 'wanted', 0, { goalId: gIelts.id })
const led = (title, flow, amount, repeat, date, x = {}) => item('ledger', date < START ? START : date, { title, flow, amount, repeat, date, ...x })
led('工资', 'income', 22000, 'month', '2022-03-10', { category: '工资' })
led('房租', 'expense', 4500, 'month', '2022-03-01', { category: '居住' })
led('吃饭', 'expense', 3200, 'month', '2022-03-01', { category: '吃饭' })
led('交通通讯', 'expense', 600, 'month', '2022-03-01', { category: '交通' })
led('订阅（音乐、云盘、AI）', 'expense', 260, 'month', '2024-01-01', { category: '订阅' })
led('给爸妈的生活费', 'expense', 1500, 'month', '2023-01-01', { category: '家人' })
led('周末摆摊', 'income', 150, 'week', add(START, 300), { category: '副业', fields: { [fIncome.id]: 150 } })
led('年终奖', 'income', 30000, 'none', add(TODAY, -300).slice(0, 7) + '-20', { category: '工资' })
led('买公路车', 'expense', 5000, 'none', add(START, 35), { category: '运动' })
led('厦门旅行', 'expense', 4200, 'none', add(START, 130), { category: '旅行' })
// A habit that saves money, for the simulation template.
const noTakeout = item('habit', add(START, 200), { title: '不点外卖', attr: 'body', days: [1, 2, 3, 4, 5], fields: { [fSave.id]: 25 } })
for (let k = add(START, 200); k < TODAY; k = add(k, 1)) if ([1, 2, 3, 4, 5].includes(wd(k)) && chance(0.8)) checkins.push({ habitId: noTakeout.id, date: k })
// Net worth recorded monthly, rising over the year.
const netWorthHist = {}
for (let i = 11; i >= 0; i--) {
  const d = new Date(TODAY)
  d.setMonth(d.getMonth() - i)
  netWorthHist[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = 82000 + (11 - i) * 3800 + Math.round(rnd() * 2000)
}

// ---------------------------------------------------------------- save
const snapshot = {
  version: 1,
  items,
  links: [...new Map(links.map((l) => [l.join(), l])).values()],
  checkins,
  moods,
  profile: { netWorth: netWorthHist, name: '阿岚', background: '深圳的程序员，五年工作经验，正在业余开发第一款独立游戏', strengths: '写代码、耐心、学得快', weaknesses: '拖延、熬夜、不擅长拒绝', interests: '独立游戏、跑步、桌游、摄影' },
}
writeFileSync(OUT, JSON.stringify(snapshot))
const count = (t) => items.filter((i) => i.type === t).length
console.log(`${OUT}: ${START} → ${TODAY}`)
console.log(`segments ${count('segment')}, fields ${count('field')}, assets ${count('asset')}, ledger ${count('ledger')}`)
console.log(`tasks ${count('task')}, habits ${count('habit')}, goals ${count('goal')}, people ${count('person')}, events ${count('event')}, notes ${count('note')}`)
console.log(`links ${snapshot.links.length}, checkins ${checkins.length}, moods ${moods.length}, contacts ${people.reduce((s, p) => s + (p.contacts?.length ?? 0), 0)}`)
