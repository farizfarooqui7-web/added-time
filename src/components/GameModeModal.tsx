import React, { useState } from 'react';
import type { GameModeInfo } from '../types';
import { soundFX } from '../utils/audio';
import { X, Copy, Check, Bot, Globe, Users, RotateCcw } from 'lucide-react';

export type LaunchFlowTab = 'solo' | 'quickmatch' | 'party';

interface GameModeModalProps {
  mode: GameModeInfo | null;
  isOpen: boolean;
  onClose: () => void;
  initialTab?: LaunchFlowTab;
}

const SAMPLE_CODES = ['TB20', 'VOLT', 'GOAT', 'MSN1', 'WC14', 'PICH', 'KOP7', 'CAMP'];

export const GameModeModal: React.FC<GameModeModalProps> = ({
  mode,
  isOpen,
  onClose,
  initialTab = 'solo',
}) => {
  const [activeTab, setActiveTab] = useState<LaunchFlowTab>(initialTab);
  const [roomCode, setRoomCode] = useState('TB20');
  const [copied, setCopied] = useState(false);
  const [partyMode, setPartyMode] = useState<'host' | 'join'>('host');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinNickname, setJoinNickname] = useState('');
  const [joinStatus, setJoinStatus] = useState<string | null>(null);

  // Quickmatch matchmaking simulation
  const [matchFound, setMatchFound] = useState(false);
  const [searching, setSearching] = useState(false);

  // Solo / Bot state for instant practice
  const [soloRound, setSoloRound] = useState(1);
  const [userBankroll, setUserBankroll] = useState(20);
  const botBankroll = 20;
  const [currentBid, setCurrentBid] = useState(1);
  const [criteriaInput, setCriteriaInput] = useState('');
  const [criteriaFeedback, setCriteriaFeedback] = useState<string | null>(null);
  const [wavelengthGuess, setWavelengthGuess] = useState(5.5);
  const [revealedWavelength, setRevealedWavelength] = useState(false);

  if (!isOpen || !mode) return null;

  const accentColor =
    mode.accent === 'purple'
      ? '#a855f7'
      : mode.accent === 'crimson'
      ? '#ef4444'
      : mode.accent === 'cyan'
      ? '#00f0ff'
      : mode.accent === 'gold'
      ? '#fbbf24'
      : '#ccff00';

  const handleTabChange = (tab: LaunchFlowTab) => {
    soundFX.playClick(650);
    setActiveTab(tab);
    setMatchFound(false);
    setSearching(false);
    setJoinStatus(null);
  };

  const handleStartQuickmatch = () => {
    soundFX.playClick(800);
    setSearching(true);
    setMatchFound(false);
    setTimeout(() => {
      setSearching(false);
      setMatchFound(true);
      soundFX.playVoltBuzz();
    }, 1500);
  };

  const handleRerollCode = () => {
    soundFX.playClick(850);
    const code = SAMPLE_CODES[Math.floor(Math.random() * SAMPLE_CODES.length)];
    setRoomCode(code);
    setCopied(false);
  };

  const handleCopyCode = () => {
    soundFX.playClick(900);
    navigator.clipboard?.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoinParty = (e: React.FormEvent) => {
    e.preventDefault();
    soundFX.playClick(750);
    if (!joinCodeInput.trim() || !joinNickname.trim()) {
      setJoinStatus('Please enter both room code and nickname.');
      return;
    }
    setJoinStatus(`Connected to Room [${joinCodeInput.toUpperCase()}] as "${joinNickname.toUpperCase()}"!`);
  };

  const handleCriteriaSubmit = () => {
    soundFX.playClick(750);
    const clean = criteriaInput.trim().toLowerCase();
    if (clean.includes('anelka') || clean.includes('ozil') || clean.includes('nasri') || clean.includes('giroud')) {
      setCriteriaFeedback('Goal! Baller verified (+1 Point)');
    } else {
      setCriteriaFeedback('Blocked! Unverified criteria. Try again!');
    }
  };

  return (
    <div
      onClick={() => {
        soundFX.playClick(500);
        onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      {/* Tactile Claymorphic Modal Surface */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl bg-[#12151e] rounded-3xl border border-white/10 text-white shadow-[0_24px_60px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.12)] flex flex-col overflow-hidden max-h-[calc(92vh/var(--zoom,1))]"
      >
        {/* Top Header */}
        <div className="bg-[#0b0e14] border-b border-white/5 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block shadow-sm"
              style={{ backgroundColor: accentColor }}
            />
            <span className="font-sans font-extrabold text-xl tracking-tight text-white">
              {mode.title}
            </span>
            <span
              className="text-[10px] font-sans font-bold uppercase px-2.5 py-0.5 rounded-full border shadow-sm"
              style={{
                color: accentColor,
                borderColor: `${accentColor}40`,
                backgroundColor: `${accentColor}10`,
              }}
            >
              {mode.badge}
            </span>
          </div>

          <button
            onClick={() => {
              soundFX.playClick(500);
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white flex items-center justify-center transition-all"
            title="Close [ESC]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3-Mode Streamlined Pill Selector */}
        <div className="p-4 bg-[#0e1118] border-b border-white/5 flex gap-2">
          <button
            onClick={() => handleTabChange('solo')}
            className={`flex-1 py-2.5 px-3 rounded-full font-sans font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'solo'
                ? 'bg-[#ccff00] text-black shadow-lg shadow-[#ccff00]/20'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Solo / Practice</span>
          </button>

          <button
            onClick={() => handleTabChange('quickmatch')}
            className={`flex-1 py-2.5 px-3 rounded-full font-sans font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'quickmatch'
                ? 'bg-[#00f0ff] text-black shadow-lg shadow-[#00f0ff]/20'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Quickmatch</span>
          </button>

          <button
            onClick={() => handleTabChange('party')}
            className={`flex-1 py-2.5 px-3 rounded-full font-sans font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'party'
                ? 'bg-[#fbbf24] text-black shadow-lg shadow-[#fbbf24]/20'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Host / Join Party</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* TAB 1: SOLO / PRACTICE */}
          {activeTab === 'solo' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#0b0e14] border border-white/5">
                <span className="font-sans font-bold text-xs text-[#ccff00] uppercase tracking-wider block mb-1">
                  Offline Solo Practice
                </span>
                <p className="text-xs text-slate-300 font-sans leading-relaxed">{mode.desc}</p>
              </div>

              {/* Mode-Specific Solo Play Simulator */}
              {mode.id === 'auction-draft' ? (
                <div className="p-5 rounded-2xl bg-[#161a24] border border-white/5 space-y-4 shadow-inner">
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="p-3 rounded-xl bg-[#0b0e14] border border-white/5">
                      <span className="block font-mono text-[10px] text-slate-400">YOU (P1)</span>
                      <span className="font-sans font-extrabold text-3xl text-[#ccff00]">
                        ${userBankroll}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#0b0e14] border border-white/5">
                      <span className="block font-mono text-[10px] text-slate-400">BOT (AI)</span>
                      <span className="font-sans font-extrabold text-3xl text-slate-300">
                        ${botBankroll}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0b0e14] border border-white/5 text-center">
                    <span className="font-mono text-[10px] text-slate-400 uppercase block">
                      Round {soloRound} of 5: Up for Bid
                    </span>
                    <span className="font-sans font-extrabold text-xl text-white uppercase block mt-1">
                      {soloRound === 1
                        ? '2014-15 Neymar Jr [ ATK ]'
                        : soloRound === 2
                        ? '2007-08 C. Ronaldo [ ATK ]'
                        : soloRound === 3
                        ? '2023-24 Phil Foden [ MID / ATK ]'
                        : '1993-94 Paolo Maldini [ DEF ]'}
                    </span>
                    <span className="text-xs font-mono text-[#fbbf24] mt-1 block">
                      Current Bid: ${currentBid} (Bot Calling)
                    </span>
                  </div>

                  <div className="flex gap-2.5">
                    <button
                      onClick={() => {
                        soundFX.playClick(700);
                        if (userBankroll > currentBid) {
                          setCurrentBid((b) => b + 1);
                        }
                      }}
                      className="flex-1 py-3 rounded-full bg-[#ccff00] hover:bg-[#b8e600] text-black font-sans font-bold uppercase text-xs tracking-wider transition-all shadow-md shadow-[#ccff00]/20"
                    >
                      Raise Bid +$1
                    </button>
                    <button
                      onClick={() => {
                        soundFX.playVoltBuzz();
                        if (userBankroll >= currentBid) {
                          setUserBankroll((b) => b - currentBid);
                        }
                        setSoloRound((r) => (r >= 5 ? 1 : r + 1));
                        setCurrentBid(1);
                      }}
                      className="flex-1 py-3 rounded-full bg-[#1e2433] hover:bg-[#252d40] border border-white/10 text-white font-sans font-bold uppercase text-xs tracking-wider transition-all"
                    >
                      Lock Baller & Next
                    </button>
                  </div>
                </div>
              ) : mode.id === 'side_netting' ? (
                <div className="p-5 rounded-2xl bg-[#161a24] border border-white/5 space-y-4">
                  <div className="p-4 rounded-xl bg-[#0b0e14] border border-white/5 text-center">
                    <span className="font-sans font-bold text-xs text-[#00f0ff] uppercase block mb-1">
                      Side Netting Prompt
                    </span>
                    <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                      <span>1: Overrated</span>
                      <span className="text-white text-base font-sans font-bold uppercase">"N'Golo Kanté 2016"</span>
                      <span>10: Underrated</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-mono text-slate-300">
                      <span>Your Dial: <strong className="text-[#00f0ff]">{wavelengthGuess}</strong></span>
                      {revealedWavelength && (
                        <span className="text-[#fbbf24]">Secret Target: <strong>7.0</strong></span>
                      )}
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="0.5"
                      value={wavelengthGuess}
                      onChange={(e) => setWavelengthGuess(parseFloat(e.target.value))}
                      className="w-full accent-[#00f0ff] cursor-pointer"
                    />
                  </div>

                  <button
                    onClick={() => {
                      soundFX.playClick(800);
                      setRevealedWavelength(!revealedWavelength);
                    }}
                    className="w-full py-2.5 rounded-full bg-[#00f0ff] hover:bg-[#00d6e6] text-black font-sans font-bold uppercase text-xs tracking-wider transition-all shadow-md shadow-[#00f0ff]/20"
                  >
                    {revealedWavelength ? 'Hide Target' : 'Reveal Target'}
                  </button>
                </div>
              ) : (
                <div className="p-5 rounded-2xl bg-[#161a24] border border-white/5 space-y-3">
                  <div className="p-4 rounded-xl bg-[#0b0e14] border border-white/5 text-center">
                    <span className="font-mono text-xs text-slate-400 uppercase block mb-1">
                      Connecting Baller Challenge
                    </span>
                    <div className="font-sans font-extrabold text-lg text-purple-300 uppercase">
                      Chelsea + Brazil + Teammate (PSG)
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type baller name..."
                      value={criteriaInput}
                      onChange={(e) => setCriteriaInput(e.target.value)}
                      className="flex-1 rounded-full bg-[#0b0e14] border border-white/10 text-white font-sans text-xs px-4 py-2.5 uppercase focus:outline-none focus:border-purple-500"
                    />
                    <button
                      onClick={handleCriteriaSubmit}
                      className="px-5 py-2.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white font-sans font-bold uppercase text-xs tracking-wider transition-all"
                    >
                      Lock In
                    </button>
                  </div>

                  {criteriaFeedback && (
                    <div className="p-3 rounded-xl text-xs font-mono text-[#ccff00] bg-[#0b0e14] border border-white/5">
                      {criteriaFeedback}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: QUICKMATCH */}
          {activeTab === 'quickmatch' && (
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-[#0b0e14] border border-white/5 text-center space-y-1">
                <span className="font-sans font-bold text-xs text-[#00f0ff] uppercase tracking-wider block">
                  Online Matchmaking
                </span>
                <p className="text-xs text-slate-300 font-sans">
                  Instant 1v1 queue against a live baller online.
                </p>
              </div>

              {!searching && !matchFound && (
                <button
                  onClick={handleStartQuickmatch}
                  className="w-full py-4 rounded-full bg-[#00f0ff] hover:bg-[#00d6e6] text-black font-sans font-extrabold uppercase text-sm tracking-wider transition-all shadow-lg shadow-[#00f0ff]/20 flex items-center justify-center gap-2"
                >
                  <Globe className="w-4 h-4 fill-black" />
                  <span>Find Opponent</span>
                </button>
              )}

              {searching && (
                <div className="p-6 rounded-2xl bg-[#161a24] border border-[#00f0ff]/40 text-center space-y-2">
                  <span className="relative flex h-3 w-3 mx-auto">
                    <span className="animate-ping absolute inline-flex h-full w-full bg-[#00f0ff] opacity-75"></span>
                    <span className="relative inline-flex h-3 w-3 bg-[#00f0ff] rounded-full"></span>
                  </span>
                  <div className="font-sans font-extrabold text-xl text-white uppercase">
                    Searching for Baller...
                  </div>
                  <span className="font-mono text-xs text-slate-400 block">Queue Time: 00:02</span>
                </div>
              )}

              {matchFound && (
                <div className="p-6 rounded-2xl bg-[#0b0e14] border border-[#ccff00] text-center space-y-3">
                  <span className="px-3 py-1 rounded-full text-xs font-sans font-bold text-black bg-[#ccff00] uppercase inline-block">
                    Match Found
                  </span>
                  <div className="font-sans font-extrabold text-2xl text-white uppercase">
                    You vs @Baller_99
                  </div>
                  <button
                    onClick={() => {
                      soundFX.playVoltBuzz();
                      onClose();
                    }}
                    className="w-full py-3 rounded-full bg-[#ccff00] hover:bg-[#b8e600] text-black font-sans font-bold uppercase text-xs tracking-wider transition-all shadow-lg shadow-[#ccff00]/25"
                  >
                    Enter Matchroom
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: HOST / JOIN PARTY */}
          {activeTab === 'party' && (
            <div className="space-y-4">
              <div className="p-1 rounded-full bg-[#0b0e14] border border-white/5 flex">
                <button
                  onClick={() => setPartyMode('host')}
                  className={`flex-1 py-2 rounded-full font-sans font-bold text-xs uppercase transition-all ${
                    partyMode === 'host'
                      ? 'bg-[#fbbf24] text-black shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Host New Room
                </button>
                <button
                  onClick={() => setPartyMode('join')}
                  className={`flex-1 py-2 rounded-full font-sans font-bold text-xs uppercase transition-all ${
                    partyMode === 'join'
                      ? 'bg-[#fbbf24] text-black shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Enter Code
                </button>
              </div>

              {partyMode === 'host' ? (
                <div className="p-6 rounded-2xl bg-[#0b0e14] border border-white/5 text-center space-y-3">
                  <span className="font-mono text-xs text-slate-400 uppercase tracking-wider block">
                    Room Code
                  </span>
                  <div className="font-sans font-black text-5xl tracking-widest text-[#fbbf24]">
                    {roomCode}
                  </div>

                  <div className="flex justify-center gap-2 pt-2">
                    <button
                      onClick={handleCopyCode}
                      className="px-4 py-2 rounded-full font-sans font-bold text-xs uppercase bg-[#161a24] hover:bg-[#1e2433] text-white border border-white/10 flex items-center gap-1.5 transition-all"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#fbbf24]" />
                          <span className="text-[#fbbf24]">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          <span>Copy Code</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleRerollCode}
                      className="px-4 py-2 rounded-full font-sans font-bold text-xs uppercase bg-[#161a24] hover:bg-[#1e2433] text-slate-300 border border-white/10 flex items-center gap-1.5 transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Re-Roll</span>
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleJoinParty} className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono uppercase text-slate-300 mb-1">
                      Room Code (4 Letters)
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="ENTER CODE"
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                      className="w-full rounded-2xl bg-[#0b0e14] border border-white/10 text-[#fbbf24] font-mono text-2xl text-center uppercase tracking-widest p-2.5 focus:outline-none focus:border-[#fbbf24]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase text-slate-300 mb-1">
                      Nickname
                    </label>
                    <input
                      type="text"
                      placeholder="ENTER NICKNAME"
                      value={joinNickname}
                      onChange={(e) => setJoinNickname(e.target.value)}
                      className="w-full rounded-2xl bg-[#0b0e14] border border-white/10 text-white font-sans text-sm uppercase p-2.5 focus:outline-none focus:border-[#fbbf24]"
                    />
                  </div>

                  {joinStatus && (
                    <div className="p-3 rounded-xl text-xs font-mono bg-[#0b0e14] border border-[#fbbf24]/30 text-[#fbbf24]">
                      {joinStatus}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-3 rounded-full bg-[#fbbf24] hover:bg-[#f59e0b] text-black font-sans font-bold uppercase text-xs tracking-wider transition-all shadow-md shadow-[#fbbf24]/20"
                  >
                    Connect
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
