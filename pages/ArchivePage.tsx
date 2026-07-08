
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Incident, ConversationNode, Difficulty, SimulationAttempt, RealWorldRecord } from '../types';
import { TACTICS, getTactic, getCategory } from '../tactics';
import { getNodeStatus, NODE_STATUS_LABELS } from '../progress';
import Celebration from '../components/Celebration';

interface ArchivePageProps {
  incidents: Incident[];
  setSession: any;
  addRealWorldRecord: (incidentId: string, record: Omit<RealWorldRecord, 'id' | 'timestamp'>) => void;
}

type ViewMode = 'byEvent' | 'byTactic';

const difficultyLabels: Record<Difficulty, string> = {
  [Difficulty.GENTLE]: '温和',
  [Difficulty.REALISTIC]: '现实',
  [Difficulty.HARD]: '困难',
  [Difficulty.WORST_REAL]: '极度现实',
  [Difficulty.WORST_IMAGINED]: '噩梦模拟',
  [Difficulty.RANDOM]: '随机'
};

const ArchivePage: React.FC<ArchivePageProps> = ({ incidents, setSession, addRealWorldRecord }) => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('byEvent');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [showConfession, setShowConfession] = useState<string | null>(null);
  // "我做到了"标记流程
  const [markingIncident, setMarkingIncident] = useState<Incident | null>(null);
  const [markTarget, setMarkTarget] = useState<string | null | 'whole'>(null); // 'whole' | nodeId
  const [markNote, setMarkNote] = useState('');
  const [celebration, setCelebration] = useState<{ title: string; subtitle: string } | null>(null);

  const goPractice = (inc: Incident, node: ConversationNode) => {
    setSession({
      incidentId: inc.id,
      incidentTitle: inc.title,
      opponentProfile: inc.opponentProfile,
      nodes: inc.nodes,
      selectedNodeId: node.id,
      messages: []
    });
    navigate('/strategy'); // 先学再练：先看应对方向，再选难度
  };

  const handleViewAttempt = (inc: Incident, node: ConversationNode, att: SimulationAttempt) => {
    // 同步设置 session，让复盘页的"换个模式再战一次"有数据可用
    setSession({
      incidentId: inc.id,
      incidentTitle: inc.title,
      opponentProfile: inc.opponentProfile,
      nodes: inc.nodes,
      selectedNodeId: node.id,
      messages: []
    });
    navigate('/review', {
      state: { attempt: att, incidentTitle: inc.title, incidentId: inc.id, node }
    });
  };

  const confirmMark = () => {
    if (!markingIncident || markTarget === null) return;
    const linkedNodeId = markTarget === 'whole' ? null : markTarget;
    addRealWorldRecord(markingIncident.id, { linkedNodeId, note: markNote.trim() || undefined });
    const days = Math.max(0, Math.round((Date.now() - markingIncident.createdAt) / 86400000));
    const targetDesc = markTarget === 'whole'
      ? `「${markingIncident.title}」这件事，你在现实中做到了`
      : `「${markingIncident.nodes.find(n => n.id === markTarget)?.description}」，你在现实中做到了`;
    setCelebration({
      title: '你做到了！',
      subtitle: `${targetDesc}。从捕捉到做到，${days === 0 ? '就在今天' : `用了 ${days} 天`}。`,
    });
    setMarkingIncident(null);
    setMarkTarget(null);
    setMarkNote('');
  };

  // ── 按话术视图的数据：跨事件聚合 ──────────────────────────────
  const tacticGroups = TACTICS
    .map(tactic => ({
      tactic,
      items: incidents.flatMap(inc =>
        inc.nodes.filter(n => (n.tacticIds || []).includes(tactic.id)).map(node => ({ inc, node }))
      ),
    }))
    .filter(g => g.items.length > 0);

  const renderNodeCard = (inc: Incident, node: ConversationNode, showEventTitle = false) => {
    const status = getNodeStatus(node, inc);
    const badge = NODE_STATUS_LABELS[status];
    const isExpanded = expandedCardId === node.id;
    return (
      <div key={node.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div
          onClick={() => setExpandedCardId(isExpanded ? null : node.id)}
          className="p-3 cursor-pointer flex items-center justify-between"
        >
          <div className="flex-1 pr-2 min-w-0">
            {showEventTitle && <p className="text-[9px] text-blue-400 font-bold truncate">{inc.title}</p>}
            <h4 className="text-xs font-bold text-gray-700">{node.description}</h4>
            <p className="text-[10px] text-gray-400 mt-0.5 italic line-clamp-1">“{node.opponentSaid}”</p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {(node.tacticIds || []).map(tid => {
                const t = getTactic(tid);
                return t ? <span key={tid} className="text-[9px] bg-orange-50 text-orange-500 px-1.5 py-0.5 rounded font-bold">{t.name}</span> : null;
              })}
            </div>
          </div>
          <div className="flex flex-col items-end space-y-1 flex-shrink-0">
            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${badge.className}`}>{badge.label}</span>
            <span className="text-[10px] text-gray-400 whitespace-nowrap">{node.attempts.length} 次演练</span>
          </div>
        </div>

        {isExpanded && (
          <div className="bg-gray-50 border-t border-gray-100 p-3 space-y-2 animate-fade-in">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">练习历史</span>
              <button
                onClick={() => goPractice(inc, node)}
                className="text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full active:scale-95 transition-transform"
              >
                + 开启新模拟
              </button>
            </div>

            {node.attempts.length === 0 ? (
              <p className="text-[10px] text-gray-400 py-2 italic">尚未对此场景进行模拟练习</p>
            ) : (
              node.attempts.map(att => (
                <div
                  key={att.id}
                  onClick={() => handleViewAttempt(inc, node, att)}
                  className="bg-white p-3 rounded-xl border border-gray-200 flex items-center justify-between hover:border-blue-300 transition-colors cursor-pointer group"
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-700">{difficultyLabels[att.difficulty]}模式</span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(att.timestamp).toLocaleString([], {month: 'numeric', day: 'numeric', hour: '2-digit', minute:'2-digit'})}
                      {att.sudsBefore != null && att.sudsAfter != null && (
                        <span className={`ml-2 font-bold ${att.sudsAfter < att.sudsBefore ? 'text-green-500' : 'text-gray-400'}`}>
                          紧张度 {att.sudsBefore}→{att.sudsAfter}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-bold mr-1">查看复盘</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#F5F5F5] flex flex-col">
      <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="p-4 flex items-center">
          <button onClick={() => navigate('/')} className="text-gray-500 mr-4 p-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
          </button>
          <h1 className="text-lg font-bold flex-1">社交事件库</h1>
          <button onClick={() => navigate('/growth')} className="text-[11px] font-bold text-blue-500 bg-blue-50 px-3 py-1.5 rounded-full">📈 成长轨迹</button>
        </div>
        {/* 双视图切换 */}
        <div className="px-4 pb-3 flex space-x-2">
          <button
            onClick={() => setViewMode('byEvent')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${viewMode === 'byEvent' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}
          >
            按事件
          </button>
          <button
            onClick={() => setViewMode('byTactic')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${viewMode === 'byTactic' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}
          >
            按话术
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 space-y-4 overflow-y-auto pb-20">
        {incidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400 text-center px-10">
             <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
             </div>
             <p className="text-sm font-medium">还没有捕获到冲突事件</p>
             <p className="text-xs mt-2">快去主页和小助手聊聊你最近遇到的不快吧</p>
             <button onClick={() => navigate('/')} className="mt-6 px-6 py-2 bg-blue-500 text-white rounded-full text-xs font-bold">立即开启复盘</button>
          </div>
        ) : viewMode === 'byTactic' ? (
          /* ── 按话术视图：跨事件聚合，专攻某一类套路 ── */
          tacticGroups.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-20">场景卡片还没有话术标签（旧数据），新捕捉的场景会自动归类</p>
          ) : (
            tacticGroups.map(({ tactic, items }) => {
              const category = getCategory(tactic.categoryId);
              return (
                <div key={tactic.id} className="space-y-2">
                  <div className="px-1 pt-2">
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold text-gray-800">{tactic.name}</h3>
                      {tactic.aka && <span className="text-[9px] text-gray-400">{tactic.aka}</span>}
                      {category && <span className="text-[9px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded font-bold">{category.name}</span>}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{tactic.explanation}</p>
                  </div>
                  {items.map(({ inc, node }) => renderNodeCard(inc, node, true))}
                </div>
              );
            })
          )
        ) : (
          /* ── 按事件视图 ── */
          incidents.map(inc => {
            const totalAttempts = inc.nodes.reduce((sum, n) => sum + n.attempts.length, 0);
            const appliedCount = inc.nodes.filter(n => inc.realWorldRecords.some(r => r.linkedNodeId === n.id)).length;
            const wholeApplied = inc.realWorldRecords.some(r => r.linkedNodeId === null);
            return (
              <div key={inc.id} className={`bg-white rounded-3xl shadow-sm border overflow-hidden transition-all duration-300 ${wholeApplied ? 'border-green-300' : 'border-gray-100'}`}>
                {/* 事件头部 */}
                <div
                  onClick={() => setExpandedEventId(expandedEventId === inc.id ? null : inc.id)}
                  className="p-5 cursor-pointer flex justify-between items-start"
                >
                  <div className="flex-1 pr-4">
                    <div className="flex items-center flex-wrap gap-2">
                      <h3 className="font-bold text-gray-800 text-base leading-tight">{inc.title}</h3>
                      {wholeApplied && <span className="text-[9px] bg-green-500 text-white px-2 py-0.5 rounded-full font-bold">已完成 ✓</span>}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">
                      创建于 {new Date(inc.createdAt).toLocaleDateString()}
                      {appliedCount > 0 && <span className="text-green-500 font-bold ml-2">{appliedCount}/{inc.nodes.length} 场景已在现实中应用</span>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full font-bold mb-1 whitespace-nowrap">
                      {inc.nodes.length} 个场景 · {totalAttempts} 次演练
                    </span>
                    <svg className={`w-4 h-4 text-gray-300 transition-transform ${expandedEventId === inc.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>

                {/* 展开内容 */}
                {expandedEventId === inc.id && (
                  <div className="bg-gray-50 border-t border-gray-100 p-4 space-y-3 animate-fade-in">
                    {/* 我做到了 */}
                    <button
                      onClick={() => { setMarkingIncident(inc); setMarkTarget(null); setMarkNote(''); }}
                      className="w-full py-3 bg-green-500 text-white rounded-2xl text-xs font-bold active:scale-[0.98] transition-transform shadow-sm"
                    >
                      ✓ 我做到了 —— 在现实中应用了练过的东西
                    </button>

                    {inc.opponentProfile && (
                      <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
                        <p className="text-[9px] font-bold text-orange-400 uppercase tracking-widest mb-1">对方人设</p>
                        <p className="text-[11px] text-orange-800 leading-relaxed">{inc.opponentProfile}</p>
                      </div>
                    )}

                    {/* 倾诉原文（折叠） */}
                    {inc.originalConfession && (
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <button
                          onClick={() => setShowConfession(showConfession === inc.id ? null : inc.id)}
                          className="w-full p-3 flex items-center justify-between"
                        >
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">📝 倾诉原文</span>
                          <span className="text-[10px] text-gray-400">{showConfession === inc.id ? '收起' : '展开'}</span>
                        </button>
                        {showConfession === inc.id && (
                          <p className="px-3 pb-3 text-[11px] text-gray-600 leading-relaxed whitespace-pre-wrap border-t border-gray-100 pt-2">
                            {inc.originalConfession}
                          </p>
                        )}
                      </div>
                    )}

                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">场景卡片</span>
                    <div className="space-y-2">
                      {inc.nodes.map(node => renderNodeCard(inc, node))}
                    </div>

                    {inc.catastrophe && (
                      <>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">灾难化想象</span>
                        <div
                          onClick={() => navigate('/catastrophe', { state: { incidentId: inc.id } })}
                          className="bg-gray-900 text-white rounded-xl p-3 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform"
                        >
                          <div className="flex-1 pr-2">
                            <h4 className="text-xs font-bold">最坏结果模拟</h4>
                            <p className="text-[10px] text-gray-300 mt-0.5 line-clamp-1">{inc.catastrophe.fear}</p>
                          </div>
                          <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full font-bold whitespace-nowrap">
                            {inc.catastrophe.attempts.length} 次演练
                          </span>
                        </div>
                      </>
                    )}

                    {/* 现实应用记录 */}
                    {inc.realWorldRecords.length > 0 && (
                      <>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">现实应用记录</span>
                        <div className="space-y-2">
                          {inc.realWorldRecords.map(r => {
                            const node = r.linkedNodeId ? inc.nodes.find(n => n.id === r.linkedNodeId) : null;
                            return (
                              <div key={r.id} className="bg-green-50 border border-green-100 rounded-xl p-3">
                                <p className="text-[11px] font-bold text-green-700">
                                  ✓ {node ? node.description : '整件事做到了'}
                                </p>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                  {new Date(r.timestamp).toLocaleDateString()}
                                  {r.note && <span className="text-gray-600"> · {r.note}</span>}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>

      {/* "我做到了"标记弹层 */}
      {markingIncident && (
        <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px] flex items-end justify-center sm:items-center" onClick={() => setMarkingIncident(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 space-y-4 animate-fade-in max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800">🎉 你做到了什么？</h3>
            <p className="text-[11px] text-gray-400 leading-relaxed">选择你在现实中做到的事——是整件事本身，还是某个练过的应对（比如现实中再遇到同类话术，这次识别并击破了）。</p>

            <button
              onClick={() => setMarkTarget('whole')}
              className={`w-full text-left p-4 rounded-2xl border-2 transition-colors ${markTarget === 'whole' ? 'border-green-500 bg-green-50' : 'border-gray-100'}`}
            >
              <p className="text-xs font-bold text-gray-800">整件事我做到了</p>
              <p className="text-[10px] text-gray-400 mt-0.5">「{markingIncident.title}」——现实中我真的去面对/解决了这件事</p>
            </button>

            {markingIncident.nodes.map(node => (
              <button
                key={node.id}
                onClick={() => setMarkTarget(node.id)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-colors ${markTarget === node.id ? 'border-green-500 bg-green-50' : 'border-gray-100'}`}
              >
                <p className="text-xs font-bold text-gray-800">{node.description}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">这类应对我在现实中用上了</p>
              </button>
            ))}

            <textarea
              value={markNote}
              onChange={e => setMarkNote(e.target.value)}
              placeholder="（可选）随手记一句：当时发生了什么，你是怎么做的？"
              className="w-full text-xs border border-gray-200 rounded-2xl p-3 h-20 focus:outline-none focus:ring-1 focus:ring-green-400 resize-none"
            />

            <div className="flex space-x-3">
              <button onClick={() => setMarkingIncident(null)} className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-2xl text-xs font-bold">取消</button>
              <button
                onClick={confirmMark}
                disabled={markTarget === null}
                className={`flex-1 py-3 rounded-2xl text-xs font-bold transition-colors ${markTarget !== null ? 'bg-green-500 text-white active:scale-95' : 'bg-gray-100 text-gray-300'}`}
              >
                确认标记
              </button>
            </div>
          </div>
        </div>
      )}

      {celebration && (
        <Celebration title={celebration.title} subtitle={celebration.subtitle} onClose={() => setCelebration(null)} />
      )}
    </div>
  );
};

export default ArchivePage;
