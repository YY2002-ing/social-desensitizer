
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Incident, SimulationAttempt, SessionArchive, Message, RealWorldRecord, DebriefRecord } from './types';
import { ExtractedIncident } from './services/deepseekService';
import Home from './pages/Home';
import TeachingPage from './pages/TeachingPage';
import SimulationPage from './pages/SimulationPage';
import ReviewPage from './pages/ReviewPage';
import ArchivePage from './pages/ArchivePage';
import CatastrophePage from './pages/CatastrophePage';
import GrowthPage from './pages/GrowthPage';

const INCIDENTS_STORAGE_KEY = 'social_trainer_incidents_v4';
const LEGACY_V3_KEY = 'social_trainer_incidents_v3';

// v3 → v4 迁移：补上话术标签、现实应用记录、策略缓存、灾难应对计划等新字段
const migrateFromV3 = (raw: string): Incident[] => {
  try {
    const v3 = JSON.parse(raw) as any[];
    return v3.map(inc => ({
      ...inc,
      realWorldRecords: inc.realWorldRecords || [],
      catastrophe: inc.catastrophe ? { copingPlan: '', ...inc.catastrophe } : null,
      nodes: (inc.nodes || []).map((n: any) => ({ tacticIds: [], strategies: null, ...n })),
    }));
  } catch {
    return [];
  }
};

const INITIAL_GUIDANCE_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'opponent',
    content: '嗨！我是社交复盘小助手。今天有没有什么让你觉得“要是当时那样说就好了”的憋屈瞬间？跟我聊聊吧。',
    timestamp: Date.now()
  }
];

const App: React.FC = () => {
  const [currentSession, setCurrentSession] = useState<Partial<SessionArchive>>({});
  const [incidents, setIncidents] = useState<Incident[]>([]);
  // 首页倾诉对话的状态提升到这里，这样从场景模拟返回首页时对话不会被重置
  const [guidanceMessages, setGuidanceMessages] = useState<Message[]>(INITIAL_GUIDANCE_MESSAGES);
  const [guidanceIncidentId, setGuidanceIncidentId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(INCIDENTS_STORAGE_KEY);
    if (saved) {
      setIncidents(JSON.parse(saved));
      return;
    }
    const legacy = localStorage.getItem(LEGACY_V3_KEY);
    if (legacy) {
      const migrated = migrateFromV3(legacy);
      setIncidents(migrated);
      localStorage.setItem(INCIDENTS_STORAGE_KEY, JSON.stringify(migrated));
    }
  }, []);

  const persist = (updated: Incident[]) => {
    localStorage.setItem(INCIDENTS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  };

  // 保存或更新一个事件：同一次倾诉里陆续抽取出的多张场景卡片归入同一个事件（existingIncidentId），
  // 共享同一份 opponentProfile，保证模拟时人设一致；返回本次使用的事件 id，供调用方记录进同一场倾诉会话
  const saveIncident = (extraction: ExtractedIncident, confessionText: string, existingIncidentId: string | null): string => {
    const resultId = existingIncidentId || crypto.randomUUID();
    setIncidents(prev => {
      const existingIdx = existingIncidentId ? prev.findIndex(i => i.id === existingIncidentId) : -1;
      let updated: Incident[];

      // 灾难化想象每事件只捕捉一次，之后不再覆盖，避免反复覆盖用户已经看过的分析
      const catastrophe = extraction.catastrophe?.fear?.trim()
        ? { ...extraction.catastrophe, attempts: [] }
        : null;

      const newNodesFrom = (nodes: ExtractedIncident['nodes']) =>
        nodes.map(n => ({ ...n, tacticIds: n.tacticIds || [], attempts: [], strategies: null }));

      if (existingIdx === -1) {
        const newIncident: Incident = {
          id: resultId,
          title: extraction.eventTitle || '未命名事件',
          opponentProfile: extraction.opponentProfile || '',
          originalConfession: confessionText,
          nodes: newNodesFrom(extraction.nodes),
          catastrophe,
          realWorldRecords: [],
          createdAt: Date.now()
        };
        updated = [newIncident, ...prev];
      } else {
        const existing = prev[existingIdx];
        // 避免重复保存同一个描述的场景卡片
        const existingDescs = new Set(existing.nodes.map(n => n.description));
        const newNodes = newNodesFrom(extraction.nodes.filter(n => !existingDescs.has(n.description)));
        const mergedIncident: Incident = {
          ...existing,
          title: extraction.eventTitle || existing.title,
          opponentProfile: extraction.opponentProfile || existing.opponentProfile,
          originalConfession: confessionText,
          nodes: [...existing.nodes, ...newNodes],
          catastrophe: existing.catastrophe || catastrophe
        };
        updated = [mergedIncident, ...prev.slice(0, existingIdx), ...prev.slice(existingIdx + 1)];
      }

      return persist(updated);
    });
    return resultId;
  };

  const saveAttempt = (incidentId: string, nodeId: string, attempt: SimulationAttempt) => {
    setIncidents(prev => persist(prev.map(inc => {
      if (inc.id !== incidentId) return inc;
      return {
        ...inc,
        nodes: inc.nodes.map(n => n.id === nodeId ? { ...n, attempts: [attempt, ...n.attempts] } : n)
      };
    })));
  };

  const saveCatastropheAttempt = (incidentId: string, attempt: SimulationAttempt) => {
    setIncidents(prev => persist(prev.map(inc => {
      if (inc.id !== incidentId || !inc.catastrophe) return inc;
      return { ...inc, catastrophe: { ...inc.catastrophe, attempts: [attempt, ...inc.catastrophe.attempts] } };
    })));
  };

  // "我做到了"：写入一条现实应用记录（linkedNodeId 为 null 表示整件事做到了）
  const addRealWorldRecord = (incidentId: string, record: Omit<RealWorldRecord, 'id' | 'timestamp'>) => {
    setIncidents(prev => persist(prev.map(inc => {
      if (inc.id !== incidentId) return inc;
      const full: RealWorldRecord = { id: crypto.randomUUID(), timestamp: Date.now(), ...record };
      return { ...inc, realWorldRecords: [full, ...inc.realWorldRecords] };
    })));
  };

  // 复盘页补聊对账（跳过后的重入口，D29）：把对账记录补写进已存档的演练
  const updateAttemptDebrief = (incidentId: string, nodeId: string, attemptId: string, debrief: DebriefRecord) => {
    setIncidents(prev => persist(prev.map(inc => {
      if (inc.id !== incidentId) return inc;
      return {
        ...inc,
        nodes: inc.nodes.map(n => n.id === nodeId
          ? { ...n, attempts: n.attempts.map(a => a.id === attemptId ? { ...a, debrief } : a) }
          : n),
      };
    })));
  };

  // 教学对话记录存到卡片上：跳过后随时可回来接着聊（D15/D29）
  const saveTeachingMessages = (incidentId: string, nodeId: string, messages: Message[]) => {
    setIncidents(prev => persist(prev.map(inc => {
      if (inc.id !== incidentId) return inc;
      return { ...inc, nodes: inc.nodes.map(n => n.id === nodeId ? { ...n, teachingMessages: messages } : n) };
    })));
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 text-gray-900 overflow-x-hidden">
        <Routes>
          <Route
            path="/"
            element={
              <Home
                setSession={setCurrentSession}
                saveIncident={saveIncident}
                incidents={incidents}
                messages={guidanceMessages}
                setMessages={setGuidanceMessages}
                sessionIncidentId={guidanceIncidentId}
                setSessionIncidentId={setGuidanceIncidentId}
                addRealWorldRecord={addRealWorldRecord}
              />
            }
          />
          <Route
            path="/strategy"
            element={<TeachingPage session={currentSession} setSession={setCurrentSession} incidents={incidents} saveTeachingMessages={saveTeachingMessages} />}
          />
          <Route
            path="/simulate"
            element={<SimulationPage session={currentSession} setSession={setCurrentSession} saveAttempt={saveAttempt} incidents={incidents} />}
          />
          <Route
            path="/review"
            element={<ReviewPage updateAttemptDebrief={updateAttemptDebrief} />}
          />
          <Route
            path="/archives"
            element={<ArchivePage incidents={incidents} setSession={setCurrentSession} addRealWorldRecord={addRealWorldRecord} />}
          />
          <Route
            path="/catastrophe"
            element={<CatastrophePage incidents={incidents} saveCatastropheAttempt={saveCatastropheAttempt} />}
          />
          <Route
            path="/growth"
            element={<GrowthPage incidents={incidents} />}
          />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
