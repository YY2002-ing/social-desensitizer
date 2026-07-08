// 话术策略库：固定词表，按"对方的攻击面"分五大类，AI 提取与复盘只能从这里选标签，
// 保证跨事件聚合、成长页掌握度、复盘识别三处数据对得上账。

export interface TacticCategory {
  id: string;
  name: string;
  theme: string; // 这一类攻击的是什么
}

export interface Tactic {
  id: string;
  name: string;       // 大白话名称
  aka?: string;       // 学术名（如有）
  categoryId: string;
  explanation: string;  // 一句话通俗解释
  signals: string[];    // 识别特征
  counters: string[];   // 应对原则
}

export const TACTIC_CATEGORIES: TacticCategory[] = [
  { id: 'squeeze',  name: '压缩选择', theme: '让你觉得"只能这样"' },
  { id: 'emotion',  name: '情绪操纵', theme: '让你因为感受而让步' },
  { id: 'selfdoubt', name: '动摇自我', theme: '让你怀疑自己' },
  { id: 'distort',  name: '扭曲事实', theme: '让责任和事实变形' },
  { id: 'pace',     name: '控制节奏', theme: '让你在不利的时机应战' },
];

export const TACTICS: Tactic[] = [
  // ── 压缩选择 ──────────────────────────────────────────────
  {
    id: 'false-dilemma', name: '虚假两难', aka: '虚假两难谬误', categoryId: 'squeeze',
    explanation: '把很多种可能砍成二选一，逼你当场站队。',
    signals: ['"要么……要么……"', '"你到底是不是想……"', '选项明显不止两个却只给你两个'],
    counters: ['拒绝选边，直接指出还有第三种可能', '把被压缩的问题拆回原样再讨论'],
  },
  {
    id: 'urgency', name: '制造紧迫', aka: '稀缺性施压', categoryId: 'squeeze',
    explanation: '用"过时不候"让你来不及思考就答应。',
    signals: ['"名额不多了"', '"今天必须定下来"', '好处总是"仅限现在"'],
    counters: ['越催越要慢：真机会经得起24小时', '主动说"我需要时间考虑"，看对方反应'],
  },
  {
    id: 'foot-in-door', name: '得寸进尺', aka: '登门槛效应', categoryId: 'squeeze',
    explanation: '先让你答应小事，再一步步加码到你本不会答应的事。',
    signals: ['要求逐步升级', '拿旧账压你："上次你都答应了"'],
    counters: ['每个请求独立评估，答应过≠必须继续', '发现被加码时及时止损，不被沉没成本绑架'],
  },
  {
    id: 'door-in-face', name: '以退为进', aka: '留面子效应', categoryId: 'squeeze',
    explanation: '先提一个过分要求被你拒绝，再抛出"折中"方案让你不好意思再拒。',
    signals: ['大要求秒变小要求', '"那这样总可以了吧"'],
    counters: ['折中方案也要单独评估，不为"已经拒绝过一次"的愧疚买单'],
  },
  {
    id: 'fait-accompli', name: '既成事实', aka: '先斩后奏', categoryId: 'squeeze',
    explanation: '不商量先做了，逼你接受已经发生的安排。',
    signals: ['"我已经帮你定好了"', '通知你而不是询问你'],
    counters: ['已经发生≠必须接受', '明确表态不认可，并要求对方纠正'],
  },

  // ── 情绪操纵 ──────────────────────────────────────────────
  {
    id: 'emotional-blackmail', name: '情绪勒索', aka: 'FOG（恐惧/义务/内疚）', categoryId: 'emotion',
    explanation: '用你的恐惧、义务感、内疚感当筹码，逼你就范。',
    signals: ['"你不……我就……"', '"我对你这么好，你就这样报答我？"'],
    counters: ['分清"他的情绪"和"你的责任"——他难受不等于你有错', '被勒索出来的愧疚不是真实亏欠'],
  },
  {
    id: 'moral-kidnap', name: '道德绑架', categoryId: 'emotion',
    explanation: '抬出大道理，让你拒绝就显得不道德。',
    signals: ['"这么点忙都不帮"', '"你对得起……吗"'],
    counters: ['道德标准对事不对人', '拒绝不合理的要求，不等于你是坏人'],
  },
  {
    id: 'victim-playing', name: '卖惨扮弱', aka: '受害者姿态', categoryId: 'emotion',
    explanation: '表演可怜来换取你的让步。',
    signals: ['诉苦和请求总是绑在一起出现', '你一拒绝他就更惨了'],
    counters: ['同情归同情，决定归决定', '真正的困难可以帮，被表演的困难不必买单'],
  },
  {
    id: 'love-bombing', name: '画饼示好', aka: '好意轰炸', categoryId: 'emotion',
    explanation: '用密集的好处、夸赞和承诺，让你不好意思说不。',
    signals: ['过度热情', '承诺很大但兑现很少', '"我这都是为你好"'],
    counters: ['看行动不看承诺', '好处落袋之前都只是话术'],
  },
  {
    id: 'goading', name: '激将法', categoryId: 'emotion',
    explanation: '用挑衅逼你为了证明自己而做本不想做的事。',
    signals: ['"你连这都不敢"', '"我看你就是不行"'],
    counters: ['你不需要向挑衅你的人证明任何事', '识破后反而可以笑着承认："对，我就是不敢"'],
  },

  // ── 动摇自我 ──────────────────────────────────────────────
  {
    id: 'negging', name: '贬低否定', aka: '打压式推销', categoryId: 'selfdoubt',
    explanation: '先打压你的价值，再推销他的"出路"。',
    signals: ['全盘否定你的经历、学历、能力', '否定之后立刻给你指一条要花钱/要付出的路'],
    counters: ['警惕"先贬后卖"组合拳，贬低是在为推销铺路', '你的价值不由推销者定义'],
  },
  {
    id: 'gaslighting', name: '否认事实', aka: '煤气灯效应', categoryId: 'selfdoubt',
    explanation: '否认发生过的事，让你怀疑自己的记忆和判断。',
    signals: ['"我从没说过"', '"是你记错了"', '"你想多了"'],
    counters: ['重要对话留存记录', '相信自己的一手感知，不在对方的叙事里自我审判'],
  },
  {
    id: 'darvo', name: '倒打一耙', aka: 'DARVO', categoryId: 'selfdoubt',
    explanation: '你指出他的问题，他反过来攻击你、并自称才是受害者。',
    signals: ['指责被瞬间反转', '"我才是被伤害的那个"'],
    counters: ['咬住原始问题不跟着他走', '对方反扑得越激烈，往往说明你戳得越准'],
  },
  {
    id: 'labeling', name: '贴标签', aka: '感受无效化', categoryId: 'selfdoubt',
    explanation: '用"你太敏感/想多了"把问题归因于你的性格，让你的感受失去合法性。',
    signals: ['讨论具体的事，他评价你这个人', '"至于吗"'],
    counters: ['感受不需要任何人批准', '把话题拉回具体行为："我们在说的是你刚才那句话"'],
  },

  // ── 扭曲事实 ──────────────────────────────────────────────
  {
    id: 'blame-shifting', name: '转移责任', categoryId: 'distort',
    explanation: '把他的问题说成是你的问题。',
    signals: ['永远是别人的错', '"还不是因为你……"'],
    counters: ['谁的行为谁负责', '不接飞来的锅：先厘清"这件事里各自做了什么"'],
  },
  {
    id: 'topic-shifting', name: '偷换概念', aka: '转移话题', categoryId: 'distort',
    explanation: '悄悄换掉讨论的对象，让你的追问永远落空。',
    signals: ['回答的永远不是你问的', '聊着聊着主题变了'],
    counters: ['复述原问题："我刚才问的是……"', '一次只谈一件事，谈完再换'],
  },
  {
    id: 'selective-telling', name: '选择性陈述', categoryId: 'distort',
    explanation: '只讲对他有利的一半事实。',
    signals: ['信息总是拼不成完整图景', '关键细节永远含糊'],
    counters: ['主动求证另一半', '追问具体细节，模糊处就是问题处'],
  },
  {
    id: 'playing-dumb', name: '假装糊涂', categoryId: 'distort',
    explanation: '用"听不懂你在说什么"消耗你，让你自我怀疑或放弃追究。',
    signals: ['装傻', '要求你反复解释显而易见的事'],
    counters: ['重要的事书面化、留痕', '不陪他演：说清一次即可，不重复自证'],
  },
  {
    id: 'fake-authority', name: '虚假权威', categoryId: 'distort',
    explanation: '用无法验证的资历和头衔压你。',
    signals: ['"我做了N年"', '"圈内谁不认识我"', '资历经不起具体追问'],
    counters: ['权威也要讲逻辑，资历替代不了论证', '无法验证的背书，等于不存在'],
  },
  {
    id: 'bandwagon', name: '从众施压', aka: '诉诸多数', categoryId: 'distort',
    explanation: '用"大家都这样"让你显得不合群、不正常。',
    signals: ['拿"所有人""大家"当论据，却举不出一个实名例子'],
    counters: ['大家都做≠正确', '你不需要和"大家"保持一致才成立'],
  },

  // ── 控制节奏 ──────────────────────────────────────────────
  {
    id: 'stalling', name: '拖延爽约', categoryId: 'pace',
    explanation: '反复改期、放鸽子，消耗你的时间和期待，占据主动权。',
    signals: ['永远"再等等""晚点说"', '改期从不道歉、不给确定时间'],
    counters: ['给出明确的最后期限', '两次爽约即可止损，你的时间也是成本'],
  },
  {
    id: 'pestering', name: '疲劳纠缠', aka: '磨到你答应', categoryId: 'pace',
    explanation: '不接受拒绝，同一个要求换着花样反复问，直到你烦了松口。',
    signals: ['拒绝之后话题永远绕回来', '"就一次""最后问一遍"'],
    counters: ['破唱片法：用同一句拒绝原样重复，不给新理由', '每次给新解释，都是给他新的突破口'],
  },
  {
    id: 'silent-treatment', name: '冷暴力', aka: '沉默惩罚', categoryId: 'pace',
    explanation: '用突然的沉默和消失惩罚你，逼你先低头。',
    signals: ['已读不回作为惩罚手段', '你不哄他就一直冷着'],
    counters: ['沉默是他的选择，不是你的错', '不追着道歉，给出沟通窗口后回归自己的生活'],
  },
  {
    id: 'public-pressure', name: '当众施压', categoryId: 'pace',
    explanation: '专挑你不好翻脸的场合提要求、发难。',
    signals: ['人多的时候才提事', '利用你的体面逼你就范'],
    counters: ['"这事我们私下说"——把战场拉回你可控的地方', '当众可以不回应，沉默不等于默认'],
  },
  {
    id: 'ambush', name: '突袭逼答', categoryId: 'pace',
    explanation: '不给思考时间，要求你立刻给答复。',
    signals: ['"现在就要答案"', '深夜/工作中突然抛重大问题'],
    counters: ['"我需要时间考虑"本身就是完整的回答', '任何逼你立刻决定的人，都不希望你想清楚'],
  },

  // ── 兜底 ──────────────────────────────────────────────────
  {
    id: 'other', name: '其他', categoryId: 'distort',
    explanation: '暂未归类的话术。',
    signals: [],
    counters: [],
  },
];

const tacticMap = new Map(TACTICS.map(t => [t.id, t]));
const categoryMap = new Map(TACTIC_CATEGORIES.map(c => [c.id, c]));

export const getTactic = (id: string): Tactic | undefined => tacticMap.get(id);
export const getCategory = (id: string): TacticCategory | undefined => categoryMap.get(id);

/** 给 AI prompt 用的紧凑词表：id、名称、一句话解释 */
export const tacticVocabularyForPrompt = (): string =>
  TACTIC_CATEGORIES.map(cat => {
    const items = TACTICS.filter(t => t.categoryId === cat.id && t.id !== 'other')
      .map(t => `${t.id}=${t.name}（${t.explanation}）`)
      .join('；');
    return `【${cat.name}·${cat.theme}】${items}`;
  }).join('\n') + '\n【兜底】other=其他（以上都不符合时使用）';
