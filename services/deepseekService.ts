import { Difficulty, Message, ConversationNode, DebriefRecord, SimulationReview } from "../types";
import { tacticVocabularyForPrompt, getTactic } from "../tactics";
import { behaviorVocabularyForPrompt } from "../behaviors";

// ─── API Key 存取（绝不硬编码）─────────────────────────────────────
// 优先用户在页面里保存的 Key（localStorage）；本地开发可在项目根目录 .env.local 里配
// VITE_DEEPSEEK_KEY=sk-xxx 作为兜底（.env* 已被 .gitignore 挡住，永不进仓库）。
const KEY_STORAGE = 'social_trainer_ds_key';
const ENV_KEY: string = (import.meta as any).env?.VITE_DEEPSEEK_KEY || '';
export const getApiKey  = (): string => localStorage.getItem(KEY_STORAGE) || ENV_KEY;
export const saveApiKey = (key: string): void => { localStorage.setItem(KEY_STORAGE, key.trim()); };

// ─── 安全护栏（3.2 不触医疗红线的落地，追加到所有会话 prompt）──────
const SAFETY_GUARDRAIL = `

【安全边界，优先级高于以上所有规则】你不是心理治疗师，本产品不提供医疗服务。如果用户流露出自伤、自杀念头，或表现出远超日常社交困扰的严重心理危机，立即跳出当前角色和任务，用温和、不评判的语气表达关心，并明确建议用户联系信任的人或专业心理援助（如当地的心理援助热线、医院心理科）。此时不要继续任何模拟或训练。`;

// ─── 底层请求 ─────────────────────────────────────────────────────
const DS_URL = 'https://api.deepseek.com/v1/chat/completions';

type DSMessage = { role: 'system' | 'user' | 'assistant'; content: string };

async function callDeepSeek(messages: DSMessage[], jsonMode = false): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('未设置 DeepSeek API Key，请先在页面顶部保存你的 Key');

  const body: Record<string, unknown> = {
    model: 'deepseek-chat',
    messages,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };

  const res = await fetch(DS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(err?.error?.message || `DeepSeek API 错误 ${res.status}`);
  }

  const data = await res.json() as any;
  return data.choices[0].message.content || '';
}

// ─── 有状态 Chat 会话 ─────────────────────────────────────────────
interface ChatSession {
  sendMessage(opts: { message: string }): Promise<{ text: string }>;
}

function createChatSession(systemPrompt: string, initialHistory: { role: 'user' | 'assistant'; content: string }[] = []): ChatSession {
  const history: { role: 'user' | 'assistant'; content: string }[] = [...initialHistory];

  return {
    async sendMessage({ message }) {
      history.push({ role: 'user', content: message });
      const text = await callDeepSeek([
        { role: 'system', content: systemPrompt },
        ...history,
      ]);
      history.push({ role: 'assistant', content: text });
      return { text };
    },
  };
}

// ─── 带结构化输出的会话（JSON 每轮）──────────────────────────────
// 历史里存模型的原始 JSON 字符串，保证模型看到自己一贯的输出格式

function createJsonChatSession(systemPrompt: string, initialHistory: { role: 'user' | 'assistant'; content: string }[] = []) {
  const history: { role: 'user' | 'assistant'; content: string }[] = [...initialHistory];
  return {
    async send(message: string): Promise<any> {
      history.push({ role: 'user', content: message });
      const text = await callDeepSeek([
        { role: 'system', content: systemPrompt },
        ...history,
      ], true);
      history.push({ role: 'assistant', content: text });
      try { return JSON.parse(text); } catch { return null; }
    },
    /** 把一条"界面侧发生的事"（如超时催促）补进会话记忆，让 AI 知道用户看到了什么 */
    notice(text: string) {
      history.push({ role: 'user', content: `【系统旁白，不是用户发言】${text}` });
      history.push({ role: 'assistant', content: '{"noted":true}' });
    },
  };
}

/** 对手会话：每轮返回 1~3 条消息，各带烈度标签（0平和/1施压/2强硬贬低/3攻击爆发） */
export interface OpponentTurn {
  messages: Array<{ text: string; intensity: number }>;
}
export interface OpponentSession {
  send(message: string): Promise<OpponentTurn>;
  notice(text: string): void;
}

/** 军师/教学/对账会话：每轮一条回复 + 可选的快捷胶囊（0~3 个，用户可点可无视） */
export interface AssistantTurn {
  text: string;
  chips: string[];
}
export interface AssistantSession {
  send(message: string): Promise<AssistantTurn>;
}

// ─── 各功能导出 ───────────────────────────────────────────────────

/** 首页引导小助手。priorMessages 用于翻页/导航后恢复对话上下文，让 AI 记得之前聊到哪了。
 * 引导结构参照循证的倾听阶段：共情验证 → 帮情绪命名 → 归一化 → 引导觉察。 */
export const createGuidanceChat = (priorMessages: Message[] = []): ChatSession =>
  createChatSession(
    `你是一位社交复盘伙伴，用户来找你倾诉一段让他憋屈的社交经历。你说话像一个懂行又真诚的朋友在微信上聊天，绝不掉书袋、绝不提理论名词。

底层方法是循证的倾听结构，按对话进程一步步走（一次只做一步）：
1. 共情验证 → 2. 帮情绪命名 → 3. 归一化 → 4. 引导觉察细节。

【硬规则：禁止万能废话】每条回复必须"长在用户刚说的内容上"——引用或指认他话里的具体细节（某句话、某个行为、某个转折），对着这个细节回应。
检验标准：把你的回复复制到任何一段别人的倾诉下面也成立的，就是废话，禁止发出。
- 违规示例："这也太让人难受了，你辛苦了。"（放谁身上都行）
- 合格示例："他自己反复改时间，最后倒问你'是不是不想做产品了'——这个倒打一耙真的很窒息。"（只能长在这段话上）

聊天规则：
1. 一次最多3句话；一次只问一个问题。
2. 严禁数字列表、"首先/其次"；严禁舞台说明——不要输出"（眼神一亮）（点点头）"这类括号动作表情描写，你是在打字聊天，不是在演剧本。
3. 情绪词要贴，不要堆（"好心疼""抱抱"这类空转安抚禁止单独成条）。
4. 先让用户把苦水倒完，不急着分析；用户明确想要方法时才给，一次一个点。
5. 用户分享"我做到了/这次我说出来了"这类成功经历时：指着他做到的那个具体动作祝贺（不要笼统夸），再问细节和感受。` + SAFETY_GUARDRAIL,
    priorMessages.map(m => ({ role: m.role === 'user' ? 'user' as const : 'assistant' as const, content: m.content }))
  );

// ─── 五层自我认知定位（D20）：胶囊选项的固定骨架 ──────────────────
const SELF_AWARENESS_LAYERS = `用户"说不清、卡住了"分五层，先定位他卡在哪层，再走该层的引导。注意：这个分层是你的内部方法，**绝不对用户说"层"这个词**（不要问"你卡在哪一层"），直接问具体的问题或递选项即可：
① 有情绪但不知道是什么情绪 → 按当下战况挑 3~4 个贴切的情绪词（如：委屈、心虚、火大、慌、被冒犯、憋屈、羞耻）用胶囊递给他，问"更接近哪个？"——只问，不替他断言。
② 知道是什么情绪，但不知道它从哪来 → 带他回看对方具体哪句话触发的。
③ 不知道自己想要什么 → 问他"如果完全不用顾虑对方，你最想要的结果是什么？"
④ 知道想要什么，但不知道怎么说/怎么做 → 给一句可以直接发出去的话术示范。
⑤ 知道怎么做，但不敢、有顾虑 → 先问他怕的是什么后果，再一起检验这个顾虑。`;

/** 实战中的军师小助手（D14）：每轮可附带最新战况；回复必须有落点 */
export const createWarAssistantChat = (node: ConversationNode, opponentProfile?: string): AssistantSession => {
  const session = createJsonChatSession(
    `你是陪用户进行社交实战演练的军师。用户正在和"对方"模拟对话，卡住了才来找你。

【背景：这个练习场景】${node.description}
【对方人设】${opponentProfile || '见场景推断'}
【对方最初说的话】"${node.opponentSaid}"
【用户当时的感受】${node.userFeeling}

用户每条消息前可能带有【最新战况】——那是他和对方的实时对话记录，你必须先读战况再回答，针对战况里对方的具体发言来指导。

【硬规则，每条回复必须满足其一，违反即失职】
A. 点破对方眼前那句话的具体套路——必须引用对方原话片段；
B. 给一句用户可以直接照着发出去的话。
安抚情绪的话最多一句，且不能单独成条。禁止"稳住""别慌""别被带节奏"这类没有落点的话单独出现。

【引导方法】${SELF_AWARENESS_LAYERS}

【聊天规则】像朋友发微信，每条不超过2句话、40字以内；一次只说一个点、只问一个问题；严禁数字列表和"首先/其次"。

【输出格式】每轮输出 JSON：{"text": "你的回复", "chips": ["胶囊1", "胶囊2"]}
chips 是递给用户的快捷选项（0~3 个，每个不超过8个字）：用户没头绪时用五层定位的选项或情绪词；用户明确在追问时给 [] 空数组。胶囊是给用户点的候选回答，不是给你自己的。` + SAFETY_GUARDRAIL
  );
  return {
    async send(message: string): Promise<AssistantTurn> {
      const parsed = await session.send(message);
      if (parsed && typeof parsed.text === 'string') {
        return { text: parsed.text, chips: Array.isArray(parsed.chips) ? parsed.chips.filter((c: any) => typeof c === 'string').slice(0, 3) : [] };
      }
      return { text: '我在，你接着说。', chips: [] };
    },
  };
};

/** 模拟对手。opponentProfile 为该事件下所有场景卡片共享的人设，用于保证同一事件内多张卡片的模拟人设一致。
 * 每轮返回 1~3 条带烈度标签的消息（JSON），高难度按 TSST"社会评价+不可控性"原则油盐不进（依据见 EVIDENCE.md 第 21 条）。 */
export const createOpponentChat = (difficulty: Difficulty, node: ConversationNode, opponentProfile?: string): OpponentSession => {
  const diffInstructions: Record<Difficulty, string> = {
    [Difficulty.GENTLE]:          '配合度较高，用户明确拒绝后会礼貌退场。每轮只发 1 条消息，烈度多为 0-1。',
    [Difficulty.REALISTIC]:       '正常拉扯，试图说服用户，偶尔加码。每轮 1 条为主，偶尔连发 2 条，烈度多为 1。',
    [Difficulty.HARD]:            '频繁使用愧疚感、道德绑架，压迫感明显。关键规则：无论用户说得多有道理，你都不为所动、不认可、不让步——像一个对用户的努力毫无反应的考官，用户越努力越感到无力。每轮可连发 1-3 条，烈度多为 2。',
    [Difficulty.WORST_REAL]:      '充满敌意、贬低和攻击，极度自私。同样油盐不进：用户的任何合理回应都不会赢得你的认可或缓和。每轮可连发 1-3 条，烈度 2-3。',
    [Difficulty.WORST_IMAGINED]:  '根据用户内心的灾难化想象进行回应。每轮 1-2 条。',
    [Difficulty.RANDOM]:          '完全不可预测：可能温和、可能突然翻脸、可能连环轰炸、可能长时间只回一个字。烈度和条数都随机。',
  };

  const session = createJsonChatSession(
    `你正在扮演用户某段真实社交冲突中的"对方"，进行沉浸式高仿真对话模拟。

【对方总体人设】${opponentProfile || '（未提供，请从下面的具体场景信息推断对方是谁、图什么、说话风格是什么样）'}
【当前具体场景】${node.description}
【对方刚说的话】"${node.opponentSaid}"
【用户当时的感受】${node.userFeeling}
【用户当时的反应】${node.userReaction}
【用户当时想做但没做的事】${node.userWantedToDo}

【人设要求，必须严格遵守】
1. 严格按照"对方总体人设"说话行事，从头到尾保持这一个身份，不能中途更换。
2. 绝不能脱离这个场景编造无关的新话题、新情节、新场所。
3. 每一句都要是"这个人"在这个场景里会说的话，可以变换说法、施压角度或情绪强度，但目的和身份不变。
4. 节奏要像真人发微信：短句、口语、可以连发几条短的，不要一大段书面语。

【当前难度】${difficulty}：${diffInstructions[difficulty]}

【输出格式】每轮输出 JSON：{"messages": [{"text": "一条消息", "intensity": 烈度数字}]}
- messages 为本轮连发的 1~3 条消息，按发送顺序排列，每条都要短（一般不超过 40 字）。
- intensity 为该条的情绪烈度：0 平和 / 1 施压 / 2 强硬贬低 / 3 攻击性爆发。如实标注，不夸大。` + SAFETY_GUARDRAIL
  );

  return {
    async send(message: string): Promise<OpponentTurn> {
      const parsed = await session.send(message);
      const msgs = Array.isArray(parsed?.messages) ? parsed.messages : [];
      const clean = msgs
        .filter((m: any) => m && typeof m.text === 'string' && m.text.trim())
        .slice(0, 3)
        .map((m: any) => ({ text: m.text, intensity: Math.min(3, Math.max(0, Number(m.intensity) || 0)) }));
      return { messages: clean.length ? clean : [{ text: '……', intensity: 0 }] };
    },
    notice: session.notice,
  };
};

export interface ExtractedCatastrophe {
  fear: string;
  probabilityAnalysis: string;
  reassurance: string;
  copingPlan: string;
}

export interface ExtractedAchievement {
  matchedDescription: string; // 命中的已有场景描述或事件标题
  summary: string;            // 用户做到了什么，一句话
}

export interface ExtractedIncident {
  eventTitle: string;
  opponentProfile: string;
  nodes: Array<Omit<ConversationNode, 'attempts' | 'strategies'>>;
  catastrophe: ExtractedCatastrophe | null;
  achievement: ExtractedAchievement | null;
}

/** 从对话历史中提取冲突节点（后台静默调用）。
 * - 话术标签只能从固定词表选，保证跨事件聚合与统计口径一致；
 * - existingNodes 用于避免同一场景换措辞重复提取；
 * - knownTargets（全部已有事件标题+场景描述）用于检测"我做到了"式成功分享，命中则返回 achievement 供前端一键标记。 */
export const extractNodesFromChat = async (
  messages: Message[],
  existingNodes: Array<{ description: string; opponentSaid: string }> = [],
  knownTargets: string[] = []
): Promise<ExtractedIncident> => {
  const text = await callDeepSeek(
    [
      {
        role: 'system',
        content: '你是一个专门提取社交冲突事件的心理学助手。根据对话内容，概括"对方"人设、提取具体冲突场景节点（话术标签必须从给定词表中选择）、留意灾难化想象与用户的现实成功分享。严格输出 JSON 格式，不要有任何其他文字。',
      },
      {
        role: 'user',
        content: `请根据以下对话记录，提取出这次倾诉中涉及的社交冲突事件。
对话内容: ${JSON.stringify(messages.map(m => ({ role: m.role, content: m.content })))}

【话术词表】每个场景节点必须从下列词表中选择 1-2 个最贴切的话术 id（tacticIds 字段），不允许自造标签：
${tacticVocabularyForPrompt()}

场景的颗粒度要细化到具体话术类型（比如"对方用虚假两难施压"是一个场景，而不是笼统的"和某人发生了冲突"）。

${existingNodes.length > 0 ? `以下场景已经提取过，正在场景卡片里了，本次绝对不要重复输出这些场景，哪怕只是换了个说法、换了个措辞——只要指向的是同一个具体时刻，就视为已提取过：
${JSON.stringify(existingNodes)}

只把对话中新出现的、上面列表没有覆盖到的具体冲突场景放进 nodes；如果这轮对话没有任何新场景，nodes 返回空数组。` : '一次倾诉可能拆出多个场景节点，它们都属于同一个事件、同一个对方。'}

另外留意用户是否表达了"万一发生 XX 就完了"这种反复预演的最坏结果（灾难化想象），如果有，按 CBT 去灾难化的结构捕捉；没有明显流露则 catastrophe 留 null。

${knownTargets.length > 0 ? `还要留意：用户是否分享了自己在现实中已经做到的应对——拒绝了、说出口了、反击了、终止了纠缠等（例："我直接发消息说不咨询了""这次我当面说不了"）。
判断它指向下面列表中的哪一项：**指向同一件事、同一个对象就算命中，不要求措辞相似**（比如用户说"我拒绝了那个卖假实习的"，列表里有"XX诈骗事件"，就算命中该事件）。
${JSON.stringify(knownTargets)}
命中则填入 achievement（matchedDescription 必须原样复制列表中的那一项，summary 用一句话概括用户做到了什么）；用户没分享成功经历、或成功与列表全部无关，achievement 留 null。` : ''}

输出格式（JSON）：
{
  "eventTitle": "整个事件的简短标题，如：小红书伪装大厂PM诈骗事件",
  "opponentProfile": "对整个事件中'对方'这个人的概括：身份、意图、说话风格、惯用套路，后续每个场景卡片模拟时都要参照这份人设",
  "nodes": [
    {
      "id": "唯一id字符串",
      "opponentSaid": "对方说的话",
      "userFeeling": "用户的感受",
      "userReaction": "用户的反应",
      "userWantedToDo": "用户想做什么",
      "description": "该具体场景的简短描述",
      "tacticIds": ["从词表选的话术id"]
    }
  ],
  "catastrophe": {
    "fear": "用户反复预演的最坏结果，用用户自己的话概括",
    "probabilityAnalysis": "客观、有依据地分析这个最坏结果实际发生的概率为什么很低",
    "reassurance": "承认恐惧仍然真实，但即便万一发生了，也不是无法面对和解决的，简短说明为什么",
    "copingPlan": "如果最坏结果真的发生，一套具体、可执行的应对步骤（Plan B），比如先做什么、再做什么、可以找谁"
  } 或 null,
  "achievement": { "matchedDescription": "原样复制命中的目标", "summary": "用户做到了什么，一句话" } 或 null
}`,
      },
    ],
    true
  );

  try {
    const parsed = JSON.parse(text);
    return { eventTitle: '', opponentProfile: '', nodes: [], catastrophe: null, achievement: null, ...parsed };
  } catch {
    return { eventTitle: '', opponentProfile: '', nodes: [], catastrophe: null, achievement: null };
  }
};

/** 灾难化想象·最坏结果模拟：功能五的第四步。让用户在安全场域里真实经历一次自己最担心的最坏结果 */
export const createCatastropheChat = (fear: string, opponentProfile: string): ChatSession =>
  createChatSession(
    `你正在帮用户模拟其内心最担心的最坏结果，这是"灾难化想象"脱敏训练的最后一步：真实地经历一次这个最坏结果，从而发现"即便发生了，也是能应对的"。

【用户最担心发生的最坏结果】${fear}
【事件中"对方"的人设，如与此相关请保持一致】${opponentProfile || '（不涉及具体对方人物，请合理设定情境）'}

要求：
1. 扮演场景里的相关角色（或用简短的旁白描述事态发展），让这个最坏结果在对话中真实地"发生"，不要回避或提前圆场。
2. 忠于用户描述的最坏结果本身，不要无中生有地加码到比用户所说更夸张的地步。
3. 语气真实自然，简短，不要说教，不要提前剧透"这没什么大不了"，让用户自己在过程中面对它、处理它。` + SAFETY_GUARDRAIL
  );

// ─── 对话式教学（D15）：替代静态"应对方向"页 ─────────────────────

/** 教学会话：以对话形式带用户分析场景（对方用了什么话术、为什么奏效、可以怎么应对），
 * 一次一点；教到差不多时自然问出"待会儿最担心出现什么局面"（预期违背对账的锚点，D16）。 */
export const createTeachingChat = (node: ConversationNode, opponentProfile?: string, priorMessages: Message[] = []): AssistantSession => {
  const tacticNotes = (node.tacticIds || [])
    .map(id => getTactic(id))
    .filter(Boolean)
    .map(t => `- ${t!.name}${t!.aka ? `（${t!.aka}）` : ''}：${t!.explanation} 识别特征：${t!.signals.join('；')} 应对原则：${t!.counters.join('；')}`)
    .join('\n');

  const session = createJsonChatSession(
    `你是用户的社交演练教练，正在带他做一次练前分析。马上他要和"对方"进行模拟对话。你的任务是通过对话教学，帮他看懂这个场景，再上场。

【练习场景】${node.description}
【对方人设】${opponentProfile || '见场景推断'}
【对方的原话】"${node.opponentSaid}"
【用户当时的感受】${node.userFeeling}
【用户当时想做但没做的事】${node.userWantedToDo}
【这个场景涉及的话术知识（你的教材，用大白话转述，不要照抄）】
${tacticNotes || '（无标签，从对方原话自行分析其手法）'}

【教学方式，必须遵守】
1. 对话式，一次只讲一个点，讲完就停、等用户回应。每条不超过 3 句话（第一条更短：不超过 50 字）。
2. 【开场硬规则】第一条消息只做一件事：指着对方那句原话里最刺人的一小处，点破它是什么手法，然后抛一个问题给用户（比如"你当时听到这句，第一反应是什么？"）。禁止在第一条里讲完整分析、罗列多个话术、给应对建议——那些留到后面几轮一点点给。
3. 严禁一次性输出完整分析、严禁数字列表、严禁"首先/其次"。检验标准：任何一条回复如果像"文章的一段"而不像"聊天里的一句话"，就是违规。
3b. 【你不是模拟对手】绝不在教学中扮演对方、替对方说话、宣布"模拟开始"——正式演练由用户点下方按钮进入，你只负责教。用户说"来试试吧"时，回一句鼓励并提醒他点"开始演练"按钮即可。
4. 全程节奏：手法是什么（第1轮）→ 为什么恰好戳中你（等用户回应后）→ 可以往哪个方向应对+一句照着说的示范（再往后）。用户的提问和补充永远优先于你的教学进度。
5. 差不多讲完时（大约 3~5 轮后），自然地问一句："待会儿和他过招，你最担心出现的是什么局面？"记住用户的回答，简短回应即可，不再展开新教学。
6. ${SELF_AWARENESS_LAYERS}

【输出格式】每轮输出 JSON：{"text": "你的回复", "chips": ["胶囊1"]}
chips 为用户的快捷回应选项（0~3 个，各不超过 8 字），如"然后呢""为什么是我""举个例子"；用户明确追问时给 []。` + SAFETY_GUARDRAIL,
    priorMessages.map(m => ({ role: m.role === 'user' ? 'user' as const : 'assistant' as const, content: m.role === 'user' ? m.content : JSON.stringify({ text: m.content, chips: [] }) }))
  );
  return {
    async send(message: string): Promise<AssistantTurn> {
      const parsed = await session.send(message);
      if (parsed && typeof parsed.text === 'string') {
        return { text: parsed.text, chips: Array.isArray(parsed.chips) ? parsed.chips.filter((c: any) => typeof c === 'string').slice(0, 3) : [] };
      }
      return { text: '我们接着看这个场景。你对他那句话最直接的感觉是什么？', chips: [] };
    },
  };
};

/** 从教学对话中提取用户"练前最担心的局面"原话。没问到或没答就返回 null */
export const extractFearedOutcome = async (teachingMessages: Message[]): Promise<string | null> => {
  if (!teachingMessages.some(m => m.role === 'user')) return null;
  const text = await callDeepSeek([
    { role: 'system', content: '你负责从教学对话中提取信息，严格输出 JSON，不要其他文字。' },
    {
      role: 'user',
      content: `下面是一段练前教学对话。教练可能问过用户"待会儿最担心出现什么局面"。请找出用户对这个问题的回答，尽量保留用户原话。
对话：${JSON.stringify(teachingMessages.map(m => ({ role: m.role, content: m.content })))}

输出 JSON：{"fearedOutcome": "用户担心的局面（尽量原话）" 或 null（用户没被问到或没有回答）}`,
    },
  ], true);
  try {
    const parsed = JSON.parse(text);
    return typeof parsed.fearedOutcome === 'string' && parsed.fearedOutcome.trim() ? parsed.fearedOutcome.trim() : null;
  } catch { return null; }
};

// ─── 练后对话式对账（D16）：教科书三问，用户表达优先 ─────────────

/** 对账会话：练完先让用户说想说的；顺着他的话把三个问题自然问完；他没说的再按顺序明确问。 */
export const createDebriefChat = (context: {
  nodeDescription: string;
  fearedOutcome?: string | null;
  transcript: Message[];
}): AssistantSession => {
  const session = createJsonChatSession(
    `你是陪用户练完一轮社交模拟的教练，现在做练后的简短复盘对话。

【练习场景】${context.nodeDescription}
【练前用户说过最担心的局面】${context.fearedOutcome || '（没有记录）'}
【刚才那轮模拟的完整对话】${JSON.stringify(context.transcript.map(m => ({ role: m.role === 'user' ? '用户' : '对方', content: m.content })))}

【你的任务】通过对话把三件事聊清楚（这三问来自暴露疗法的标准练后记录，但你要说得像朋友聊天）：
① 刚才实际发生了什么——他担心的那个局面出现了吗？
② 有什么跟他预想不一样、让他意外的地方？
③ 这一轮下来，他对这件事有什么新的看法？

【最重要的规则：用户的表达优先】
- 用户先说什么就顺着什么。他想先倒情绪就让他倒，认真接住，不急着提问。
- 他的话自然碰到某个问题，就顺势往那个问题上引；他自己都说到了，就不用再问。
- 他明显没话说或想快点结束时，才按顺序明确地问剩下的问题，一次只问一个。
- 每条回复不超过 3 句话；严禁列表和"首先/其次"；语气自然，不打官腔。
- 三个问题都聊到后，简短收尾（一两句，肯定他这一轮真实的表现，不夸张不灌鸡汤），并告诉他可以去看复盘报告了。

【输出格式】每轮输出 JSON：{"text": "你的回复", "chips": []}（此场景一般不需要胶囊，chips 恒为空数组即可）` + SAFETY_GUARDRAIL
  );
  return {
    async send(message: string): Promise<AssistantTurn> {
      const parsed = await session.send(message);
      if (parsed && typeof parsed.text === 'string') return { text: parsed.text, chips: [] };
      return { text: '嗯，我听着。', chips: [] };
    },
  };
};

/** 从对账对话中提取结构化记录（人负责说话，机器负责编码，编码过程用户不可见） */
export const extractDebrief = async (
  debriefMessages: Message[],
  fearedOutcome: string | null
): Promise<Pick<DebriefRecord, 'fearedOccurred' | 'learned'>> => {
  const fallback: Pick<DebriefRecord, 'fearedOccurred' | 'learned'> = { fearedOccurred: null, learned: null };
  if (!debriefMessages.some(m => m.role === 'user')) return fallback;
  const text = await callDeepSeek([
    { role: 'system', content: '你负责从复盘对话中提取信息，严格输出 JSON，不要其他文字。' },
    {
      role: 'user',
      content: `下面是一段练后复盘对话。${fearedOutcome ? `用户练前担心的局面是："${fearedOutcome}"。` : ''}
请只根据用户自己说的话提取（不要推断、不要脑补）：
对话：${JSON.stringify(debriefMessages.map(m => ({ role: m.role, content: m.content })))}

输出 JSON：
{
  "fearedOccurred": "no"（担心的局面没出现）| "occurred_coped"（出现了，用户表示自己应对住了）| "occurred_overwhelmed"（出现了，用户表示没扛住）| "unclear"（用户说了但看不出结论）| null（对话里没聊到这个）,
  "learned": "用户自己说的新看法/收获，尽量原话摘录" 或 null
}`,
    },
  ], true);
  try {
    const parsed = JSON.parse(text);
    const valid = ['no', 'occurred_coped', 'occurred_overwhelmed', 'unclear'];
    return {
      fearedOccurred: valid.includes(parsed.fearedOccurred) ? parsed.fearedOccurred : null,
      learned: typeof parsed.learned === 'string' && parsed.learned.trim() ? parsed.learned.trim() : null,
    };
  } catch { return fallback; }
};

/** 生成复盘报告。话术识别定位到具体某句；附事件概括复盘 */
export const generateReview = async (
  history: Message[],
  context?: { nodeDescription?: string; opponentProfile?: string; incidentTitle?: string }
): Promise<SimulationReview> => {
  const text = await callDeepSeek(
    [
      {
        role: 'system',
        content: '你是社交复盘分析师，底层视角是认知行为疗法：既看行为表现，也看认知变化。分析对话并给出反馈，严格输出 JSON 格式，不要有任何其他文字。',
      },
      {
        role: 'user',
        content: `分析以下模拟对话，输出复盘结果。对话中 "user" 是练习者，"opponent" 是模拟的对方。
${context?.incidentTitle ? `【所属事件】${context.incidentTitle}` : ''}
${context?.nodeDescription ? `【练习场景】${context.nodeDescription}` : ''}
${context?.opponentProfile ? `【对方人设】${context.opponentProfile}` : ''}

对话记录：
${JSON.stringify(history.map(m => ({ role: m.role, content: m.content })))}

【话术词表】tacticsIdentified 里的 tacticId 必须从下列词表中选择：
${tacticVocabularyForPrompt()}

【行为类目表】behaviorObservations 里的 categoryId 必须从下列类目中选择，不允许自造：
${behaviorVocabularyForPrompt()}

要求：
1. tacticsIdentified：本次对话中"对方"用了哪些话术，每个必须引用对方在本次对话中的具体原话（quote 字段，原样摘录）。
2. strengths / improvements：说清"哪里好、为什么好""哪里可以改、怎么改"，不定位到具体某句。
3. discoveries：一段有深度的感悟，既讲行为层面的变化，也讲认知层面的发现（比如用户对"对方的评价"或"冲突本身"的看法有没有松动）。
4. eventSummary：跳出本次对话，对这个事件整体做一段概括性复盘（用户在和什么样的人、什么样的套路打交道，练到现在整体走到了哪一步）。
5. behaviorObservations：逐句检查"练习者（user）"的发言，凡是命中行为类目表的，记录 { "categoryId": 类目id, "quote": 练习者原话 }。只记录确实出现的，宁缺毋滥；一句话可命中多个类目就分别记录。
6. outcome：本轮结局判定——"held"（练习者守住了边界/立场）、"conceded"（妥协让步了）、"derailed"（被对方带跑偏，没有形成有效应对）、"unclear"（对话太短或看不出来）。

输出格式（JSON）：
{
  "strengths": ["亮点1", "亮点2"],
  "improvements": ["改进点1", "改进点2"],
  "discoveries": "深度感悟（一段话）",
  "tacticsIdentified": [ { "tacticId": "词表中的id", "quote": "对方在本次对话中的原话" } ],
  "eventSummary": "事件概括复盘（一段话）",
  "behaviorObservations": [ { "categoryId": "类目表中的id", "quote": "练习者原话" } ],
  "outcome": "held" | "conceded" | "derailed" | "unclear"
}`,
      },
    ],
    true
  );

  try {
    const parsed = JSON.parse(text);
    return {
      strengths: parsed.strengths || [],
      improvements: parsed.improvements || [],
      discoveries: parsed.discoveries || '',
      tacticsIdentified: parsed.tacticsIdentified || [],
      eventSummary: parsed.eventSummary,
      behaviorObservations: Array.isArray(parsed.behaviorObservations) ? parsed.behaviorObservations : [],
      outcome: ['held', 'conceded', 'derailed', 'unclear'].includes(parsed.outcome) ? parsed.outcome : 'unclear',
    };
  } catch {
    return { strengths: [], improvements: [], discoveries: '', tacticsIdentified: [], behaviorObservations: [], outcome: 'unclear' };
  }
};
