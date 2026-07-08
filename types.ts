
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
  strategies?: NodeStrategy | null; // 应对方向内容缓存，首次进入生成
}

export interface Message {
  id: string;
  role: 'user' | 'opponent' | 'assistant';
  content: string;
  timestamp: number;
}

export interface SimulationReview {
  strengths: string[];
  improvements: string[];
  discoveries: string;
  tacticsIdentified?: Array<{ tacticId: string; quote: string }>; // 定位到具体某句话
  eventSummary?: string; // 事件概括复盘：对本次模拟所属整个事件的概括总结
}

// 单次模拟尝试
export interface SimulationAttempt {
  id: string;
  timestamp: number;
  difficulty: Difficulty;
  messages: Message[];
  review?: SimulationReview;
  sudsBefore?: number; // 练前主观不适评分 0-10（SUDs，暴露疗法标准工具）
  sudsAfter?: number;  // 练后主观不适评分 0-10
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
