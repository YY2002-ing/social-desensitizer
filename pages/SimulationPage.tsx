
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

// 阶段流转（D16）：选难度 → 3-2-1 入场倒数 → 对方第一句话砸出（静置片刻后测"遭遇瞬间"紧张度）→ 练完对话式对账 → 复盘
type Phase = 'difficulty' | 'countdown' | 'chat' | 'debrief';

// 倒计时时长：作者原始设计 30 秒（D19）
const TURN_SECONDS = 30;
// 停止敲字 3 秒后倒计时恢复（检测真实键入而非光标位置，D19）
const TYPING_GRACE_MS = 3000;
// 屏幕闪烁类刺激效果的开关（默认关闭+首次询问，D27-7）
const FX_FLASH_KEY = 'st_fx_flash';

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

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
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS);
  const [isOpponentTyping, setIsOpponentTyping] = useState(false);
  // 闪烁效果偏好：'on' / 'off' / null（还没问过，首次进入时询问）
  const [fxFlash, setFxFlash] = useState<string | null>(() => localStorage.getItem(FX_FLASH_KEY));
  const [showAssistant, setShowAssistant] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  // 小助手对话状态
  const [assistantMessages, setAssistantMessages] = useState<Message[]>([]);
  const [assistantInput, setAssistantInput] = useState('');
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const [assistantSuggested, setAssistantSuggested] = useState<string | null>(null); // 军师给的示范话术卡：仅供参考，字用户自己打
  const [countdownNum, setCountdownNum] = useState(3); // 3-2-1 入场倒数

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
  // 敲字暂停计时：停手 3 秒后恢复（D19）
  const typingGraceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 连续超时催促计数：最多催两次，之后对方安静等待（避免同一句话无限刷屏）
  const timeoutStreakRef = useRef(0);

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

  const TIMEOUT_PROMPTS = ["怎么不说话了？心虚了？", "？还在吗"];
  const handleTimeout = () => {
    stopTimer();
    // 最多连催两次，之后对方不再刷屏，安静等用户开口
    if (timeoutStreakRef.current >= 2) return;
    const content = TIMEOUT_PROMPTS[timeoutStreakRef.current];
    timeoutStreakRef.current += 1;
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'opponent' as const,
      content,
      timestamp: Date.now(),
      intensity: 2
    }]);
    // 把这句界面侧的催促补进对手的记忆，否则它不知道自己"说过"这句话
    opponentChatRef.current?.notice(`用户超时未回复，你追发了一句："${content}"`);
    lastOpponentAtRef.current = Date.now();
    startTimer();
  };

  useEffect(() => () => {
    stopTimer();
    if (typingGraceRef.current) clearTimeout(typingGraceRef.current); // 离开页面清掉敲字宽限计时
  }, [stopTimer]);

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

  // 选完难度：3-2-1 黑屏倒数（前置调动感官）→ 对方第一句话"啪"地砸出 → 静置约 2.5 秒
  // 让那句话先砸到人 → 紧张度弹层再浮起（D16 时序修正：先看到话，再被问紧张度）
  const startChat = (chosen: Difficulty) => {
    setDifficulty(chosen);
    opponentChatRef.current = createOpponentChat(chosen, selectedNode, session.opponentProfile);
    setPhase('countdown');
    setCountdownNum(3);
    const tick = (n: number) => {
      if (n > 0) {
        setCountdownNum(n);
        setTimeout(() => tick(n - 1), 750);
        return;
      }
      setMessages([{
        id: crypto.randomUUID(),
        role: 'opponent',
        content: selectedNode.opponentSaid,
        timestamp: Date.now(),
        intensity: 2,
      }]);
      lastOpponentAtRef.current = Date.now();
      setPhase('chat');
      // 静置片刻再弹紧张度测量；计时器等测完再启动，测量期间不施加时间压力
      setTimeout(() => setShowEncounterSuds(true), 2500);
    };
    tick(3);
  };

  const confirmEncounterSuds = (value: number) => {
    setSudsEncounter(value);
    setShowEncounterSuds(false);
    lastOpponentAtRef.current = Date.now(); // 测量时间不算进首条回复用时
    setTimeLeft(TURN_SECONDS);
    startTimer();
  };

  // 检测真实键入：每敲一个字暂停倒计时，停手 3 秒自动恢复（D19，取代旧的"光标在框内就暂停"）
  const handleInputChange = (value: string) => {
    setInputText(value);
    if (phase !== 'chat' || showEncounterSuds) return;
    stopTimer();
    if (typingGraceRef.current) clearTimeout(typingGraceRef.current);
    typingGraceRef.current = setTimeout(() => startTimer(), TYPING_GRACE_MS);
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isEnding) return;
    stopTimer();
    if (typingGraceRef.current) clearTimeout(typingGraceRef.current);
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: inputText, timestamp: Date.now() };
    // 机械行为指标：回复用时（对方消息弹出→按下发送）与字数
    if (lastOpponentAtRef.current) behaviorRef.current.replyLatenciesMs.push(Date.now() - lastOpponentAtRef.current);
    behaviorRef.current.replyLengths.push(userMsg.content.length);
    timeoutStreakRef.current = 0; // 用户开口了，催促计数清零
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsOpponentTyping(true);

    try {
      const turn = await opponentChatRef.current!.send(userMsg.content);
      // 不可预测的回复节奏（D24·NPU 范式）：随机停顿；高烈度时"正在输入"出现又消失（打了又删）
      const maxIntensity = Math.max(0, ...turn.messages.map(m => m.intensity));
      await delay(350 + Math.random() * 800);
      if (maxIntensity >= 2 && Math.random() < 0.45) {
        setIsOpponentTyping(false);
        await delay(450 + Math.random() * 650);
        setIsOpponentTyping(true);
        await delay(400 + Math.random() * 500);
      }
      // 连发消息逐条砸出，间隔不均（真人连环施压的节奏）
      for (let i = 0; i < turn.messages.length; i++) {
        const m = turn.messages[i];
        setIsOpponentTyping(false);
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'opponent' as const,
          content: m.text,
          timestamp: Date.now(),
          intensity: m.intensity,
        }]);
        if (i < turn.messages.length - 1) {
          await delay(250 + Math.random() * 400);
          setIsOpponentTyping(true);
          await delay(350 + Math.random() * 650);
        }
      }
      lastOpponentAtRef.current = Date.now();
      setTimeLeft(TURN_SECONDS);
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
  const handleAssistantSend = async () => {
    const content = assistantInput.trim();
    if (!content) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content, timestamp: Date.now() };
    setAssistantMessages(prev => [...prev, userMsg]);
    setAssistantInput('');
    setIsAssistantTyping(true);
    try {
      const delta = messages.slice(assistantSyncedRef.current);
      assistantSyncedRef.current = messages.length;
      const prefix = delta.length
        ? `【最新战况】\n${delta.map(m => `${m.role === 'user' ? '用户' : '对方'}：${m.content}`).join('\n')}\n\n【用户对你说】`
        : '';
      const turn = await assistantChatRef.current!.send(prefix + content);
      setAssistantMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'opponent', content: turn.text, timestamp: Date.now() }]);
      setAssistantSuggested(turn.suggestedReply || null);
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
        <p className="text-[11px] text-gray-400 mb-4 leading-relaxed">💡 {rec.reason}</p>

        {/* 刺激性效果知情同意：默认关闭，首次询问，设置随时可改（D27-6/7） */}
        {fxFlash === null && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-4">
            <p className="text-xs font-bold text-gray-700">要开启倒计时的紧迫效果吗？</p>
            <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">倒计时快结束时屏幕边缘会红光闪动，压迫感更强。<span className="font-bold">对闪烁敏感（如光敏性癫痫）请勿开启。</span>之后随时可以在设置里修改。</p>
            <div className="flex space-x-2 mt-3">
              <button
                onClick={() => { localStorage.setItem(FX_FLASH_KEY, 'on'); setFxFlash('on'); }}
                className="flex-1 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl active:scale-95 transition-transform"
              >开启</button>
              <button
                onClick={() => { localStorage.setItem(FX_FLASH_KEY, 'off'); setFxFlash('off'); }}
                className="flex-1 py-2 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded-xl active:scale-95 transition-transform"
              >不用了</button>
            </div>
          </div>
        )}
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

  // ── 阶段二：3-2-1 入场倒数（前置感官调动）──────────────────────
  if (phase === 'countdown') {
    return (
      <div className="max-w-md mx-auto h-screen bg-gray-950 flex items-center justify-center">
        <span key={countdownNum} className="text-8xl font-black text-white animate-fade-in tabular-nums">{countdownNum}</span>
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
      {/* 倒计时与进度条一体，放显眼处（D19 修正：不再缩在左下角） */}
      <div className="flex items-center bg-[#EDEDED] px-3 py-1 space-x-2">
        <div className="h-1.5 flex-1 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full transition-all duration-1000 ${timeLeft <= 10 && !showAssistant ? 'bg-red-500 animate-pulse' : timeLeft <= 10 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${(timeLeft / TURN_SECONDS) * 100}%` }}></div>
        </div>
        <span className={`tabular-nums font-bold flex-shrink-0 ${timeLeft <= 10 ? 'text-red-500 text-base' : 'text-gray-500 text-sm'}`}>{timeLeft}s</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 pb-10">
        {messages.map(msg => {
          // 逼近式压迫特效（D24）：烈度 2 砸出、烈度 3 砸出并震颤，均由对手的烈度标签驱动
          const fx = msg.role === 'opponent' && msg.intensity != null
            ? msg.intensity >= 3 ? 'msg-shake ring-1 ring-red-300' : msg.intensity === 2 ? 'msg-slam' : ''
            : '';
          return (
            <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="flex max-w-[85%] items-start space-x-2">
                {msg.role === 'opponent' && <div className="w-9 h-9 bg-gray-300 rounded-md flex-shrink-0 flex items-center justify-center text-[10px] text-white font-bold">对方</div>}
                <div className={`p-3 rounded-lg text-sm shadow-sm leading-relaxed ${msg.role === 'user' ? 'wechat-bubble-user rounded-tr-none' : 'wechat-bubble-opponent rounded-tl-none'} ${fx}`}>{msg.content}</div>
                {msg.role === 'user' && <div className="w-9 h-9 bg-blue-400 rounded-md flex-shrink-0 flex items-center justify-center text-[10px] text-white font-bold">我</div>}
              </div>
            </div>
          );
        })}
        {isOpponentTyping && <div className="p-2 bg-white/50 rounded-lg text-[10px] italic text-gray-400 w-fit ml-11">对方正在输入...</div>}
      </div>
      <div className="bg-white border-t border-gray-200 p-3 pb-8 flex flex-col space-y-3">
        <div className="flex items-center space-x-3">
          <input type="text" value={inputText} onChange={(e) => handleInputChange(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="打字时计时暂停..." className="flex-1 bg-gray-100 border-none rounded-md px-4 py-2 text-sm focus:ring-1 focus:ring-green-400" />
          <button onClick={handleSendMessage} className={`px-4 py-2 rounded-md font-bold text-sm transition-colors ${inputText.trim() ? 'bg-[#50C878] text-white' : 'bg-gray-100 text-gray-400'}`}>发送</button>
        </div>
        <div className="flex justify-end items-center px-1">
          <button onClick={handleOpenAssistant} className="text-[11px] bg-blue-50 text-blue-500 px-4 py-1.5 rounded-full font-bold active:scale-95 transition-transform">💡 小助手教我</button>
        </div>
      </div>

      {/* 倒计时末段的屏幕边缘泛红（知情开启才生效 D27-7；求助小助手时暂停施压，不闪） */}
      {fxFlash === 'on' && timeLeft <= 10 && !showEncounterSuds && !showAssistant && (
        <div className="absolute inset-0 pointer-events-none z-30 edge-pulse rounded-none"></div>
      )}
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
            {/* 示范话术卡：只给参考，不代打——字要用户自己说出口才算练习（D28/D30修正） */}
            {assistantSuggested && !isAssistantTyping && (
              <div className="px-4 pb-2">
                <div className="bg-blue-600 rounded-2xl p-3.5 shadow-lg animate-fade-in">
                  <p className="text-[9px] font-bold text-blue-200 uppercase tracking-widest mb-1">可以往这个方向回他</p>
                  <p className="text-[13px] text-white leading-relaxed">“{assistantSuggested}”</p>
                  <button
                    onClick={() => { setAssistantSuggested(null); setShowAssistant(false); startTimer(); }}
                    className="mt-2.5 w-full py-2 bg-white text-blue-600 text-xs font-bold rounded-xl active:scale-95 transition-transform"
                  >
                    记住了，我自己去回 →
                  </button>
                  <p className="text-[9px] text-blue-200 text-center mt-1.5">用自己的话说出来，才算练到了。</p>
                </div>
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
