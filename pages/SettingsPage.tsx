
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiKey, saveApiKey } from '../services/deepseekService';

// 设置页（D27-7）：刺激性效果的开关集中在这里，默认关闭、首次询问、随时可改。
// 未来的 BGM、震动、截图底图等开关也挂在这一页。
const FX_FLASH_KEY = 'st_fx_flash';

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [fxFlash, setFxFlash] = useState<boolean>(() => localStorage.getItem(FX_FLASH_KEY) === 'on');
  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState<boolean>(() => !!getApiKey());
  const [editingKey, setEditingKey] = useState(false);

  const toggleFlash = () => {
    const next = !fxFlash;
    localStorage.setItem(FX_FLASH_KEY, next ? 'on' : 'off');
    setFxFlash(next);
  };

  const handleSaveKey = () => {
    if (!keyInput.trim()) return;
    saveApiKey(keyInput);
    setHasKey(true);
    setKeyInput('');
    setEditingKey(false);
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#F5F5F5] flex flex-col">
      <header className="p-4 bg-white border-b flex items-center sticky top-0 z-10 shadow-sm">
        <button onClick={() => navigate(-1)} className="text-gray-500 mr-4 p-1">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
        </button>
        <h1 className="text-lg font-bold">设置</h1>
      </header>

      <main className="flex-1 p-4 space-y-4">
        {/* 刺激性效果开关 */}
        <section className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">演练效果</h3>
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-4">
              <p className="text-sm font-bold text-gray-800">倒计时紧迫效果</p>
              <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">倒计时快结束时屏幕边缘红光闪动。<span className="font-bold">对闪烁敏感（如光敏性癫痫）请保持关闭。</span></p>
            </div>
            <button
              onClick={toggleFlash}
              className={`w-12 h-7 rounded-full transition-colors flex-shrink-0 relative ${fxFlash ? 'bg-green-500' : 'bg-gray-200'}`}
              aria-label="倒计时紧迫效果开关"
            >
              <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${fxFlash ? 'left-[22px]' : 'left-0.5'}`}></span>
            </button>
          </div>
        </section>

        {/* API Key */}
        <section className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">DeepSeek API Key</h3>
          {editingKey ? (
            <div className="flex items-center space-x-2">
              <input
                type="password"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleSaveKey()}
                placeholder="粘贴你的 Key (sk-...)"
                className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                autoFocus
              />
              <button onClick={handleSaveKey} className="text-xs bg-blue-500 text-white px-3 py-2 rounded-lg font-bold">保存</button>
              <button onClick={() => setEditingKey(false)} className="text-xs text-gray-400 px-1">取消</button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">{hasKey ? '🔑 已设置（只保存在你自己的浏览器里）' : '⚠️ 未设置，AI 功能不可用'}</p>
              <button onClick={() => setEditingKey(true)} className="text-xs font-bold text-blue-500">{hasKey ? '修改' : '去设置'}</button>
            </div>
          )}
        </section>

        <p className="text-[9px] text-gray-300 text-center px-8 leading-relaxed">
          所有数据（倾诉记录、演练记录、API Key）都只存在你自己的浏览器本地，不会上传到任何服务器。
        </p>
      </main>
    </div>
  );
};

export default SettingsPage;
