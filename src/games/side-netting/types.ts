export type SideNettingRarityTier =
  | 'Tap-In' // 5 pts (Beach / Surface)
  | 'Starter XI' // 30 pts (Open Ocean)
  | 'Cult Hero' // 50 pts (Twilight Ocean)
  | 'Streets Won\'t Forget' // 85 pts (Midnight Trench)
  | 'Ballon d\'Or Knowledge'; // 100 pts (The Hadal Abyss)

export interface SideNettingTierInfo {
  tier: SideNettingRarityTier;
  points: number;
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  glowColor: string;
  depthRange: string;
}

export const SIDE_NETTING_TIER_CONFIGS: Record<SideNettingRarityTier, SideNettingTierInfo> = {
  'Tap-In': {
    tier: 'Tap-In',
    points: 5,
    label: 'TAP-IN',
    badgeBg: 'bg-amber-500/20',
    badgeText: 'text-amber-300',
    badgeBorder: 'border-amber-400/50',
    glowColor: '#f59e0b',
    depthRange: '5 YDS • 6-YARD BOX (TAP-IN)',
  },
  'Starter XI': {
    tier: 'Starter XI',
    points: 30,
    label: 'STARTER XI',
    badgeBg: 'bg-emerald-500/20',
    badgeText: 'text-emerald-300',
    badgeBorder: 'border-emerald-400/50',
    glowColor: '#10b981',
    depthRange: '25 YDS • PENALTY ARC (STARTER)',
  },
  'Cult Hero': {
    tier: 'Cult Hero',
    points: 50,
    label: 'CULT HERO',
    badgeBg: 'bg-cyan-500/20',
    badgeText: 'text-cyan-300',
    badgeBorder: 'border-cyan-400/50',
    glowColor: '#06b6d4',
    depthRange: '50 YDS • CENTER CIRCLE (CULT HERO)',
  },
  'Streets Won\'t Forget': {
    tier: 'Streets Won\'t Forget',
    points: 85,
    label: 'STREETS WON\'T FORGET',
    badgeBg: 'bg-purple-500/20',
    badgeText: 'text-purple-300',
    badgeBorder: 'border-purple-400/50',
    glowColor: '#a855f7',
    depthRange: '75 YDS • THREE-QUARTER PITCH (STREETS)',
  },
  'Ballon d\'Or Knowledge': {
    tier: 'Ballon d\'Or Knowledge',
    points: 100,
    label: 'BALLON D\'OR KNOWLEDGE',
    badgeBg: 'bg-yellow-400/25',
    badgeText: 'text-yellow-300',
    badgeBorder: 'border-yellow-400/70',
    glowColor: '#eab308',
    depthRange: '100 YDS • FULL PITCH BICYCLE KICK (BALLON D\'OR)',
  },
};

export interface SideNettingAnswer {
  text: string;
  aliases?: string[];
  rarityScore: number; // 5, 30, 50, 85, 100
  tier: SideNettingRarityTier;
  pickRatePct: number; // e.g., 85% down to 0.5%
  commentary?: string; // e.g., "Tap-in!" vs "BALLON D'OR KNOWLEDGE! Frightening recall!" (optional for generated answers)
}

export interface SideNettingPrompt {
  id: string;
  prompt: string;
  category?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  description?: string;
  /** Broad prompt with a big answer pool (e.g. "any Premier League player"); 2–3 per 10-round match. */
  broad?: boolean;
  answers: SideNettingAnswer[];
}

export interface SideNettingMatchConfig {
  roundCount: 5 | 10 | 15;
  timerSeconds: 30 | 45 | 60 | 0; // 0 = Relaxed / No timer
  isMultiplayer?: boolean;
  lobbyMode?: 'solo' | 'host' | 'join';
  /** Public Quick Match: prompts drawn Easy → Medium → Hard. */
  difficultyCurve?: 'rising';
}

export interface SideNettingRoundSubmission {
  rawInput: string;
  matchedAnswer: SideNettingAnswer | null;
  isValid: boolean;
  score: number;
  depthMeters: number; // 0m to 4000m
  tier: SideNettingRarityTier | 'Miss';
  submittedAtMs: number;
}

export interface SideNettingRoundResult {
  prompt: SideNettingPrompt;
  submission: SideNettingRoundSubmission;
}
