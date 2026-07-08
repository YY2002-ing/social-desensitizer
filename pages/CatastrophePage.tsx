
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Incident, Message, SimulationAttempt, Difficulty } from '../types';
import { createCatastropheChat, generateReview } from '../services/deepseekService';

interface CatastrophePageProps {
  incidents: Incident[];
  saveCatastropheAttempt: (incidentId: string, attempt: SimulationAttempt) => void;
}

// 灾难化想象·功能五：捕捉 → 客观降概率 → 承认"万一" → 最坏结果模拟
const CatastrophePage: React.FC<CatastrophePageProps> = ({ incidents, saveCatastropheAttempt }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { incidentId } = (location.state as { incidentId: string }) || {};
  const incident = incidents.find(i => i.id === incidentId);

  const [stage, setStage] = useState<'intro' | 'simulating'>('intro');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isOpponentTyping, setIsOpponentTyping] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isOpponentTyping]);

  if (!incident || !incident.catastrophe) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-white flex flex-col items-center justify-center p-10 text-center">
        <p className="text-sm text-gray-500">没有找到该事件的灾难化想象记录。</p>
        <button onClick={() => navigate('/archives')} className="mt-4 text-blue-500 text-sm font-bold">返回事件库</button>
      </div>
    );
  }

  const { fear, probabilityAnalysis, reassurance, copingPlan } = incident.catastrophe;

  const startSimulation = () => {
    chatRef.current = createCatastropheChat(fear, incident.opponentProfile);
    setMessages([{
      id: crypto.randomUUID(),
      role: 'opponent',
      content: fear,
      timestamp: Date.now()
    }]);
    setStage('simulating');
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isEnding) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: inputText, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsOpponentTyping(true);
    try {
      const response = await chatRef.current.sendMessage({ message: userMsg.content });
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'opponent',
        content: response.text || "……",
        timestamp: Date.now()
      }]);
    } catch (e) { console.error(e); } finally { setIsOpponentTyping(false); }
  };

  const handleEndSimulation = async () => {
    setIsEnding(true);
    const review = await generateReview(messages);
    const attempt: SimulationAttempt = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      difficulty: Difficulty.WORST_IMAGINED,
      messages,
      review
    };
    saveCatastropheAttempt(incident.id, attempt);
    navigate('/review', { state: { attempt, incidentTitle: `${incident.title}（灾难模拟）`, incidentId: incident.id, node: null } });
  };

  if (stage === 'intro') {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-white flex flex-col p-6 overflow-y-auto">
        <button onClick={() => navigate('/archives')} className="text-gray-500 mb-4 p-1 self-start"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg></button>
        <h2 className="text-2xl font-bold mb-1">灾难化想象模拟</h2>
        <p className="text-xs text-gray-400 mb-6">{incident.title}</p>

        <div className="space-y-4 flex-1">
          <section className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">① 捕捉到你反复预演的最坏结果</h3>
            <p className="text-sm text-gray-800 leading-relaxed">{fear}</p>
          </section>

          <section className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
            <h3 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-2">② 客观来看，这件事发生的概率</h3>
            <p className="text-sm text-blue-900 leading-relaxed">{probabilityAnalysis}</p>
          </section>

          <section className="bg-orange-50 border border-orange-100 rounded-2xl p-5">
            <h3 className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-2">③ 哪怕万一发生了</h3>
            <p className="text-sm text-orange-900 leading-relaxed">{reassurance}</p>
            {copingPlan && (
              <div className="bg-white/70 rounded-xl p-3 mt-3">
                <p className="text-[9px] font-bold text-orange-400 uppercase tracking-widest mb-1">你的 Plan B</p>
                <p className="text-xs text-gray-700 leading-relaxed">{copingPlan}</p>
              </div>
            )}
          </section>

          <section className="bg-gray-800 rounded-2xl p-5">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">④ 接下来</h3>
            <p className="text-sm text-white leading-relaxed">在完全安全的环境里，真实地经历一次这个最坏结果，亲自验证一遍：即便发生了，你也能应对——手里还握着上面那份 Plan B。</p>
          </section>
        </div>

        <button
          onClick={startSimulation}
          className="mt-6 w-full py-4 bg-gray-900 text-white font-bold rounded-2xl text-sm active:scale-[0.98] transition-transform"
        >
          开始模拟最坏情况
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto h-screen bg-[#EDEDED] flex flex-col relative overflow-hidden">
      <header className="p-3 bg-[#EDEDED] border-b border-gray-200 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => navigate('/archives')} className="text-gray-600 p-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg></button>
        <div className="text-center">
          <h1 className="text-sm font-bold truncate">灾难模拟中</h1>
          <p className="text-[10px] text-gray-400">最坏结果正在发生</p>
        </div>
        <button onClick={handleEndSimulation} className="text-xs font-bold text-red-500 bg-white px-2 py-1 rounded-md shadow-sm">完成</button>
      </header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 pb-10">
        {messages.map(msg => (
          <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="flex max-w-[85%] items-start space-x-2">
              {msg.role === 'opponent' && <div className="w-9 h-9 bg-gray-800 rounded-md flex-shrink-0 flex items-center justify-center text-[10px] text-white font-bold">⚡</div>}
              <div className={`p-3 rounded-lg text-sm shadow-sm leading-relaxed ${msg.role === 'user' ? 'wechat-bubble-user rounded-tr-none' : 'wechat-bubble-opponent rounded-tl-none'}`}>{msg.content}</div>
              {msg.role === 'user' && <div className="w-9 h-9 bg-blue-400 rounded-md flex-shrink-0 flex items-center justify-center text-[10px] text-white font-bold">我</div>}
            </div>
          </div>
        ))}
        {isOpponentTyping && <div className="p-2 bg-white/50 rounded-lg text-[10px] italic text-gray-400 w-fit ml-11">对方正在输入...</div>}
      </div>
      <div className="bg-white border-t border-gray-200 p-3 pb-8 flex items-center space-x-3">
        <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="面对它，试着回应..." className="flex-1 bg-gray-100 border-none rounded-md px-4 py-2 text-sm focus:ring-1 focus:ring-green-400" />
        <button onClick={handleSendMessage} className={`px-4 py-2 rounded-md font-bold text-sm transition-colors ${inputText.trim() ? 'bg-[#50C878] text-white' : 'bg-gray-100 text-gray-400'}`}>发送</button>
      </div>
      {isEnding && <div className="absolute inset-0 z-[60] bg-white/90 backdrop-blur-md flex flex-col items-center justify-center p-10 text-center animate-fade-in"><div className="w-12 h-12 border-4 border-gray-200 border-t-green-500 rounded-full animate-spin mb-4"></div><h3 className="text-lg font-bold text-gray-800">正在生成深度复盘...</h3></div>}
    </div>
  );
};

export default CatastrophePage;
