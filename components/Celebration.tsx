
import React, { useMemo } from 'react';

interface CelebrationProps {
  title: string;      // 如：你做到了！
  subtitle?: string;  // 如：从捕捉到做到，用了 6 天
  onClose: () => void;
}

// 全屏庆祝动效：纯 CSS 彩带 + 弹入卡片。正强化是打破习得性无助的关键一环，所以做得隆重一点。
const Celebration: React.FC<CelebrationProps> = ({ title, subtitle, onClose }) => {
  const pieces = useMemo(() =>
    Array.from({ length: 36 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 2.2 + Math.random() * 1.6,
      emoji: ['🎉', '✨', '🎊', '⭐', '💚', '🌟'][i % 6],
      size: 14 + Math.random() * 14,
    })), []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-8vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(108vh) rotate(540deg); opacity: 0.6; }
        }
        @keyframes celebration-pop {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.06); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-fade-in"></div>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 pointer-events-none select-none"
          style={{
            left: `${p.left}%`,
            fontSize: p.size,
            animation: `confetti-fall ${p.duration}s linear ${p.delay}s forwards`,
          }}
        >
          {p.emoji}
        </span>
      ))}
      <div
        className="relative bg-white rounded-3xl px-8 py-10 mx-8 text-center shadow-2xl max-w-sm"
        style={{ animation: 'celebration-pop 0.45s ease-out forwards' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-xl font-bold text-gray-800">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-3 leading-relaxed">{subtitle}</p>}
        <p className="text-[11px] text-gray-400 mt-4">这是你自己一步步练出来的</p>
        <button
          onClick={onClose}
          className="mt-6 w-full py-3 bg-green-500 text-white font-bold rounded-2xl text-sm active:scale-95 transition-transform"
        >
          收下这份成长
        </button>
      </div>
    </div>
  );
};

export default Celebration;
