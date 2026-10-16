import React from 'react';
import { ArrowRight, Users } from 'lucide-react';
import { useParty } from '../context/PartyContext';
import type { PublicSquadInfo } from '../types/wsProtocol';

const MODE_LABELS: Record<string, string> = {
  'auction-draft': 'Auction Draft',
  'criteria-rush': 'Link-Up',
  'tally-race': 'Record Books',
  'football-imposter': 'Imposter',
  side_netting: 'Side Netting',
};

/** Public squads other players can join with one click. Private squads stay code-only. */
function usePublicSquads() {
  const { publicSquads, party, playerName, joinPartyWithCode, openDrawer } = useParty();
  const inSquad = party.isActive && !party.roomCode?.startsWith('match_');
  const squads = publicSquads.filter((s) => s.roomId !== party.roomCode);

  const blockReason = (s: PublicSquadInfo): string | null => {
    if (s.status === 'in-game') return s.modeId ? `In ${MODE_LABELS[s.modeId] || 'a match'}` : 'In a match';
    if (s.memberCount >= s.maxSlots) return 'Full';
    if (inSquad) return 'Leave your squad first';
    return null;
  };

  const join = (s: PublicSquadInfo) => {
    if (blockReason(s)) return;
    if (joinPartyWithCode(s.roomId, playerName || undefined)) openDrawer();
  };

  return { squads, blockReason, join };
}

const SquadChip: React.FC<{ squad: PublicSquadInfo; reason: string | null; onJoin: () => void; wide?: boolean }> = ({
  squad,
  reason,
  onJoin,
  wide,
}) => (
  <div
    className={`shrink-0 flex items-center gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] pl-3 pr-1.5 py-1.5 ${
      wide ? 'w-full justify-between' : ''
    }`}
  >
    <div className="min-w-0">
      <span className="block font-athletic italic font-black text-base uppercase text-white leading-none truncate">
        {squad.hostName}&apos;s squad
      </span>
      <span className="mt-1 flex items-center gap-1.5 font-mono text-[9px] tracking-[0.16em] uppercase text-slate-500">
        <Users className="w-3 h-3" />
        {squad.memberCount}/{squad.maxSlots}
        {reason && <span className="text-amber-300/80">· {reason}</span>}
      </span>
    </div>
    <button
      type="button"
      onClick={onJoin}
      disabled={Boolean(reason)}
      title={reason || `Join ${squad.hostName}'s squad`}
      className="bc-btn bc-btn-primary shrink-0 h-8 px-3 rounded-md inline-flex items-center gap-1 font-mono text-[10px] font-black tracking-[0.14em] cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
    >
      JOIN
      <ArrowRight className="w-3 h-3" />
    </button>
  </div>
);

/** Hub strip: only rendered while there is at least one public squad to show. */
export const PublicSquadsStrip: React.FC = () => {
  const { squads, blockReason, join } = usePublicSquads();
  const { toggleJoinCode } = useParty();
  if (squads.length === 0) return null;
  const shown = squads.slice(0, 3);

  return (
    <div
      style={{ ['--acc' as string]: '#ccff00' } as React.CSSProperties}
      className="bc-scope flex items-center gap-3 overflow-x-auto no-scrollbar"
    >
      <span className="shrink-0 flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.22em] uppercase text-slate-300">
        <span className="relative flex h-1.5 w-1.5">
          <span className="bc-radar absolute inline-flex h-full w-full rounded-full bg-[#ccff00]" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#ccff00]" />
        </span>
        Open squads
      </span>
      {shown.map((s) => (
        <SquadChip key={s.roomId} squad={s} reason={blockReason(s)} onJoin={() => join(s)} />
      ))}
      {squads.length > shown.length && (
        <button
          type="button"
          onClick={toggleJoinCode}
          className="bc-btn bc-btn-ghost shrink-0 h-9 px-3 rounded-lg font-mono text-[10px] font-black tracking-[0.14em] uppercase cursor-pointer"
        >
          +{squads.length - shown.length} more
        </button>
      )}
    </div>
  );
};

/** Full list for the party panel's Join tab. */
export const PublicSquadsList: React.FC = () => {
  const { squads, blockReason, join } = usePublicSquads();
  if (squads.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-white/[0.08] px-3 py-3 text-[12px] text-slate-500">
        No public squads right now. Host one and set it to Public to appear here.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {squads.map((s) => (
        <SquadChip key={s.roomId} wide squad={s} reason={blockReason(s)} onJoin={() => join(s)} />
      ))}
    </div>
  );
};
