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

  return (
    <>
      {/* Discreet Floating Trigger Pill anchored at bottom-left */}
      <div className="fixed bottom-3 left-3 sm:bottom-4 sm:left-4 z-40 select-none">
        <button
          type="button"
          onClick={handleOpen}
          aria-label="Report Bug or Send Feedback"
          className="min-h-[44px] px-3.5 py-2 rounded-full bg-[#0a0d14]/90 hover:bg-[#121622] border border-white/10 hover:border-amber-400/40 text-neutral-300 hover:text-white backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.6)] flex items-center gap-2 text-xs font-mono transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer group"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
          </span>
          <Bug className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-12 transition-transform" />
          <span className="font-semibold tracking-wide hidden xs:inline sm:inline">Report Bug</span>
        </button>
      </div>

      {/* Floating Success Toast */}
      {toastMessage && (
        <div className="fixed bottom-16 left-3 sm:left-4 z-50 animate-in slide-in-from-bottom-2 duration-200 select-none">
          <div className="px-4 py-3 rounded-2xl bg-[#0c121e] border border-emerald-500/40 shadow-[0_12px_40px_rgba(0,0,0,0.85)] flex items-center gap-2.5 text-xs font-mono text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Bug Report & Feedback Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-150 select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg rounded-2xl bg-[#0c1018] border border-white/10 p-5 sm:p-7 shadow-[0_24px_80px_rgba(0,0,0,0.95)] flex flex-col gap-4 overflow-hidden animate-in zoom-in-95 duration-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.2)]">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3
                    id="feedback-title"
                    className="font-sans font-black text-lg text-white uppercase tracking-tight"
                  >
                    Feedback &amp; Bug Report
                  </h3>
                  <p className="text-[11px] font-mono text-neutral-400">
                    Help us elevate the pitch experience.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Type Tabs */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-mono font-bold text-neutral-300 uppercase tracking-wider">
                  Feedback Category
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'bug' as FeedbackType, label: 'Bug', icon: Bug, color: 'text-rose-400' },
                    { id: 'suggestion' as FeedbackType, label: 'Idea', icon: Sparkles, color: 'text-[#ccff00]' },
                    { id: 'question' as FeedbackType, label: 'Question', icon: HelpCircle, color: 'text-cyan-400' },
                  ].map((item) => {
                    const isSelected = feedbackType === item.id;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          soundFX.playClick(600);
                          setFeedbackType(item.id);
                        }}
                        className={`min-h-[44px] py-2 px-3 rounded-xl border font-mono text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-[#181e2b] border-[#ccff00] text-white shadow-[0_0_14px_rgba(204,255,0,0.2)]'
                            : 'bg-white/[0.03] border-white/10 text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.06]'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-mono font-bold text-neutral-300 uppercase tracking-wider">
                  Description
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what occurred, steps to reproduce, or your gameplay suggestion..."
                  className="w-full rounded-xl bg-[#121622] border border-white/10 focus:border-[#ccff00]/60 p-3 text-base sm:text-sm font-sans text-white placeholder-neutral-500 focus:outline-none transition-all resize-none"
                />
              </div>

              {/* Optional Contact Email */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-mono font-bold text-neutral-300 uppercase tracking-wider">
                  Contact Email (Optional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@domain.com for follow-up"
                  className="min-h-[44px] w-full rounded-xl bg-[#121622] border border-white/10 focus:border-[#ccff00]/60 px-3 py-2 text-base sm:text-sm font-sans text-white placeholder-neutral-500 focus:outline-none transition-all"
                />
              </div>

              {/* Silent Metadata Notice */}
              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5 text-[10px] font-mono text-neutral-500 flex items-center justify-between">
                <span>Includes active arena: {currentView || 'hub'}</span>
                <span>Silent diagnostics</span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="min-h-[44px] py-2 px-4 rounded-xl text-neutral-400 hover:text-white font-mono text-xs uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !description.trim()}
                  className="min-h-[44px] py-2.5 px-5 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] disabled:opacity-50 text-black font-sans font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(204,255,0,0.3)] active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Sending...' : 'Submit Report'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
