
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Difficulty, Message, SessionArchive, SimulationAttempt, Incident, BehaviorRecord, DebriefRecord } from '../types';
import { createOpponentChat, createWarAssistantChat, createDebriefChat, extractDebrief, generateReview, OpponentSession, AssistantSession } from '../services/deepseekService';
import { recommendDifficulty } from '../progress';

interface SimulationPageProps {
  session: Partial<SessionArchive>;
  setSession: React.Dispatch<React.SetStateAction<Partial<SessionArchive>>>;
  saveAttempt: (incidentId: string, nodeId: string, attempt: SimulationAttempt) => void;
  incidents: Incident[];
}

// 阶段流转（D16）：选难度 → 进入对话（对方第一句话弹出后测"遭遇瞬间"紧张度）→ 练完对话式对账 → 复盘
type Phase = 'difficulty' | 'chat' | 'debrief';

// 遭遇瞬间紧张度（SUDs 0-10）：对方第一句话弹出后、消息仍可见时以底部弹层测量（D16）
const EncounterSudsSheet: React.FC<{ onConfirm: (value: number) => void }> = ({ onConfirm }) => {
  const [value, setValue] = useState(5);
  const color = value <= 3 ? 'text-green-500' : value <= 6 ? 'text-orange-500' : 'text-red-500';
  return (
    <div className="absolute inset-0 z-40 bg-black/30 flex items-end">
      <div className="w-full bg-white rounded-t-3xl p-6 pb-10 shadow-2xl animate-fade-in">
        <h3 className="text-base font-bold text-gray-800">看到他这句话的这一刻</h3>
        <p className="text-[11px] text-gray-400 mt-1">凭直觉拖一下：现在有多紧张？</p>
        <div className={`text-6xl font-black text-center my-6 tabular-nums ${color}`}>{value}</div>
        <input
          type="range" min={0} max={10} step={1} value={value}
          onChange={e => setValue(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-[10px] text-gray-400 mt-2">
          <span>0 完全平静</span>
          <span>5 明显紧张</span>
          <span>10 极度紧张</span>
        </div>
        <button
          onClick={() => onConfirm(value)}
          className="mt-6 w-full py-3.5 bg-blue-600 text-white font-bold rounded-2xl text-sm active:scale-95 transition-transform"
        >
          记下了，开始应对
        </button>
      </div>
    </div>
  );
};

const SimulationPage: React.FC<SimulationPageProps> = ({ session, setSession, saveAttempt, incidents }) => {
  const [phase, setPhase] = useState<Phase>('difficulty');
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  // 遭遇瞬间紧张度：对方第一句话砸出来之后测（激活态测量，D16）；undefined = 还没测
  const [sudsEncounter, setSudsEncounter] = useState<number | undefined>(undefined);
  const [showEncounterSuds, setShowEncounterSuds] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [isOpponentTyping, setIsOpponentTyping] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  // 小助手对话状态
  const [assistantMessages, setAssistantMessages] = useState<Message[]>([]);
  const [assistantInput, setAssistantInput] = useState('');
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const [assistantChips, setAssistantChips] = useState<string[]>([]); // 快捷胶囊：可点可无视（D20）

  // 练后对账对话状态（D16：用户表达优先的三问对账）
  const [debriefMessages, setDebriefMessages] = useState<Message[]>([]);
  const [debriefInput, setDebriefInput] = useState('');
  const [isDebriefTyping, setIsDebriefTyping] = useState(false);
  const debriefChatRef = useRef<AssistantSession | null>(null);
  const debriefScrollRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const assistantScrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const opponentChatRef = useRef<OpponentSession | null>(null);
  const assistantChatRef = useRef<AssistantSession | null>(null);
  // 小助手已同步到第几条战况：每次求助只把增量喂给它（D14 实时战况）
  const assistantSyncedRef = useRef(0);
  // 机械行为指标（D17）：程序直接记录，不经过 AI
  const behaviorRef = useRef<BehaviorRecord>({ replyLatenciesMs: [], replyLengths: [], helpCount: 0 });
  const lastOpponentAtRef = useRef<number>(0);

  // 优先从全局 incidents 取最新节点数据（含最新演练记录，供难度推荐），session 里的是进入时的快照
  const freshIncident = incidents.find(i => i.id === session.incidentId);
  const selectedNode = freshIncident?.nodes.find(n => n.id === session.selectedNodeId)
    || session.nodes?.find(n => n.id === session.selectedNodeId);

  // 噩梦模拟（WORST_IMAGINED）不在此列：它是事件级的"灾难化想象"独立流程，见 CatastrophePage
  const difficultyLabels: Partial<Record<Difficulty, { title: string, desc: string }>> = {
    [Difficulty.GENTLE]: { title: '温和模式', desc: '对方态度友好，接受拒绝。' },
    [Difficulty.REALISTIC]: { title: '现实模式', desc: '正常拉扯，更接近日常。' },
    [Difficulty.HARD]: { title: '困难模式', desc: '对方会施加压力和套路。' },
    [Difficulty.WORST_REAL]: { title: '极度现实', desc: '对方充满敌意和攻击性。' },
    [Difficulty.RANDOM]: { title: '随机模式', desc: '反应不可预测，最真实。' }
  };

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const handleTimeout = () => {
    stopTimer();
    const timeoutMsg = {
      id: crypto.randomUUID(),
      role: 'opponent' as const,
      content: "怎么不说话了？心虚了？",
      timestamp: Date.now(),
      intensity: 2
    };
    setMessages(prev => [...prev, timeoutMsg]);
    // 把这句界面侧的催促补进对手的记忆，否则它不知道自己"说过"这句话
    opponentChatRef.current?.notice('用户超时未回复，你追发了一句："怎么不说话了？心虚了？"');
    lastOpponentAtRef.current = Date.now();
    startTimer();
  };

  useEffect(() => () => stopTimer(), [stopTimer]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isOpponentTyping]);

  useEffect(() => {
    if (assistantScrollRef.current) assistantScrollRef.current.scrollTop = assistantScrollRef.current.scrollHeight;
  }, [assistantMessages, isAssistantTyping]);

  useEffect(() => {
    if (debriefScrollRef.current) debriefScrollRef.current.scrollTop = debriefScrollRef.current.scrollHeight;
  }, [debriefMessages, isDebriefTyping]);

  // 空 session 保护：直接输入 URL 或复盘页"再战"时 session 丢失的场景
  if (!selectedNode) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-white flex flex-col items-center justify-center p-10 text-center">
        <p className="text-sm text-gray-500">没有选中的练习场景。</p>
        <button onClick={() => navigate('/archives')} className="mt-4 text-blue-500 text-sm font-bold">去事件库选一个场景</button>
      </div>
    );
  }

  // 选完难度直接进入对话：对方第一句话"啪"地弹出，紧张度在这个心跳漏一拍的时刻测（D16）
  const startChat = (chosen: Difficulty) => {
    setDifficulty(chosen);
    opponentChatRef.current = createOpponentChat(chosen, selectedNode, session.opponentProfile);
    setMessages([{
      id: crypto.randomUUID(),
      role: 'opponent',
      content: selectedNode.opponentSaid,
      timestamp: Date.now()
    }]);
    lastOpponentAtRef.current = Date.now();
    setPhase('chat');
    // 计时器等紧张度测完再启动，测量期间不施加时间压力
    setShowEncounterSuds(true);
  };

  const confirmEncounterSuds = (value: number) => {
    setSudsEncounter(value);
    setShowEncounterSuds(false);
    lastOpponentAtRef.current = Date.now(); // 测量时间不算进首条回复用时
    setTimeLeft(60);
    startTimer();
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isEnding) return;
    stopTimer();
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: inputText, timestamp: Date.now() };
    // 机械行为指标：回复用时（对方消息弹出→按下发送）与字数
    if (lastOpponentAtRef.current) behaviorRef.current.replyLatenciesMs.push(Date.now() - lastOpponentAtRef.current);
    behaviorRef.current.replyLengths.push(userMsg.content.length);
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsOpponentTyping(true);

    try {
      const turn = await opponentChatRef.current!.send(userMsg.content);
      const now = Date.now();
      setMessages(prev => [
        ...prev,
        ...turn.messages.map((m, i) => ({
          id: crypto.randomUUID(),
          role: 'opponent' as const,
          content: m.text,
          timestamp: now + i,
          intensity: m.intensity,
        })),
      ]);
      lastOpponentAtRef.current = now;
      setTimeLeft(60);
      startTimer();
    } catch (e) { console.error(e); } finally { setIsOpponentTyping(false); }
  };

  const handleOpenAssistant = () => {
    stopTimer();
    setShowAssistant(true);
    behaviorRef.current.helpCount += 1; // 求助次数：App 情境下的安全行为指标
    if (!assistantChatRef.current) {
      assistantChatRef.current = createWarAssistantChat(selectedNode, session.opponentProfile);
      setAssistantMessages([{ id: '1', role: 'opponent', content: '卡住了？跟我说说现在的情况。', timestamp: Date.now() }]);
    }
  };

  // 求助时把"上次之后的新战况"作为增量喂给小助手，它才看得见实时战局（D14）
  const handleAssistantSend = async (text?: string) => {
    const content = (text ?? assistantInput).trim();
    if (!content) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content, timestamp: Date.now() };
    setAssistantMessages(prev => [...prev, userMsg]);
    setAssistantInput('');
    setAssistantChips([]);
    setIsAssistantTyping(true);
    try {
      const delta = messages.slice(assistantSyncedRef.current);
      assistantSyncedRef.current = messages.length;
      const prefix = delta.length
        ? `【最新战况】\n${delta.map(m => `${m.role === 'user' ? '用户' : '对方'}：${m.content}`).join('\n')}\n\n【用户对你说】`
        : '';
      const turn = await assistantChatRef.current!.send(prefix + content);
      setAssistantMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'opponent', content: turn.text, timestamp: Date.now() }]);
      setAssistantChips(turn.chips);
    } catch (e) { console.error(e); } finally { setIsAssistantTyping(false); }
  };

  // 练完 → 对账对话（用户表达优先，可跳过直接看复盘，D16/D29）
  const startDebrief = () => {
    stopTimer();
    setPhase('debrief');
    debriefChatRef.current = createDebriefChat({
      nodeDescription: selectedNode.description,
      fearedOutcome: session.fearedOutcome,
      transcript: messages,
    });
    // 开场是固定的、把话头交给用户的一句，不消耗 API
    setDebriefMessages([{
      id: crypto.randomUUID(),
      role: 'opponent',
      content: '这一轮结束了。刚才和他聊的这几个来回，你想先说点什么？',
      timestamp: Date.now(),
    }]);
  };

  const handleDebriefSend = async () => {
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

  // 收尾：复盘生成 + 对账结构化提取并行跑，存档后跳转复盘页。
  // 任一 AI 调用失败都不阻塞收尾——演练记录本身必须保住
  const finishSimulation = async () => {
    setIsEnding(true);
    const hasDebrief = debriefMessages.some(m => m.role === 'user');
    const [review, debriefExtract] = await Promise.all([
      generateReview(messages, {
        nodeDescription: selectedNode.description,
        opponentProfile: session.opponentProfile,
        incidentTitle: session.incidentTitle,
      }).catch(() => ({ strengths: [], improvements: [], discoveries: '复盘生成失败了，这一轮的对话记录已完整保存。', tacticsIdentified: [], behaviorObservations: [], outcome: 'unclear' as const })),
      (hasDebrief
        ? extractDebrief(debriefMessages, session.fearedOutcome || null)
        : Promise.resolve({ fearedOccurred: null, learned: null } as Pick<DebriefRecord, 'fearedOccurred' | 'learned'>)
      ).catch(() => ({ fearedOccurred: null, learned: null } as Pick<DebriefRecord, 'fearedOccurred' | 'learned'>)),
    ]);
    const attempt: SimulationAttempt = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      difficulty: difficulty!,
      messages: messages,
      review: review,
      sudsEncounter,
      fearedOutcome: session.fearedOutcome,
      debrief: hasDebrief ? { messages: debriefMessages, ...debriefExtract } : undefined,
      behavior: { ...behaviorRef.current },
    };
    if (session.incidentId) {
      saveAttempt(session.incidentId, selectedNode.id, attempt);
    }
    navigate('/review', { state: { attempt, incidentTitle: session.incidentTitle, incidentId: session.incidentId, node: selectedNode } });
  };

  // ── 阶段一：选难度（带恐惧阶梯推荐）──────────────────────────
  if (phase === 'difficulty') {
    const rec = recommendDifficulty(selectedNode);
    return (
      <div className="max-w-md mx-auto min-h-screen bg-white flex flex-col p-6 overflow-y-auto">
        <button onClick={() => navigate(-1)} className="text-gray-500 mb-4 p-1 self-start">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
        </button>
        <h2 className="text-2xl font-bold mb-2">选择模拟难度</h2>
        <p className="text-[11px] text-gray-400 mb-6 leading-relaxed">💡 {rec.reason}</p>
        <div className="space-y-4 flex-1 pb-8">
          {Object.entries(difficultyLabels).map(([key, info]) => {
            const isRecommended = key === rec.difficulty;
            return (
              <button
                key={key}
                onClick={() => startChat(key as Difficulty)}
                className={`w-full text-left p-5 border-2 rounded-2xl transition-all active:scale-[0.98] relative ${isRecommended ? 'border-blue-500 bg-blue-50/30' : 'border-gray-100'}`}
              >
                {isRecommended && <span className="absolute -top-3 right-4 bg-blue-500 text-white text-[10px] px-2 py-1 rounded-full font-bold shadow-sm">推荐</span>}
                <h3 className="font-bold text-gray-800">{info.title}</h3>
                <p className="text-xs text-gray-500 mt-1">{info.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── 阶段三：练后对话式对账（用户表达优先，可跳过，D16）────────
  if (phase === 'debrief') {
    return (
      <div className="max-w-md mx-auto h-screen bg-[#EDEDED] flex flex-col overflow-hidden relative">
        <header className="p-3 bg-white border-b flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center min-w-0">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs mr-2">💡</div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold truncate">聊聊刚才这一轮</h1>
              <p className="text-[10px] text-gray-400 truncate">想说什么都行，说完再看复盘</p>
            </div>
          </div>
          <button onClick={finishSimulation} disabled={isEnding} className="text-[11px] font-bold text-gray-400 px-2 whitespace-nowrap">
            {debriefMessages.some(m => m.role === 'user') ? '聊好了，看复盘 →' : '跳过，直接看复盘 →'}
          </button>
        </header>
        <div ref={debriefScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {debriefMessages.map(msg => (
            <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`p-3 rounded-2xl text-[13px] max-w-[85%] shadow-sm leading-relaxed ${msg.role === 'user' ? 'bg-blue-500 text-white rounded-tr-none' : 'bg-white text-gray-700 rounded-tl-none border border-gray-100'}`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isDebriefTyping && <div className="text-[10px] text-gray-400 italic ml-2">正在想...</div>}
        </div>
        <div className="bg-white border-t p-3 pb-8 flex items-center space-x-2">
          <input
            type="text"
            value={debriefInput}
            onChange={e => setDebriefInput(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleDebriefSend()}
            placeholder="随便说说..."
            className="flex-1 bg-gray-100 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-blue-400"
          />
          <button onClick={handleDebriefSend} className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${debriefInput.trim() ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'}`}>发送</button>
        </div>
        {isEnding && (
          <div className="absolute inset-0 z-[60] bg-white/90 backdrop-blur-md flex flex-col items-center justify-center p-10 text-center animate-fade-in">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-green-500 rounded-full animate-spin mb-4"></div>
            <h3 className="text-lg font-bold text-gray-800">正在生成深度复盘...</h3>
          </div>
        )}
      </div>
    );
  }

  // ── 阶段三：模拟对话 ────────────────────────────────────────
  return (
    <div className="max-w-md mx-auto h-screen bg-[#EDEDED] flex flex-col relative overflow-hidden">
      <header className="p-3 bg-[#EDEDED] border-b border-gray-200 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => { stopTimer(); navigate('/'); }} className="text-gray-600 p-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg></button>
        <div className="text-center">
          <h1 className="text-sm font-bold truncate">实战练习中</h1>
          <p className="text-[10px] text-gray-400">{difficultyLabels[difficulty!]?.title}</p>
        </div>
        <button onClick={startDebrief} className="text-xs font-bold text-red-500 bg-white px-2 py-1 rounded-md shadow-sm">完成</button>
      </header>
      <div className="h-1 bg-gray-200 w-full">
        <div className={`h-full transition-all duration-1000 ${timeLeft < 15 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${(timeLeft / 60) * 100}%` }}></div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 pb-10">
        {messages.map(msg => (
          <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="flex max-w-[85%] items-start space-x-2">
              {msg.role === 'opponent' && <div className="w-9 h-9 bg-gray-300 rounded-md flex-shrink-0 flex items-center justify-center text-[10px] text-white font-bold">对方</div>}
              <div className={`p-3 rounded-lg text-sm shadow-sm leading-relaxed ${msg.role === 'user' ? 'wechat-bubble-user rounded-tr-none' : 'wechat-bubble-opponent rounded-tl-none'}`}>{msg.content}</div>
              {msg.role === 'user' && <div className="w-9 h-9 bg-blue-400 rounded-md flex-shrink-0 flex items-center justify-center text-[10px] text-white font-bold">我</div>}
            </div>
          </div>
        ))}
        {isOpponentTyping && <div className="p-2 bg-white/50 rounded-lg text-[10px] italic text-gray-400 w-fit ml-11">对方正在输入...</div>}
      </div>
      <div className="bg-white border-t border-gray-200 p-3 pb-8 flex flex-col space-y-3">
        <div className="flex items-center space-x-3">
          <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onFocus={stopTimer} onBlur={() => { if(!inputText) startTimer(); }} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="打字时计时暂停..." className="flex-1 bg-gray-100 border-none rounded-md px-4 py-2 text-sm focus:ring-1 focus:ring-green-400" />
          <button onClick={handleSendMessage} className={`px-4 py-2 rounded-md font-bold text-sm transition-colors ${inputText.trim() ? 'bg-[#50C878] text-white' : 'bg-gray-100 text-gray-400'}`}>发送</button>
        </div>
        <div className="flex justify-between items-center px-1">
          <div className="flex items-center space-x-1 text-xs text-gray-400"><span className={timeLeft < 15 ? 'text-red-500 font-bold' : ''}>⏱️ {timeLeft}s</span></div>
          <button onClick={handleOpenAssistant} className="text-[11px] bg-blue-50 text-blue-500 px-4 py-1.5 rounded-full font-bold active:scale-95 transition-transform">💡 小助手教我</button>
        </div>
      </div>
      {/* 遭遇瞬间紧张度：对方第一句话可见时的底部弹层（D16） */}
      {showEncounterSuds && <EncounterSudsSheet onConfirm={confirmEncounterSuds} />}

      {showAssistant && (
        <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-end justify-center sm:items-center">
          <div className="bg-[#EDEDED] w-full max-w-md h-[75vh] sm:h-[80vh] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-fade-in">
            <header className="p-4 bg-white border-b flex justify-between items-center"><div className="flex items-center"><div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white mr-2 text-xs">💡</div><h3 className="font-bold text-gray-800">小助手</h3></div><button onClick={() => { setShowAssistant(false); startTimer(); }} className="text-gray-400 p-2 hover:bg-gray-100 rounded-full">✕</button></header>
            <div ref={assistantScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {assistantMessages.map(msg => (
                <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-3 rounded-2xl text-[13px] max-w-[80%] shadow-sm leading-relaxed ${msg.role === 'user' ? 'bg-blue-500 text-white rounded-tr-none' : 'bg-white text-gray-700 rounded-tl-none border border-gray-100'}`}>{msg.content}</div>
                </div>
              ))}
              {isAssistantTyping && <div className="text-[10px] text-gray-400 italic ml-2">正在思考...</div>}
            </div>
            {/* 快捷胶囊：可点可无视，点了等于替用户说了这句话（D20） */}
            {assistantChips.length > 0 && !isAssistantTyping && (
              <div className="px-4 pb-2 flex flex-wrap gap-2 bg-white/60">
                {assistantChips.map((chip, i) => (
                  <button
                    key={i}
                    onClick={() => handleAssistantSend(chip)}
                    className="text-xs bg-white border border-blue-200 text-blue-600 px-3 py-1.5 rounded-full active:scale-95 transition-transform shadow-sm"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
            <div className="p-4 bg-white border-t flex space-x-2 pb-10 sm:pb-4"><input type="text" value={assistantInput} onChange={(e) => setAssistantInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAssistantSend()} placeholder="跟小助手聊聊..." className="flex-1 bg-gray-100 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-blue-400" /><button onClick={() => handleAssistantSend()} className="bg-blue-500 text-white px-5 py-2 rounded-xl text-sm font-bold active:scale-95 transition-transform">发送</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationPage;
