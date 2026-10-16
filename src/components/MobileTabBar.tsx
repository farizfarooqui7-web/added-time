import React from 'react';
import { Bug, Gamepad2, UserPlus, Users } from 'lucide-react';
import { useParty } from '../context/PartyContext';
import { soundFX } from '../utils/audio';

interface MobileTabBarProps {
  onHostParty: () => void;
  onJoinCode: () => void;
}

/**
 * Phone-only bottom navigation for the hub, like a native app's tab bar. Host/Join/Report live
 * here so the header stays light and nothing floats over game controls.
 */
export const MobileTabBar: React.FC<MobileTabBarProps> = ({ onHostParty, onJoinCode }) => {
  const { party, toggleDrawer, isDrawerOpen } = useParty();
  const inSquad = party.isActive && !party.roomCode?.startsWith('match_');

  const items: Array<{ key: string; label: string; icon: React.ElementType; active?: boolean; badge?: string; onClick: () => void }> = [
    {
      key: 'play',
      label: 'Play',
      icon: Gamepad2,
      active: !isDrawerOpen,
      onClick: () => {
        soundFX.playClick(700);
        if (isDrawerOpen) toggleDrawer();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    },
    {
      key: 'squad',
      label: inSquad ? 'Squad' : 'Host',
      icon: Users,
      active: isDrawerOpen && inSquad,
      badge: inSquad ? `${party.members.length}/${party.maxSlots}` : undefined,
      onClick: () => {
        if (inSquad) {
          soundFX.playClick(800);
          toggleDrawer();
        } else {
          onHostParty();
        }
      },
    },
    { key: 'join', label: 'Join', icon: UserPlus, onClick: onJoinCode },
    {
      key: 'report',
      label: 'Report',
      icon: Bug,
      onClick: () => window.dispatchEvent(new CustomEvent('topbins:open-feedback')),
    },
  ];

  return (
    <nav
      aria-label="Main"
      style={{ ['--acc' as string]: '#ccff00' } as React.CSSProperties}
      className="bc-scope sm:hidden fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-[#090b10]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-4">
        {items.map(({ key, label, icon: Icon, active, badge, onClick }) => (
          <button
            key={key}
            type="button"
            onClick={onClick}
            aria-current={active ? 'page' : undefined}
            className="relative h-16 flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-95 transition-transform"
          >
            {active && <span className="absolute top-0 inset-x-6 h-[2px] rounded-b bg-[#ccff00]" />}
            <span className="relative">
              <Icon className="w-5 h-5" style={{ color: active ? '#ccff00' : '#94a3b8' }} />
              {badge && (
                <span className="absolute -top-1.5 -right-4 px-1 rounded-sm bg-[#ccff00] text-black font-mono text-[8px] font-black leading-[12px]">
                  {badge}
                </span>
              )}
            </span>
            <span
              className="font-mono text-[9px] font-black tracking-[0.16em] uppercase"
              style={{ color: active ? '#ffffff' : '#64748b' }}
            >
              {label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
};
