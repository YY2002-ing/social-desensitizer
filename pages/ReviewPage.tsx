
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SimulationAttempt, Difficulty, Message, DebriefRecord } from '../types';
import { getTactic } from '../tactics';
import { getBehaviorCategory, BEHAVIOR_GROUP_LABELS } from '../behaviors';
import { createDebriefChat, extractDebrief, AssistantSession } from '../services/deepseekService';

interface ReviewPageProps {
  updateAttemptDebrief: (incidentId: string, nodeId: string, attemptId: string, debrief: DebriefRecord) => void;
}

const FEARED_OCCURRED_LABELS: Record<string, string> = {
  no: '担心的局面没有出现',
  occurred_coped: '出现了，你应对住了',
  occurred_overwhelmed: '出现了，这次没接住——多练几轮，没关系',
  unclear: '聊过了，结论先留着',
};

const ReviewPage: React.FC<ReviewPageProps> = ({ updateAttemptDebrief }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showTranscript, setShowTranscript] = useState(false);

  const state = location.state as { attempt: SimulationAttempt, incidentTitle: string, incidentId: string, node: any };
  const { attempt: initialAttempt, incidentTitle, incidentId, node } = state || {};
  // 补聊对账后本页要立刻反映结果，attempt 放进 state
  const [attempt, setAttempt] = useState<SimulationAttempt | undefined>(initialAttempt);

  // 复盘页的对账重入口（D29）：跳过了练后对话，这里随时能补聊
  const [showDebriefChat, setShowDebriefChat] = useState(false);
  const [debriefMessages, setDebriefMessages] = useState<Message[]>([]);
  const [debriefInput, setDebriefInput] = useState('');
  const [isDebriefTyping, setIsDebriefTyping] = useState(false);
  const [isSavingDebrief, setIsSavingDebrief] = useState(false);
  const debriefChatRef = useRef<AssistantSession | null>(null);
  const debriefScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debriefScrollRef.current) debriefScrollRef.current.scrollTop = debriefScrollRef.current.scrollHeight;
  }, [debriefMessages, isDebriefTyping]);

  const openDebriefChat = () => {
    if (!attempt) return;
    setShowDebriefChat(true);
    if (!debriefChatRef.current) {
      debriefChatRef.current = createDebriefChat({
        nodeDescription: node?.description || incidentTitle || '',
        fearedOutcome: attempt.fearedOutcome,
        transcript: attempt.messages,
      });
      setDebriefMessages([{
        id: crypto.randomUUID(), role: 'opponent',
        content: '回来聊聊刚才那一轮？想说什么都行。',
        timestamp: Date.now(),
      }]);
    }
  };

  const sendDebrief = async () => {
    const content = debriefInput.trim();
    if (!content || isDebriefTyping) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content, timestamp: Date.now() };
    setDebriefMessages(prev => [...prev, userMsg]);
    setDebriefInput('');
    setIsDebriefTyping(true);
    try {
      const turn = await debriefChatRef.current!.send(content);
      setDebriefMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'opponent', content: turn.text, timestamp: Date.now() }]);
    } catch (e) { console.error(e); } finally { setIsDebriefTyping(false); }
  };

  // 关闭补聊：有实质对话就提取并写回存档
  const closeDebriefChat = async () => {
    if (!attempt || !debriefMessages.some(m => m.role === 'user')) { setShowDebriefChat(false); return; }
    setIsSavingDebrief(true);
    try {
      const extract = await extractDebrief(debriefMessages, attempt.fearedOutcome || null);
      const debrief: DebriefRecord = { messages: debriefMessages, ...extract };
      setAttempt({ ...attempt, debrief });
      if (incidentId && node?.id) updateAttemptDebrief(incidentId, node.id, attempt.id, debrief);
    } catch (e) { console.error(e); } finally {
      setIsSavingDebrief(false);
      setShowDebriefChat(false);
    }
  };

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

  // 旧数据显示练前/练后对比；新数据显示遭遇瞬间值（跨次曲线在成长页）
  const hasLegacySuds = attempt.sudsBefore != null && attempt.sudsAfter != null;
  const sudsDrop = hasLegacySuds ? attempt.sudsBefore! - attempt.sudsAfter! : 0;
  const behaviorObs = review?.behaviorObservations || [];

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
        {/* 遭遇瞬间紧张度：跨次对比才是脱敏曲线，本页只展示这一轮的值 */}
        {attempt.sudsEncounter != null && (
          <section className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">遭遇瞬间的紧张度</h3>
            <div className="flex items-center justify-center space-x-3">
              <p className={`text-4xl font-black tabular-nums ${attempt.sudsEncounter <= 3 ? 'text-green-500' : attempt.sudsEncounter <= 6 ? 'text-orange-500' : 'text-red-500'}`}>{attempt.sudsEncounter}</p>
              <p className="text-[11px] text-gray-400 leading-snug">他那句话弹出来的那一刻，<br />你标记的紧张度（0-10）</p>
            </div>
            <p className="text-[11px] text-gray-500 text-center mt-3">同一个场景多练几轮，这个数字的走向就是你的脱敏曲线——在成长轨迹页可以看到。</p>
          </section>
        )}

        {/* 旧版数据的练前/练后展示（兼容历史记录） */}
        {attempt.sudsEncounter == null && hasLegacySuds && (
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
          </section>
        )}

        {/* 预期对账：练前担心的 vs 实际发生的（预期违背是脱敏起效的核心，D16/D17） */}
        {(attempt.sudsEncounter != null || attempt.fearedOutcome || attempt.debrief) && (
          <section className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">练前的担心，对一下账</h3>
            {attempt.fearedOutcome && (
              <p className="text-xs text-gray-600 leading-relaxed"><span className="font-bold text-gray-800">练前你担心：</span>“{attempt.fearedOutcome}”</p>
            )}
            {attempt.debrief?.fearedOccurred ? (
              <div className={`rounded-xl px-3 py-2 text-xs font-bold ${attempt.debrief.fearedOccurred === 'occurred_overwhelmed' ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>
                {FEARED_OCCURRED_LABELS[attempt.debrief.fearedOccurred]}
              </div>
            ) : !attempt.debrief && (
              <button onClick={openDebriefChat} className="w-full text-left bg-blue-50 rounded-xl px-3 py-2.5 text-xs font-bold text-blue-600 active:scale-[0.98] transition-transform">
                💬 还没聊过这一轮 —— 和小助手聊聊，把这笔账对上 →
              </button>
            )}
            {attempt.debrief?.learned && (
              <p className="text-xs text-gray-600 leading-relaxed"><span className="font-bold text-gray-800">你说：</span>“{attempt.debrief.learned}”</p>
            )}
          </section>
        )}

        {/* 行为观察：AI 按固定类目从对话里识别（D17，类目见 behaviors.ts） */}
        {behaviorObs.length > 0 && (
          <section className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-2.5">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">这一轮里你的表现</h3>
            {behaviorObs.map((ob, i) => {
              const cat = getBehaviorCategory(ob.categoryId);
              if (!cat) return null;
              const positive = cat.group === 'assertive';
              return (
                <div key={i} className={`rounded-xl px-3 py-2 ${positive ? 'bg-green-50' : 'bg-gray-50'}`}>
                  <p className={`text-[10px] font-bold ${positive ? 'text-green-600' : 'text-gray-500'}`}>{positive ? '✓' : '·'} {cat.name} <span className="font-normal opacity-70">（{BEHAVIOR_GROUP_LABELS[cat.group]}）</span></p>
                  <p className="text-[11px] text-gray-600 mt-0.5 italic leading-relaxed">“{ob.quote}”</p>
                </div>
              );
            })}
            <p className="text-[9px] text-gray-300 leading-relaxed">安全行为不是错，它是你保护自己的方式；练习的方向是慢慢不再需要它们。</p>
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

      {/* 对账补聊弹层（D29 重入口） */}
      {showDebriefChat && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end justify-center sm:items-center">
          <div className="bg-[#EDEDED] w-full max-w-md h-[70vh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-fade-in">
            <header className="p-4 bg-white border-b flex justify-between items-center">
              <div className="flex items-center"><div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white mr-2 text-xs">💡</div><h3 className="font-bold text-gray-800 text-sm">聊聊这一轮</h3></div>
              <button onClick={closeDebriefChat} disabled={isSavingDebrief} className="text-xs font-bold text-blue-500 px-2 py-1">
                {isSavingDebrief ? '正在记录...' : '聊好了 ✓'}
              </button>
            </header>
            <div ref={debriefScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {debriefMessages.map(msg => (
                <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-3 rounded-2xl text-[13px] max-w-[80%] shadow-sm leading-relaxed ${msg.role === 'user' ? 'bg-blue-500 text-white rounded-tr-none' : 'bg-white text-gray-700 rounded-tl-none border border-gray-100'}`}>{msg.content}</div>
                </div>
              ))}
              {isDebriefTyping && <div className="text-[10px] text-gray-400 italic ml-2">正在想...</div>}
            </div>
            <div className="p-4 bg-white border-t flex space-x-2 pb-8 sm:pb-4">
              <input type="text" value={debriefInput} onChange={e => setDebriefInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && sendDebrief()} placeholder="随便说说..." className="flex-1 bg-gray-100 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-blue-400" />
              <button onClick={sendDebrief} className="bg-blue-500 text-white px-5 py-2 rounded-xl text-sm font-bold active:scale-95 transition-transform">发送</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewPage;
