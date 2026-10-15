import React, { useState, useEffect, useRef } from 'react';
import { useParty } from '../context/PartyContext';
import { soundFX } from '../utils/audio';
import {
  X,
  Crown,
  Check,
  Copy,
  Eye,
  EyeOff,
  Users,
  UserPlus,
  LogOut,
  Sparkles,
  Shield,
  Zap,
  ArrowRight,
  UserMinus,
  CheckCircle2,
  Clock,
  Edit2,
  Radio,
  Lock,
  Globe,
} from 'lucide-react';

export const PartyDrawer: React.FC = () => {
  const {
    party,
    playerName,
    updatePlayerName,
    isDrawerOpen,
    dockView,
    setDockView,
    drawerInitialFocusJoin,
    closeDrawer,
    hostNewParty,
    joinPartyWithCode,
    leaveParty,
    toggleReady,
    toggleCodeMask,
    kickMember,
    expandSlots,
    wsConnected,
  } = useParty();

  const isActualParty = party.isActive && !party.roomCode?.startsWith('match_');

  // Host setup form state
  const [hostNameInput, setHostNameInput] = useState(playerName || '');
  const [serverVisibility, setServerVisibility] = useState<'private' | 'public'>('private');
  const [hostSetupError, setHostSetupError] = useState<string | null>(null);

  // Join form state
  const [inputCode, setInputCode] = useState('');
  const [isCodeMaskedJoin, setIsCodeMaskedJoin] = useState(true);
  const [inputNickname, setInputNickname] = useState(playerName || '');
  const [joinError, setJoinError] = useState<string | null>(null);

  // Active lobby inline name edit
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(playerName || '');
  const [copiedCode, setCopiedCode] = useState(false);

  const joinInputRef = useRef<HTMLInputElement | null>(null);
  const hostNameInputRef = useRef<HTMLInputElement | null>(null);
  const nameEditInputRef = useRef<HTMLInputElement | null>(null);

  // Sync state when playerName changes from outside
  useEffect(() => {
    if (playerName) {
      setTempName(playerName);
      if (!hostNameInput) setHostNameInput(playerName);
      if (!inputNickname) setInputNickname(playerName);
    }
  }, [playerName]);

  // Focus join input or host name input when drawer opens
  useEffect(() => {
    if (isDrawerOpen) {
      if (!isActualParty) {
        if (dockView === 'join' || drawerInitialFocusJoin) {
          setTimeout(() => {
            joinInputRef.current?.focus();
          }, 150);
        } else if (dockView === 'host-setup') {
          setTimeout(() => {
            hostNameInputRef.current?.focus();
          }, 150);
        }
      }
    }
  }, [isDrawerOpen, dockView, drawerInitialFocusJoin, isActualParty]);

  // Reset errors when closed
  useEffect(() => {
    if (!isDrawerOpen) {
      setJoinError(null);
      setHostSetupError(null);
      setEditingName(false);
    }
  }, [isDrawerOpen]);

  // Auto-focus name edit input when triggered
  useEffect(() => {
    if (editingName) {
      setTimeout(() => {
        nameEditInputRef.current?.focus();
        nameEditInputRef.current?.select();
      }, 50);
    }
  }, [editingName]);

  const handleCopyCode = async () => {
    if (!party.roomCode) return;
    soundFX.playSuccess();
    try {
      await navigator.clipboard.writeText(party.roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleHostCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = hostNameInput.trim();
    if (!cleanName) {
      setHostSetupError('Please enter your name to host a squad');
      soundFX.playVoltBuzz();
      hostNameInputRef.current?.focus();
      return;
    }

    setHostSetupError(null);
    hostNewParty(cleanName, serverVisibility);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) {
      setJoinError('Please enter a 4-6 character room code');
      soundFX.playVoltBuzz();
      return;
    }

    const success = joinPartyWithCode(inputCode, inputNickname);
    if (success) {
      setInputCode('');
      setJoinError(null);
    } else {
      setJoinError('Invalid room code. Try again.');
      soundFX.playVoltBuzz();
    }
  };

  const handleSaveName = () => {
    const clean = tempName.trim();
    if (clean && clean !== playerName) {
      updatePlayerName(clean);
      soundFX.playLockIn();
    }
    setEditingName(false);
  };

  if (!isDrawerOpen) return null;

  const currentMember = party.members.find((m) => m.id === party.currentUserId);
  const isGuestReady = currentMember ? currentMember.isReady : false;
  const readyCount = party.members.filter((m) => m.isReady).length;

  return (
    <>
      {/* Mobile Backdrop overlay to dismiss on tap */}
      <div
        onClick={closeDrawer}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden animate-in fade-in duration-200 pointer-events-auto"
      />

      {/* Non-modal persistent companion dock: pointer-events-none on outer container so background remains 100% interactive */}
      <aside
        aria-label="Party Companion Dock"
        className="fixed inset-y-0 right-0 z-40 pointer-events-none flex justify-end w-full md:w-auto select-none"
      >
        {/* Self-contained floating dock along the right edge with pointer-events-auto */}
        <div className="pointer-events-auto w-full sm:w-[360px] lg:w-[380px] h-full bg-[#090c13]/95 backdrop-blur-xl border-l border-white/15 shadow-[-16px_0_40px_rgba(0,0,0,0.85)] flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-300">
          {/* Subtle Ambient Top-Right Glow */}
          <div
            className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl opacity-20"
            style={{
              background: isActualParty
                ? 'radial-gradient(circle, #ccff00 0%, transparent 70%)'
                : 'radial-gradient(circle, #ff6b00 0%, transparent 70%)',
            }}
          />

          {/* ================= 1. DOCK HEADER ================= */}
          <div className="relative z-10 px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#0c101a]/90">
            {/* Left: Branding & Status */}
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                  isActualParty
                    ? 'bg-[#ccff00]/15 border-[#ccff00]/40 text-[#ccff00] shadow-[0_0_15px_rgba(204,255,0,0.25)]'
                    : 'bg-[#ff6b00]/15 border-[#ff6b00]/40 text-[#ff6b00] shadow-[0_0_15px_rgba(255,107,0,0.25)]'
                }`}
              >
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="font-display text-sm sm:text-base font-black uppercase tracking-wider text-white truncate">
                    {isActualParty ? 'SQUAD LOBBY' : 'PARTY HUB'}
                  </h2>
                  {wsConnected && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" title="Real-Time Server Connected" />
                  )}
                </div>
                <p className="text-[10px] sm:text-[11px] font-mono text-neutral-400 mt-0.5 truncate">
                  {isActualParty
                    ? party.isCurrentUserHost
                      ? 'Squad Host: Control & Launch'
                      : 'Connected: Waiting for Host'
                    : 'Assemble teammates or link up'}
                </p>
              </div>
            </div>

            {/* Right: Flush Player Counter Badge + Clean Single "X" Close Button */}
            <div className="flex items-center gap-2 shrink-0">
              {isActualParty && (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-[#ccff00]/15 text-[#ccff00] border border-[#ccff00]/40 shadow-[0_0_10px_rgba(204,255,0,0.15)] flex items-center gap-1">
                  <Radio className="w-3 h-3 text-[#ccff00] animate-pulse" />
                  <span>{party.members.length}/{party.maxSlots} SQUAD</span>
                </span>
              )}

              <button
                type="button"
                onClick={closeDrawer}
                className="min-w-[44px] min-h-[44px] rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Close Dock"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

        {/* ================= 2. DRAWER BODY ================= */}
        <div className="relative z-10 flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {isActualParty ? (
            /* ================= STATE A: ACTIVE LOBBY VIEW ================= */
            <>
              {/* BIG ROOM CODE CARD (HOST ONLY) OR SQUAD CONNECTION STATUS (GUEST ONLY) */}
              {party.isCurrentUserHost ? (
                <div className="relative rounded-2xl bg-gradient-to-br from-[#121724] to-[#0c101a] border border-white/15 p-4 shadow-xl overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-400">
                        SQUAD ROOM CODE
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold uppercase bg-white/10 text-neutral-300">
                        {party.visibility === 'public' ? 'PUBLIC' : 'PRIVATE'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={toggleCodeMask}
                        className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        title={party.isCodeMasked ? 'Reveal Room Code' : 'Hide Code (Streamer Safe)'}
                      >
                        {party.isCodeMasked ? (
                          <EyeOff className="w-3.5 h-3.5 text-[#ff6b00]" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
                        title="Copy Room Code"
                      >
                        {copiedCode ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">COPIED</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-neutral-400" />
                            <span>COPY</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-center py-2">
                    <span className="font-display text-4xl font-black tracking-widest text-[#ccff00] drop-shadow-[0_0_20px_rgba(204,255,0,0.35)] select-all">
                      {party.isCodeMasked ? '••••••' : party.roomCode}
                    </span>
                  </div>

                  <p className="text-[10px] font-mono text-center text-neutral-400">
                    {party.isCodeMasked
                      ? 'Code is masked for streamer safety. Click eye icon to reveal.'
                      : `Share with up to ${Math.max(0, party.maxSlots - party.members.length)} friends to join the party.`}
                  </p>
                </div>
              ) : (
                <div className="relative rounded-2xl bg-[#0e1320] border border-emerald-500/30 p-4 shadow-xl overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
                      <span className="font-mono text-xs font-black uppercase tracking-wider text-emerald-400">
                        🟢 IN SQUAD ({party.members.length}/{party.maxSlots}) : Host: {party.members.find((m) => m.isHost)?.name || 'Host'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] font-mono text-neutral-400 mt-2">
                    Room code is protected by your host. Connected and ready for match launch.
                  </p>
                </div>
              )}

              {/* SQUAD MEMBER ROSTER & SLOTS */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-neutral-400">
                    SQUAD ROSTER ({party.members.length}/{party.maxSlots})
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {readyCount} / {party.members.length} READY
                  </span>
                </div>

                <div className="space-y-2">
                  {/* Render active players */}
                  {party.members.map((member, idx) => {
                    const isMe = member.id === party.currentUserId;
                    return (
                      <div
                        key={member.id}
                        className={`rounded-xl border px-3.5 py-3 flex items-center justify-between gap-3 transition-all ${
                          member.isHost
                            ? 'bg-[#151c2a] border-[#ccff00]/30 shadow-[0_0_15px_rgba(204,255,0,0.08)]'
                            : 'bg-[#101420] border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Avatar Badge */}
                          <div
                            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                              member.isHost
                                ? 'bg-[#ccff00]/15 border-[#ccff00]/40 text-[#ccff00]'
                                : 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300'
                            }`}
                          >
                            {member.isHost ? (
                              <Crown className="w-4 h-4 fill-current" />
                            ) : (
                              <span className="font-mono text-xs font-black">#{idx + 1}</span>
                            )}
                          </div>

                          {/* Name & Role with Inline Editable Name for Current User */}
                          <div className="min-w-0 flex-1">
                            {isMe ? (
                              editingName ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    ref={nameEditInputRef}
                                    type="text"
                                    maxLength={16}
                                    value={tempName}
                                    onChange={(e) => setTempName(e.target.value.toUpperCase())}
                                    onBlur={handleSaveName}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveName();
                                      if (e.key === 'Escape') setEditingName(false);
                                    }}
                                    className="font-display text-xs sm:text-sm font-black uppercase text-white bg-black/60 border border-[#ccff00] rounded px-1.5 py-0.5 w-full focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={handleSaveName}
                                    className="p-1 rounded bg-[#ccff00]/20 text-[#ccff00] hover:bg-[#ccff00]/30 cursor-pointer shrink-0"
                                    title="Save name"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 group/name">
                                  <span className="font-display text-sm font-black uppercase text-white truncate">
                                    {member.name}
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold uppercase bg-[#ccff00]/20 text-[#ccff00] border border-[#ccff00]/30 shrink-0">
                                    YOU
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTempName(member.name);
                                      setEditingName(true);
                                    }}
                                    className="opacity-60 group-hover/name:opacity-100 p-0.5 hover:text-[#ccff00] transition-opacity cursor-pointer shrink-0"
                                    title="Click to edit your display callsign"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="font-display text-sm font-black uppercase text-white truncate">
                                  {member.name}
                                </span>
                              </div>
                            )}

                            <span className="text-[10px] font-mono text-neutral-400 block mt-0.5">
                              {member.isHost ? 'Host' : 'Squad Member'}
                            </span>
                          </div>
                        </div>

                        {/* Right: Ready Status / Kick Action */}
                        <div className="flex items-center gap-2 shrink-0">
                          {member.isReady ? (
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>READY</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-amber-500/15 border border-amber-500/40 text-amber-400">
                              <Clock className="w-3 h-3" />
                              <span>WAITING</span>
                            </span>
                          )}

                          {/* Host can kick non-host members */}
                          {party.isCurrentUserHost && !member.isHost && (
                            <button
                              type="button"
                              onClick={() => kickMember(member.id)}
                              className="p-1 rounded-lg hover:bg-rose-950/60 text-neutral-400 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Remove member"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Empty Slot Placeholders */}
                  {Array.from({ length: Math.max(0, party.maxSlots - party.members.length) }).map(
                    (_, i) => (
                      <div
                        key={`empty-slot-${i}`}
                        className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-3.5 py-2.5 flex items-center justify-between text-neutral-500"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl border border-dashed border-white/10 flex items-center justify-center">
                            <UserPlus className="w-3.5 h-3.5 text-neutral-600" />
                          </div>
                          <span className="text-xs font-mono uppercase tracking-wider text-neutral-500">
                            OPEN SQUAD SLOT
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-neutral-600 uppercase">
                          INVITE WITH CODE
                        </span>
                      </div>
                    )
                  )}

                  {/* Dynamic Capacity Expansion Button for Host (up to 8 slots) */}
                  {party.isCurrentUserHost && party.maxSlots < 8 && (
                    <button
                      type="button"
                      onClick={() => expandSlots(Math.min(8, party.maxSlots + 2))}
                      className="w-full py-2.5 rounded-xl border border-dashed border-[#ccff00]/30 hover:border-[#ccff00]/60 bg-[#ccff00]/5 hover:bg-[#ccff00]/10 text-[#ccff00] font-mono text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer hover:scale-[1.01] active:scale-95"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>+ EXPAND SQUAD SLOTS (TO {Math.min(8, party.maxSlots + 2)})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* GUEST PERMISSIONS ADVISORY BANNER */}
              {!party.isCurrentUserHost && (
                <div className="rounded-xl bg-amber-950/30 border border-amber-500/30 p-3 flex items-start gap-2.5">
                  <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] font-mono leading-relaxed text-amber-200">
                    <strong className="text-amber-300 font-bold uppercase block mb-0.5">
                      GUEST PERMISSIONS ACTIVE
                    </strong>
                    You can freely preview game mode setup screens. Only the Party Host can configure settings and launch matches for the squad.
                  </div>
                </div>
              )}
            </>
          ) : (
            /* ================= STATE B: NO ACTIVE PARTY VIEW (HOST SETUP & JOIN TABS) ================= */
            <>
              {/* Tab Selector: HOST SQUAD vs JOIN SQUAD */}
              <div className="flex rounded-xl bg-black/40 border border-white/10 p-1">
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick(600);
                    setDockView('host-setup');
                  }}
                  className={`flex-1 py-2 rounded-lg font-sans font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    dockView === 'host-setup'
                      ? 'bg-[#ccff00] text-black shadow-md shadow-[#ccff00]/20'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Crown className="w-3.5 h-3.5 fill-current" />
                  <span>HOST SQUAD</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick(600);
                    setDockView('join');
                  }}
                  className={`flex-1 py-2 rounded-lg font-sans font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    dockView === 'join'
                      ? 'bg-[#ff6b00] text-black shadow-md shadow-[#ff6b00]/20'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>JOIN SQUAD</span>
                </button>
              </div>

              {/* VIEW 1: HOST SQUAD SETUP SCREEN */}
              {dockView === 'host-setup' ? (
                <form onSubmit={handleHostCreateSubmit} className="space-y-4">
                  <div className="rounded-2xl bg-[#121724] border border-[#ccff00]/30 p-5 shadow-lg relative overflow-hidden">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-[#ccff00]/15 border border-[#ccff00]/40 flex items-center justify-center text-[#ccff00] shadow-[0_0_15px_rgba(204,255,0,0.25)]">
                        <Crown className="w-5 h-5 fill-current" />
                      </div>
                      <div>
                        <h3 className="font-display text-base font-black uppercase text-white">
                          HOST SQUAD SERVER
                        </h3>
                        <p className="text-[11px] font-mono text-neutral-400">
                          Set up your lobby and invite ballers
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-neutral-300 leading-relaxed mb-4">
                      As the host, you manage the squad, choose match modes, and launch games simultaneously for everyone.
                    </p>

                    {/* 1. Enter Your Name (Placeholder "Enter Name") */}
                    <div className="space-y-1.5 mb-4">
                      <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-300 block">
                        ENTER YOUR NAME
                      </label>
                      <input
                        ref={hostNameInputRef}
                        type="text"
                        maxLength={16}
                        value={hostNameInput}
                        onChange={(e) => {
                          setHostNameInput(e.target.value.toUpperCase());
                          if (hostSetupError) setHostSetupError(null);
                        }}
                        placeholder="Enter Name"
                        className="w-full h-11 px-4 rounded-xl bg-[#0a0d14] border border-white/15 focus:border-[#ccff00] text-white font-display font-black text-base sm:text-sm tracking-wider uppercase placeholder:text-neutral-500 placeholder:font-normal focus:outline-none transition-colors"
                      />
                      {hostSetupError && (
                        <div className="text-[11px] font-mono text-rose-400 bg-rose-950/40 border border-rose-500/30 rounded-lg px-3 py-1.5 mt-1.5">
                          {hostSetupError}
                        </div>
                      )}
                    </div>

                    {/* 2. Server Visibility Selection: Private or Public */}
                    <div className="space-y-2 mb-5">
                      <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-300 block">
                        SERVER VISIBILITY
                      </label>
                      <div className="grid grid-cols-2 gap-2.5">
                        {/* Private Server Option */}
                        <button
                          type="button"
                          onClick={() => {
                            soundFX.playClick(600);
                            setServerVisibility('private');
                          }}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                            serverVisibility === 'private'
                              ? 'bg-[#ccff00]/10 border-[#ccff00] shadow-[0_0_15px_rgba(204,255,0,0.2)]'
                              : 'bg-black/30 border-white/10 hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                              serverVisibility === 'private'
                                ? 'bg-[#ccff00]/20 text-[#ccff00]'
                                : 'bg-white/5 text-neutral-400'
                            }`}>
                              <Lock className="w-3.5 h-3.5" />
                            </div>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              serverVisibility === 'private'
                                ? 'border-[#ccff00] bg-[#ccff00] text-black'
                                : 'border-white/20'
                            }`}>
                              {serverVisibility === 'private' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                          </div>
                          <div>
                            <span className={`font-display text-xs font-black uppercase block ${
                              serverVisibility === 'private' ? 'text-[#ccff00]' : 'text-white'
                            }`}>
                              PRIVATE SERVER
                            </span>
                            <span className="text-[10px] font-mono text-neutral-400 block mt-0.5 leading-tight">
                              Invite code only
                            </span>
                          </div>
                        </button>

                        {/* Public Server Option */}
                        <button
                          type="button"
                          onClick={() => {
                            soundFX.playClick(600);
                            setServerVisibility('public');
                          }}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                            serverVisibility === 'public'
                              ? 'bg-[#ccff00]/10 border-[#ccff00] shadow-[0_0_15px_rgba(204,255,0,0.2)]'
                              : 'bg-black/30 border-white/10 hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                              serverVisibility === 'public'
                                ? 'bg-[#ccff00]/20 text-[#ccff00]'
                                : 'bg-white/5 text-neutral-400'
                            }`}>
                              <Globe className="w-3.5 h-3.5" />
                            </div>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              serverVisibility === 'public'
                                ? 'border-[#ccff00] bg-[#ccff00] text-black'
                                : 'border-white/20'
                            }`}>
                              {serverVisibility === 'public' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </div>
                          </div>
                          <div>
                            <span className={`font-display text-xs font-black uppercase block ${
                              serverVisibility === 'public' ? 'text-[#ccff00]' : 'text-white'
                            }`}>
                              PUBLIC SERVER
                            </span>
                            <span className="text-[10px] font-mono text-neutral-400 block mt-0.5 leading-tight">
                              Open to squad ballers
                            </span>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Create Button */}
                    <button
                      type="submit"
                      className="w-full py-3 rounded-xl bg-[#ccff00] hover:bg-[#d8ff33] text-black font-sans font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(204,255,0,0.35)] transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
                    >
                      <Zap className="w-4 h-4 fill-black" />
                      <span>CREATE SQUAD LOBBY</span>
                    </button>
                  </div>
                </form>
              ) : (
                /* VIEW 2: JOIN VIA ROOM CODE SCREEN */
                <form
                  onSubmit={handleJoinSubmit}
                  className="rounded-2xl bg-[#121724] border border-[#ff6b00]/30 p-5 shadow-lg space-y-3.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#ff6b00]/15 border border-[#ff6b00]/40 flex items-center justify-center text-[#ff6b00] shadow-[0_0_15px_rgba(255,107,0,0.25)]">
                      <UserPlus className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-display text-base font-black uppercase text-white">
                        JOIN VIA ROOM CODE
                      </h3>
                      <p className="text-[11px] font-mono text-neutral-400">
                        Enter code provided by your squad host
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                          ROOM CODE (4-6 CHARACTERS)
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            soundFX.playClick(600);
                            setIsCodeMaskedJoin((prev) => !prev);
                          }}
                          className="flex items-center gap-1 text-[10px] font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer"
                        >
                          {isCodeMaskedJoin ? (
                            <>
                              <EyeOff className="w-3 h-3 text-[#ff6b00]" />
                              <span>SHOW</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3 text-neutral-400" />
                              <span>HIDE</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          ref={joinInputRef}
                          type={isCodeMaskedJoin ? 'password' : 'text'}
                          maxLength={8}
                          value={inputCode}
                          onChange={(e) => {
                            setInputCode(e.target.value.toUpperCase());
                            if (joinError) setJoinError(null);
                          }}
                          placeholder={isCodeMaskedJoin ? '••••••' : 'ROOM CODE'}
                          className="w-full h-11 px-4 rounded-xl bg-[#0a0d14] border border-white/15 focus:border-[#ff6b00] text-white font-mono font-black text-center text-base uppercase tracking-widest focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1">
                        YOUR CALLSIGN / NICKNAME
                      </label>
                      <input
                        type="text"
                        maxLength={16}
                        value={inputNickname}
                        onChange={(e) => setInputNickname(e.target.value.toUpperCase())}
                        placeholder="ENTER NAME"
                        className="w-full h-11 px-4 rounded-xl bg-[#0a0d14] border border-white/10 focus:border-[#ff6b00] text-white font-sans text-base sm:text-xs placeholder:text-neutral-500 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  {joinError && (
                    <div className="text-[11px] font-mono text-rose-400 bg-rose-950/40 border border-rose-500/30 rounded-lg px-3 py-1.5">
                      {joinError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-[#ff6b00] hover:bg-[#ff7b1a] text-black font-sans font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,107,0,0.35)] transition-all cursor-pointer hover:scale-[1.02] active:scale-95"
                  >
                    <span>JOIN PARTY NOW</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        {/* ================= 3. DRAWER FOOTER ================= */}
        {isActualParty && (
          <div className="relative z-10 px-5 py-4 border-t border-white/10 bg-[#0c101a]/95 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
            {/* Ready Up Toggle for Guest / Status for Host */}
            {!party.isCurrentUserHost ? (
              <button
                type="button"
                onClick={toggleReady}
                className={`flex-1 py-3 rounded-xl font-sans font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                  isGuestReady
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/25'
                    : 'bg-[#ccff00] hover:bg-[#d8ff33] text-black shadow-[#ccff00]/25'
                }`}
              >
                {isGuestReady ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>YOU ARE READY!</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>READY UP</span>
                  </>
                )}
              </button>
            ) : (
              <div className="flex-1 text-left min-w-0">
                <span className="text-[10px] font-mono uppercase text-neutral-400 block truncate">
                  HOST CONTROLS
                </span>
                <span className="text-[11px] font-mono font-bold text-[#ccff00] truncate block">
                  Select game mode on hub to launch
                </span>
              </div>
            )}

            {/* Leave / Disband Button */}
            <button
              type="button"
              onClick={leaveParty}
              className="px-3.5 py-3 rounded-xl bg-white/5 hover:bg-rose-950/40 border border-white/10 hover:border-rose-500/40 text-neutral-300 hover:text-rose-300 font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              title={party.isCurrentUserHost ? 'Disband Squad' : 'Leave Squad'}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{party.isCurrentUserHost ? 'DISBAND' : 'LEAVE'}</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  </>
  );
};
