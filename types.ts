
export enum Difficulty {
  GENTLE = 'gentle',
  REALISTIC = 'realistic',
  HARD = 'hard',
  WORST_REAL = 'worst_real',
  WORST_IMAGINED = 'worst_imagined', // 不出现在场景卡片的难度选择里，仅用于标记事件级"灾难化想象"模拟的记录
  RANDOM = 'random'
}

// 应对方向（练前学习页）的内容，AI 生成后缓存在场景卡片上
export interface NodeStrategy {
  tacticAnalysis: Array<{
    tacticId: string;  // 来自 tactics.ts 固定词表
    quote: string;     // 定位到对方的原话
    why: string;       // 这招为什么对你有效
  }>;
  principles: Array<{
    title: string;
    explanation: string;
    examples: string[]; // 话术示例
  }>;
}

export interface ConversationNode {
  id: string;
  opponentSaid: string;
  userFeeling: string;
  userReaction: string;
  userWantedToDo: string;
  description: string;
  tacticIds: string[]; // 对方在该场景使用的话术，取自 tactics.ts 固定词表
  attempts: SimulationAttempt[];
  strategies?: NodeStrategy | null; // （旧版字段，仅为兼容历史数据保留）静态应对方向缓存，已被对话式教学取代
  teachingMessages?: Message[]; // 教学对话记录：可跳过、可随时回来接着聊（D15/D29）
  dismissed?: boolean;       // "这张不需要练"：用户主动归档，不作任何回避推断（D28/EVIDENCE 第17条）
  dismissedNote?: string;    // 归档时用户随手说的原因
}

export interface Message {
  id: string;
  role: 'user' | 'opponent' | 'assistant';
  content: string;
  timestamp: number;
  intensity?: number; // 对手消息的情绪烈度 0-3（0平和/1施压/2强硬贬低/3攻击爆发），驱动压迫特效；用户消息无此字段
}

export interface SimulationReview {
  strengths: string[];
  improvements: string[];
  discoveries: string;
  tacticsIdentified?: Array<{ tacticId: string; quote: string }>; // 定位到具体某句话
  eventSummary?: string; // 事件概括复盘：对本次模拟所属整个事件的概括总结
  behaviorObservations?: Array<{ categoryId: string; quote: string }>; // AI 按 behaviors.ts 固定类目识别的用户行为实例
  outcome?: 'held' | 'conceded' | 'derailed' | 'unclear'; // 本轮结局：守住边界 / 妥协让步 / 被带跑偏 / 看不出来
}

// 练后对话式对账的结构化提取（对账问题照搬暴露疗法教科书记录单，见 EVIDENCE.md 第 16 条）
export interface DebriefRecord {
  messages: Message[]; // 对账对话原文
  fearedOccurred: 'no' | 'occurred_coped' | 'occurred_overwhelmed' | 'unclear' | null; // 练前担心的局面：没出现 / 出现了且应对住了 / 出现了没扛住 / 说不清
  learned: string | null; // 用户自己说的"这一轮学到/看法变化"，原话摘录
}

// 模拟内的机械行为指标（程序直接记录，不经过 AI）
export interface BehaviorRecord {
  replyLatenciesMs: number[]; // 每条回复的用时（对方消息弹出到按下发送）
  replyLengths: number[];     // 每条回复的字数
  helpCount: number;          // 点"小助手教我"的次数
}

// 单次模拟尝试
export interface SimulationAttempt {
  id: string;
  timestamp: number;
  difficulty: Difficulty;
  messages: Message[];
  review?: SimulationReview;
  sudsBefore?: number; // （旧版字段，仅为兼容历史数据保留）练前评分
  sudsAfter?: number;  // （旧版字段，仅为兼容历史数据保留）练后评分
  sudsEncounter?: number;  // 遭遇瞬间紧张度 0-10：对方第一句话弹出后测（D16），跨次对比它才是脱敏曲线
  fearedOutcome?: string;  // 练前担心出现的局面，教学对话中用户的原话（预期违背对账的锚点）
  debrief?: DebriefRecord; // 练后对话式对账
  behavior?: BehaviorRecord; // 机械行为指标
}

// 现实应用记录：用户在现实中"做到了"的一次标记
export interface RealWorldRecord {
  id: string;
  timestamp: number;
  note?: string;             // 用户随手记的一句话
  linkedNodeId: string | null; // 关联的场景卡片；null 表示"整件事做到了"
}

// 事件级"灾难化想象"：每个事件最多一个，独立于场景卡片之外
export interface CatastropheScenario {
  fear: string; // 捕捉到的、用户反复预演的最坏结果
  probabilityAnalysis: string; // AI 客观分析：该结果实际发生的概率为什么很低
  reassurance: string; // 承认"万一"：哪怕发生了，也不是无法面对和解决的
  copingPlan: string; // Plan B：如果最坏结果真的发生，具体可执行的应对计划（CBT 去灾难化的标准一环）
  attempts: SimulationAttempt[]; // 最坏结果模拟的演练记录
}

// 社交冲突事件：一次倾诉可拆解出多张场景卡片，共享同一个对方人设
export interface Incident {
  id: string;
  title: string; // 事件标题，如：卖假实习哥
  opponentProfile: string; // 对方人设：身份、意图、话术风格，贯穿该事件下所有场景卡片，保证多张卡片模拟时人设一致
  originalConfession: string; // 倾诉原文：用户首次讲述该事件的完整对话
  nodes: ConversationNode[]; // 多张场景卡片，各卡片下挂其自己的模拟记录（attempts）
  catastrophe: CatastropheScenario | null; // 事件级灾难化想象，可能没有
  realWorldRecords: RealWorldRecord[]; // 现实应用记录（"我做到了"），闭环的最后一环
  createdAt: number;
}

export interface SessionArchive extends SimulationAttempt {
  incidentId: string;
  incidentTitle: string;
  opponentProfile: string;
  nodes: ConversationNode[];
  selectedNodeId: string;
}
