import { Difficulty, Message, ConversationNode, NodeStrategy } from "../types";
import { tacticVocabularyForPrompt } from "../tactics";

// ─── API Key 存取（localStorage，绝不硬编码）───────────────────────
const KEY_STORAGE = 'social_trainer_ds_key';
export const getApiKey  = (): string => localStorage.getItem(KEY_STORAGE) || '';
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

// ─── 各功能导出 ───────────────────────────────────────────────────

/** 首页引导小助手。priorMessages 用于翻页/导航后恢复对话上下文，让 AI 记得之前聊到哪了。
 * 引导结构参照循证的倾听阶段：共情验证 → 帮情绪命名 → 归一化 → 引导觉察。 */
export const createGuidanceChat = (priorMessages: Message[] = []): ChatSession =>
  createChatSession(
    `你是一位温柔、随性的社交复盘伙伴。底层方法是心理咨询中循证的倾听结构，但你说话像朋友在微信上聊天，绝不掉书袋、绝不提任何理论名词。

倾听的四步结构（随对话自然推进，绝不一口气全做）：
1. 共情验证：先接住用户的情绪，站在他这边（"换我我也会又气又懵"）。
2. 帮情绪命名：帮他把模糊的难受说清楚（"听起来比起生气，更多是觉得被冒犯了？"）。
3. 归一化：让他知道这种反应很正常（"被这样对待，难受是再正常不过的反应"）。
4. 引导觉察：等情绪落了地，再引导他看具体发生了什么（"你回头看，他哪句话让你最不舒服？"）。

聊天规则（必须遵守）：
1. 一次只说一两句话，绝对不要超过3句；一次只问一个问题。
2. 严禁使用任何数字列表（1. 2. 3.）或点位符，严禁"首先/其次"。
3. 语气像真人，多用"哎呀""嗯嗯""好心疼"这种词。
4. 不要急着分析和给建议，先让用户把苦水倒完；用户明确想要方法时，才点出对方的套路并给方向，一次只给一个点。
5. 如果用户分享"我做到了/我这次真的说出来了"这类成功经历：先真诚地祝贺，明确肯定这是他自己练出来的成长，再好奇地问问细节和感受。` + SAFETY_GUARDRAIL,
    priorMessages.map(m => ({ role: m.role === 'user' ? 'user' as const : 'assistant' as const, content: m.content }))
  );

/** 实战中的军师小助手 */
export const createAssistantChat = (node: ConversationNode, lastOpponentMsg: string): ChatSession =>
  createChatSession(
    `你是一个正在陪用户进行社交实战练习的贴心军师。
用户现在被卡住了，对方刚刚说了："${lastOpponentMsg}"。

你的职责和聊天规则（非常重要）：
1. 像朋友一样聊天：语气要软，简短自然，不要像个AI助手。
2. 一次只说一个点：绝对不要列举建议。如果用户没头绪，先问他的感受。
3. 极简回复：每条回复控制在30字以内，不超过2句话。
4. 严禁使用列表：绝对不要出现 1. 2. 3. 或者"首先/其次"。
5. 逐步引导：
   第一步：先认可用户的情绪（比如："这话说得确实让人心里咯噔一下"）。
   第二步：帮他识破套路（如："他在用虚假二选一，其实你不需要选"），但要分话头说。
   第三步：启发他想办法，而不是直接喂饭。
6. 如果你要解释一个概念（比如情绪勒索），请用最通俗的一句话解释，不要写论文。` + SAFETY_GUARDRAIL
  );

/** 模拟对手。opponentProfile 为该事件下所有场景卡片共享的人设，用于保证同一事件内多张卡片的模拟人设一致 */
export const createOpponentChat = (difficulty: Difficulty, node: ConversationNode, opponentProfile?: string): ChatSession => {
  const diffInstructions: Record<Difficulty, string> = {
    [Difficulty.GENTLE]:          '配合度极高，用户拒绝后会礼貌退场。',
    [Difficulty.REALISTIC]:       '会有正常的拉扯，试图通过讲道理说服用户。',
    [Difficulty.HARD]:            '频繁使用愧疚感、道德绑架。言语间带有明显的压迫感。',
    [Difficulty.WORST_REAL]:      '充满敌意、人身攻击、极度自私，模拟现实中最糟糕的垃圾人。',
    [Difficulty.WORST_IMAGINED]:  '根据用户内心的灾难化想象进行回应。',
    [Difficulty.RANDOM]:          '性格完全不可预测，可能温和也可能突然翻脸。',
  };

  return createChatSession(
    `你正在扮演用户某段真实社交冲突中的"对方"，进行沉浸式高仿真对话模拟。

【对方总体人设】${opponentProfile || '（未提供，请从下面的具体场景信息推断对方是谁、图什么、说话风格是什么样）'}
【当前具体场景】${node.description}
【对方刚说的话】"${node.opponentSaid}"
【用户当时的感受】${node.userFeeling}
【用户当时的反应】${node.userReaction}
【用户当时想做但没做的事】${node.userWantedToDo}

【人设要求，必须严格遵守】
1. 严格按照上面的"对方总体人设"来说话、行事，从头到尾保持这一个身份，不能中途更换。
2. 绝不能脱离这个场景编造无关的新话题、新情节、新场所（比如场景是职场/网络诈骗，就不能突然聊起图书馆、考试之类不相关的事）。
3. 每一句回复都要是"这个人"在这个场景里会说的话，服务于推进同一个冲突，可以变换说法、施压角度或情绪强度，但目的和身份不变。

当前难度: ${difficulty}（${diffInstructions[difficulty]}）
回复要求：简短、真实、口语化，不要像机器人，不要用书面语列点。` + SAFETY_GUARDRAIL
  );
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

${knownTargets.length > 0 ? `还要留意：用户是否在分享"我做到了/我真的去做了/这次我说出来了"这类现实中的成功经历，且做到的事能对应到下面这些已有的练习目标之一：
${JSON.stringify(knownTargets)}
如果能明确对应，填入 achievement（matchedDescription 必须原样复制上面列表中的某一项）；对应不上或用户没有分享成功经历，achievement 留 null。不要勉强匹配。` : ''}

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

/** 应对方向（练前学习页）：定位对方话术到具体原话 + 拆解为什么有效 + 3 个应对原则。结果缓存在卡片上 */
export const generateNodeStrategy = async (node: ConversationNode, opponentProfile: string): Promise<NodeStrategy> => {
  const text = await callDeepSeek(
    [
      {
        role: 'system',
        content: '你是社交应对策略专家，擅长把心理学的操纵识别知识讲成大白话。严格输出 JSON 格式，不要有任何其他文字。',
      },
      {
        role: 'user',
        content: `用户遇到了这样一个社交场景，请生成练习前的"应对方向"讲解。

【对方人设】${opponentProfile || '未知'}
【场景】${node.description}
【对方的原话】"${node.opponentSaid}"
【用户当时的感受】${node.userFeeling}
【用户当时想做但没做的事】${node.userWantedToDo}

【话术词表】tacticId 必须从下列词表中选择：
${tacticVocabularyForPrompt()}

要求：
1. tacticAnalysis：识别对方用了哪些话术（1-3个），每个话术引用对方的具体原话（quote 尽量用上面给出的原话或其中片段），并用一两句大白话讲清"这招为什么恰好对用户有效"。
2. principles：给 3 个应对原则，从"最保守（保护自己）"到"最主动（正面反击）"排列，每个配 1-2 句可以直接照着说的话术示例。示例要口语化、符合这个具体场景，不要空泛。

输出格式（JSON）：
{
  "tacticAnalysis": [
    { "tacticId": "词表中的id", "quote": "对方原话", "why": "这招为什么对用户有效" }
  ],
  "principles": [
    { "title": "原则名（短）", "explanation": "一两句解释", "examples": ["话术示例1", "话术示例2"] }
  ]
}`,
      },
    ],
    true
  );

  try {
    const parsed = JSON.parse(text);
    return { tacticAnalysis: parsed.tacticAnalysis || [], principles: parsed.principles || [] };
  } catch {
    return { tacticAnalysis: [], principles: [] };
  }
};

/** 生成复盘报告。话术识别定位到具体某句；附事件概括复盘 */
export const generateReview = async (
  history: Message[],
  context?: { nodeDescription?: string; opponentProfile?: string; incidentTitle?: string }
): Promise<any> => {
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

要求：
1. tacticsIdentified：本次对话中"对方"用了哪些话术，每个必须引用对方在本次对话中的具体原话（quote 字段，原样摘录）。
2. strengths / improvements：说清"哪里好、为什么好""哪里可以改、怎么改"，不定位到具体某句。
3. discoveries：一段有深度的感悟，既讲行为层面的变化，也讲认知层面的发现（比如用户对"对方的评价"或"冲突本身"的看法有没有松动）。
4. eventSummary：跳出本次对话，对这个事件整体做一段概括性复盘（用户在和什么样的人、什么样的套路打交道，练到现在整体走到了哪一步）。

输出格式（JSON）：
{
  "strengths": ["亮点1", "亮点2"],
  "improvements": ["改进点1", "改进点2"],
  "discoveries": "深度感悟（一段话）",
  "tacticsIdentified": [ { "tacticId": "词表中的id", "quote": "对方在本次对话中的原话" } ],
  "eventSummary": "事件概括复盘（一段话）"
}`,
      },
    ],
    true
  );

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};
