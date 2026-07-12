
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTeachingChat, extractFearedOutcome, AssistantSession } from '../services/deepseekService';
import { SessionArchive, Incident, Message } from '../types';

interface TeachingPageProps {
  session: Partial<SessionArchive>;
  setSession: React.Dispatch<React.SetStateAction<Partial<SessionArchive>>>;
  incidents: Incident[];
  saveTeachingMessages: (incidentId: string, nodeId: string, messages: Message[]) => void;
}

// 练前教学（D15）：对话式，一次一点，可跳过、可回来接着聊（D29）。
// 教学末尾教练会自然问"待会儿最担心出现什么局面"，回答被提取为预期违背对账的锚点（D16）。
const TeachingPage: React.FC<TeachingPageProps> = ({ session, setSession, incidents, saveTeachingMessages }) => {
  const navigate = useNavigate();
  const incident = incidents.find(i => i.id === session.incidentId);
  const node = incident?.nodes.find(n => n.id === session.selectedNodeId);

  const [messages, setMessages] = useState<Message[]>(node?.teachingMessages || []);
  const [inputText, setInputText] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatRef = useRef<AssistantSession | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bootedRef = useRef(false);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  // 首次进入：让教练开口讲第一个点；再次进入：带着历史续聊
  useEffect(() => {
    if (!node || bootedRef.current) return;
    bootedRef.current = true;
    chatRef.current = createTeachingChat(node, incident?.opponentProfile, node.teachingMessages || []);
    if (!node.teachingMessages || node.teachingMessages.length === 0) {
      setIsTyping(true);
      chatRef.current.send('（用户刚进入练前分析，请从对方那句原话讲起，开始第一个教学点）')
        .then(turn => {
          setMessages([{ id: crypto.randomUUID(), role: 'opponent', content: turn.text, timestamp: Date.now() }]);
          setChips(turn.chips);
        })
        .catch(e => setError(e?.message || '教练暂时连不上'))
        .finally(() => setIsTyping(false));
    }
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

  const handleSend = async (text?: string) => {
    const content = (text ?? inputText).trim();
    if (!content || isTyping) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setChips([]);
    setIsTyping(true);
    try {
      const turn = await chatRef.current!.send(content);
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'opponent', content: turn.text, timestamp: Date.now() }]);
      setChips(turn.chips);
      setError(null);
    } catch (e: any) { setError(e?.message || '发送失败'); } finally { setIsTyping(false); }
  };

  // 进入演练：保存教学记录（重入口用），后台提取"最担心的局面"挂到本次 session
  const startPractice = async (skipped: boolean) => {
    setIsLeaving(true);
    if (messages.length > 0) saveTeachingMessages(incident.id, node.id, messages);
    let fearedOutcome: string | null = null;
    if (!skipped && messages.some(m => m.role === 'user')) {
      try { fearedOutcome = await extractFearedOutcome(messages); } catch { /* 提取失败不阻塞进入演练 */ }
    }
    setSession(prev => ({ ...prev, fearedOutcome: fearedOutcome || undefined }));
    navigate('/simulate');
  };

  return (
    <div className="max-w-md mx-auto h-screen bg-[#EDEDED] flex flex-col overflow-hidden">
      <header className="p-3 bg-white border-b flex items-center sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-gray-500 mr-2 p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold truncate">练前分析</h1>
          <p className="text-[10px] text-gray-400 truncate">{node.description}</p>
        </div>
        <button onClick={() => startPractice(true)} className="text-[11px] font-bold text-gray-400 px-2 whitespace-nowrap" disabled={isLeaving}>
          跳过 →
        </button>
      </header>

      {/* 对方原话：教学的靶子，常驻顶部 */}
      <div className="bg-orange-50 border-b border-orange-100 px-4 py-2.5">
        <p className="text-[11px] text-orange-900 leading-relaxed"><span className="font-bold">当时他说：</span>“{node.opponentSaid}”</p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="flex max-w-[85%] items-start space-x-2">
              {msg.role === 'opponent' && <div className="w-8 h-8 bg-blue-500 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs">💡</div>}
              <div className={`p-3 rounded-2xl text-[13px] shadow-sm leading-relaxed ${msg.role === 'user' ? 'bg-blue-500 text-white rounded-tr-none' : 'bg-white text-gray-700 rounded-tl-none border border-gray-100'}`}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}
        {isTyping && <div className="text-[10px] text-gray-400 italic ml-10">正在想怎么讲...</div>}
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-[11px] text-red-500">
            {error}。可以直接点下方按钮开始演练。
          </div>
        )}
      </div>

      {/* 快捷胶囊：可点可无视（D20） */}
      {chips.length > 0 && !isTyping && (
        <div className="px-4 pb-1 flex flex-wrap gap-2">
          {chips.map((chip, i) => (
            <button key={i} onClick={() => handleSend(chip)} className="text-xs bg-white border border-blue-200 text-blue-600 px-3 py-1.5 rounded-full active:scale-95 transition-transform shadow-sm">
              {chip}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white border-t p-3 space-y-2 pb-6">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSend()}
            placeholder="有疑问随时说..."
            className="flex-1 bg-gray-100 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-blue-400"
          />
          <button onClick={() => handleSend()} className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${inputText.trim() ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'}`}>发送</button>
        </div>
        <button
          onClick={() => startPractice(false)}
          disabled={isLeaving}
          className="w-full py-3.5 bg-gray-900 text-white font-bold rounded-2xl text-sm active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {isLeaving ? '正在进入演练...' : '我准备好了，开始演练'}
        </button>
      </div>
    </div>
  );
};

export default TeachingPage;
