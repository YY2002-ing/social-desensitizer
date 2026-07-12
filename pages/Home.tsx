
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createGuidanceChat, extractNodesFromChat, getApiKey, saveApiKey, ExtractedIncident, ExtractedAchievement } from '../services/deepseekService';
import { Message, SessionArchive, ConversationNode, Incident, RealWorldRecord } from '../types';
import Celebration from '../components/Celebration';

interface HomeProps {
  setSession: React.Dispatch<React.SetStateAction<Partial<SessionArchive>>>;
  saveIncident: (extraction: ExtractedIncident, confessionText: string, existingIncidentId: string | null) => string;
  incidents: Incident[];
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  sessionIncidentId: string | null;
  setSessionIncidentId: React.Dispatch<React.SetStateAction<string | null>>;
  addRealWorldRecord: (incidentId: string, record: Omit<RealWorldRecord, 'id' | 'timestamp'>) => void;
}

const Home: React.FC<HomeProps> = ({ setSession, saveIncident, incidents, messages, setMessages, sessionIncidentId, setSessionIncidentId, addRealWorldRecord }) => {
  const navigate = useNavigate();
  const [apiKey, setApiKey]         = useState<string>(getApiKey);
  const [keyInput, setKeyInput]     = useState<string>('');
  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);

  const handleSaveKey = () => {
    saveApiKey(keyInput);
    setApiKey(keyInput.trim());
    setKeyInput('');
    setShowKeyInput(false);
  };

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showIncidents, setShowIncidents] = useState(false); // 控制冲突点抽屉
  // 成就自动检测：AI 在倾诉中听到"我做到了"式分享并命中已有练习目标时，浮出一键标记提示条
  const [pendingAchievement, setPendingAchievement] = useState<ExtractedAchievement | null>(null);
  const [celebration, setCelebration] = useState<{ title: string; subtitle: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);

  useEffect(() => {
    // messages 由父组件状态提升而来，挂载时用当前已有的对话记录seed会话，
    // 这样从模拟页返回后 AI 还记得之前聊到哪了，不会从头开始
    if (!chatRef.current) {
      chatRef.current = createGuidanceChat(messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // 提取竞态防护：同一时间只允许一个提取在跑，期间新触发的排队；
  // 已有卡片清单和会话事件 id 永远从 ref 读最新值，否则并发提取会看到旧清单、重复出卡
  const incidentsRef = useRef(incidents);
  const sessionIncidentIdRef = useRef(sessionIncidentId);
  useEffect(() => { incidentsRef.current = incidents; }, [incidents]);
  useEffect(() => { sessionIncidentIdRef.current = sessionIncidentId; }, [sessionIncidentId]);
  const extractBusyRef = useRef(false);
  const extractPendingRef = useRef<Message[] | null>(null);

  // 静默提取场景卡片并保存/合并进本次倾诉对应的事件；顺带检测"我做到了"式成功分享
  const extractIncidents = (history: Message[]) => {
    if (history.length < 3) return;
    if (extractBusyRef.current) { extractPendingRef.current = history; return; } // 排队，跑完再提最新的
    extractBusyRef.current = true;
    const currentSessionId = sessionIncidentIdRef.current;
    const existingIncident = incidentsRef.current.find(i => i.id === currentSessionId);
    const existingNodes = existingIncident?.nodes.map(n => ({ description: n.description, opponentSaid: n.opponentSaid })) || [];
    // 全部已有练习目标（事件标题 + 场景描述），供 AI 匹配用户分享的成功经历
    const knownTargets = incidentsRef.current.flatMap(inc => [inc.title, ...inc.nodes.map(n => n.description)]);
    extractNodesFromChat(history, existingNodes, knownTargets)
      .then(result => {
        if (result.nodes && result.nodes.length > 0) {
          const confessionText = history.filter(m => m.role === 'user').map(m => m.content).join('\n');
          const id = saveIncident(result, confessionText, currentSessionId);
          setSessionIncidentId(id);
          sessionIncidentIdRef.current = id; // 立刻同步，排队中的下一轮提取要用
        }
        if (result.achievement?.matchedDescription) {
          setPendingAchievement(result.achievement);
        }
      })
      .catch(e => console.error("Extraction failed", e))
      .finally(() => {
        extractBusyRef.current = false;
        const pending = extractPendingRef.current;
        extractPendingRef.current = null;
        if (pending) extractIncidents(pending);
      });
  };

  // 用户点击成就提示条确认：找到命中的事件/卡片，写入现实应用记录并庆祝
  const confirmAchievement = () => {
    if (!pendingAchievement) return;
    const desc = pendingAchievement.matchedDescription;
    for (const inc of incidents) {
      const node = inc.nodes.find(n => n.description === desc);
      if (node || inc.title === desc) {
        addRealWorldRecord(inc.id, { linkedNodeId: node ? node.id : null, note: pendingAchievement.summary });
        const days = Math.max(0, Math.round((Date.now() - inc.createdAt) / 86400000));
        setCelebration({
          title: '你做到了！',
          subtitle: `${pendingAchievement.summary}。从捕捉到做到，${days === 0 ? '就在今天' : `用了 ${days} 天`}。`,
        });
        break;
      }
    }
    setPendingAchievement(null);
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: inputText, timestamp: Date.now() };
    const historyWithUserMsg = [...messages, userMsg];
    setMessages(historyWithUserMsg);
    setInputText('');
    setIsTyping(true);
    try {
      const response = await chatRef.current.sendMessage({ message: inputText });
      const assistantMsg: Message = { id: crypto.randomUUID(), role: 'opponent', content: response.text || "嗯，我听着呢...", timestamp: Date.now() };
      setMessages(prev => [...prev, assistantMsg]);
      extractIncidents(historyWithUserMsg);
    } catch (e) { console.error(e); } finally { setIsTyping(false); }
  };

  const startSimulation = (incident: Incident, node: ConversationNode) => {
    setSession({
      incidentId: incident.id,
      incidentTitle: incident.title,
      opponentProfile: incident.opponentProfile,
      nodes: incident.nodes,
      selectedNodeId: node.id,
      messages: []
    });
    navigate('/strategy'); // 先学再练：先看应对方向，再选难度
  };

  // 摊平所有事件下的场景卡片（用户归档"不需要练"的除外），抽屉里全量显示、内部滚动（D19 修正）
  const allCards = incidents.flatMap(inc => inc.nodes.filter(n => !n.dismissed).map(node => ({ incident: inc, node })));
  const totalCardCount = allCards.length;

  return (
    <div className="max-w-md mx-auto h-screen bg-[#EDEDED] flex flex-col overflow-hidden relative">
      {/* API Key 设置条 */}
      <div className="bg-white border-b border-gray-100 px-4 py-2">
        {showKeyInput ? (
          <div className="flex items-center space-x-2">
            <input
              type="password"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSaveKey()}
              placeholder="粘贴你的 DeepSeek API Key (sk-...)"
              className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
            />
            <button
              onClick={handleSaveKey}
              className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg font-bold active:scale-95 transition-transform"
            >
              保存
            </button>
            <button
              onClick={() => setShowKeyInput(false)}
              className="text-xs text-gray-400 px-2"
            >
              取消
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400">
              {apiKey ? '🔑 DeepSeek Key 已设置' : '⚠️ 未设置 DeepSeek API Key，无法使用 AI 功能'}
            </span>
            <button
              onClick={() => { setKeyInput(''); setShowKeyInput(true); }}
              className={`text-[10px] font-bold ${apiKey ? 'text-gray-400' : 'text-blue-500'}`}
            >
              {apiKey ? '修改' : '去设置 →'}
            </button>
          </div>
        )}
      </div>

      {/* 头部导航 */}
      <header className="p-3 bg-[#EDEDED] border-b border-gray-200 flex items-center justify-between z-10">
        <button onClick={() => navigate('/archives')} className="text-gray-600 p-2 relative">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          {totalCardCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>}
        </button>
        <h1 className="text-base font-bold text-gray-800">社交复盘小助手</h1>
        <div className="flex items-center">
          <button onClick={() => navigate('/growth')} className="text-gray-600 p-2" title="成长轨迹">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
          </button>
          <button onClick={() => navigate('/settings')} className="text-gray-600 p-2" title="设置">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </button>
        </div>
      </header>

      {/* 聊天区 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
        {messages.map(msg => (
          <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="flex max-w-[85%] items-start space-x-2">
              {msg.role === 'opponent' && <div className="w-9 h-9 bg-blue-500 rounded-md flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold">助</div>}
              <div className={`p-3 rounded-lg text-sm shadow-sm leading-relaxed ${msg.role === 'user' ? 'wechat-bubble-user rounded-tr-none' : 'wechat-bubble-opponent rounded-tl-none'}`}>
                {msg.content}
              </div>
              {msg.role === 'user' && <div className="w-9 h-9 bg-gray-300 rounded-md flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold">我</div>}
            </div>
          </div>
        ))}
        {isTyping && <div className="text-[10px] text-gray-400 italic ml-11">正在输入...</div>}
      </div>

      {/* 底部交互区 */}
      <div className="absolute bottom-0 left-0 right-0 max-w-md mx-auto z-20">

        {/* 成就自动检测提示条：一键确认才标记，不全自动 */}
        {pendingAchievement && (
          <div className="px-4 pb-1">
            <div className="bg-green-500 text-white rounded-xl py-2.5 px-4 flex items-center justify-between shadow-lg animate-fade-in">
              <p className="text-[11px] font-bold flex-1 pr-2 leading-snug">🎉 听起来你做到了「{pendingAchievement.matchedDescription}」？</p>
              <div className="flex items-center space-x-2 flex-shrink-0">
                <button onClick={confirmAchievement} className="text-[11px] font-bold bg-white text-green-600 px-3 py-1 rounded-full active:scale-95 transition-transform">标记 ✓</button>
                <button onClick={() => setPendingAchievement(null)} className="text-[11px] text-green-100 px-1">不是</button>
              </div>
            </div>
          </div>
        )}

        {/* 灵感提示条 (方案 1) */}
        {totalCardCount > 0 && (
          <div className="px-4">
            <button
              onClick={() => setShowIncidents(!showIncidents)}
              className="w-full bg-white/80 backdrop-blur-md border border-gray-200 rounded-t-xl py-2 px-4 flex items-center justify-between shadow-sm transition-all active:bg-gray-50"
            >
              <div className="flex items-center space-x-2">
                <span className="text-blue-500 text-xs">💡</span>
                <span className="text-[11px] font-bold text-gray-600">已捕捉 {totalCardCount} 个练习场景</span>
              </div>
              <span className="text-[10px] text-gray-400 font-medium">{showIncidents ? '收起 ▲' : '查看详情 ▼'}</span>
            </button>
          </div>
        )}

        {/* 冲突场景抽屉：与上方提示条同宽同边距，全量显示、内部滚动（D19 修正） */}
        {showIncidents && totalCardCount > 0 && (
          <div className="px-4">
            <div className="bg-white border-x border-b border-gray-200 p-4 space-y-3 max-h-[55vh] overflow-y-auto shadow-[0_-4px_12px_rgba(0,0,0,0.05)] animate-fade-in">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">点击选择一个场景开始实战演练（共 {totalCardCount} 个）</p>
              {allCards.map(({ incident, node }) => (
                <div
                  key={node.id}
                  onClick={() => startSimulation(incident, node)}
                  className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex items-center justify-between active:scale-[0.98] transition-transform cursor-pointer group"
                >
                  <div className="flex-1 mr-3">
                    <p className="text-[9px] text-blue-400 font-bold truncate">{incident.title}</p>
                    <h4 className="text-xs font-bold text-gray-800 truncate">{node.description}</h4>
                    <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1 italic">“{node.opponentSaid}”</p>
                  </div>
                  <div className="bg-blue-50 text-blue-500 p-1.5 rounded-full group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7-7 7"></path></svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 微信风格输入框 */}
        <div className="bg-[#F7F7F7] border-t p-3 pb-2 flex items-center space-x-2 shadow-inner">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="跟我聊聊当时的情况..."
            className="flex-1 bg-white border border-gray-200 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-400 shadow-sm"
          />
          <button
            onClick={handleSend}
            className={`px-5 py-2.5 rounded-md font-bold text-sm transition-all ${inputText.trim() ? 'bg-[#07C160] text-white shadow-md active:scale-95' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
          >
            发送
          </button>
        </div>
        <p className="bg-[#F7F7F7] text-[9px] text-gray-300 text-center pb-6 px-8">
          本工具用于自助练习，不构成心理或医疗建议；若你正处于严重困扰，请寻求专业帮助。
        </p>
      </div>

      {celebration && (
        <Celebration title={celebration.title} subtitle={celebration.subtitle} onClose={() => setCelebration(null)} />
      )}
    </div>
  );
};

export default Home;
