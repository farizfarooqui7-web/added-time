import React, { useState } from 'react';
import { Bug, Sparkles, HelpCircle, X, Send, CheckCircle2, MessageSquare } from 'lucide-react';
import { soundFX } from '../utils/audio';

type FeedbackType = 'bug' | 'suggestion' | 'question';

interface FeedbackWidgetProps {
  currentView?: string;
}

export const FeedbackWidget: React.FC<FeedbackWidgetProps> = ({ currentView }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('bug');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleOpen = () => {
    soundFX.playClick(650);
    setIsOpen(true);
  };

  const handleClose = () => {
    soundFX.playClick(500);
    setIsOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsSubmitting(true);
    soundFX.playClick(800);

    const clientMetadata = {
      timestamp: new Date().toISOString(),
      activeView: currentView || 'main-hub',
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      userAgent: navigator.userAgent,
      pixelRatio: window.devicePixelRatio,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language,
    };

    const webhookUrl =
      import.meta.env.VITE_FEEDBACK_WEBHOOK_URL ||
      (import.meta.env.VITE_WEB3FORMS_ACCESS_KEY ? 'https://api.web3forms.com/submit' : undefined);
    const category = feedbackType;

    if (webhookUrl) {
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            access_key: import.meta.env.VITE_WEB3FORMS_ACCESS_KEY,
            subject: 'Added Time - Bug Report / Feedback',
            category: category,
            message: description,
            email: email || 'Anonymous Baller',
            metadata: clientMetadata,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          console.error('[FeedbackWidget] Web3Forms submission failed:', res.status, errData);
        }
      } catch (err) {
        console.error('[FeedbackWidget] Webhook dispatch failed, falling back to local acknowledgment:', err);
      }
    }

    soundFX.playSuccess();
    setIsSubmitting(false);
    setDescription('');
    setEmail('');
    setIsOpen(false);

    setToastMessage('Feedback recorded! Cheers for helping improve Added Time.');
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const fieldClass =
    'w-full rounded-lg bg-black/40 border border-white/10 focus:border-[color:var(--acc-line)] focus:ring-1 focus:ring-[color:var(--acc-soft)] text-base sm:text-sm text-white placeholder-slate-600 focus:outline-none transition-colors';

  return (
    <>
      {/* Floating trigger, bottom-left */}
      <div className="fixed bottom-3 left-3 sm:bottom-4 sm:left-4 z-40 select-none">
        <button
          type="button"
          onClick={handleOpen}
          aria-label="Report Bug or Send Feedback"
          style={{ ['--acc' as string]: '#fbbf24' } as React.CSSProperties}
          className="bc-scope bc-btn h-9 pl-2.5 pr-3 rounded-lg bg-[#0b0e14]/90 border border-white/10 hover:border-amber-400/50 text-slate-300 hover:text-white backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.6)] inline-flex items-center gap-2 cursor-pointer"
        >
          <Bug className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline font-mono text-[10px] font-black tracking-[0.18em] uppercase">Report bug</span>
        </button>
      </div>

      {/* Success toast */}
      {toastMessage && (
        <div className="bc-overlay fixed bottom-14 left-3 sm:left-4 z-50 select-none">
          <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/40 bg-[#0b0e14] px-3.5 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.85)] text-[12px] text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Bug report & feedback sheet */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') handleClose();
          }}
          className="bc-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-5 bg-black/80 backdrop-blur-md select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ['--acc' as string]: '#fbbf24' } as React.CSSProperties}
            className="bc-scope bc-panel relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[94dvh]"
          >
            <div className="bc-rail absolute inset-x-0 top-0 h-[2px]" />
            <div className="bc-sheen absolute inset-x-0 top-0 h-32 pointer-events-none" />

            <div className="relative shrink-0 flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-white/[0.07]">
              <div>
                <div className="flex items-center gap-2.5 font-mono text-[10px] font-bold tracking-[0.22em] uppercase">
                  <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-300">Support desk</span>
                </div>
                <h3
                  id="feedback-title"
                  className="mt-2 font-athletic italic font-black text-4xl uppercase text-white leading-[0.9] tracking-tight"
                >
                  Report a bug
                </h3>
                <p className="mt-2 text-[13px] text-slate-400">Spotted something off, or got an idea? Tell us.</p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="bc-btn bc-btn-ghost shrink-0 w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="relative flex flex-col min-h-0">
              <div className="flex flex-col gap-4 px-6 py-5 overflow-y-auto">
                <div className="flex flex-col gap-2">
                  <span className="font-mono text-[10px] font-bold tracking-[0.22em] uppercase text-slate-300">
                    <span style={{ color: 'var(--acc)' }}>01</span> Category
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'bug' as FeedbackType, label: 'Bug', icon: Bug },
                      { id: 'suggestion' as FeedbackType, label: 'Idea', icon: Sparkles },
                      { id: 'question' as FeedbackType, label: 'Question', icon: HelpCircle },
                    ].map((item) => {
                      const Icon = item.icon;
                      const isSelected = feedbackType === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => {
                            soundFX.playClick(600);
                            setFeedbackType(item.id);
                          }}
                          className={`bc-tile ${isSelected ? 'is-selected' : ''} h-11 rounded-lg inline-flex items-center justify-center gap-2 font-mono text-[11px] font-black tracking-[0.12em] uppercase text-slate-200 cursor-pointer`}
                        >
                          <Icon className="w-3.5 h-3.5" style={{ color: isSelected ? 'var(--acc)' : '#94a3b8' }} />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="flex flex-col gap-2">
                  <span className="font-mono text-[10px] font-bold tracking-[0.22em] uppercase text-slate-300">
                    <span style={{ color: 'var(--acc)' }}>02</span> What happened?
                  </span>
                  <textarea
                    required
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What you saw, steps to reproduce, or your idea..."
                    className={`${fieldClass} p-3 resize-none select-text`}
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="font-mono text-[10px] font-bold tracking-[0.22em] uppercase text-slate-300">
                    <span style={{ color: 'var(--acc)' }}>03</span> Email <span className="text-slate-500">(optional)</span>
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@domain.com, for a follow-up"
                    className={`${fieldClass} h-11 px-3 select-text`}
                  />
                </label>

                <span className="font-mono text-[10px] tracking-[0.12em] text-slate-500 uppercase">
                  Attaches: {currentView || 'hub'} · device info
                </span>
              </div>

              <div className="shrink-0 grid grid-cols-2 gap-2 px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] border-t border-white/[0.07] bg-black/30">
                <button
                  type="button"
                  onClick={handleClose}
                  className="bc-btn bc-btn-ghost h-11 rounded-lg font-mono text-[11px] font-black tracking-[0.14em] uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !description.trim()}
                  className="bc-btn bc-btn-primary h-11 rounded-lg inline-flex items-center justify-center gap-2 font-mono text-[11px] font-black tracking-[0.14em] uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isSubmitting ? 'Sending...' : 'Send report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
