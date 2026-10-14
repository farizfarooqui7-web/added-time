import React from 'react';
import {
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from 'remotion';
import { HeaderBar } from '../components/HeaderBar';
import { ParticleExplosion } from '../components/ParticleExplosion';
import { Outro } from '../components/Outro';
import { Gavel } from 'lucide-react';

export const Comp2_AuctionDraft: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Bidding progression:
  // Frame 0-70: Erling Haaland on the block ($1 -> $5 -> $9)
  // Frame 70-130: Gavel slam! "SOLD TO YOU ($9)" stamp slams on card!
  // Frame 130-220: Lot 2 Kevin De Bruyne ($7)
  // Frame 220-330: Lot 3 Cole Palmer ($3.50 Bargain!)
  // Frame 330-450: Completed 5-man squad roster reveal + Rate 1-10 CTA

  let highBid = 1;
  let highBidder = 'GAFFER';
  let remainingBankroll = 20.0;

  if (frame >= 30 && frame < 55) {
    highBid = 5;
    highBidder = 'GAFFER';
  } else if (frame >= 55 && frame < 130) {
    highBid = 9;
    highBidder = 'YOU';
    remainingBankroll = 11.0;
  } else if (frame >= 130 && frame < 220) {
    highBid = 7;
    highBidder = 'YOU (WON)';
    remainingBankroll = 4.0;
  } else if (frame >= 220) {
    highBid = 3.5;
    highBidder = 'YOU (WON)';
    remainingBankroll = 0.5;
  }

  // Stamp slam spring (Frame 70)
  const stampSpring = spring({
    frame: frame - 70,
    fps,
    config: { damping: 8, stiffness: 220 },
  });

  const cardEntrance = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 140 },
  });

  const rosterRevealSpring = spring({
    frame: frame - 330,
    fps,
    config: { damping: 10, stiffness: 150 },
  });

  return (
    <div className="w-[1080px] h-[1920px] bg-[#080a0f] text-white relative overflow-hidden font-sans select-none flex flex-col justify-between">
      {/* Background Stadium Pitch Lines from site */}
      <div className="absolute inset-0 pitch-grid-bg opacity-40 pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-[radial-gradient(circle,rgba(204,255,0,0.12)_0%,transparent_70%)] pointer-events-none" />

      {/* Main Arena Sequence (Frames 0 - 450 = 15s) */}
      <Sequence from={0} durationInFrames={450}>
        <div className="w-full h-full flex flex-col justify-between pb-12 relative">
          <HeaderBar modeTitle="$20 AUCTION DRAFT" pillColor="#ccff00" />

          {/* TikTok Hook Header */}
          <div className="px-8 pt-4 text-center">
            <span className="inline-block px-5 py-2 rounded-full bg-[#ccff00]/20 border border-[#ccff00]/40 text-[#ccff00] font-mono text-base font-bold uppercase tracking-wider mb-2">
              💰 LIVE $20 SALARY CAP DUEL
            </span>
            <h1 className="text-5xl font-black uppercase tracking-tight text-white font-athletic">
              {frame < 330 ? 'OUTBID YOUR RIVAL • BUILD THE SQUAD' : 'SQUAD COMPLETE • RATE 1-10!'}
            </h1>
          </div>

          {/* EXACT SITE TOP AUCTION HUD BAR */}
          <div className="mx-8 p-4 rounded-2xl bg-[#12151e] border border-white/10 flex items-center justify-between shadow-xl">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ccff00] animate-pulse" />
              <span className="font-mono text-sm font-bold text-white tracking-wider">
                {frame < 330 ? 'ROUND 01 / 05 • ATK' : 'DRAFT COMPLETED'}
              </span>
            </div>

            {/* High Bidder Callout */}
            <div className="flex items-center gap-2 bg-[#0a0d14] px-4 py-2 rounded-xl border border-white/10">
              <span className="text-xs font-mono text-slate-400">HIGH BIDDER:</span>
              <span className={`font-mono text-base font-black ${highBidder.includes('YOU') ? 'text-[#ccff00]' : 'text-amber-400'}`}>
                {highBidder} (${highBid})
              </span>
            </div>

            {/* Remaining Bankroll */}
            <div className="flex items-center gap-2 font-mono text-sm">
              <span className="text-slate-400">BANKROLL:</span>
              <span className="font-black text-[#ccff00] text-lg">
                ${remainingBankroll.toFixed(2)}
              </span>
            </div>
          </div>

          {/* CENTER DISPLAY: ERA PLAYER CARD (Frames 0 - 330) OR FULL SQUAD PITCH (330 - 450) */}
          {frame < 330 ? (
            <div className="flex flex-col items-center justify-center my-auto px-8">
              {/* EXACT SITE TRADING CARD: aspect-[5/7] with prismatic gold borders */}
              <div
                style={{ transform: `scale(${cardEntrance})` }}
                className="relative w-[520px] aspect-[5/7] rounded-3xl bg-[#10141f] border-4 border-[#d4af37] shadow-[0_25px_60px_rgba(0,0,0,0.95),inset_0_1px_1px_rgba(251,191,36,0.4)] p-6 flex flex-col justify-between overflow-hidden"
              >
                {/* Gold Bezel Framing & Corner Notches */}
                <div className="absolute inset-2 rounded-2xl border border-[#fbbf24]/30 pointer-events-none" />
                <div className="absolute top-2 left-2 w-5 h-5 border-t-3 border-l-3 border-[#fbbf24] pointer-events-none" />
                <div className="absolute top-2 right-2 w-5 h-5 border-t-3 border-r-3 border-[#fbbf24] pointer-events-none" />
                <div className="absolute bottom-2 left-2 w-5 h-5 border-b-3 border-l-3 border-[#fbbf24] pointer-events-none" />
                <div className="absolute bottom-2 right-2 w-5 h-5 border-b-3 border-r-3 border-[#fbbf24] pointer-events-none" />

                {/* Card Top: OVR, POS, Club */}
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-athletic font-black text-6xl text-[#fbbf24] leading-none">
                      91
                    </span>
                    <div className="flex flex-col">
                      <span className="font-mono font-black text-2xl text-white">
                        ST
                      </span>
                      <span className="font-mono text-xs text-slate-400">
                        MCI
                      </span>
                    </div>
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-black/50 border border-white/20 flex items-center justify-center text-3xl">
                    👑
                  </div>
                </div>

                {/* Card Center: Player Visual Avatar */}
                <div className="relative z-10 my-auto flex flex-col items-center">
                  <div className="w-56 h-56 rounded-full bg-gradient-to-b from-[#182030] to-transparent border-2 border-white/10 flex items-center justify-center text-8xl shadow-2xl">
                    ⚽
                  </div>
                  <h2 className="mt-4 font-athletic font-black text-5xl text-white uppercase tracking-tight text-center">
                    ERLING HAALAND
                  </h2>
                  <span className="font-mono text-sm text-[#fbbf24] font-bold">
                    MANCHESTER CITY • 2024
                  </span>
                </div>

                {/* Card Bottom: Attributes Matrix */}
                <div className="relative z-10 grid grid-cols-6 gap-2 pt-4 border-t border-white/10 text-center font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 block">PAC</span>
                    <span className="font-bold text-white text-base">89</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">SHO</span>
                    <span className="font-bold text-[#ccff00] text-base">93</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">PAS</span>
                    <span className="font-bold text-white text-base">66</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">DRI</span>
                    <span className="font-bold text-white text-base">80</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">DEF</span>
                    <span className="font-bold text-white text-base">45</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">PHY</span>
                    <span className="font-bold text-[#ccff00] text-base">88</span>
                  </div>
                </div>

                {/* EXACT OFFICIAL TRANSFER RUBBER STAMP (from EraPlayerCard.tsx) */}
                {frame >= 70 && (
                  <div
                    style={{ transform: `scale(${stampSpring}) rotate(-12deg)` }}
                    className="absolute inset-x-8 top-1/3 z-30 p-4 rounded-2xl border-4 border-[#22c55e] bg-black/85 backdrop-blur-md shadow-[0_0_50px_rgba(34,197,94,0.6)] flex flex-col items-center text-center pointer-events-none"
                  >
                    <span className="text-xs font-mono font-black text-emerald-400 uppercase tracking-widest">
                      TRANSFER APPROVED
                    </span>
                    <span className="text-4xl font-athletic font-black text-white uppercase tracking-tight my-1">
                      SOLD TO YOU
                    </span>
                    <span className="px-3 py-1 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold text-xs">
                      FEE PAID • $9.00
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* COMPLETED SQUAD PITCH VIEW (Frames 330 - 450) */
            <div
              style={{ transform: `scale(${rosterRevealSpring})` }}
              className="mx-8 p-6 rounded-3xl bg-[#10131a] border-2 border-[#ccff00] shadow-[0_0_50px_rgba(204,255,0,0.3)] flex flex-col gap-4 my-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <span className="px-4 py-1.5 rounded-full bg-[#ccff00] text-black font-sans font-black text-xs uppercase">
                  🏆 FINAL 5-MAN ROSTER
                </span>
                <span className="font-mono text-sm font-bold text-[#ccff00]">
                  TOTAL SPENT: $19.50 • SURPLUS: $0.50
                </span>
              </div>

              {/* Roster lineup items */}
              <div className="flex flex-col gap-3">
                <div className="p-3.5 rounded-2xl bg-[#181c28] border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-300 font-mono font-bold flex items-center justify-center">
                      ST
                    </span>
                    <div>
                      <h4 className="font-bold text-white text-lg">ERLING HAALAND</h4>
                      <span className="text-xs font-mono text-slate-400">Manchester City • 91 OVR</span>
                    </div>
                  </div>
                  <span className="font-mono font-black text-[#ccff00] text-lg">$9.00</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#181c28] border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 font-mono font-bold flex items-center justify-center">
                      MID
                    </span>
                    <div>
                      <h4 className="font-bold text-white text-lg">KEVIN DE BRUYNE</h4>
                      <span className="text-xs font-mono text-slate-400">Manchester City • 91 OVR</span>
                    </div>
                  </div>
                  <span className="font-mono font-black text-[#ccff00] text-lg">$7.00</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#181c28] border border-emerald-500/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-300 font-mono font-bold flex items-center justify-center">
                      RW
                    </span>
                    <div>
                      <h4 className="font-bold text-white text-lg">COLE PALMER</h4>
                      <span className="text-xs font-mono text-emerald-400">Chelsea • Bargain Snipe!</span>
                    </div>
                  </div>
                  <span className="font-mono font-black text-emerald-300 text-lg">$3.50</span>
                </div>
              </div>

              <div className="mt-2 p-3 rounded-xl bg-white/5 border border-white/10 text-center text-amber-300 font-bold text-base">
                👇 WHO WOULD WIN YOUR 5-A-SIDE LEAGUE?
              </div>
            </div>
          )}

          {/* EXACT SITE BIDDING BELT & GAVEL SUBMIT BUTTON */}
          <div className="px-8">
            <div className="p-4 rounded-3xl bg-[#12151e] border-2 border-white/10 flex flex-col gap-3 shadow-2xl">
              {/* Quick Bid Increment Buttons */}
              <div className="grid grid-cols-4 gap-2">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center font-mono text-sm text-slate-300">
                  +$1 ($7)
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center font-mono text-sm text-slate-300">
                  +$2 ($8)
                </div>
                <div className="p-3 rounded-xl bg-[#ccff00]/20 border border-[#ccff00]/50 text-center font-mono text-sm font-bold text-[#ccff00]">
                  +$4 ($9) ✓
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-center font-mono text-sm text-slate-300">
                  ALL-IN
                </div>
              </div>

              {/* Main Submit Bid Button */}
              <div className="h-16 rounded-2xl bg-[#ccff00] text-black font-sans font-black text-xl uppercase tracking-wider flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(204,255,0,0.4)] cursor-pointer">
                <Gavel className="w-6 h-6 fill-black" />
                <span>{frame < 70 ? 'SUBMIT BID ($9.00)' : 'HAMMER DROPPED! LOT WON'}</span>
              </div>
            </div>
          </div>

          {frame >= 70 && frame < 120 && <ParticleExplosion startFrame={70} />}
        </div>
      </Sequence>

      {/* Outro (Frames 450 - 540) */}
      <Sequence from={450} durationInFrames={90}>
        <Outro
          headline="OUTBID YOUR FRIENDS IN DRAFT MODE"
          subheadline="REAL-TIME MULTIPLAYER • $20 BUDGET CAP • PLAY FREE"
        />
      </Sequence>
    </div>
  );
};
