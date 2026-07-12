// 脱敏进度与推荐逻辑（D17/D18，依据见 EVIDENCE.md 第 17/18 条）：
// 判定采用多信号合成——遭遇瞬间 SUDs 跨次走低 + 预期违背记录（担心的事没发生/扛住了）+ 行为指标；
// 单次练习内的紧张度下降不再作为判据（抑制学习模型：它与疗效几乎无预测关系）。
// 阈值本身是工程参数（见 EVIDENCE.md 诚实清单），不是临床对应值。

import { ConversationNode, Difficulty, Incident, SimulationAttempt } from './types';

// ── 场景卡片脱敏状态机 ─────────────────────────────────────────
// 未开始 → 脱敏中 → 已脱敏（多信号）→ 现实验证 ✓（"我做到了"）

export type NodeStatus = 'new' | 'training' | 'desensitized' | 'applied';

export const NODE_STATUS_LABELS: Record<NodeStatus, { label: string; className: string }> = {
  new:           { label: '未开始',   className: 'bg-gray-100 text-gray-500' },
  training:      { label: '脱敏中',   className: 'bg-blue-50 text-blue-500' },
  desensitized:  { label: '已脱敏',   className: 'bg-green-50 text-green-600' },
  applied:       { label: '现实验证 ✓', className: 'bg-green-500 text-white' },
};

/** 某次演练的"遭遇瞬间"紧张度：新数据用 sudsEncounter；旧数据用练前值作为近似（当年测的是"想到要面对他"） */
export const encounterSuds = (a: SimulationAttempt): number | null =>
  a.sudsEncounter ?? a.sudsBefore ?? null;

/** 该卡片按时间正序的遭遇紧张度序列（attempts 存储时新的在前） */
export const nodeEncounterSeries = (node: ConversationNode): number[] =>
  [...node.attempts].reverse().map(encounterSuds).filter((v): v is number => v != null);

/** 预期违背的成功记录数：担心的局面没出现，或出现了但应对住了 */
export const expectancySuccesses = (node: ConversationNode): number =>
  node.attempts.filter(a => a.debrief?.fearedOccurred === 'no' || a.debrief?.fearedOccurred === 'occurred_coped').length;

export function getNodeStatus(node: ConversationNode, incident: Incident): NodeStatus {
  if (incident.realWorldRecords.some(r => r.linkedNodeId === node.id)) return 'applied';
  const series = nodeEncounterSeries(node);
  if (node.attempts.length >= 3 && series.length >= 2) {
    const first = series[0];
    const latest = series[series.length - 1];
    // 信号一：遭遇瞬间紧张度跨次显著走低（最近≤3，或较首次下降≥3分）
    const sudsSignal = latest <= 3 || first - latest >= 3;
    // 信号二：至少一次预期违背的成功经验（旧数据没有对账记录，则单靠信号一）
    const hasDebriefData = node.attempts.some(a => a.debrief);
    const expectancySignal = !hasDebriefData || expectancySuccesses(node) >= 1;
    if (sudsSignal && expectancySignal) return 'desensitized';
  }
  return node.attempts.length > 0 ? 'training' : 'new';
}

// ── 难度推荐（D18：五档永远自由选，这里只产生"推荐"角标和一句理由）──
// 依据：经典协议从中等强度起步也可行；强度可变的暴露学得更牢（variability）。

const LADDER: Difficulty[] = [Difficulty.GENTLE, Difficulty.REALISTIC, Difficulty.HARD, Difficulty.WORST_REAL];

export interface DifficultyRecommendation {
  difficulty: Difficulty;
  reason: string;
}

export function recommendDifficulty(node: ConversationNode): DifficultyRecommendation {
  if (node.attempts.length === 0) {
    return { difficulty: Difficulty.REALISTIC, reason: '五档随你挑。第一次练，"现实模式"最接近真实拉扯；想先热身选温和，想直面挑战也行' };
  }
  const latest = node.attempts[0]; // 新的在前
  const latestSuds = encounterSuds(latest);
  const idx = LADDER.indexOf(latest.difficulty);
  // 上一轮遭遇紧张度不高且守住了 → 推荐升档或换随机（变化性有利于学习）
  const heldWell = (latestSuds == null || latestSuds <= 4) && latest.review?.outcome !== 'derailed';
  if (heldWell) {
    if (idx === -1 || idx >= LADDER.length - 1) {
      return { difficulty: Difficulty.RANDOM, reason: '上一轮相当稳。试试随机模式——不可预测的对手最接近真实世界，也最锻炼人' };
    }
    return { difficulty: LADDER[idx + 1], reason: '上一轮比较从容，可以往上走一档；研究发现难度有变化反而学得更牢' };
  }
  const target = idx === -1 ? Difficulty.REALISTIC : latest.difficulty;
  return { difficulty: target, reason: '上一轮紧张度还偏高，同档再来一轮也好、换一档感受不同强度也好——都由你定' };
}

// ── 成长页统计 ─────────────────────────────────────────────────

export interface GrowthStats {
  totalPractices: number;
  totalScenes: number;
  totalApplied: number;
  avgDaysToApply: number | null; // 捕捉→做到的平均天数
}

const allAttempts = (incidents: Incident[]): SimulationAttempt[] =>
  incidents.flatMap(inc => [
    ...inc.nodes.flatMap(n => n.attempts),
    ...(inc.catastrophe?.attempts ?? []),
  ]);

export function getGrowthStats(incidents: Incident[]): GrowthStats {
  const applied = incidents.flatMap(inc => inc.realWorldRecords.map(r => ({ inc, r })));
  const dayDiffs = applied.map(({ inc, r }) => Math.max(0, (r.timestamp - inc.createdAt) / 86400000));
  return {
    totalPractices: allAttempts(incidents).length,
    totalScenes: incidents.reduce((s, i) => s + i.nodes.length, 0),
    totalApplied: applied.length,
    avgDaysToApply: dayDiffs.length ? dayDiffs.reduce((a, b) => a + b, 0) / dayDiffs.length : null,
  };
}

/** 近 N 周每周演练次数（含当周，时间正序） */
export function getWeeklyPractice(incidents: Incident[], weeks = 8): { label: string; count: number }[] {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // 周一为一周起点
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(weekStart);
    start.setDate(start.getDate() - (weeks - 1 - i) * 7);
    return { start: start.getTime(), end: start.getTime() + 7 * 86400000, count: 0, label: `${start.getMonth() + 1}/${start.getDate()}` };
  });
  for (const a of allAttempts(incidents)) {
    const b = buckets.find(bk => a.timestamp >= bk.start && a.timestamp < bk.end);
    if (b) b.count++;
  }
  return buckets.map(({ label, count }) => ({ label, count }));
}

export interface Milestone {
  timestamp: number;
  type: 'incident' | 'applied';
  title: string;
  detail?: string;
}

export function getMilestones(incidents: Incident[]): Milestone[] {
  const ms: Milestone[] = [];
  for (const inc of incidents) {
    ms.push({ timestamp: inc.createdAt, type: 'incident', title: `捕捉事件「${inc.title}」` });
    for (const r of inc.realWorldRecords) {
      const node = r.linkedNodeId ? inc.nodes.find(n => n.id === r.linkedNodeId) : null;
      const days = Math.max(0, Math.round((r.timestamp - inc.createdAt) / 86400000));
      ms.push({
        timestamp: r.timestamp,
        type: 'applied',
        title: node ? `现实中击破「${node.description}」` : `做到了「${inc.title}」这件事`,
        detail: `${days === 0 ? '当天' : `用了 ${days} 天`}${r.note ? ` · ${r.note}` : ''}`,
      });
    }
  }
  return ms.sort((a, b) => b.timestamp - a.timestamp);
}

export interface TacticMastery {
  tacticId: string;
  practiceCount: number;
  nodeCount: number;
  applied: boolean; // 是否已在现实中击破过该话术
}

export function getTacticMastery(incidents: Incident[]): TacticMastery[] {
  const map = new Map<string, TacticMastery>();
  for (const inc of incidents) {
    for (const node of inc.nodes) {
      for (const tid of node.tacticIds || []) {
        const m = map.get(tid) || { tacticId: tid, practiceCount: 0, nodeCount: 0, applied: false };
        m.nodeCount++;
        m.practiceCount += node.attempts.length;
        if (inc.realWorldRecords.some(r => r.linkedNodeId === node.id)) m.applied = true;
        map.set(tid, m);
      }
    }
  }
  return [...map.values()].sort((a, b) => b.practiceCount - a.practiceCount);
}

/** 脱敏曲线：所有演练的"遭遇瞬间"紧张度按时间正序（旧数据用练前值近似） */
export function getSudsSeries(incidents: Incident[]): { value: number; timestamp: number }[] {
  return allAttempts(incidents)
    .map(a => ({ value: encounterSuds(a), timestamp: a.timestamp }))
    .filter((p): p is { value: number; timestamp: number } => p.value != null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

// ── 预期对账统计（D17 信号二）────────────────────────────────

export interface ExpectancyStats {
  total: number;        // 对过账的轮数
  notOccurred: number;  // 担心的局面没出现
  coped: number;        // 出现了但应对住了
}

export function getExpectancyStats(incidents: Incident[]): ExpectancyStats {
  const debriefs = allAttempts(incidents).map(a => a.debrief?.fearedOccurred).filter(Boolean);
  return {
    total: debriefs.length,
    notOccurred: debriefs.filter(d => d === 'no').length,
    coped: debriefs.filter(d => d === 'occurred_coped').length,
  };
}

// ── 行为进步（D17 信号三）：每轮的自我主张 vs 安全行为计数，按时间正序 ──

export interface BehaviorTrendPoint {
  timestamp: number;
  assertive: number; // 自我主张行为次数（review.behaviorObservations 中 assertive 组）
  safety: number;    // 安全行为次数（avoidance + impression 组）
  helpCount: number; // 求助次数（机械指标）
}

const ASSERTIVE_IDS = new Set(['refuse', 'boundary', 'challenge', 'name-tactic']);

export function getBehaviorTrend(incidents: Incident[]): BehaviorTrendPoint[] {
  return allAttempts(incidents)
    .filter(a => a.review?.behaviorObservations || a.behavior)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(a => {
      const obs = a.review?.behaviorObservations || [];
      return {
        timestamp: a.timestamp,
        assertive: obs.filter(o => ASSERTIVE_IDS.has(o.categoryId)).length,
        safety: obs.filter(o => !ASSERTIVE_IDS.has(o.categoryId)).length,
        helpCount: a.behavior?.helpCount ?? 0,
      };
    });
}
