// 脱敏进度与推荐逻辑：基于暴露疗法的分级暴露（graded exposure）与习惯化（habituation）原则。
// SUDs（主观不适单位，0-10）练前练后各测一次，下降曲线是"脱敏正在发生"的核心指标。

import { ConversationNode, Difficulty, Incident, SimulationAttempt } from './types';

// ── 场景卡片脱敏状态机 ─────────────────────────────────────────
// 未开始 → 脱敏中 → 已脱敏（练≥3次且 SUDs 降幅≥40%）→ 现实验证 ✓（"我做到了"）

export type NodeStatus = 'new' | 'training' | 'desensitized' | 'applied';

export const NODE_STATUS_LABELS: Record<NodeStatus, { label: string; className: string }> = {
  new:           { label: '未开始',   className: 'bg-gray-100 text-gray-500' },
  training:      { label: '脱敏中',   className: 'bg-blue-50 text-blue-500' },
  desensitized:  { label: '已脱敏',   className: 'bg-green-50 text-green-600' },
  applied:       { label: '现实验证 ✓', className: 'bg-green-500 text-white' },
};

const sudsAttempts = (node: ConversationNode): SimulationAttempt[] =>
  // attempts 存储时新的在前，按时间正序排回来
  [...node.attempts].reverse().filter(a => a.sudsBefore != null && a.sudsAfter != null);

export function getNodeStatus(node: ConversationNode, incident: Incident): NodeStatus {
  if (incident.realWorldRecords.some(r => r.linkedNodeId === node.id)) return 'applied';
  const rated = sudsAttempts(node);
  if (node.attempts.length >= 3 && rated.length >= 2) {
    const baseline = rated[0].sudsBefore!;
    const latest = rated[rated.length - 1].sudsAfter!;
    if (baseline === 0 || (baseline - latest) / baseline >= 0.4) return 'desensitized';
  }
  return node.attempts.length > 0 ? 'training' : 'new';
}

// ── 难度阶梯推荐（只推荐，不强制锁）───────────────────────────
// 从温和开始逐级向上；某一档"通过"（练后 SUDs ≤ 4）才推荐下一档；爬完阶梯推荐随机模式。

const LADDER: Difficulty[] = [Difficulty.GENTLE, Difficulty.REALISTIC, Difficulty.HARD, Difficulty.WORST_REAL];

export interface DifficultyRecommendation {
  difficulty: Difficulty;
  reason: string;
}

export function recommendDifficulty(node: ConversationNode): DifficultyRecommendation {
  if (node.attempts.length === 0) {
    return { difficulty: Difficulty.GENTLE, reason: '第一次练这个场景，脱敏训练建议从最温和的一档开始，逐级向上' };
  }
  let highestCleared = -1;
  LADDER.forEach((d, idx) => {
    const cleared = node.attempts.some(a => a.difficulty === d && a.sudsAfter != null && a.sudsAfter <= 4);
    if (cleared) highestCleared = Math.max(highestCleared, idx);
  });
  if (highestCleared === -1) {
    const tried = LADDER.findIndex(d => node.attempts.some(a => a.difficulty === d));
    const target = tried === -1 ? Difficulty.GENTLE : LADDER[tried];
    return { difficulty: target, reason: '这一档练完紧张度还偏高，建议同一档位再巩固一次' };
  }
  if (highestCleared >= LADDER.length - 1) {
    return { difficulty: Difficulty.RANDOM, reason: '四档难度都已经拿下，试试反应不可预测的随机模式吧' };
  }
  return { difficulty: LADDER[highestCleared + 1], reason: '上一档已经比较从容了，按恐惧阶梯可以往上爬一级' };
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

/** SUDs 曲线：所有带评分的演练按时间正序，练前/练后两条线 */
export function getSudsSeries(incidents: Incident[]): { before: number; after: number; timestamp: number }[] {
  return allAttempts(incidents)
    .filter(a => a.sudsBefore != null && a.sudsAfter != null)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(a => ({ before: a.sudsBefore!, after: a.sudsAfter!, timestamp: a.timestamp }));
}
