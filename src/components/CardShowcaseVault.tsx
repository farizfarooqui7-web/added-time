import React, { useState } from 'react';
import type { PlayerEraCardExtended, PositionCategory } from '../types';
import { EraPlayerCard } from './EraPlayerCard';
import { soundFX } from '../utils/audio';
import { SlidersHorizontal, Search, Rotate3d, CheckCircle2, X } from 'lucide-react';

interface CardShowcaseVaultProps {
  cards: PlayerEraCardExtended[];
  onClose?: () => void;
}

export const CardShowcaseVault: React.FC<CardShowcaseVaultProps> = ({ cards, onClose }) => {
  const [selectedPosition, setSelectedPosition] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [comparisonMode, setComparisonMode] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string>(cards[0].id);

  const filteredCards = cards.filter((card) => {
    const matchesSearch =
      card.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.club.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.campaignTag?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedPosition === 'ALL') return true;
    if (selectedPosition === 'DUAL') return card.positions.length > 1;
    return card.positions.includes(selectedPosition as PositionCategory);
  });

  const neymarBarca = cards.find((c) => c.id === 'neymar-2014-15')!;
  const neymarPsg = cards.find((c) => c.id === 'neymar-2018-19')!;
  const ronaldoUtd = cards.find((c) => c.id === 'ronaldo-2007-08')!;
  const ronaldoReal = cards.find((c) => c.id === 'ronaldo-2011-12')!;

  return (
    <section id="vault" className="w-full py-8 border-t border-neutral-800">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 pb-4 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 bg-[#fbbf24] rounded-none inline-block" />
            <span className="font-mono text-[11px] font-bold text-[#fbbf24] uppercase tracking-wider">
              COLLECTOR'S VAULT
            </span>
          </div>
          <h2 className="font-athletic font-black text-3xl sm:text-5xl text-white uppercase tracking-tight">
            ERA COLLECTIBLE CARDS
          </h2>
          <p className="text-xs text-neutral-400 font-sans mt-1">
            Physical trading cards with era variants and 4 squad categories: <strong className="text-white">[ GK ]</strong>, <strong className="text-white">[ DEF ]</strong>, <strong className="text-white">[ MID ]</strong>, <strong className="text-white">[ ATK ]</strong>.
          </p>
        </div>

        {/* Compare Eras Trigger & Optional Close */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick(800);
              setComparisonMode(!comparisonMode);
            }}
            className={`flex items-center gap-2 px-3.5 py-2 font-athletic font-bold uppercase text-sm border transition ${
              comparisonMode
                ? 'bg-[#fbbf24] text-black border-[#fbbf24]'
                : 'bg-[#12151e] text-neutral-300 border-neutral-700 hover:border-white'
            }`}
          >
            <Rotate3d className="w-4 h-4" />
            <span>[ {comparisonMode ? 'EXIT COMPARISON' : 'COMPARE ERAS'} ]</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={() => {
                soundFX.playClick(500);
                onClose();
              }}
              className="p-2 bg-[#12151e] border border-neutral-700 hover:border-white text-neutral-300 hover:text-white transition"
              title="Close Vault"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ERA COMPARISON SHOWCASE (Head-to-head era variants) */}
      {comparisonMode && (
        <div className="mb-8 bg-[#0b0e14] border border-[#fbbf24]/50 p-6">
          <div className="flex items-center justify-between pb-3 mb-6 border-b border-neutral-800">
            <span className="font-mono text-xs font-bold text-[#fbbf24] uppercase tracking-wider">
              HEAD-TO-HEAD ERA VARIANT COMPARISON
            </span>
            <span className="text-xs font-mono text-neutral-400">
              PHYSICAL COLLECTIBLES
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Pair 1: Neymar Barça vs PSG */}
            <div className="bg-[#12151e] border border-neutral-800 p-4">
              <h4 className="font-athletic font-black text-xl text-white uppercase text-center pb-3 mb-4 border-b border-neutral-800">
                NEYMAR JR: TREBLE VS PARC DES PRINCES
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <EraPlayerCard {...neymarBarca} interactive={true} />
                  <div className="mt-3 p-2 bg-[#080a0f] border border-neutral-800 text-[11px] font-mono text-center">
                    <span className="text-[#ccff00] font-bold block">39 GOALS</span>
                    <span className="text-neutral-400">MSN TREBLE</span>
                  </div>
                </div>

                <div>
                  <EraPlayerCard {...neymarPsg} interactive={true} />
                  <div className="mt-3 p-2 bg-[#080a0f] border border-neutral-800 text-[11px] font-mono text-center">
                    <span className="text-[#00f0ff] font-bold block">23 GOALS / 13 AST</span>
                    <span className="text-neutral-400">PRIME PLAYMAKER</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pair 2: Ronaldo Utd vs Real Madrid */}
            <div className="bg-[#12151e] border border-neutral-800 p-4">
              <h4 className="font-athletic font-black text-xl text-white uppercase text-center pb-3 mb-4 border-b border-neutral-800">
                C. RONALDO: OLD TRAFFORD VS BERNABÉU 100 PTS
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <EraPlayerCard {...ronaldoUtd} interactive={true} />
                  <div className="mt-3 p-2 bg-[#080a0f] border border-neutral-800 text-[11px] font-mono text-center">
                    <span className="text-[#ccff00] font-bold block">42 GOALS</span>
                    <span className="text-neutral-400">BALLON D'OR DOUBLE</span>
                  </div>
                </div>

                <div>
                  <EraPlayerCard {...ronaldoReal} interactive={true} />
                  <div className="mt-3 p-2 bg-[#080a0f] border border-neutral-800 text-[11px] font-mono text-center">
                    <span className="text-[#fbbf24] font-bold block">60 GOALS</span>
                    <span className="text-neutral-400">100-POINT LA LIGA</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-[#12151e] border border-neutral-800 p-3.5 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Position Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase text-neutral-400 mr-1.5 flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3 text-[#00f0ff]" />
            POSITION:
          </span>

          {[
            { id: 'ALL', label: 'ALL BALLERS' },
            { id: 'GK', label: '[ GK ]' },
            { id: 'DEF', label: '[ DEF ]' },
            { id: 'MID', label: '[ MID ]' },
            { id: 'ATK', label: '[ ATK ]' },
            { id: 'DUAL', label: '[ DUAL: MID/ATK ]' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                soundFX.playClick(600);
                setSelectedPosition(tab.id);
              }}
              className={`text-xs font-athletic font-bold uppercase tracking-wider px-2.5 py-1 transition border ${
                selectedPosition === tab.id
                  ? 'bg-[#ccff00] text-black border-[#ccff00]'
                  : 'bg-[#080a0f] text-neutral-300 border-neutral-800 hover:border-neutral-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search baller, club, season..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#080a0f] border border-neutral-700 text-xs font-mono text-white pl-9 pr-3 py-2 uppercase placeholder:text-neutral-600 focus:outline-none focus:border-[#ccff00]"
          />
        </div>
      </div>

      {/* Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {filteredCards.map((card) => {
          const isSelected = card.id === selectedCardId;
          return (
            <div
              key={card.id}
              onClick={() => {
                setSelectedCardId(card.id);
                soundFX.playClick(680);
              }}
              className={`p-2 transition ${
                isSelected
                  ? 'bg-[#181c28] border-2 border-[#fbbf24]'
                  : 'bg-[#12151e] border border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <EraPlayerCard {...card} interactive={true} />
            </div>
          );
        })}
      </div>

      {/* Position Architecture Card */}
      <div className="mt-10 bg-[#0d1017] border border-neutral-800 p-5">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="w-4 h-4 text-[#ccff00]" />
          <h4 className="font-athletic font-black text-xl text-white uppercase tracking-tight">
            TOP BINS SQUAD ARCHITECTURE
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono text-neutral-300">
          <div className="bg-[#12151e] p-3 border-l-2 border-[#fbbf24]">
            <span className="font-bold text-[#fbbf24] uppercase block mb-1">[ GK ] GOALKEEPERS</span>
            <p className="text-neutral-400 text-[11px]">
              Pure shot-stoppers (e.g. Buffon, Casillas, Neuer).
            </p>
          </div>

          <div className="bg-[#12151e] p-3 border-l-2 border-blue-500">
            <span className="font-bold text-blue-400 uppercase block mb-1">[ DEF ] DEFENDERS</span>
            <p className="text-neutral-400 text-[11px]">
              Fullbacks and Centerbacks map to [ DEF ] (e.g. Maldini, Ramos).
            </p>
          </div>

          <div className="bg-[#12151e] p-3 border-l-2 border-[#ccff00]">
            <span className="font-bold text-[#ccff00] uppercase block mb-1">[ MID ] MIDFIELDERS</span>
            <p className="text-neutral-400 text-[11px]">
              Central, defensive, and attacking midfielders (e.g. Zidane).
            </p>
          </div>

          <div className="bg-[#12151e] p-3 border-l-2 border-red-500">
            <span className="font-bold text-red-400 uppercase block mb-1">[ ATK ] ATTACKERS</span>
            <p className="text-neutral-400 text-[11px]">
              Wingers and Center-Forwards (e.g. Neymar Jr, Ronaldo, Henry).
            </p>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-neutral-800 flex items-center justify-between text-xs font-mono text-neutral-400">
          <span>
            <strong className="text-[#00f0ff]">DUAL-ELIGIBILITY:</strong> Versatile ballers (e.g. Phil Foden, Eden Hazard) carry [ MID / ATK ] to slot into either position.
          </span>
          <span className="text-[#fbbf24] hidden sm:inline">OFFICIAL ERA COLLECTIBLE STANDARD</span>
        </div>
      </div>
    </section>
  );
};
