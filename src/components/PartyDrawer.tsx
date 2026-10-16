import React, { useState, useEffect, useRef } from 'react';
import { useParty } from '../context/PartyContext';
import { soundFX } from '../utils/audio';
import { GuestNotice, OptionTile } from './setup/SetupKit';
import {
  X,
  Crown,
  Check,
  Copy,
  Eye,
  EyeOff,
  UserPlus,
  LogOut,
  Sparkles,
  Zap,
  ArrowRight,
  UserMinus,
  CheckCircle2,
  Clock,
  Edit2,
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

  const accent = !isActualParty && dockView === 'join' ? '#ff6b00' : '#ccff00';
  const fieldClass =
    'w-full h-11 px-3 rounded-lg bg-black/40 border border-white/10 focus:border-[color:var(--acc-line)] focus:ring-1 focus:ring-[color:var(--acc-soft)] text-white placeholder:text-slate-600 placeholder:font-normal focus:outline-none transition-colors select-text';
  const label = (index: string, text: React.ReactNode) => (
    <span className="font-mono text-[10px] font-bold tracking-[0.22em] uppercase text-slate-300">
      <span style={{ color: 'var(--acc)' }}>{index}</span> {text}
    </span>
  );

  return (
    <>
      {/* Mobile Backdrop overlay to dismiss on tap */}
      <div
        onClick={closeDrawer}
        className="bc-overlay fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden pointer-events-auto"
      />

      {/* Non-modal persistent companion dock: pointer-events-none on outer container so background remains 100% interactive */}
      <aside
        aria-label="Party Companion Dock"
        className="fixed inset-y-0 right-0 z-40 pointer-events-none flex justify-end w-full md:w-auto select-none"
      >
        <div
          style={{ ['--acc' as string]: accent } as React.CSSProperties}
          className="bc-scope pointer-events-auto relative w-full sm:w-[360px] lg:w-[380px] h-full bg-gradient-to-b from-[#10131b] to-[#0a0d13] border-l border-white/[0.08] shadow-[-24px_0_60px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden animate-in slide-in-from-right duration-300"
        >
          <div className="bc-rail absolute inset-x-0 top-0 h-[2px] z-20" />
          <div className="bc-sheen absolute inset-x-0 top-0 h-40 pointer-events-none" />

          {/* ================= 1. DOCK HEADER ================= */}
          <div className="relative z-10 px-5 pt-5 pb-4 border-b border-white/[0.07] flex items-start justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.22em] uppercase">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]' : 'bg-slate-600'}`}
                  title={wsConnected ? 'Real-Time Server Connected' : 'Connecting...'}
                />
                <span style={{ color: 'var(--acc)' }}>
                  {isActualParty ? (party.isCurrentUserHost ? 'Host controls' : 'Connected') : 'Party hub'}
                </span>
              </div>
              <h2 className="mt-1.5 font-athletic italic font-black text-[34px] uppercase text-white leading-[0.9] tracking-tight">
                {isActualParty ? 'Squad lobby' : dockView === 'join' ? 'Join a squad' : 'Host a squad'}
              </h2>
              <p className="mt-1.5 text-[12px] text-slate-400 leading-snug">
                {isActualParty
                  ? party.isCurrentUserHost
                    ? 'Pick a game on the hub to launch for everyone.'
                    : 'Waiting for the host to launch a game.'
                  : 'Assemble teammates or link up with a code.'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isActualParty && (
                <span className="h-9 px-2.5 rounded-lg border border-[color:var(--acc-line)] bg-[color:var(--acc-soft)] inline-flex items-center font-mono text-[11px] font-black tracking-[0.12em] text-white">
                  {party.members.length}/{party.maxSlots}
                </span>
              )}
              <button
                type="button"
                onClick={closeDrawer}
                className="bc-btn bc-btn-ghost w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer"
                title="Close Dock"
                aria-label="Close party dock"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ================= 2. DRAWER BODY ================= */}
          <div className="relative z-10 flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
            {isActualParty ? (
              /* ================= STATE A: ACTIVE LOBBY VIEW ================= */
              <>
                {party.isCurrentUserHost ? (
                  /* Room code (host only) */
                  <div className="rounded-xl border border-white/[0.08] bg-black/30 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.22em] uppercase text-slate-400">
                        Room code
                        <span className="px-1.5 py-0.5 rounded bg-white/[0.06] text-[9px] tracking-[0.16em] text-slate-300 inline-flex items-center gap-1">
                          {party.visibility === 'public' ? <Globe className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                          {party.visibility === 'public' ? 'PUBLIC' : 'PRIVATE'}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={toggleCodeMask}
                          className="bc-btn bc-btn-ghost w-8 h-8 rounded-md flex items-center justify-center cursor-pointer"
                          title={party.isCodeMasked ? 'Reveal Room Code' : 'Hide Code (Streamer Safe)'}
                        >
                          {party.isCodeMasked ? <EyeOff className="w-3.5 h-3.5 text-[#ff6b00]" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={handleCopyCode}
                          className="bc-btn bc-btn-ghost h-8 px-2.5 rounded-md inline-flex items-center gap-1.5 font-mono text-[10px] font-black tracking-[0.14em] cursor-pointer"
                          title="Copy Room Code"
                        >
                          {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span className={copiedCode ? 'text-emerald-400' : ''}>{copiedCode ? 'COPIED' : 'COPY'}</span>
                        </button>
                      </span>
                    </div>
                    <div
                      className="mt-3 text-center font-athletic italic font-black text-6xl leading-none tracking-[0.12em] select-all"
                      style={{ color: 'var(--acc)', textShadow: '0 0 28px color-mix(in srgb, var(--acc) 35%, transparent)' }}
                    >
                      {party.isCodeMasked ? '••••••' : party.roomCode}
                    </div>
                    <p className="mt-3 text-center text-[11px] text-slate-500">
                      {party.isCodeMasked
                        ? 'Masked for streamer safety. Tap the eye to reveal.'
                        : `Share it: room for ${Math.max(0, party.maxSlots - party.members.length)} more.`}
                    </p>
                  </div>
                ) : (
                  /* Connection status (guest only) */
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
                    <span className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.22em] uppercase text-emerald-300">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="bc-radar absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                      </span>
                      In squad · {party.members.length}/{party.maxSlots}
                    </span>
                    <p className="mt-2 text-[13px] text-slate-300">
                      Host: <span className="font-bold text-white">{party.members.find((m) => m.isHost)?.name || 'Host'}</span>
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">The room code stays with your host.</p>
                  </div>
                )}

                {/* SQUAD MEMBER ROSTER & SLOTS */}
                <section className="flex flex-col gap-2.5">
                  <div className="flex items-baseline justify-between">
                    {label('01', 'Roster')}
                    <span className="font-mono text-[10px] tracking-[0.14em] text-slate-500">
                      {readyCount}/{party.members.length} READY
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {party.members.map((member, idx) => {
                      const isMe = member.id === party.currentUserId;
                      return (
                        <div
                          key={member.id}
                          className={`rounded-lg border px-3 py-2.5 flex items-center justify-between gap-3 ${
                            member.isHost ? 'border-[color:var(--acc-line)] bg-[color:var(--acc-soft)]' : 'border-white/[0.08] bg-white/[0.02]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div
                              className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 font-mono text-[11px] font-black ${
                                member.isHost ? 'bg-[color:var(--acc)] text-black' : 'bg-white/[0.06] text-slate-300'
                              }`}
                            >
                              {member.isHost ? <Crown className="w-4 h-4" /> : String(idx + 1).padStart(2, '0')}
                            </div>

                            <div className="min-w-0 flex-1">
                              {isMe && editingName ? (
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
                                    className="w-full h-8 px-2 rounded-md bg-black/50 border border-[color:var(--acc-line)] font-athletic italic font-black text-lg uppercase text-white focus:outline-none select-text"
                                  />
                                  <button
                                    type="button"
                                    onClick={handleSaveName}
                                    className="bc-btn bc-btn-primary w-8 h-8 rounded-md flex items-center justify-center shrink-0 cursor-pointer"
                                    title="Save name"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 min-w-0 group/name">
                                  <span className="font-athletic italic font-black text-lg uppercase text-white leading-none truncate">
                                    {member.name}
                                  </span>
                                  {isMe && (
                                    <>
                                      <span className="px-1 py-px rounded-sm font-mono text-[8px] font-black tracking-[0.14em] bg-white/10 text-slate-200 shrink-0">
                                        YOU
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setTempName(member.name);
                                          setEditingName(true);
                                        }}
                                        className="p-0.5 text-slate-500 hover:text-white opacity-70 group-hover/name:opacity-100 transition-opacity cursor-pointer shrink-0"
                                        title="Click to edit your display callsign"
                                        aria-label="Edit your name"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                              <span className="block mt-1 font-mono text-[9px] tracking-[0.18em] uppercase text-slate-500">
                                {member.isHost ? 'Host' : 'Squad member'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {member.isReady ? (
                              <span className="h-6 px-2 rounded-md inline-flex items-center gap-1 font-mono text-[9px] font-black tracking-[0.14em] bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
                                <CheckCircle2 className="w-3 h-3" />
                                READY
                              </span>
                            ) : (
                              <span className="h-6 px-2 rounded-md inline-flex items-center gap-1 font-mono text-[9px] font-black tracking-[0.14em] bg-amber-500/10 border border-amber-500/35 text-amber-300">
                                <Clock className="w-3 h-3" />
                                WAITING
                              </span>
                            )}
                            {party.isCurrentUserHost && !member.isHost && (
                              <button
                                type="button"
                                onClick={() => kickMember(member.id)}
                                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-red-300 hover:bg-red-500/15 transition-colors cursor-pointer"
                                title="Remove member"
                                aria-label={`Remove ${member.name}`}
                              >
                                <UserMinus className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Empty Slot Placeholders */}
                    {Array.from({ length: Math.max(0, party.maxSlots - party.members.length) }).map((_, i) => (
                      <div
                        key={`empty-slot-${i}`}
                        className="rounded-lg border border-dashed border-white/[0.08] px-3 py-2 flex items-center gap-3 text-slate-600"
                      >
                        <div className="w-8 h-8 rounded-md border border-dashed border-white/10 flex items-center justify-center">
                          <UserPlus className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-mono text-[10px] tracking-[0.18em] uppercase">Open slot</span>
                      </div>
                    ))}

                    {/* Dynamic Capacity Expansion Button for Host (up to 8 slots) */}
                    {party.isCurrentUserHost && party.maxSlots < 8 && (
                      <button
                        type="button"
                        onClick={() => expandSlots(Math.min(8, party.maxSlots + 2))}
                        className="bc-btn mt-1 h-10 rounded-lg border border-dashed border-[color:var(--acc-line)] bg-[color:var(--acc-soft)] inline-flex items-center justify-center gap-2 font-mono text-[10px] font-black tracking-[0.16em] uppercase text-white cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" style={{ color: 'var(--acc)' }} />
                        Add slots (to {Math.min(8, party.maxSlots + 2)})
                      </button>
                    )}
                  </div>
                </section>

                {/* GUEST PERMISSIONS ADVISORY */}
                {!party.isCurrentUserHost && (
                  <GuestNotice>Preview any setup screen. Only the host can change settings and launch.</GuestNotice>
                )}
              </>
            ) : (
              /* ================= STATE B: NO ACTIVE PARTY VIEW (HOST SETUP & JOIN TABS) ================= */
              <>
                {/* Tab Selector: HOST SQUAD vs JOIN SQUAD */}
                <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-white/[0.08] bg-black/30 p-1">
                  {[
                    { view: 'host-setup' as const, text: 'Host', icon: Crown },
                    { view: 'join' as const, text: 'Join', icon: UserPlus },
                  ].map(({ view, text, icon: Icon }) => (
                    <button
                      key={view}
                      type="button"
                      aria-pressed={dockView === view}
                      onClick={() => {
                        soundFX.playClick(600);
                        setDockView(view);
                      }}
                      className={`bc-btn h-9 rounded-md inline-flex items-center justify-center gap-1.5 font-mono text-[11px] font-black tracking-[0.16em] uppercase cursor-pointer ${
                        dockView === view ? 'bc-btn-primary' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {text}
                    </button>
                  ))}
                </div>

                {dockView === 'host-setup' ? (
                  /* VIEW 1: HOST SQUAD SETUP SCREEN */
                  <form onSubmit={handleHostCreateSubmit} className="flex flex-col gap-5">
                    <p className="text-[13px] text-slate-400 leading-snug">
                      As host you pick the games and launch them for everyone at once.
                    </p>

                    <label className="flex flex-col gap-2">
                      {label('01', 'Your name')}
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
                        className={`${fieldClass} font-mono font-black text-base sm:text-sm tracking-[0.14em] uppercase`}
                      />
                      {hostSetupError && <span className="text-[11px] text-red-300">{hostSetupError}</span>}
                    </label>

                    <div className="flex flex-col gap-2">
                      {label('02', 'Server visibility')}
                      <div className="grid grid-cols-2 gap-2">
                        <OptionTile
                          selected={serverVisibility === 'private'}
                          onClick={() => {
                            soundFX.playClick(600);
                            setServerVisibility('private');
                          }}
                          icon={Lock}
                          title="Private"
                          sub="Invite code only"
                        />
                        <OptionTile
                          selected={serverVisibility === 'public'}
                          onClick={() => {
                            soundFX.playClick(600);
                            setServerVisibility('public');
                          }}
                          icon={Globe}
                          title="Public"
                          sub="Open to squad ballers"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="bc-btn bc-btn-primary h-11 rounded-lg inline-flex items-center justify-center gap-2 font-mono text-[11px] font-black tracking-[0.16em] uppercase cursor-pointer"
                    >
                      <Zap className="w-4 h-4" />
                      Create squad lobby
                    </button>
                  </form>
                ) : (
                  /* VIEW 2: JOIN VIA ROOM CODE SCREEN */
                  <form onSubmit={handleJoinSubmit} className="flex flex-col gap-5">
                    <p className="text-[13px] text-slate-400 leading-snug">Enter the code your squad host shared.</p>

                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        {label('01', 'Room code')}
                        <button
                          type="button"
                          onClick={() => {
                            soundFX.playClick(600);
                            setIsCodeMaskedJoin((prev) => !prev);
                          }}
                          className="inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-[0.14em] text-slate-400 hover:text-white cursor-pointer"
                        >
                          {isCodeMaskedJoin ? <EyeOff className="w-3 h-3 text-[#ff6b00]" /> : <Eye className="w-3 h-3" />}
                          {isCodeMaskedJoin ? 'SHOW' : 'HIDE'}
                        </button>
                      </div>
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
                        className={`${fieldClass} h-14 text-center font-athletic italic font-black text-3xl tracking-[0.3em] uppercase`}
                      />
                    </div>

                    <label className="flex flex-col gap-2">
                      {label('02', 'Your callsign')}
                      <input
                        type="text"
                        maxLength={16}
                        value={inputNickname}
                        onChange={(e) => setInputNickname(e.target.value.toUpperCase())}
                        placeholder="ENTER NAME"
                        className={`${fieldClass} font-mono font-black text-base sm:text-sm tracking-[0.14em] uppercase`}
                      />
                    </label>

                    {joinError && <span className="-mt-2 text-[11px] text-red-300">{joinError}</span>}

                    <button
                      type="submit"
                      className="bc-btn bc-btn-primary h-11 rounded-lg inline-flex items-center justify-center gap-2 font-mono text-[11px] font-black tracking-[0.16em] uppercase cursor-pointer"
                    >
                      Join squad
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                )}
              </>
            )}
          </div>

          {/* ================= 3. DRAWER FOOTER ================= */}
          {isActualParty && (
            <div className="relative z-10 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-white/[0.07] bg-black/30 flex items-center gap-2 shrink-0">
              {!party.isCurrentUserHost ? (
                <button
                  type="button"
                  onClick={toggleReady}
                  style={isGuestReady ? ({ ['--acc' as string]: '#34d399' } as React.CSSProperties) : undefined}
                  className="bc-scope bc-btn bc-btn-primary flex-1 h-11 rounded-lg inline-flex items-center justify-center gap-2 font-mono text-[11px] font-black tracking-[0.16em] uppercase cursor-pointer"
                >
                  {isGuestReady ? <Check className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                  {isGuestReady ? "You're ready" : 'Ready up'}
                </button>
              ) : (
                <div className="flex-1 min-w-0">
                  <span className="block font-mono text-[9px] tracking-[0.2em] uppercase text-slate-500">Host controls</span>
                  <span className="block text-[12px] font-bold truncate" style={{ color: 'var(--acc)' }}>
                    Pick a game on the hub to launch
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={leaveParty}
                className="bc-btn h-11 px-3.5 rounded-lg inline-flex items-center gap-1.5 border border-red-500/40 text-red-300 hover:bg-red-500 hover:text-white hover:border-red-500 font-mono text-[11px] font-black tracking-[0.14em] cursor-pointer shrink-0"
                title={party.isCurrentUserHost ? 'Disband Squad' : 'Leave Squad'}
              >
                <LogOut className="w-3.5 h-3.5" />
                {party.isCurrentUserHost ? 'DISBAND' : 'LEAVE'}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
