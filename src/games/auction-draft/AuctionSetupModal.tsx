import React, { useState } from 'react';
import { FORMATION_PRESETS } from './formations';
import type { FormationId, MatchConfig, LeagueDeckId } from './types';
import { soundFX } from '../../utils/audio';
import { Users, Bot, Zap, X, Play } from 'lucide-react';
import { useParty } from '../../context/PartyContext';

interface AuctionSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEnterArena: (config: MatchConfig) => void;
  initialMode?: 'solo' | 'host' | 'join';
}

const LEAGUE_DECKS: Array<{
  id: LeagueDeckId;
  name: string;
  tag: string;
  description: string;
}> = [
  {
    id: 'global',
    name: 'GLOBAL ALL-STARS',
    tag: 'ALL ERAS',
    description: 'All leagues, eras, and world icons.',
  },
  {
    id: 'premier-league',
    name: 'PREMIER LEAGUE',
    tag: 'ENG',
    description: 'Icons and stars across all Premier League history.',
  },
  {
    id: 'la-liga',
    name: 'LA LIGA',
    tag: 'ESP',
    description: 'Spanish top-flight legends and modern standouts.',
  },
  {
    id: 'serie-a',
    name: 'SERIE A',
    tag: 'ITA',
    description: 'Italian league icons and historic greats.',
  },
  {
    id: 'bundesliga',
    name: 'BUNDESLIGA',
    tag: 'GER',
    description: 'German top-flight legends and title winners.',
  },
];

export const AuctionSetupModal: React.FC<AuctionSetupModalProps> = ({
  isOpen,
  onClose,
  onEnterArena,
}) => {
  const [selectedFormation, setSelectedFormation] = useState<FormationId>('balanced-1-1-2-1');
  const [selectedDeck, setSelectedDeck] = useState<LeagueDeckId>('global');

  const { party, triggerSoloEscapeHatch, openDrawer, joinQueue, launchMatch } = useParty();
  const isGuestInParty = party.isActive && !party.isCurrentUserHost;
  const isSquadReady = party.isActive && party.members.length === 2;

  if (!isOpen) return null;

  const handleLaunchSolo = () => {
    soundFX.playClick(1000);
    const startSolo = () => {
      onEnterArena({
        formationId: selectedFormation,
        deckId: selectedDeck,
        mode: 'solo',
        roomCode: 'SOLO_AI',
        isRoomCodeMasked: true,
      });
    };

    if (isGuestInParty) {
      triggerSoloEscapeHatch(startSolo);
      return;
    }
    startSolo();
  };

  const handleQuickMatch = () => {
    soundFX.playClick(850);
    onClose();
    joinQueue('auction-draft', 'duel');
  };

  const handleSquadAction = () => {
    if (isSquadReady) {
      soundFX.playHammer();
      const config: MatchConfig = {
        formationId: selectedFormation,
        deckId: selectedDeck,
        mode: 'host',
        roomCode: party.roomCode,
        isRoomCodeMasked: party.isCodeMasked,
        isMultiplayer: true,
      };
      launchMatch('auction-draft', config);
      onEnterArena(config);
    } else {
      soundFX.playClick(750);
      onClose();
      openDrawer();
    }
  };

  return (
    <div
      onClick={() => {
        soundFX.playClick(500);
        onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-hidden select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl bg-[#0e111a] border border-white/10 rounded-2xl px-5 py-4 md:px-7 md:py-5 shadow-[0_30px_90px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.12)] flex flex-col justify-between gap-4 overflow-hidden"
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ccff00] animate-pulse shadow-[0_0_10px_rgba(204,255,0,0.8)]" />
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-sans font-black text-xl md:text-2xl text-white uppercase tracking-tight leading-none">
                  $20 AUCTION DRAFT
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#ccff00]/15 border border-[#ccff00]/40 text-[#ccff00] font-mono text-[10px] font-bold tracking-wider uppercase">
                  1v1 DUEL
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400 mt-1">
                Out-bid and out-think your opponent across 5 high-stakes rounds.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. FORMATION PRESET */}
        <div className="flex flex-col gap-2 shrink-0">
          <label className="text-xs font-mono text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span className="text-[#ccff00]">01.</span> ROSTER FORMATION
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {Object.values(FORMATION_PRESETS).map((formation) => {
              const isSelected = selectedFormation === formation.id;
              return (
                <div
                  key={formation.id}
                  onClick={() => {
                    soundFX.playClick(700);
                    setSelectedFormation(formation.id);
                  }}
                  className={`p-3 rounded-xl cursor-pointer transition-all duration-200 border flex flex-col justify-between gap-1 ${
                    isSelected
                      ? 'bg-[#181e2b] border-[#ccff00] ring-1 ring-[#ccff00] shadow-[0_0_16px_rgba(204,255,0,0.2)]'
                      : 'bg-[#12151e] border-white/10 hover:border-white/20 hover:bg-[#151924]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-black text-xs text-white uppercase tracking-tight">
                      {formation.name}
                    </span>
                    {isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ccff00] shadow-[0_0_6px_#ccff00]" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
                    <span>{formation.slots.join(' • ')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. LEAGUE DECK */}
        <div className="flex flex-col gap-2 shrink-0">
          <label className="text-xs font-mono text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span className="text-[#00f0ff]">02.</span> LEAGUE CARD POOL
          </label>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
            {LEAGUE_DECKS.map((deck) => {
              const isSelected = selectedDeck === deck.id;
              return (
                <div
                  key={deck.id}
                  onClick={() => {
                    soundFX.playClick(650);
                    setSelectedDeck(deck.id);
                  }}
                  className={`p-2.5 rounded-xl cursor-pointer transition-all duration-200 border flex flex-col justify-between gap-1 ${
                    isSelected
                      ? 'bg-[#181e2b] border-[#00f0ff] ring-1 ring-[#00f0ff] shadow-[0_0_16px_rgba(0,240,255,0.2)]'
                      : 'bg-[#12151e] border-white/10 hover:border-white/20 hover:bg-[#151924]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-white/5 text-slate-400">
                      {deck.tag}
                    </span>
                    {isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00f0ff] shadow-[0_0_6px_#00f0ff]" />
                    )}
                  </div>
                  <span className="font-sans font-black text-xs text-white uppercase tracking-tight">
                    {deck.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. GAME PATHWAYS */}
        <div className="space-y-2.5 pt-3 border-t border-white/10 shrink-0">
          <label className="text-[11px] font-mono text-slate-400 font-bold uppercase tracking-wider block">
            CHOOSE MATCH PATHWAY
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Pathway 1: Solo vs AI */}
            <button
              type="button"
              onClick={handleLaunchSolo}
              className="py-3 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/15 hover:border-[#ccff00]/40 text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer group"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-[#ccff00]" />
                  <span className="font-sans font-black text-xs text-white uppercase tracking-wide group-hover:text-[#ccff00]">
                    SOLO VS THE GAFFER
                  </span>
                </div>
                <Play className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#ccff00]" />
              </div>
              <p className="text-[11px] font-mono text-slate-400 leading-snug">
                Instant match against tactical AI with dynamic bidding psychology.
              </p>
            </button>

            {/* Pathway 2: 1v1 Quick Match (Drop-In) */}
            <button
              type="button"
              onClick={handleQuickMatch}
              className="py-3 px-4 rounded-xl bg-[#ccff00]/10 hover:bg-[#ccff00]/20 border border-[#ccff00]/40 hover:border-[#ccff00] text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer group"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-[#ccff00] fill-current" />
                  <span className="font-sans font-black text-xs text-[#ccff00] uppercase tracking-wide">
                    1v1 QUICK MATCH
                  </span>
                </div>
                <span className="text-[9px] font-mono font-bold bg-[#ccff00]/20 px-1.5 py-0.5 rounded text-[#ccff00]">
                  &lt;10s
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-300 leading-snug">
                Online drop-in queue. Pairs with active ballers or automated bot at 10s.
              </p>
            </button>

            {/* Pathway 3: Play with Squad */}
            <button
              type="button"
              onClick={handleSquadAction}
              className={`py-3 px-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer group ${
                isSquadReady
                  ? 'bg-amber-500/15 border-amber-400/50 hover:bg-amber-500/25'
                  : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.06]'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span className="font-sans font-black text-xs text-white uppercase tracking-wide">
                    {isSquadReady ? 'LAUNCH WITH SQUAD' : 'PLAY WITH SQUAD'}
                  </span>
                </div>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
                  {isSquadReady ? '2/2 SQUAD' : 'PARTY DOCK'}
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 leading-snug">
                {isSquadReady
                  ? 'Squad is ready. Click to launch both players into the live auction.'
                  : 'Open the right slide-over Party Dock to invite or duel a friend.'}
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const LaunchpadModal = AuctionSetupModal;
