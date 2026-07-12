// 行为观察固定类目：条目改写自社交焦虑安全行为研究的标准量表（SBQ/SAFE 的对话适用项）
// 与话术词表（tactics.ts）同一设计思路：AI 复盘识别行为时只能从这里选类目，不许自造。
// 证据依据见 EVIDENCE.md 第 17 条（BAT / SBQ / SAFE）。

export type BehaviorGroup = 'avoidance' | 'impression' | 'assertive';

export interface BehaviorCategory {
  id: string;
  group: BehaviorGroup;
  name: string;
  description: string;
}

export const BEHAVIOR_GROUP_LABELS: Record<BehaviorGroup, string> = {
  avoidance: '回避型安全行为',
  impression: '印象管理型安全行为',
  assertive: '自我主张',
};

export const BEHAVIOR_CATEGORIES: BehaviorCategory[] = [
  // ── 回避亚型（量表条目："说得很少""避免提问""避免谈论自己"）──
  { id: 'minimal-reply', group: 'avoidance', name: '敷衍短答', description: '回复极短、含糊带过，尽量少说话（"嗯""哦，好吧"）' },
  { id: 'topic-dodge',   group: 'avoidance', name: '绕开正面回应', description: '不接对方的话锋，转移话题或含糊其辞避开冲突点' },
  { id: 'no-stance',     group: 'avoidance', name: '隐藏自己的立场', description: '始终不表达自己的真实想法、感受或需求' },
  // ── 印象管理亚型（量表条目："努力表现得体""装作正常""反复确认自己的印象"）──
  { id: 'over-explain',   group: 'impression', name: '过度解释找补', description: '反复解释、补理由，生怕对方误会（"我不是那个意思，我只是……"）' },
  { id: 'over-apologize', group: 'impression', name: '过度道歉', description: '没做错也道歉，用道歉平息对方' },
  { id: 'appease',        group: 'impression', name: '讨好附和', description: '违心认同对方来缓和气氛（"你说得也对，不过……"）' },
  // ── 自我主张（角色扮演评估的正向行为指标）──
  { id: 'refuse',      group: 'assertive', name: '明确拒绝', description: '清楚地说不，不留模糊空间' },
  { id: 'boundary',    group: 'assertive', name: '亮明边界', description: '陈述自己的立场、需求或底线' },
  { id: 'challenge',   group: 'assertive', name: '反问质疑', description: '对对方的说法提出质疑、要求解释' },
  { id: 'name-tactic', group: 'assertive', name: '点破套路', description: '直接指出对方正在使用的手法' },
];

export const getBehaviorCategory = (id: string): BehaviorCategory | undefined =>
  BEHAVIOR_CATEGORIES.find(c => c.id === id);

/** 生成给 AI 的行为类目说明（复盘识别时用） */
export const behaviorVocabularyForPrompt = (): string =>
  BEHAVIOR_CATEGORIES
    .map(c => `- ${c.id}（${BEHAVIOR_GROUP_LABELS[c.group]}·${c.name}）：${c.description}`)
    .join('\n');
