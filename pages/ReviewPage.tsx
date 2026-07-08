
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SimulationAttempt, Difficulty } from '../types';
import { getTactic } from '../tactics';

const ReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showTranscript, setShowTranscript] = useState(false);

  const state = location.state as { attempt: SimulationAttempt, incidentTitle: string, incidentId: string, node: any };
  const { attempt, incidentTitle, node } = state || {};

  if (!attempt) {
    return (
      <div className="max-w-md mx-auto p-10 text-center">
        <p>未找到尝试记录。</p>
        <button onClick={() => navigate('/')} className="mt-4 text-blue-500">返回首页</button>
      </div>
    );
  }

  const review = attempt.review;

  const difficultyLabels: Record<Difficulty, string> = {
    [Difficulty.GENTLE]: '温和',
    [Difficulty.REALISTIC]: '现实',
    [Difficulty.HARD]: '困难',
    [Difficulty.WORST_REAL]: '极度现实',
    [Difficulty.WORST_IMAGINED]: '噩梦模拟',
    [Difficulty.RANDOM]: '随机'
  };

  // 兼容旧数据：v3 的 tacticsIdentified 是 string[]，v4 起是 {tacticId, quote}[]
  const tactics = (review?.tacticsIdentified || []).map((t: any) =>
    typeof t === 'string' ? { name: t, quote: null } : { name: getTactic(t.tacticId)?.name || t.tacticId, quote: t.quote }
  );

  const hasSuds = attempt.sudsBefore != null && attempt.sudsAfter != null;
  const sudsDrop = hasSuds ? attempt.sudsBefore! - attempt.sudsAfter! : 0;

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#F5F5F5] flex flex-col pb-24">
      <header className="p-6 bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold">复盘: {incidentTitle}</h1>
          <button onClick={() => navigate('/archives')} className="p-2 text-gray-400">✕</button>
        </div>
        <div className="flex space-x-2">
          <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold uppercase tracking-wider">训练已入库</span>
          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-bold uppercase tracking-wider capitalize">{difficultyLabels[attempt.difficulty]}模式</span>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {/* SUDs 变化：脱敏是否发生的硬指标 */}
        {hasSuds && (
          <section className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">紧张度变化（SUDs）</h3>
            <div className="flex items-center justify-center space-x-4">
              <div className="text-center">
                <p className="text-3xl font-black text-gray-400 tabular-nums">{attempt.sudsBefore}</p>
                <p className="text-[10px] text-gray-400 mt-1">练前</p>
              </div>
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
              <div className="text-center">
                <p className={`text-3xl font-black tabular-nums ${sudsDrop > 0 ? 'text-green-500' : 'text-orange-500'}`}>{attempt.sudsAfter}</p>
                <p className="text-[10px] text-gray-400 mt-1">练后</p>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 text-center mt-3">
              {sudsDrop > 0
                ? `紧张度下降了 ${sudsDrop} 分——这就是脱敏正在发生。`
                : sudsDrop === 0
                  ? '紧张度持平。多练几轮，习惯化需要重复。'
                  : '这轮练完更紧张了，很正常——难度可能偏高，下次可以退一档巩固。'}
            </p>
          </section>
        )}

        {/* 对话实录开关 */}
        <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100">
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="w-full p-5 flex items-center justify-between font-bold text-gray-800"
          >
            <span className="flex items-center"><svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>对话实录</span>
            <span className="text-gray-400 text-xs">{showTranscript ? '收起' : '展开回顾'}</span>
          </button>

          {showTranscript && (
            <div className="bg-[#EDEDED] p-4 space-y-4 max-h-[400px] overflow-y-auto border-t">
              {attempt.messages.map(msg => (
                <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-3 rounded-lg text-xs shadow-sm max-w-[85%] ${msg.role === 'user' ? 'wechat-bubble-user rounded-tr-none' : 'wechat-bubble-opponent rounded-tl-none'}`}>
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 对方招数：定位到具体某句 */}
        {tactics.length > 0 && (
          <section className="bg-orange-50 border border-orange-200 p-5 rounded-3xl space-y-3">
            <h3 className="text-xs font-bold text-orange-800 uppercase tracking-widest flex items-center">⚠️ 识别到的招数</h3>
            <div className="space-y-2">
              {tactics.map((t, i) => (
                <div key={i} className="bg-white border border-orange-200 rounded-xl px-3 py-2">
                  <span className="text-orange-600 text-[11px] font-bold">{t.name}</span>
                  {t.quote && <p className="text-[11px] text-gray-600 mt-1 italic leading-relaxed">“{t.quote}”</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 亮点与建议 */}
        <section className="grid grid-cols-1 gap-4">
          <div className="bg-white p-5 rounded-3xl shadow-sm space-y-3">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">表现亮点</h3>
            <div className="space-y-2">
              {review?.strengths?.map((s, i) => (
                <div key={i} className="flex items-start space-x-2 text-sm text-gray-700">
                  <span className="text-green-500 font-bold">✓</span> <p className="text-xs">{s}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-sm space-y-3">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">改进策略</h3>
            <div className="space-y-2">
              {review?.improvements?.map((imp, i) => (
                <div key={i} className="flex items-start space-x-2 text-sm text-gray-700">
                  <span className="text-orange-500 font-bold">!</span> <p className="text-xs">{imp}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 感悟 */}
        <section className="bg-blue-600 p-6 rounded-3xl shadow-lg text-white">
          <h3 className="text-[10px] font-bold opacity-80 uppercase tracking-widest mb-2">深度复盘</h3>
          <p className="text-sm font-medium leading-relaxed italic">“{review?.discoveries}”</p>
        </section>

        {/* 事件概括复盘 */}
        {review?.eventSummary && (
          <section className="bg-gray-800 p-6 rounded-3xl shadow-lg text-white">
            <h3 className="text-[10px] font-bold opacity-70 uppercase tracking-widest mb-2">事件概括复盘</h3>
            <p className="text-sm font-medium leading-relaxed">{review.eventSummary}</p>
          </section>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-white/80 backdrop-blur-md border-t flex space-x-3">
        <button onClick={() => navigate('/archives')} className="flex-1 py-4 bg-gray-100 text-gray-600 font-bold rounded-2xl text-sm">回到事件库</button>
        {node && (
          <button
            onClick={() => navigate('/simulate')}
            className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg text-sm active:scale-95 transition-transform"
          >
            换个模式再战一次
          </button>
        )}
      </div>
    </div>
  );
};

export default ReviewPage;
