import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Share2 } from 'lucide-react';
import { shareResult } from '../utils/share';
import { soundFX } from '../utils/audio';

interface ShareResultButtonProps {
  /** Built on click, so it always reflects the final state (and the freshly recorded streak). */
  getText: () => string;
  className?: string;
}

const DEFAULT_CLASS =
  'px-6 py-3 rounded-full border border-[#ccff00]/60 bg-[#ccff00]/10 hover:bg-[#ccff00]/20 text-[#ccff00] font-sans font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 hover:scale-105 active:scale-95 cursor-pointer';

/** Post-match "SHARE RESULT": native share sheet on phones, clipboard + toast on desktop. */
export const ShareResultButton: React.FC<ShareResultButtonProps> = ({ getText, className }) => {
  const [toast, setToast] = useState<{ id: number; text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2300);
    return () => clearTimeout(t);
  }, [toast]);

  const handleShare = async () => {
    soundFX.playClick(850);
    const result = await shareResult(getText());
    if (result === 'copied') {
      soundFX.playSuccess();
      setToast({ id: Date.now(), text: 'Result copied to clipboard!', ok: true });
    } else if (result === 'failed') {
      soundFX.playVoltBuzz();
      setToast({ id: Date.now(), text: "Couldn't copy. Try again.", ok: false });
    }
  };

  return (
    <>
      <button type="button" onClick={handleShare} className={className ?? DEFAULT_CLASS}>
        <Share2 className="w-4 h-4" />
        <span>Share result</span>
      </button>
      {toast &&
        createPortal(
          <div
            key={toast.id}
            role="status"
            className="share-toast fixed left-1/2 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[300] pointer-events-none"
          >
            <div
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border bg-[#0b0e14]/95 backdrop-blur-md shadow-[0_16px_40px_rgba(0,0,0,0.6)] ${
                toast.ok ? 'border-[#ccff00]/50' : 'border-rose-500/50'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  toast.ok ? 'bg-[#ccff00] text-black' : 'bg-rose-500 text-white'
                }`}
              >
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
              </span>
              <span className="font-mono text-[11px] font-black tracking-[0.12em] uppercase text-white whitespace-nowrap">
                {toast.text}
              </span>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
