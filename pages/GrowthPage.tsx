
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Incident } from '../types';
import { getTactic } from '../tactics';
import { getGrowthStats, getWeeklyPractice, getMilestones, getTacticMastery, getSudsSeries } from '../progress';

interface GrowthPageProps {
  incidents: Incident[];
}

// SUDs 下降曲线：练前/练后两条折线，纯 SVG。这是"脱敏正在发生"最直接的证据。
const SudsChart: React.FC<{ series: { before: number; after: number }[] }> = ({ series }) => {
  const W = 320, H = 150, PAD = 24;
  const n = series.length;
  const x = (i: number) => n === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (n - 1);
  const y = (v: number) => H - PAD - (v / 10) * (H - PAD * 2);
  const line = (get: (s: { before: number; after: number }) => number) =>
    series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(get(s)).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0, 5, 10].map(v => (
        <g key={v}>
          <line x1={PAD} x2={W - PAD} y1={y(v)} y2={y(v)} stroke="#E5E7EB" strokeWidth="1" strokeDasharray="3 3" />
          <text x={PAD - 6} y={y(v) + 3} fontSize="8" fill="#9CA3AF" textAnchor="end">{v}</text>
        </g>
      ))}
      <path d={line(s => s.before)} fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" />
      <path d={line(s => s.after)} fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" />
      {series.map((s, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(s.before)} r="3" fill="#9CA3AF" />
          <circle cx={x(i)} cy={y(s.after)} r="3.5" fill="#22C55E" />
        </g>
      ))}
      <g fontSize="8">
        <circle cx={W - 108} cy={12} r="3" fill="#9CA3AF" /><text x={W - 102} y={15} fill="#6B7280">练前紧张度</text>
        <circle cx={W - 52} cy={12} r="3" fill="#22C55E" /><text x={W - 46} y={15} fill="#6B7280">练后</text>
      </g>
    </svg>
  );
};

const GrowthPage: React.FC<GrowthPageProps> = ({ incidents }) => {
  const navigate = useNavigate();
  const stats = getGrowthStats(incidents);
  const weekly = getWeeklyPractice(incidents);
  const milestones = getMilestones(incidents);
  const mastery = getTacticMastery(incidents);
  const suds = getSudsSeries(incidents);
  const maxWeekly = Math.max(1, ...weekly.map(w => w.count));

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#F5F5F5] flex flex-col">
      <header className="p-4 bg-white border-b flex items-center sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate(-1)} className="text-gray-500 mr-4 p-1">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
        </button>
        <h1 className="text-lg font-bold">成长轨迹</h1>
      </header>

      <main className="flex-1 p-4 space-y-4 overflow-y-auto pb-16">
        {/* 核心数据 */}
        <section className="grid grid-cols-2 gap-3">
          {[
            { label: '累计演练', value: `${stats.totalPractices}`, unit: '次' },
            { label: '捕捉场景', value: `${stats.totalScenes}`, unit: '个' },
            { label: '现实中做到', value: `${stats.totalApplied}`, unit: '次', highlight: true },
            { label: '捕捉→做到平均', value: stats.avgDaysToApply == null ? '—' : `${Math.round(stats.avgDaysToApply)}`, unit: stats.avgDaysToApply == null ? '' : '天' },
          ].map((s, i) => (
            <div key={i} className={`rounded-3xl p-4 shadow-sm border ${s.highlight ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-gray-100'}`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${s.highlight ? 'text-green-100' : 'text-gray-400'}`}>{s.label}</p>
              <p className="text-2xl font-black mt-1 tabular-nums">{s.value}<span className="text-xs font-bold ml-1">{s.unit}</span></p>
            </div>
          ))}
        </section>

        {/* SUDs 曲线 */}
        <section className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">脱敏曲线（SUDs 紧张度）</h3>
          {suds.length >= 2 ? (
            <>
              <SudsChart series={suds} />
              <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">每次模拟练前、练后各测一次紧张度（0-10）。绿线整体走低，说明同样的场景正在变得不那么可怕——这就是脱敏。</p>
            </>
          ) : (
            <p className="text-xs text-gray-400 py-8 text-center">完成 2 次带紧张度评分的模拟后，这里会画出你的脱敏曲线</p>
          )}
        </section>

        {/* 每周活跃度 */}
        <section className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">近八周练习</h3>
          <div className="flex items-end justify-between h-24 space-x-1.5">
            {weekly.map((w, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                {w.count > 0 && <span className="text-[9px] text-gray-500 font-bold mb-0.5">{w.count}</span>}
                <div
                  className={`w-full rounded-t-md ${w.count > 0 ? 'bg-blue-400' : 'bg-gray-100'}`}
                  style={{ height: `${Math.max(4, (w.count / maxWeekly) * 70)}%` }}
                ></div>
                <span className="text-[8px] text-gray-400 mt-1">{w.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 话术掌握度 */}
        <section className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">话术掌握度</h3>
          {mastery.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">捕捉到带话术标签的场景后，这里会显示每类套路的掌握进度</p>
          ) : (
            <div className="space-y-2.5">
              {mastery.map(m => {
                const tactic = getTactic(m.tacticId);
                if (!tactic) return null;
                return (
                  <div key={m.tacticId} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 pr-3">
                      <p className="text-xs font-bold text-gray-700">{tactic.name}</p>
                      <p className="text-[9px] text-gray-400 truncate">{tactic.explanation}</p>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <span className="text-[10px] text-gray-400">{m.practiceCount} 次演练</span>
                      {m.applied
                        ? <span className="text-[9px] bg-green-500 text-white px-2 py-0.5 rounded-full font-bold">现实击破 ✓</span>
                        : m.practiceCount > 0
                          ? <span className="text-[9px] bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full font-bold">练习中</span>
                          : <span className="text-[9px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-bold">待练习</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 里程碑时间线 */}
        <section className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">里程碑</h3>
          {milestones.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">还没有记录，去和小助手聊聊吧</p>
          ) : (
            <div className="relative pl-5 space-y-5">
              <div className="absolute left-[5px] top-1 bottom-1 w-0.5 bg-gray-100"></div>
              {milestones.map((m, i) => (
                <div key={i} className="relative">
                  <span className={`absolute -left-5 top-0.5 w-3 h-3 rounded-full border-2 border-white ${m.type === 'applied' ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                  <p className={`text-xs leading-snug ${m.type === 'applied' ? 'font-bold text-gray-800' : 'text-gray-600'}`}>
                    {m.type === 'applied' ? '🎉 ' : ''}{m.title}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(m.timestamp).toLocaleDateString()}
                    {m.detail && <span> · {m.detail}</span>}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="text-[9px] text-gray-300 text-center px-8 leading-relaxed">
          本工具用于自助练习，不构成心理或医疗建议。若你正处于严重困扰，请寻求专业帮助。
        </p>
      </main>
    </div>
  );
};

export default GrowthPage;
