
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateNodeStrategy } from '../services/deepseekService';
import { SessionArchive, Incident, NodeStrategy } from '../types';
import { getTactic, getCategory } from '../tactics';

interface StrategyPageProps {
  session: Partial<SessionArchive>;
  incidents: Incident[];
  saveNodeStrategy: (incidentId: string, nodeId: string, strategy: NodeStrategy) => void;
}

// 应对方向：练前学习页（4.3 流程中"选择场景 → 了解应对方向 → 选模式"的中间步骤）。
// 内容 = 对方话术定位到原话 + 为什么有效 + 三个应对原则；生成结果缓存在卡片上。
const StrategyPage: React.FC<StrategyPageProps> = ({ session, incidents, saveNodeStrategy }) => {
  const navigate = useNavigate();
  // 从全局 incidents 里取最新的节点数据（含缓存的 strategies），session 里的可能是旧快照
  const incident = incidents.find(i => i.id === session.incidentId);
  const node = incident?.nodes.find(n => n.id === session.selectedNodeId);

  const [strategy, setStrategy] = useState<NodeStrategy | null>(node?.strategies || null);
  const [loading, setLoading] = useState(!node?.strategies);
  const [error, setError] = useState<string | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!node || !incident || node.strategies || requestedRef.current) return;
    requestedRef.current = true;
    generateNodeStrategy(node, incident.opponentProfile)
      .then(result => {
        setStrategy(result);
        saveNodeStrategy(incident.id, node.id, result);
      })
      .catch(e => setError(e?.message || '生成失败'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!node || !incident) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-white flex flex-col items-center justify-center p-10 text-center">
        <p className="text-sm text-gray-500">没有选中的场景，请从场景卡片进入。</p>
        <button onClick={() => navigate('/')} className="mt-4 text-blue-500 text-sm font-bold">返回首页</button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#F5F5F5] flex flex-col">
      <header className="p-4 bg-white border-b flex items-center sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate(-1)} className="text-gray-500 mr-3 p-1">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate">应对方向</h1>
          <p className="text-[10px] text-gray-400 truncate">{node.description}</p>
        </div>
        <button
          onClick={() => navigate('/simulate')}
          className="text-[11px] font-bold text-gray-400 px-2 whitespace-nowrap"
        >
          跳过 →
        </button>
      </header>

      <main className="flex-1 p-4 space-y-4 overflow-y-auto pb-32">
        {/* 对方原话 */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">当时对方说</p>
          <p className="text-sm text-gray-800 leading-relaxed">“{node.opponentSaid}”</p>
        </div>

        {loading && (
          <div className="flex flex-col items-center py-14 text-gray-400">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
            <p className="text-xs">正在拆解对方的话术...</p>
            <button onClick={() => navigate('/simulate')} className="mt-4 text-[11px] text-blue-500 font-bold">先跳过，直接开练 →</button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-xs text-red-500">
            {error}
            <button onClick={() => navigate('/simulate')} className="block mt-2 font-bold text-blue-500">直接开练 →</button>
          </div>
        )}

        {strategy && (
          <>
            {/* 话术拆解：定位到原话 */}
            {strategy.tacticAnalysis.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">① 看穿他在用什么招</h3>
                {strategy.tacticAnalysis.map((ta, i) => {
                  const tactic = getTactic(ta.tacticId);
                  const category = tactic && getCategory(tactic.categoryId);
                  return (
                    <div key={i} className="bg-orange-50 border border-orange-100 rounded-2xl p-4 space-y-2">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {tactic?.name || ta.tacticId}{tactic?.aka ? `（${tactic.aka}）` : ''}
                        </span>
                        {category && <span className="text-[9px] text-orange-400 font-bold">{category.name} · {category.theme}</span>}
                      </div>
                      {tactic && <p className="text-[11px] text-orange-800">{tactic.explanation}</p>}
                      <p className="text-xs text-gray-700 leading-relaxed">
                        <span className="font-bold">他说：</span>“{ta.quote}”
                      </p>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        <span className="font-bold">为什么这招对你有效：</span>{ta.why}
                      </p>
                      {tactic && tactic.counters.length > 0 && (
                        <div className="bg-white/70 rounded-xl p-2.5 mt-1">
                          <p className="text-[9px] font-bold text-orange-400 uppercase tracking-widest mb-1">破解原则</p>
                          {tactic.counters.map((c, j) => (
                            <p key={j} className="text-[11px] text-gray-700 leading-relaxed">· {c}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {/* 应对原则 */}
            {strategy.principles.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">② 你可以怎么应对（从稳到刚）</h3>
                {strategy.principles.map((p, i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2">
                    <div className="flex items-center">
                      <span className="w-5 h-5 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center mr-2 flex-shrink-0">{i + 1}</span>
                      <h4 className="text-sm font-bold text-gray-800">{p.title}</h4>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">{p.explanation}</p>
                    {p.examples.map((ex, j) => (
                      <p key={j} className="text-xs text-blue-700 bg-blue-50 rounded-xl px-3 py-2 leading-relaxed">💬 “{ex}”</p>
                    ))}
                  </div>
                ))}
              </section>
            )}

            <p className="text-[10px] text-gray-400 text-center px-6 leading-relaxed">
              这些只是方向，不是标准答案。进入模拟后，用你自己的话说出来才算数。
            </p>
          </>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-white/90 backdrop-blur-md border-t">
        <button
          onClick={() => navigate('/simulate')}
          className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg text-sm active:scale-95 transition-transform"
        >
          {loading ? '不等了，直接开始演练' : '我了解了，开始演练'}
        </button>
      </div>
    </div>
  );
};

export default StrategyPage;
