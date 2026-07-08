
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Difficulty, Message, SessionArchive, SimulationAttempt, Incident } from '../types';
import { createOpponentChat, createAssistantChat, generateReview } from '../services/deepseekService';
import { recommendDifficulty } from '../progress';

interface SimulationPageProps {
  session: Partial<SessionArchive>;
  setSession: React.Dispatch<React.SetStateAction<Partial<SessionArchive>>>;
  saveAttempt: (incidentId: string, nodeId: string, attempt: SimulationAttempt) => void;
  incidents: Incident[];
}

type Phase = 'difficulty' | 'suds-before' | 'chat' | 'suds-after';

// SUDs（主观不适单位，0-10）滑条：暴露疗法的标准测量，练前练后各测一次
const SudsSlider: React.FC<{
  title: string;
  subtitle: string;
  confirmLabel: string;
  onConfirm: (value: number) => void;
}> = ({ title, subtitle, confirmLabel, onConfirm }) => {
  const [value, setValue] = useState(5);
  const color = value <= 3 ? 'text-green-500' : value <= 6 ? 'text-orange-500' : 'text-red-500';
  return (
    <div className="max-w-md mx-auto min-h-screen bg-white flex flex-col justify-center p-8">
      <h2 className="text-xl font-bold text-gray-800">{title}</h2>
      <p className="text-xs text-gray-400 mt-2 leading-relaxed">{subtitle}</p>
      <div className={`text-7xl font-black text-center my-10 tabular-nums ${color}`}>{value}</div>
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
        className="mt-12 w-full py-4 bg-blue-600 text-white font-bold rounded-2xl text-sm active:scale-95 transition-transform"
      >
        {confirmLabel}
      </button>
    </div>
  );
};

const SimulationPage: React.FC<SimulationPageProps> = ({ session, setSession, saveAttempt, incidents }) => {
  const [phase, setPhase] = useState<Phase>('difficulty');
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [sudsBefore, setSudsBefore] = useState<number | undefined>(undefined);
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

  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const assistantScrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const opponentChatRef = useRef<any>(null);
  const assistantChatRef = useRef<any>(null);

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
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, timeoutMsg]);
    startTimer();
  };

  useEffect(() => () => stopTimer(), [stopTimer]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isOpponentTyping]);

  useEffect(() => {
    if (assistantScrollRef.current) assistantScrollRef.current.scrollTop = assistantScrollRef.current.scrollHeight;
  }, [assistantMessages, isAssistantTyping]);

  // 空 session 保护：直接输入 URL 或复盘页"再战"时 session 丢失的场景
  if (!selectedNode) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-white flex flex-col items-center justify-center p-10 text-center">
        <p className="text-sm text-gray-500">没有选中的练习场景。</p>
        <button onClick={() => navigate('/archives')} className="mt-4 text-blue-500 text-sm font-bold">去事件库选一个场景</button>
      </div>
    );
  }

  const startChat = (suds: number) => {
    setSudsBefore(suds);
    opponentChatRef.current = createOpponentChat(difficulty!, selectedNode, session.opponentProfile);
    setMessages([{
      id: crypto.randomUUID(),
      role: 'opponent',
      content: selectedNode.opponentSaid,
      timestamp: Date.now()
    }]);
    setPhase('chat');
    setTimeLeft(60);
    startTimer();
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isEnding) return;
    stopTimer();
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: inputText, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsOpponentTyping(true);

    try {
      const response = await opponentChatRef.current.sendMessage({ message: userMsg.content });
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'opponent',
        content: response.text || "嗯？",
        timestamp: Date.now()
      }]);
      setTimeLeft(60);
      startTimer();
    } catch (e) { console.error(e); } finally { setIsOpponentTyping(false); }
  };

  const handleOpenAssistant = () => {
    stopTimer();
    setShowAssistant(true);
    const lastOpponentMsg = messages.filter(m => m.role === 'opponent').pop();
    if (!assistantChatRef.current) {
      assistantChatRef.current = createAssistantChat(selectedNode, lastOpponentMsg?.content || "");
      setAssistantMessages([{ id: '1', role: 'opponent', content: '被卡住了吗？他这话听着确实不太舒服。', timestamp: Date.now() }]);
    }
  };

  const handleAssistantSend = async () => {
    if (!assistantInput.trim()) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: assistantInput, timestamp: Date.now() };
    setAssistantMessages(prev => [...prev, userMsg]);
    setAssistantInput('');
    setIsAssistantTyping(true);
    try {
      const response = await assistantChatRef.current.sendMessage({ message: userMsg.content });
      setAssistantMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'opponent', content: response.text || "我理解。", timestamp: Date.now() }]);
    } catch (e) { console.error(e); } finally { setIsAssistantTyping(false); }
  };

  const finishSimulation = async (sudsAfter: number) => {
    setIsEnding(true);
    const review = await generateReview(messages, {
      nodeDescription: selectedNode.description,
      opponentProfile: session.opponentProfile,
      incidentTitle: session.incidentTitle,
    });
    const attempt: SimulationAttempt = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      difficulty: difficulty!,
      messages: messages,
      review: review,
      sudsBefore,
      sudsAfter,
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
                onClick={() => { setDifficulty(key as Difficulty); setPhase('suds-before'); }}
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

  // ── 阶段二：练前 SUDs ──────────────────────────────────────
  if (phase === 'suds-before') {
    return (
      <SudsSlider
        title="现在，想到要面对他"
        subtitle="凭直觉拖一下：此刻你有多紧张？练前练后各测一次，这条曲线会告诉你脱敏正在发生。"
        confirmLabel="记下了，进入模拟"
        onConfirm={startChat}
      />
    );
  }

  // ── 阶段四：练后 SUDs ──────────────────────────────────────
  if (phase === 'suds-after') {
    return (
      <div className="relative">
        <SudsSlider
          title="刚刚聊完这一轮"
          subtitle="再凭直觉拖一下：现在回想和他的对话，你还有多紧张？"
          confirmLabel="完成，生成深度复盘"
          onConfirm={finishSimulation}
        />
        {isEnding && (
          <div className="fixed inset-0 z-[60] bg-white/90 backdrop-blur-md flex flex-col items-center justify-center p-10 text-center animate-fade-in">
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
        <button onClick={() => { stopTimer(); setPhase('suds-after'); }} className="text-xs font-bold text-red-500 bg-white px-2 py-1 rounded-md shadow-sm">完成</button>
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
            <div className="p-4 bg-white border-t flex space-x-2 pb-10 sm:pb-4"><input type="text" value={assistantInput} onChange={(e) => setAssistantInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAssistantSend()} placeholder="跟小助手聊聊..." className="flex-1 bg-gray-100 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-blue-400" /><button onClick={handleAssistantSend} className="bg-blue-500 text-white px-5 py-2 rounded-xl text-sm font-bold active:scale-95 transition-transform">发送</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationPage;
