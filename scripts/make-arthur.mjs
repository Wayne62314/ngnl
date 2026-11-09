// Mock data: Arthur Morgan's year, for trying every feature with a rich dataset.
// Fan test data only. Story beats follow the game's 1899 timeline with every year
// shifted by +127 (1899 → 2026, born 1863 → 1990); months/days keep the story's
// order. "Today" sits in Chapter 6 (Beaver Hollow), already diagnosed.
//
//   node scripts/make-arthur.mjs [out.json] [seed=1899]
// Import it in the app: 设置与备份 → 从备份恢复 (replaces the data in that browser).

import { writeFileSync } from 'node:fs'

const OUT = process.argv[2] ?? 'data/demo-arthur.json'
let seed = Number(process.argv[3] ?? 1899)

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
  return key(new Date(y, m - 1, d + n))
}
const wd = (k) => new Date(k + 'T00:00:00').getDay()
const NOW = new Date().toISOString()
const iso = (k, h = 9) => {
  const t = `${k}T${pad(h)}:${pad(int(0, 59))}:00.000Z`
  return t > NOW ? NOW : t
}
const min = (a, b) => (a < b ? a : b)
let n = 0
const id = (p) => `${p}-${(++n).toString(36)}`

const items = []
const links = []
const checkins = []
const moods = []
const link = (a, b) => a && b && a !== b && links.push(a < b ? [a, b] : [b, a])
const item = (type, created, x) => {
  const c = min(created, TODAY)
  const it = { id: id(type[0]), type, createdAt: iso(c), updatedAt: iso(c, 20), ...x }
  items.push(it)
  return it
}

// ---------------------------------------------------------------- the year, by chapter (shifted to 2026)
const START = '2026-01-01'
const CH = [
  { n: 1, name: '科尔特', from: '2026-01-04', to: '2026-02-19', mood: 2.4 },
  { n: 2, name: '马蹄铁瞭望台', from: '2026-02-20', to: '2026-05-09', mood: 3.7 },
  { n: 3, name: '克莱蒙斯角', from: '2026-05-10', to: '2026-07-04', mood: 3.4 },
  { n: 4, name: '沙迪贝尔', from: '2026-07-05', to: '2026-08-18', mood: 3.0 },
  { n: 5, name: '瓜马', from: '2026-08-19', to: '2026-09-24', mood: 2.2 },
  { n: 6, name: '河狸谷', from: '2026-09-25', to: '2099-01-01', mood: 2.6 },
]
const chOf = (k) => CH.find((c) => k >= c.from && k <= c.to) ?? CH[0]
const DIAGNOSED = '2026-10-02'
const BITTEN = '2026-03-02'

// Places: the game's towns, pinned to roughly matching real spots so the offline map works.
const PL = (name, lat, lng) => ({ name, lat, lng })
const P_ = {
  blackwater: PL('黑水镇', 38.97, -95.24),
  colter: PL('科尔特', 44.6, -107.2),
  valentine: PL('瓦伦丁', 41.6, -99.0),
  horseshoe: PL('马蹄铁瞭望台', 41.9, -98.6),
  strawberry: PL('草莓镇', 40.2, -104.6),
  rhodes: PL('罗兹镇', 33.45, -88.8),
  clemens: PL('克莱蒙斯角', 33.6, -88.4),
  saintDenis: PL('圣丹尼斯', 29.95, -90.07),
  shadyBelle: PL('沙迪贝尔', 30.2, -90.6),
  lakay: PL('拉凯', 30.4, -91.3),
  guarma: PL('瓜马', 21.6, -79.2),
  beaver: PL('河狸谷', 39.4, -80.3),
  annesburg: PL('安妮斯堡', 40.6, -79.0),
  vanHorn: PL('范霍恩', 39.3, -76.6),
  emerald: PL('翡翠牧场', 40.4, -91.2),
  wapiti: PL('瓦皮蒂保留地', 45.6, -106.5),
  tumbleweed: PL('风滚草镇', 32.2, -110.9),
  chicago: PL('芝加哥', 41.88, -87.63),
  sisika: PL('西西卡监狱', 29.0, -89.6),
}

// ---------------------------------------------------------------- custom fields
const field = (title, kind, x = {}) => item('field', START, { title, kind, ...x })
const fBounty = field('赏金', 'money')
const fDanger = field('危险程度', 'number', { unit: '级' })
const fDonate = field('每次捐款', 'money')
const fPelt = field('每次卖皮毛', 'money')
const fCaliber = field('口径', 'text')
const fBond = field('亲密等级', 'number', { unit: '级' })
const fLoyal = field('对达奇忠诚', 'select', { options: ['死忠', '动摇', '已经离心'] })
const fWho = field('谁送的', 'item')
const fOwes = field('欠我人情', 'bool')

// ---------------------------------------------------------------- goals (愿景树)
const goal = (title, status, parent, created = START, x = {}) => item('goal', created, { title, status, ...(parent ? { parentId: parent.id } : {}), ...x })
const gGang = goal('让帮派活下去', 'doing', null, START, { notes: '达奇说只要再干一票大的，就能去塔希提。我越来越不信了。' })
const gTahiti = goal('凑够去塔希提的钱', 'doing', gGang)
const gTrain = goal('抢下康沃尔的火车', 'done', gTahiti)
const gValBank = goal('瓦伦丁银行（没干成）', 'done', gTahiti)
const gSDBank = goal('圣丹尼斯银行大劫案', 'done', gTahiti, '2026-07-20', { notes: '彻底失败。霍西亚和莱尼死在了那天。' })
goal('', 'unknown', gTahiti, '2026-10-01')
const gPinks = goal('甩掉平克顿', 'doing', gGang)
const gMove = goal('每次暴露就转移营地', 'doing', gPinks)
goal('', 'unknown', gPinks, '2026-09-01')

const gJohn = goal('让约翰一家离开这一切', 'doing', null, '2026-06-01', { notes: '杰克不该在这种地方长大。' })
const gJohnOut = goal('把约翰从西西卡监狱弄出来', 'done', gJohn, '2026-08-25')
const gJohnMoney = goal('给阿比盖尔攒一笔钱', 'doing', gJohn, '2026-10-01')
const gJohnRanch = goal('让他们有个能落脚的农场', 'todo', gJohn, '2026-10-01')
const gJackBack = goal('把杰克从布隆特那里救回来', 'done', gJohn, '2026-07-10')

const gRedeem = goal('在剩下的日子里做点好事', 'doing', null, DIAGNOSED, { notes: '医生说我得的是肺结核。时间不多了，至少别再让别人因为我受苦。' })
const gDownes = goal('补偿唐斯一家', 'doing', gRedeem, DIAGNOSED)
const gNative = goal('帮雨落的族人', 'doing', gRedeem, '2026-09-28')
const gCalderon = goal('帮卡尔德隆修女做点事', 'done', gRedeem, '2026-10-05')
const gCharlotte = goal('教夏洛特学会打猎', 'done', gRedeem, '2026-10-08')
goal('', 'unknown', gRedeem, '2026-10-20')

const gLegend = goal('猎齐传奇动物', 'doing', null, START)
const gBear = goal('传奇熊（鹰飞指路）', 'done', gLegend, '2026-03-10')
const gBuck = goal('传奇白鹿', 'done', gLegend, '2026-04-02')
const gWolf = goal('传奇狼', 'todo', gLegend, '2026-06-01')
const gCougar = goal('传奇美洲狮', 'todo', gLegend, '2026-06-01')

const gJournal = goal('把日记本画满', 'doing', null, START)
const gHealth = goal('别让身体先垮掉', 'doing', null, '2026-04-10')

// ---------------------------------------------------------------- people
const P = (title, relation, closeness, x = {}) => item('person', x.since ?? START, { title, relation, closeness, ...x })
const people = [
  P('达奇', '帮派首领 · 带我长大的人', 4, { met: '十四岁那年，达奇和霍西亚把我从街上捡回来', traits: '会讲道理，越来越听不进道理', birthday: '1982-05-21', fields: { [fLoyal.id]: '动摇' } }),
  P('霍西亚', '帮派元老 · 老师', 5, { met: '和达奇一起收留了我', traits: '聪明、温和，是帮里真正的大脑', fields: {} }),
  P('约翰', '帮派兄弟', 4, { met: '他十二岁被达奇带回来，我看着他长大', traits: '冲动，但心不坏。脸上有狼抓的疤', birthday: '2000-04-05' }),
  P('阿比盖尔', '约翰的妻子', 4, { met: '营地里一起熬过很多年', traits: '比约翰清醒，嘴硬心软' }),
  P('杰克', '约翰的儿子', 5, { met: '他出生时我就在营地', traits: '爱听故事，喜欢书', birthday: '2022-05-12' }),
  P('莎迪', '战友', 5, { since: '2026-01-06', met: '在科尔特附近从奥德里斯科尔手里救下她', traits: '丈夫被杀后变得比谁都狠' }),
  P('查尔斯', '帮派兄弟', 5, { met: '一起打过很多猎', traits: '可靠、正直，话少' }),
  P('哈维尔', '帮派兄弟', 3, { traits: '会弹吉他，对达奇言听计从', fields: { [fLoyal.id]: '死忠' } }),
  P('比尔', '帮派兄弟', 2, { traits: '不聪明，但够忠心', fields: { [fLoyal.id]: '死忠' } }),
  P('米卡', '新入伙的人', 1, { since: '2025-06-01', met: '去年才入伙', traits: '嘴甜心黑，一直在达奇耳边说话', fields: { [fDanger.id]: 9, [fLoyal.id]: '死忠' } }),
  P('莱尼', '帮派兄弟', 4, { met: '他入伙时我还不太看得上他', traits: '读过书，年轻有冲劲', fields: {} }),
  P('肖恩', '帮派兄弟', 3, { met: '在科尔特的赏金猎人手里救出来', traits: '嘴碎，爱吹牛，挺讨人喜欢', fields: {} }),
  P('基兰', '被俘后入伙', 2, { since: '2026-01-15', met: '科尔特抓来的奥德里斯科尔小子', traits: '胆小，会照顾马', fields: {} }),
  P('大叔', '营地老人', 2, { traits: '腰永远在疼，活永远没干' }),
  P('皮尔森', '营地厨子', 3, { traits: '总在做炖菜，总说当年在海军' }),
  P('施特劳斯', '营地放贷人', 1, { traits: '让我去收债的人。是他害了唐斯一家', fields: { [fLoyal.id]: '死忠' } }),
  P('斯旺森牧师', '营地牧师', 3, { traits: '酒鬼，但心是好的' }),
  P('莫莉', '达奇的女人', 2, { traits: '觉得达奇不再看她了', fields: {} }),
  P('格里姆肖小姐', '营地管事', 3, { traits: '凶，营地全靠她管着' }),
  P('凯伦', '营地姑娘', 3, { traits: '胆子大，爱喝酒' }),
  P('蒂莉', '营地姑娘', 3, { traits: '聪明，吃过很多苦' }),
  P('玛丽-贝丝', '营地姑娘', 3, { traits: '爱看小说，想写书' }),
  P('特劳尼', '老朋友 · 骗子', 3, { traits: '魔术师兼骗子，出入上流社会' }),
  P('玛丽·林顿', '以前的恋人', 3, { met: '年轻时爱过的人。她选了别的路', traits: '她的家人从来看不起我' }),
  P('伊丽莎', '儿子的母亲', 2, { met: '年轻时在一家小馆子认识', traits: '温柔', fields: {} }),
  P('艾萨克', '儿子', 5, { traits: '我很少去看他。后来再也看不到了', fields: {} }),
  P('卡尔德隆修女', '修女', 3, { since: '2026-07-12', met: '在圣丹尼斯的路边', traits: '相信我心里还有好的东西' }),
  P('雨落', '瓦皮蒂族长', 3, { since: '2026-09-28', traits: '为族人忍了太久' }),
  P('鹰飞', '雨落的儿子', 3, { since: '2026-09-28', traits: '年轻，想打仗', fields: {} }),
  P('哈米什', '独腿老猎人', 3, { since: '2026-10-10', met: '在山里帮他找回马', traits: '比我乐观得多', fields: {} }),
  P('夏洛特', '寡妇', 3, { since: '2026-10-08', met: '她丈夫死后不会打猎，快饿死了', traits: '学得很快' }),
  P('托马斯·唐斯', '欠债的农夫', 1, { since: BITTEN, met: '去收债时把他打了。他咳在我脸上', traits: '他已经病得很重了', fields: {} }),
  P('埃德娜·唐斯', '托马斯的妻子', 2, { since: BITTEN, traits: '丈夫死后带着儿子讨生活' }),
  P('阿奇·唐斯', '托马斯的儿子', 2, { since: BITTEN, traits: '还是个孩子，就得去矿上干活' }),
  P('科尔姆·奥德里斯科尔', '仇人', 1, { met: '和达奇斗了十几年的帮派头目', traits: '杀了达奇的女人，达奇也杀了他弟弟', fields: { [fBounty.id]: 1500, [fDanger.id]: 8 } }),
  P('康沃尔', '石油大亨 · 仇人', 1, { since: '2026-03-20', met: '我们抢了他的火车', traits: '有钱，有平克顿，记仇', fields: { [fDanger.id]: 7 } }),
  P('布隆特', '圣丹尼斯黑帮', 1, { since: '2026-07-01', met: '他绑走了杰克', traits: '笑着做最脏的事', fields: { [fDanger.id]: 8 } }),
  P('米尔顿探员', '平克顿', 1, { since: '2026-03-25', met: '在营地外找上我', traits: '冷静，知道得太多', fields: { [fDanger.id]: 9 } }),
  P('罗斯探员', '平克顿', 1, { since: '2026-03-25', traits: '米尔顿的搭档', fields: { [fDanger.id]: 8 } }),
  P('老伙计', '我的马', 5, { since: '2026-02-21', met: '在瓦伦丁的马厩买的', traits: '比大多数人可靠', fields: { [fBond.id]: 4 } }),
]
const by = Object.fromEntries(people.map((p) => [p.title, p]))
const DEATH = {
  霍西亚: '2026-08-18',
  莱尼: '2026-08-18',
  肖恩: '2026-07-06',
  基兰: '2026-08-02',
  莫莉: '2026-10-25',
  哈米什: '2026-10-30',
  '托马斯·唐斯': '2026-03-20',
  '科尔姆·奥德里斯科尔': '2026-06-28',
  布隆特: '2026-07-30',
  伊丽莎: '2016-08-01',
  艾萨克: '2016-08-01',
}
const GONE = { 施特劳斯: '2026-10-18' } // left the camp — no more contact
for (const p of people) {
  if (DEATH[p.title]) Object.assign(p, { status: 'deceased', statusDate: DEATH[p.title] })
  else if (GONE[p.title]) Object.assign(p, { status: 'gone', statusDate: GONE[p.title] })
}
// Who owes Arthur a favour.
for (const t of ['特劳尼', '夏洛特', '卡尔德隆修女', '埃德娜·唐斯']) by[t].fields = { ...(by[t].fields ?? {}), [fOwes.id]: true }
const knows = [
  ['达奇', '霍西亚'], ['达奇', '约翰'], ['达奇', '米卡'], ['达奇', '莫莉'], ['达奇', '哈维尔'], ['达奇', '比尔'], ['达奇', '施特劳斯'], ['达奇', '科尔姆·奥德里斯科尔'],
  ['约翰', '阿比盖尔'], ['约翰', '杰克'], ['阿比盖尔', '杰克'], ['约翰', '查尔斯'], ['约翰', '莎迪'], ['约翰', '哈维尔'], ['约翰', '比尔'],
  ['莎迪', '查尔斯'], ['莎迪', '蒂莉'], ['莎迪', '凯伦'], ['查尔斯', '雨落'], ['查尔斯', '鹰飞'], ['雨落', '鹰飞'],
  ['霍西亚', '莱尼'], ['霍西亚', '特劳尼'], ['莱尼', '查尔斯'], ['肖恩', '凯伦'], ['基兰', '莎迪'], ['大叔', '皮尔森'], ['皮尔森', '斯旺森牧师'],
  ['格里姆肖小姐', '蒂莉'], ['格里姆肖小姐', '凯伦'], ['格里姆肖小姐', '玛丽-贝丝'], ['格里姆肖小姐', '莫莉'],
  ['托马斯·唐斯', '埃德娜·唐斯'], ['托马斯·唐斯', '阿奇·唐斯'], ['埃德娜·唐斯', '阿奇·唐斯'], ['施特劳斯', '托马斯·唐斯'],
  ['伊丽莎', '艾萨克'], ['米尔顿探员', '罗斯探员'], ['康沃尔', '米尔顿探员'], ['米卡', '米尔顿探员'],
  ['卡尔德隆修女', '斯旺森牧师'], ['特劳尼', '玛丽·林顿'],
]
for (const [a, b] of knows) link(by[a].id, by[b].id)

// Contact log, closer people more often, nothing after someone dies or leaves.
const CNOTES = {
  达奇: ['他又说起塔希提', '他问我是不是还信他', '一起骑马去探路', '他今天发了很大的火', '听他讲计划，越听越不对'],
  霍西亚: ['一起去钓鱼，聊了很久', '他说该收手了', '帮他骗了一个地主'],
  约翰: ['一起去抢了一辆马车', '骂了他一顿，让他多陪杰克', '和他喝了一杯', '他问我以后打算怎么办'],
  阿比盖尔: ['她托我照看杰克', '她担心约翰', '帮她搬了东西'],
  杰克: ['带杰克去钓鱼', '给杰克讲了个故事', '杰克给我看了他的书', '教杰克认动物脚印'],
  莎迪: ['和莎迪一起去救人', '她要去找奥德里斯科尔报仇', '和莎迪去打劫马车', '她说她不怕死'],
  查尔斯: ['和查尔斯去打猎', '和查尔斯聊了雨落的事', '他说达奇变了', '一起烤了只鹿'],
  哈维尔: ['听哈维尔弹吉他', '一起抓了个欠钱的'],
  比尔: ['把喝醉的比尔拖回营地', '一起去抢火车'],
  米卡: ['又和米卡吵了一架', '他在打听我的行踪'],
  莱尼: ['和莱尼在瓦伦丁喝醉了', '和莱尼一起去侦查'],
  肖恩: ['肖恩又在吹牛', '和肖恩打了一架玩'],
  基兰: ['基兰帮我刷了马', '让基兰别乱跑'],
  皮尔森: ['给皮尔森送了只鹿', '皮尔森说营地没肉了'],
  斯旺森牧师: ['把斯旺森牧师从酒馆捞出来', '他说他戒酒了'],
  格里姆肖小姐: ['格里姆肖小姐让我多捐点钱', '她把营地管得井井有条'],
  玛丽·林顿: ['收到玛丽的信', '和玛丽在圣丹尼斯见了一面', '她说她还在乎我'],
  卡尔德隆修女: ['和卡尔德隆修女聊了很久', '她问我害不害怕'],
  夏洛特: ['教夏洛特用枪', '给夏洛特送了些物资'],
  '埃德娜·唐斯': ['给埃德娜送了钱', '在安妮斯堡找到埃德娜'],
  老伙计: ['刷了老伙计', '老伙计受了点伤', '给老伙计喂了苹果'],
  特劳尼: ['特劳尼带来了消息', '帮特劳尼脱身'],
  雨落: ['和雨落谈了他的族人', '雨落让我劝鹰飞'],
  鹰飞: ['鹰飞想去打仗', '和鹰飞一起去偷军队的马'],
  哈米什: ['和哈米什一起钓鱼', '听哈米什讲他的腿'],
}
const GENERIC = ['一起吃了晚饭', '在营地聊了几句', '一起去城里', '一起站岗']
const EVERY = [0, 90, 30, 10, 4, 2]
for (const p of people) {
  const from = p.createdAt.slice(0, 10)
  const stop = min(add(DEATH[p.title] ?? GONE[p.title] ?? '2099-01-01', -1), TODAY)
  const c = []
  const notes = {}
  // Guarma: only a few of them were there.
  const onGuarma = ['达奇', '米卡', '哈维尔', '比尔', '莎迪'].includes(p.title)
  for (let k = from < START ? START : from; k <= stop; k = add(k, 1)) {
    if (chOf(k).n === 5 && !onGuarma && k > '2026-08-20') continue
    if (chance(1 / EVERY[p.closeness])) {
      c.push(k)
      if (chance(0.4)) notes[k] = pick(CNOTES[p.title] ?? GENERIC)
    }
  }
  if (c.length) p.contacts = c
  if (Object.keys(notes).length) p.contactNotes = notes
}

// ---------------------------------------------------------------- daily tasks across the year
const T = {
  body: ['去{place}附近打猎', '钓鱼', '刷马、喂马', '追一只鹿追了半天', '洗个热水澡', '去{place}买弹药', '剥皮卖给猎人商', '给营地带一头鹿回来'],
  craft: ['在日记里画{animal}', '写日记', '修补马鞍', '画营地的篝火', '给杰克画一张{animal}'],
  social: ['陪{p}聊天', '帮{p}办件事', '给{p}带点东西', '和{p}一起去{place}', '营地篝火边唱歌'],
  career: ['替施特劳斯收债', '抢一辆马车', '踩点：{place}', '销赃', '往营地钱箱里放钱', '劫一辆驿站马车', '去{place}打听消息'],
  mind: ['读报纸', '研究地图', '想清楚接下来怎么办', '听霍西亚讲他的计划'],
  spirit: ['一个人看日落', '去教堂外坐一会儿', '想起伊丽莎和艾萨克', '少喝点酒', '早点睡'],
}
const ANIMALS = ['鹿', '狼', '熊', '老鹰', '野牛', '短吻鳄', '狐狸', '马']
const PLACES_BY_CH = { 1: ['科尔特'], 2: ['瓦伦丁', '草莓镇', '翡翠牧场'], 3: ['罗兹镇', '翡翠牧场'], 4: ['圣丹尼斯', '拉凯', '罗兹镇'], 5: ['瓜马'], 6: ['安妮斯堡', '范霍恩', '圣丹尼斯'] }
const W_BY_CH = {
  1: { body: 40, career: 15, social: 25, craft: 10, mind: 5, spirit: 5 },
  2: { body: 25, career: 30, social: 20, craft: 12, mind: 5, spirit: 8 },
  3: { body: 22, career: 32, social: 22, craft: 12, mind: 6, spirit: 6 },
  4: { body: 18, career: 35, social: 20, craft: 10, mind: 9, spirit: 8 },
  5: { body: 30, career: 30, social: 20, craft: 5, mind: 10, spirit: 5 },
  6: { body: 14, career: 14, social: 28, craft: 16, mind: 8, spirit: 20 },
}
const GOAL_FOR = { body: [gLegend, gHealth], craft: [gJournal], career: [gTahiti, gPinks], social: [gJohn], mind: [gPinks], spirit: [gRedeem] }
const alive = (k) => people.filter((p) => p.closeness >= 3 && !['伊丽莎', '艾萨克', '老伙计'].includes(p.title) && (!DEATH[p.title] || DEATH[p.title] > k) && p.createdAt.slice(0, 10) <= k)
for (let k = START; k <= add(TODAY, 14); k = add(k, 1)) {
  const ch = chOf(k)
  const future = k > TODAY
  const per = future ? (chance(0.3) ? 1 : 0) : int(1, 3)
  for (let i = 0; i < per; i++) {
    let r = rnd() * 100
    let attr = 'body'
    for (const [a, w] of Object.entries(W_BY_CH[ch.n])) if ((r -= w) < 0) {
      attr = a
      break
    }
    if (attr === 'mind' && ch.n >= 5) attr = 'spirit'
    let title = pick(T[attr])
    let who
    if (title.includes('{p}')) {
      who = pick(alive(k))
      title = title.replace('{p}', who.title)
    }
    if (title.includes('施特劳斯') && k > GONE.施特劳斯) title = '往营地钱箱里放钱'
    if (title.includes('霍西亚') && k >= DEATH.霍西亚) title = '研究地图'
    title = title.replace('{place}', pick(PLACES_BY_CH[ch.n])).replace('{animal}', pick(ANIMALS))
    const t = item('task', future ? TODAY : add(k, -int(0, 3)), { title, attr, difficulty: chance(0.15) ? 3 : chance(0.4) ? 2 : 1, status: 'todo' })
    if (chance(0.8)) t.due = k
    if (chance(0.25) && GOAL_FOR[attr]?.length) t.goalId = pick(GOAL_FOR[attr]).id
    if (!future) {
      const x = rnd()
      if (x < 0.82) (t.status = 'done'), (t.doneAt = k)
      else if (x < 0.93) t.status = 'dropped'
      else if (k > add(TODAY, -6)) t.status = 'todo'
      else (t.status = 'done'), (t.doneAt = k)
    }
    // Some tasks are linked to the person by hand; the rest are left for 关联建议 to find.
    if (who && chance(0.5)) link(t.id, who.id)
  }
}

// Story tasks with prerequisites.
const st = (title, attr, diff, due, x = {}) => item('task', min(add(due, -5), TODAY), { title, attr, difficulty: diff, due, status: due < TODAY ? 'done' : 'todo', ...(due < TODAY ? { doneAt: due } : {}), ...x })
const s1 = st('找到唐斯一家的下落', 'social', 2, '2026-10-12', { goalId: gDownes.id })
const s2 = st('把钱交给埃德娜·唐斯', 'social', 2, '2026-10-20', { goalId: gDownes.id, prereqIds: [s1.id] })
st('帮阿奇·唐斯离开矿场', 'social', 3, add(TODAY, 6), { goalId: gDownes.id, prereqIds: [s2.id] })
const j1 = st('从施特劳斯的账本里找出我那份钱', 'career', 2, add(TODAY, 2), { goalId: gJohnMoney.id })
const j2 = st('把钱藏好，留给阿比盖尔', 'career', 2, add(TODAY, 5), { goalId: gJohnMoney.id, prereqIds: [j1.id] })
st('劝约翰带着家人走，别回头', 'social', 3, add(TODAY, 10), { goalId: gJohnRanch.id, prereqIds: [j2.id] })
st('打听西边哪里有便宜的地', 'mind', 1, add(TODAY, 8), { goalId: gJohnRanch.id })
st('把约翰从西西卡监狱救出来', 'career', 3, '2026-09-30', { goalId: gJohnOut.id })
st('潜进布隆特的宅子', 'career', 3, '2026-07-15', { goalId: gJackBack.id })
st('帮鹰飞偷回军队抢走的马', 'social', 3, '2026-10-06', { goalId: gNative.id })
st('去军营把雨落救出来', 'social', 3, add(TODAY, 4), { goalId: gNative.id })
st('给卡尔德隆修女的教堂带些吃的', 'spirit', 1, '2026-10-14', { goalId: gCalderon.id })
st('带夏洛特去打第一只兔子', 'social', 1, '2026-10-09', { goalId: gCharlotte.id })
st('去看医生', 'body', 1, DIAGNOSED, { goalId: gHealth.id })
st('少抽点烟', 'body', 1, add(TODAY, 3), { goalId: gHealth.id })
st('找到传奇狼的踪迹', 'body', 2, add(TODAY, 12), { goalId: gWolf.id })
// Today's plate.
item('task', TODAY, { title: '给玛丽·林顿回信', attr: 'social', difficulty: 1, status: 'todo', due: TODAY })
item('task', TODAY, { title: '盯着米卡，看他去见了谁', attr: 'career', difficulty: 2, status: 'todo', due: TODAY, goalId: gPinks.id })
item('task', TODAY, { title: '在日记里写下今天', attr: 'craft', difficulty: 1, status: 'todo', due: TODAY, goalId: gJournal.id })

// ---------------------------------------------------------------- habits
const habit = (title, attr, days, from, rate, x = {}) => {
  const it = item('habit', from, { title, attr, days, ...x })
  for (let k = from; k <= TODAY; k = add(k, 1)) {
    if (!days.includes(wd(k))) continue
    if (k === TODAY && chance(0.5)) continue
    const prev = checkins.length && checkins.at(-1).habitId === it.id && checkins.at(-1).date >= add(k, -2)
    if (chance(Math.max(0.02, Math.min(0.97, rate(k) + (prev ? 0.08 : -0.06))))) checkins.push({ habitId: it.id, date: k })
  }
  return it
}
const sick = (k) => (k >= DIAGNOSED ? 0.25 : k >= '2026-06-01' ? 0.1 : 0)
const hJournal = habit('写日记、画画', 'craft', [0, 1, 2, 3, 4, 5, 6], START, (k) => (chOf(k).n === 5 ? 0.3 : chOf(k).n === 6 ? 0.9 : 0.7))
habit('刷马、照顾老伙计', 'body', [0, 2, 4, 6], '2026-02-21', () => 0.8)
const hDonate = habit('给营地钱箱捐款', 'career', [0], '2026-01-11', (k) => (chOf(k).n === 5 ? 0 : 0.85), { fields: { [fDonate.id]: 25 } })
const hHunt = habit('打猎卖皮毛', 'body', [1, 3, 5], START, (k) => 0.75 - sick(k) * 1.4, { fields: { [fPelt.id]: 12 } })
habit('钓鱼', 'spirit', [0, 6], '2026-02-20', (k) => (chOf(k).n === 5 ? 0 : 0.55))
habit('洗澡刮胡子', 'body', [6], '2026-02-20', (k) => (chOf(k).n === 5 ? 0 : 0.7))
habit('每天少喝一杯', 'spirit', [0, 1, 2, 3, 4, 5, 6], '2026-05-01', () => 0.45, { archived: true })
habit('早睡（医生说的）', 'body', [0, 1, 2, 3, 4, 5, 6], DIAGNOSED, () => 0.5)
habit('去看看杰克', 'social', [1, 4], '2026-02-20', (k) => (chOf(k).n === 5 ? 0 : 0.7))
// The journal streak is unbroken lately.
for (let d = 1; d <= 24; d++) if (!checkins.some((c) => c.habitId === hJournal.id && c.date === add(TODAY, -d))) checkins.push({ habitId: hJournal.id, date: add(TODAY, -d) })

// ---------------------------------------------------------------- moods
const MOOD = {
  1: ['冷得要命，大家都在挨饿', '黑水镇的事一直压着', '把莎迪带回来了'],
  2: ['瓦伦丁的酒不错', '抢下了康沃尔的火车', '和杰克钓了一下午鱼', '那个农夫咳在我脸上', '营地难得这么热闹', '在山上看到了传奇熊'],
  3: ['和奥德里斯科尔的人又打起来了', '罗兹镇的两家人斗得厉害', '跟莱尼喝醉了', '达奇越来越像变了一个人'],
  4: ['圣丹尼斯太吵了', '杰克被绑走了', '修女说我还有救', '银行那天什么都完了'],
  5: ['在一个陌生的岛上醒来', '甘蔗地里干活的人像奴隶一样', '只想回家，如果那还叫家'],
  6: ['医生说是肺结核', '把钱给了埃德娜，心里好受一点', '看了一整晚日出', '达奇把约翰留在了那里', '米卡的话越来越多', '教夏洛特打猎，她学得真快', '咳了一夜', '想通了一些事'],
}
let level = 3
for (let k = START; k < TODAY; k = add(k, 1)) {
  const ch = chOf(k)
  level += (rnd() - 0.5) * 0.7 + (ch.mood - level) * 0.15
  // Ch6: the illness weighs, but he finds some peace in the last weeks.
  if (ch.n === 6 && k > '2026-10-15') level += 0.04
  if (k === '2026-08-18' || k === DIAGNOSED || k === '2026-07-06') level = 1.2
  level = Math.max(1, Math.min(4.8, level))
  if (!chance(0.8)) continue
  const mood = Math.max(1, Math.min(5, Math.round(level + (rnd() - 0.5) * 1.2)))
  moods.push({ date: k, mood, note: chance(0.25) ? pick(MOOD[ch.n]) : '' })
}
for (const [d, note, mood] of [['2026-08-18', '霍西亚和莱尼都死了', 1], [DIAGNOSED, '医生说是肺结核', 1], ['2026-07-06', '肖恩死在了罗兹镇', 1], ['2026-01-06', '把莎迪带回来了', 2]]) {
  const m = moods.find((x) => x.date === d)
  if (m) Object.assign(m, { note, mood })
  else moods.push({ date: d, mood, note })
}

// ---------------------------------------------------------------- experiences
const ev = (title, date, kind, place, who = [], x = {}) => {
  const e = item('event', date < START ? START : date, { title, date, kind, feeling: 'neutral', ...(place ? { place } : {}), ...x })
  for (const w of who) link(e.id, by[w].id)
  return e
}
ev('出生', '1990-03-15', 'milestone', null, [], { notes: '母亲早逝，父亲是个贼，后来被吊死了' })
ev('被达奇和霍西亚收留', '2004-06-01', 'milestone', null, ['达奇', '霍西亚'], { feeling: 'good', notes: '十四岁。第一次有人教我读书写字' })
ev('约翰入伙', '2012-04-01', 'event', null, ['约翰', '达奇'])
ev('和玛丽·林顿分开', '2009-09-01', 'decision', PL('芝加哥', 41.88, -87.63), ['玛丽·林顿'], { feeling: 'bad', options: '离开帮派和她走 / 留在帮里', choice: '留在帮里', reason: '我放不下达奇，她也放不下她的家' })
ev('伊丽莎和艾萨克被杀', '2016-08-01', 'event', null, ['伊丽莎', '艾萨克'], { feeling: 'bad', notes: '为了十块钱。我到的时候已经晚了' })
ev('杰克出生', '2022-05-12', 'milestone', null, ['杰克', '约翰', '阿比盖尔'], { feeling: 'good' })
ev('米卡入伙', '2025-06-01', 'event', null, ['米卡'])
ev('黑水镇渡船劫案出事', '2026-01-02', 'event', P_.blackwater, ['达奇', '霍西亚', '米卡'], { feeling: 'bad', notes: '达奇在船上开了枪。钱藏起来了，人死了，我们只能逃' })
ev('逃进科尔特的大雪里', '2026-01-04', 'event', P_.colter, ['达奇', '约翰'], { feeling: 'bad' })
ev('从奥德里斯科尔手里救下莎迪', '2026-01-06', 'milestone', P_.colter, ['莎迪'], { feeling: 'good' })
ev('在狼群里找到约翰', '2026-01-08', 'event', P_.colter, ['约翰', '哈维尔'])
ev('抢了第一辆火车', '2026-02-10', 'milestone', P_.colter, ['米卡', '约翰', '比尔'], { feeling: 'good' })
ev('营地搬到马蹄铁瞭望台', '2026-02-20', 'milestone', P_.horseshoe, [], { feeling: 'good' })
ev('在瓦伦丁买了老伙计', '2026-02-21', 'milestone', P_.valentine, ['老伙计'], { feeling: 'good' })
ev('去唐斯家收债', BITTEN, 'decision', P_.valentine, ['托马斯·唐斯', '施特劳斯'], { feeling: 'bad', options: '放他一马 / 把钱收回来', choice: '把钱收回来', reason: '那时候我觉得这只是活儿' })
ev('在瓦伦丁和莱尼喝醉', '2026-03-05', 'event', P_.valentine, ['莱尼'], { feeling: 'good' })
ev('抢下康沃尔的火车', '2026-03-18', 'milestone', P_.valentine, ['约翰', '查尔斯', '比尔', '康沃尔'], { feeling: 'good' })
ev('第一次见到平克顿的人', '2026-03-25', 'event', P_.horseshoe, ['米尔顿探员', '罗斯探员'], { feeling: 'bad' })
ev('瓦伦丁的大枪战', '2026-05-08', 'event', P_.valentine, ['米卡', '约翰'], { feeling: 'bad', notes: '为了救米卡出狱，结果整个镇子都打起来了' })
ev('营地搬到克莱蒙斯角', '2026-05-10', 'milestone', P_.clemens)
ev('卷进格雷家和布雷斯韦特家的恩怨', '2026-06-05', 'event', P_.rhodes, ['达奇', '莎迪'], { feeling: 'bad' })
ev('科尔姆·奥德里斯科尔被吊死', '2026-06-28', 'event', P_.strawberry, ['科尔姆·奥德里斯科尔', '达奇'], { feeling: 'neutral' })
ev('肖恩被埋伏打死', '2026-07-06', 'event', P_.rhodes, ['肖恩'], { feeling: 'bad' })
ev('营地搬到沙迪贝尔', '2026-07-05', 'milestone', P_.shadyBelle)
ev('在圣丹尼斯遇到卡尔德隆修女', '2026-07-12', 'event', P_.saintDenis, ['卡尔德隆修女'], { feeling: 'good' })
ev('从布隆特手里接回杰克', '2026-07-16', 'milestone', P_.saintDenis, ['杰克', '布隆特', '约翰'], { feeling: 'good' })
ev('基兰被奥德里斯科尔杀害', '2026-08-02', 'event', P_.shadyBelle, ['基兰'], { feeling: 'bad', notes: '他们把他送回来时已经不成人样' })
ev('圣丹尼斯银行劫案', '2026-08-18', 'event', P_.saintDenis, ['霍西亚', '莱尼', '达奇', '约翰', '米卡'], { feeling: 'bad', notes: '霍西亚被抓后死在街上，莱尼死在屋顶。约翰被抓，我们坐船逃了' })
ev('船沉了，漂到瓜马', '2026-08-20', 'event', P_.guarma, ['达奇', '米卡', '哈维尔', '比尔'], { feeling: 'bad' })
ev('从瓜马逃回来', '2026-09-24', 'milestone', P_.guarma, ['达奇'], { feeling: 'neutral' })
ev('营地搬到河狸谷', '2026-09-25', 'milestone', P_.beaver)
ev('认识雨落和鹰飞', '2026-09-28', 'event', P_.wapiti, ['雨落', '鹰飞', '查尔斯'], { feeling: 'good' })
ev('确诊肺结核', DIAGNOSED, 'milestone', P_.saintDenis, ['托马斯·唐斯'], { feeling: 'bad', notes: '医生让我去西边干燥的地方养病。我笑了' })
ev('决定自己去救约翰', '2026-09-26', 'decision', P_.beaver, ['达奇', '约翰', '阿比盖尔'], { options: '等达奇的计划 / 自己去救', choice: '自己去救', reason: '达奇不想救他。我想', feeling: 'neutral' })
ev('把约翰从西西卡监狱救出来', '2026-09-30', 'milestone', P_.sisika, ['约翰', '莎迪', '查尔斯'], { feeling: 'good' })
ev('在安妮斯堡找到唐斯一家', '2026-10-12', 'event', P_.annesburg, ['埃德娜·唐斯', '阿奇·唐斯'], { feeling: 'neutral' })
ev('教夏洛特打猎', '2026-10-09', 'event', null, ['夏洛特'], { feeling: 'good' })
ev('帮哈米什找回他的马', '2026-10-10', 'event', null, ['哈米什'], { feeling: 'good' })
ev('施特劳斯被赶出营地', GONE.施特劳斯, 'decision', P_.beaver, ['施特劳斯', '达奇'], { options: '让他留下 / 让他走', choice: '让他走', reason: '他的生意害了太多人', feeling: 'good' })
ev('莫莉死了', '2026-10-25', 'event', P_.beaver, ['莫莉', '达奇', '格里姆肖小姐'], { feeling: 'bad' })
ev('哈米什死了', '2026-10-30', 'event', null, ['哈米什'], { feeling: 'bad' })
ev('是否继续跟着达奇', '2026-11-05', 'decision', P_.beaver, ['达奇', '约翰', '查尔斯', '莎迪'], { options: '继续跟着达奇 / 带约翰一家走', choice: '先保住约翰一家', reason: '达奇已经不是那个教我读书的人了', feeling: 'neutral' })

// ---------------------------------------------------------------- notes: ideas & intel
const idea = (title, status, date, x = {}, linkTo = []) => {
  const it = item('note', date, { title, kind: 'idea', status, ...x })
  for (const l of linkTo) link(it.id, l.id)
  return it
}
idea('也许该劝约翰去西边买块地', 'growing', '2026-06-10', { notes: '杰克该上学，阿比盖尔不该天天提心吊胆' }, [gJohnRanch])
idea('把日记本留给杰克', 'seed', '2026-10-15', { notes: '里面有我画的每一只动物' })
idea('去塔希提种芒果', 'dropped', '2026-03-01', { notes: '达奇的梦。我曾经也信过' }, [gTahiti])
idea('在瓦伦丁开个马厩', 'dropped', '2026-04-01')
idea('给霍西亚立块碑', 'seed', '2026-08-25', {}, [by.霍西亚])
idea('教杰克钓鱼', 'done', '2026-04-15', {}, [by.杰克])
idea('帮雨落写信给政府', 'growing', '2026-10-01', {}, [gNative])
idea('如果当年跟玛丽走了会怎样', 'dropped', '2026-05-20')
idea('把老伙计留给约翰', 'seed', '2026-11-01', { notes: '如果哪天我骑不动了' })
idea('写一首给伊丽莎和艾萨克的诗', 'seed', '2026-10-28')
const intel = (title, tags, date, linkTo = []) => {
  const it = item('note', date, { title, kind: 'intel', tags, source: '营地闲聊' })
  for (const l of linkTo) link(it.id, l.id)
  return it
}
intel('康沃尔的火车每周四经过', ['火车', '情报'], '2026-03-10', [gTrain, by.康沃尔])
intel('瓦伦丁银行的金库位置', ['银行', '瓦伦丁'], '2026-04-20', [gValBank])
intel('圣丹尼斯银行的守卫换班时间', ['银行', '圣丹尼斯'], '2026-08-01', [gSDBank])
intel('平克顿在马蹄铁一带打听我们', ['平克顿', '危险'], '2026-04-28', [gPinks, by.米尔顿探员])
intel('奥德里斯科尔在草莓镇附近藏身', ['仇人'], '2026-06-20', [by['科尔姆·奥德里斯科尔']])
intel('传奇熊出没在鹰飞指的山谷', ['打猎', '传奇'], '2026-03-08', [gBear])
intel('传奇白鹿在瓦伦丁北边', ['打猎', '传奇'], '2026-03-30', [gBuck])
intel('传奇狼可能在科尔特一带', ['打猎', '传奇'], '2026-10-20', [gWolf])
intel('西西卡监狱的看守轮换', ['监狱'], '2026-09-26', [gJohnOut])
intel('军队要把雨落的族人迁走', ['瓦皮蒂', '军队'], '2026-10-03', [gNative])
intel('施特劳斯的账本放在他帐篷里', ['钱'], '2026-10-16', [gJohnMoney])
intel('米卡最近总一个人出营地', ['可疑'], '2026-11-02', [by.米卡])
intel('西边干燥的地方对肺好', ['健康'], DIAGNOSED, [gHealth])
intel('安妮斯堡矿场的工钱', ['唐斯'], '2026-10-11', [gDownes])
intel('布隆特的宅子在河边', ['圣丹尼斯', '仇人'], '2026-07-13', [gJackBack, by.布隆特])

// ---------------------------------------------------------------- trajectory
const seg = (lane, title, start, end, place, x = {}) => item('segment', start, { lane, title, start, ...(end ? { end } : {}), ...(place ? { place } : {}), ...x })
seg('home', '没有家的童年', '1990-03-15', '2004-05-31', null, { feeling: 'bad' })
seg('home', '跟着帮派四处为家', '2004-06-01', '2025-05-31', null)
seg('home', '黑水镇营地', '2025-06-01', '2026-01-02', P_.blackwater)
seg('home', '科尔特（雪山里的废弃矿镇）', '2026-01-04', '2026-02-19', P_.colter, { feeling: 'bad' })
seg('home', '马蹄铁瞭望台', '2026-02-20', '2026-05-09', P_.horseshoe, { feeling: 'good' })
seg('home', '克莱蒙斯角', '2026-05-10', '2026-07-04', P_.clemens)
seg('home', '沙迪贝尔', '2026-07-05', '2026-08-18', P_.shadyBelle)
seg('home', '瓜马（流落荒岛）', '2026-08-20', '2026-09-24', P_.guarma, { feeling: 'bad' })
seg('home', '河狸谷', '2026-09-25', undefined, P_.beaver)
seg('home', '西边干燥的地方？', add(TODAY, 60), undefined, P_.tumbleweed, { goalId: gHealth.id, notes: '医生的建议。我自己都不信' })
seg('work', '跟着达奇讨生活', '2004-06-01', undefined, null)
seg('work', '替施特劳斯收债', '2025-06-01', GONE.施特劳斯, null, { feeling: 'bad' })
seg('work', '在瓜马的甘蔗地里打仗', '2026-08-20', '2026-09-24', P_.guarma, { feeling: 'bad' })
seg('work', '帮约翰一家攒一条出路', '2026-10-01', undefined, null, { goalId: gJohn.id, feeling: 'good' })
seg('love', '和玛丽·林顿', '2006-05-01', '2009-09-01', PL('芝加哥', 41.88, -87.63), { feeling: 'good' })
seg('love', '和伊丽莎，有了艾萨克', '2012-01-01', '2016-08-01', null, { feeling: 'good' })
seg('love', '一个人', '2016-08-01', undefined, null)
seg('health', '壮得像头牛', '1990-03-15', BITTEN, null, { feeling: 'good' })
seg('health', '咳嗽越来越重', BITTEN, add(DIAGNOSED, -1), null, { feeling: 'neutral' })
seg('health', '肺结核', DIAGNOSED, undefined, P_.saintDenis, { feeling: 'bad' })
seg('money', '帮派公用钱箱', '2004-06-01', undefined, null)
seg('money', '偷偷存一笔给约翰一家', '2026-10-01', undefined, null, { goalId: gJohnMoney.id })
// Places on events not set above.
for (const e of items.filter((i) => i.type === 'event' && !i.place && i.date >= START)) e.place = { 1: P_.colter, 2: P_.valentine, 3: P_.rhodes, 4: P_.saintDenis, 5: P_.guarma, 6: P_.beaver }[chOf(e.date).n]

// ---------------------------------------------------------------- assets & ledger (amounts in the period's dollars)
const asset = (title, category, status, value, x = {}) => item('asset', x.created ?? START, { title, category, status, ...(value ? { value } : {}), ...x })
asset('身上的现金', 'finance', 'owned', 186)
asset('营地钱箱里我的那份', 'finance', 'owned', 640, { goalId: gJohnMoney.id })
asset('藏在黑水镇的钱', 'finance', 'lost', 10000, { notes: '一直藏着，谁也拿不到' })
const horse = asset('老伙计（肯塔基马）', 'item', 'owned', 150, { acquired: '2026-02-21', fields: { [fBond.id]: 4 } })
link(horse.id, by.老伙计.id)
asset('卡特曼左轮手枪', 'item', 'owned', 50, { acquired: '2024-01-01', fields: { [fCaliber.id]: '.45' } })
const schofield = asset('斯科菲尔德左轮', 'item', 'owned', 120, { acquired: '2026-03-18', fields: { [fCaliber.id]: '.44', [fWho.id]: by.霍西亚.id } })
link(schofield.id, by.霍西亚.id)
asset('栓动步枪', 'item', 'owned', 90, { acquired: '2026-04-10', fields: { [fCaliber.id]: '.30' } })
asset('日记本', 'item', 'owned', 0, { acquired: '2004-08-01', notes: '霍西亚送的第一本', fields: { [fWho.id]: by.霍西亚.id } })
asset('那顶旧帽子', 'item', 'owned', 0, { acquired: '2015-01-01' })
asset('鹿皮外套', 'item', 'owned', 40, { acquired: '2026-03-01' })
asset('伊丽莎和艾萨克的照片', 'item', 'owned', 0, { acquired: '2014-01-01' })
asset('玛丽送的怀表', 'item', 'sold', 35, { acquired: '2008-12-25', fields: { [fWho.id]: by['玛丽·林顿'].id } })
asset('奥德里斯科尔的马', 'item', 'sold', 60, { acquired: '2026-01-07' })
asset('范德林德帮的二把手', 'cred', 'owned', 0)
asset('传奇熊的皮', 'fame', 'owned', 0, { acquired: '2026-03-12', goalId: gBear.id })
asset('传奇白鹿的角', 'fame', 'owned', 0, { acquired: '2026-04-05', goalId: gBuck.id })
asset('日记里的 46 幅画', 'fame', 'owned', 0, { goalId: gJournal.id })
asset('新汉诺威悬赏', 'debt', 'owned', 250, { notes: '瓦伦丁那场枪战之后' })
asset('莱莫恩悬赏', 'debt', 'owned', 420, { notes: '圣丹尼斯银行之后' })
asset('欠营地的账', 'debt', 'owned', 60)
const farm = asset('给约翰一家买块地', 'item', 'wanted', 1500, { saved: 640, goalId: gJohnRanch.id, notes: '西边，越远越好' })
link(farm.id, by.约翰.id)
link(farm.id, by.阿比盖尔.id)
const downesMoney = asset('还给唐斯一家的钱', 'finance', 'wanted', 300, { saved: 150, goalId: gDownes.id })
link(downesMoney.id, by['埃德娜·唐斯'].id)
asset('一支好的猎枪', 'item', 'wanted', 110, { saved: 40 })
const book = asset('给杰克的新书', 'item', 'wanted', 3, { saved: 1 })
link(book.id, by.杰克.id)
asset('去塔希提的船票', 'item', 'wanted', 2000, { saved: 0, goalId: gTahiti.id, notes: '达奇的梦' })

const led = (title, flow, amount, repeat, date, x = {}) => item('ledger', date < START ? START : date, { title, flow, amount, repeat, date, ...x })
led('替施特劳斯收债', 'income', 40, 'week', '2025-06-07', { until: GONE.施特劳斯, category: '收债' })
led('卖皮毛', 'income', 30, 'week', START, { category: '打猎', fields: { [fPelt.id]: 12 } })
led('打劫马车的分成', 'income', 60, 'month', '2026-02-20', { category: '抢劫' })
led('给营地捐款', 'expense', 25, 'week', '2026-01-11', { category: '营地' })
led('弹药', 'expense', 6, 'week', START, { category: '装备' })
led('马料、马刷', 'expense', 3, 'week', '2026-02-21', { category: '马' })
led('酒钱', 'expense', 4, 'week', START, { category: '吃喝' })
led('康沃尔火车的分成', 'income', 400, 'none', '2026-03-18', { category: '抢劫' })
led('火车劫案的分成（科尔特）', 'income', 120, 'none', '2026-02-10', { category: '抢劫' })
led('布雷斯韦特家给的钱', 'income', 150, 'none', '2026-06-08', { category: '活儿' })
led('卖掉奥德里斯科尔的马', 'income', 60, 'none', '2026-01-09', { category: '卖东西' })
led('买老伙计', 'expense', 150, 'none', '2026-02-21', { category: '马' })
led('买栓动步枪', 'expense', 90, 'none', '2026-04-10', { category: '装备' })
led('给埃德娜·唐斯的钱', 'expense', 150, 'none', '2026-10-20', { category: '还债' })
led('医生诊费', 'expense', 5, 'none', DIAGNOSED, { category: '看病' })
led('给卡尔德隆修女的教堂', 'expense', 20, 'none', '2026-10-14', { category: '捐赠' })
led('赢了一局扑克', 'income', 35, 'none', '2026-05-22', { category: '赌' })
led('输了一局扑克', 'expense', 28, 'none', '2026-03-15', { category: '赌' })

// ---------------------------------------------------------------- simulation canvases
const sid = (() => {
  let i = 0
  return () => `s${++i}`
})()
const node = (kind, x, y, data = {}, off) => ({ id: sid(), kind, x, y, data, ...(off ? { off: true } : {}) })
const wire = (a, ap, b, bp) => ({ id: sid(), from: a.id, fromPort: ap, to: b.id, toPort: bp })
{
  const nFarm = node('item', 40, 40, { itemId: farm.id })
  const nHunt = node('item', 40, 300, { itemId: hHunt.id })
  const nMul = node('mul', 340, 300)
  const nPelt = node('item', 340, 520, { itemId: items.find((i) => i.title === '卖皮毛').id })
  const nRob = node('item', 340, 740, { itemId: items.find((i) => i.title === '打劫马车的分成').id }, true)
  const nSum = node('sum', 660, 420)
  const nDonate = node('item', 40, 560, { itemId: hDonate.id })
  const nPer = node('per', 340, 960, { from: 'week', to: 'day' })
  const nNeg = node('sub', 660, 700)
  const nDead = node('date', 660, 960, { value: '2026-12-31', })
  const nSave = node('save', 980, 120, { label: '年底前能给约翰一家攒够买地的钱吗' })
  const nChart = node('chart', 980, 560)
  const sim = item('sim', '2026-10-21', {
    title: '年底前给约翰一家攒够买地的钱',
    pinned: true,
    nodes: [nFarm, nHunt, nMul, nPelt, nRob, nSum, nDonate, nPer, nNeg, nDead, nSave, nChart],
    edges: [
      wire(nHunt, 'f:' + fPelt.id, nMul, 'a'),
      wire(nHunt, 'perDay', nMul, 'b'),
      wire(nMul, 'out', nSum, 'a'),
      wire(nRob, 'day', nSum, 'b'),
      wire(nDonate, 'f:' + fDonate.id, nPer, 'in'),
      wire(nSum, 'out', nNeg, 'a'),
      wire(nPer, 'out', nNeg, 'b'),
      wire(nFarm, 'value', nSave, 'target'),
      wire(nFarm, 'saved', nSave, 'have'),
      wire(nNeg, 'out', nSave, 'perDay'),
      wire(nDead, 'out', nSave, 'deadline'),
      wire(nFarm, 'saved', nChart, 'start'),
      wire(nNeg, 'out', nChart, 'perDay'),
      wire(nFarm, 'value', nChart, 'target'),
    ],
  })
  void sim
  void nPelt
}
{
  const nDiag = node('item', 40, 40, { itemId: items.find((i) => i.title === '确诊肺结核').id })
  const nToday = node('today', 40, 260)
  const nDays = node('daysBetween', 360, 120)
  const nShow = node('show', 680, 120, { label: '确诊以来过了几天', unit: '天' })
  const nJack = node('item', 40, 440, { itemId: by.杰克.id })
  const nBday = node('daysBetween', 360, 400)
  const nShow2 = node('show', 680, 400, { label: '离杰克生日还有几天', unit: '天' })
  item('sim', '2026-10-25', {
    title: '日子还剩多少',
    nodes: [nDiag, nToday, nDays, nShow, nJack, nBday, nShow2],
    edges: [wire(nDiag, 'date', nDays, 'a'), wire(nToday, 'out', nDays, 'b'), wire(nDays, 'out', nShow, 'in'), wire(nToday, 'out', nBday, 'a'), wire(nJack, 'birthday', nBday, 'b'), wire(nBday, 'out', nShow2, 'in')],
  })
}

// ---------------------------------------------------------------- net worth by month (shrinking after the bank job)
const NW = { '2026-01': -180, '2026-02': 40, '2026-03': 420, '2026-04': 560, '2026-05': 480, '2026-06': 620, '2026-07': 700, '2026-08': 150, '2026-09': -120, '2026-10': 80 }

// ---------------------------------------------------------------- save
const snapshot = {
  version: 1,
  items,
  links: [...new Map(links.map((l) => [l.join(), l])).values()],
  checkins,
  moods,
  profile: {
    name: '亚瑟·摩根',
    title: '范德林德帮的执行者',
    portrait: 'preset:warrior',
    background: '范德林德帮的老人。十四岁被达奇和霍西亚收留，从此跟着他们四处为家。黑水镇出事后，帮派一路被追着往东逃。最近被确诊了肺结核。（模拟数据：年份整体平移到 2026 年，金额按当时的美元记）',
    strengths: '枪法、骑术、打猎、能扛事',
    weaknesses: '脾气硬、嘴笨、太听达奇的话',
    interests: '画画、写日记、钓鱼、看日落',
    baseLevels: { body: 34, career: 26, social: 18, craft: 16, mind: 12, spirit: 9 },
    netWorth: NW,
    lanes: [],
  },
}
writeFileSync(OUT, JSON.stringify(snapshot))
const count = (t) => items.filter((i) => i.type === t).length
console.log(`${OUT}: ${START} → ${TODAY}`)
console.log(`tasks ${count('task')}, habits ${count('habit')}, goals ${count('goal')}, people ${count('person')}, events ${count('event')}, notes ${count('note')}`)
console.log(`segments ${count('segment')}, fields ${count('field')}, assets ${count('asset')}, ledger ${count('ledger')}, sims ${count('sim')}`)
console.log(`links ${snapshot.links.length}, checkins ${checkins.length}, moods ${moods.length}, contacts ${people.reduce((s, p) => s + (p.contacts?.length ?? 0), 0)}`)
