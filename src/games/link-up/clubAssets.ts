import type { LinkUpDifficulty, LinkUpPosition } from './types';

// Special existing filenames in /assets/crests/ that differ from their slug
const SPECIAL_CREST_PATHS: Record<string, string> = {
  'ac-milan': '/assets/crests/ac_milan.svg',
  'arsenal': '/assets/crests/arsenal.svg',
  'atletico-madrid': '/assets/crests/atletico_madrid.png',
  'bayern-munich': '/assets/crests/bayern_munich.svg',
  'blackburn-rovers': '/assets/crests/blackburn.png',
  'bolton-wanderers': '/assets/crests/bolton.png',
  'borussia-dortmund': '/assets/crests/borussia_dortmund.png',
  'chelsea': '/assets/crests/chelsea.svg',
  'deportivo-la-coruna': '/assets/crests/deportivo.png',
  'everton': '/assets/crests/everton.png',
  'fc-barcelona': '/assets/crests/fc_barcelona.svg',
  'fiorentina': '/assets/crests/fiorentina.png',
  'inter-milan': '/assets/crests/inter_milan.png',
  'juventus': '/assets/crests/juventus.png',
  'lazio': '/assets/crests/lazio.png',
  'leicester-city': '/assets/crests/leicester.png',
  'bayer-leverkusen': '/assets/crests/leverkusen.png',
  'liverpool': '/assets/crests/liverpool.svg',
  'malaga': '/assets/crests/malaga.png',
  'manchester-city': '/assets/crests/manchester_city.svg',
  'manchester-united': '/assets/crests/manchester_united.svg',
  'borussia-monchengladbach': '/assets/crests/monchengladbach.png',
  'napoli': '/assets/crests/napoli.png',
  'newcastle-united': '/assets/crests/newcastle.png',
  'queens-park-rangers': '/assets/crests/qpr.png',
  'real-betis': '/assets/crests/real_betis.png',
  'real-madrid': '/assets/crests/real_madrid.svg',
  'as-roma': '/assets/crests/roma.png',
  'sevilla': '/assets/crests/sevilla.png',
  'stoke-city': '/assets/crests/stoke.png',
  'swansea-city': '/assets/crests/swansea.png',
  'tottenham-hotspur': '/assets/crests/tottenham.png',
  'valencia': '/assets/crests/valencia.png',
  'villarreal': '/assets/crests/villarreal.png',
  'werder-bremen': '/assets/crests/werder_bremen.png',
  'vfl-wolfsburg': '/assets/crests/wolfsburg.png',
};

export function getClubCrestUrl(slug: string): string {
  if (SPECIAL_CREST_PATHS[slug]) {
    return SPECIAL_CREST_PATHS[slug];
  }
  return `/assets/crests/${slug}.png`;
}

export const NATION_CODES: Record<string, { code: string; iso2: string; tier: LinkUpDifficulty }> = {
  // Easy
  'Brazil': { code: 'BRA', iso2: 'br', tier: 'Easy' },
  'Argentina': { code: 'ARG', iso2: 'ar', tier: 'Easy' },
  'France': { code: 'FRA', iso2: 'fr', tier: 'Easy' },
  'England': { code: 'ENG', iso2: 'gb-eng', tier: 'Easy' },
  'Spain': { code: 'ESP', iso2: 'es', tier: 'Easy' },
  'Germany': { code: 'GER', iso2: 'de', tier: 'Easy' },
  'Italy': { code: 'ITA', iso2: 'it', tier: 'Easy' },
  'Portugal': { code: 'POR', iso2: 'pt', tier: 'Easy' },
  'Netherlands': { code: 'NED', iso2: 'nl', tier: 'Easy' },
  'Belgium': { code: 'BEL', iso2: 'be', tier: 'Easy' },

  // Medium
  'Croatia': { code: 'CRO', iso2: 'hr', tier: 'Medium' },
  'Uruguay': { code: 'URU', iso2: 'uy', tier: 'Medium' },
  'Colombia': { code: 'COL', iso2: 'co', tier: 'Medium' },
  'Chile': { code: 'CHI', iso2: 'cl', tier: 'Medium' },
  'Mexico': { code: 'MEX', iso2: 'mx', tier: 'Medium' },
  'United States': { code: 'USA', iso2: 'us', tier: 'Medium' },
  'Senegal': { code: 'SEN', iso2: 'sn', tier: 'Medium' },
  'Ivory Coast': { code: 'CIV', iso2: 'ci', tier: 'Medium' },
  'Nigeria': { code: 'NGA', iso2: 'ng', tier: 'Medium' },
  'Ghana': { code: 'GHA', iso2: 'gh', tier: 'Medium' },
  'Cameroon': { code: 'CMR', iso2: 'cm', tier: 'Medium' },
  'Morocco': { code: 'MAR', iso2: 'ma', tier: 'Medium' },
  'Egypt': { code: 'EGY', iso2: 'eg', tier: 'Medium' },
  'Algeria': { code: 'ALG', iso2: 'dz', tier: 'Medium' },
  'Japan': { code: 'JPN', iso2: 'jp', tier: 'Medium' },
  'South Korea': { code: 'KOR', iso2: 'kr', tier: 'Medium' },
  'Australia': { code: 'AUS', iso2: 'au', tier: 'Medium' },
  'Switzerland': { code: 'SUI', iso2: 'ch', tier: 'Medium' },
  'Austria': { code: 'AUT', iso2: 'at', tier: 'Medium' },
  'Denmark': { code: 'DEN', iso2: 'dk', tier: 'Medium' },
  'Sweden': { code: 'SWE', iso2: 'se', tier: 'Medium' },
  'Norway': { code: 'NOR', iso2: 'no', tier: 'Medium' },
  'Poland': { code: 'POL', iso2: 'pl', tier: 'Medium' },
  'Serbia': { code: 'SRB', iso2: 'rs', tier: 'Medium' },
  'Czech Republic': { code: 'CZE', iso2: 'cz', tier: 'Medium' },
  'Turkey': { code: 'TUR', iso2: 'tr', tier: 'Medium' },
  'Ukraine': { code: 'UKR', iso2: 'ua', tier: 'Medium' },
  'Russia': { code: 'RUS', iso2: 'ru', tier: 'Medium' },
  'Scotland': { code: 'SCO', iso2: 'gb-sct', tier: 'Medium' },
  'Wales': { code: 'WAL', iso2: 'gb-wls', tier: 'Medium' },
  'Republic of Ireland': { code: 'IRL', iso2: 'ie', tier: 'Medium' },

  // Hard
  'Bosnia and Herzegovina': { code: 'BIH', iso2: 'ba', tier: 'Hard' },
  'Montenegro': { code: 'MNE', iso2: 'me', tier: 'Hard' },
  'North Macedonia': { code: 'MKD', iso2: 'mk', tier: 'Hard' },
  'Slovenia': { code: 'SVN', iso2: 'si', tier: 'Hard' },
  'Slovakia': { code: 'SVK', iso2: 'sk', tier: 'Hard' },
  'Hungary': { code: 'HUN', iso2: 'hu', tier: 'Hard' },
  'Romania': { code: 'ROU', iso2: 'ro', tier: 'Hard' },
  'Bulgaria': { code: 'BUL', iso2: 'bg', tier: 'Hard' },
  'Greece': { code: 'GRE', iso2: 'gr', tier: 'Hard' },
  'Finland': { code: 'FIN', iso2: 'fi', tier: 'Hard' },
  'Iceland': { code: 'ISL', iso2: 'is', tier: 'Hard' },
  'Northern Ireland': { code: 'NIR', iso2: 'gb-nir', tier: 'Hard' },
  'Georgia': { code: 'GEO', iso2: 'ge', tier: 'Hard' },
  'Armenia': { code: 'ARM', iso2: 'am', tier: 'Hard' },
  'Albania': { code: 'ALB', iso2: 'al', tier: 'Hard' },
  'Kosovo': { code: 'KOS', iso2: 'xk', tier: 'Hard' },
  'Mali': { code: 'MLI', iso2: 'ml', tier: 'Hard' },
  'Guinea': { code: 'GUI', iso2: 'gn', tier: 'Hard' },
  'Burkina Faso': { code: 'BFA', iso2: 'bf', tier: 'Hard' },
  'DR Congo': { code: 'COD', iso2: 'cd', tier: 'Hard' },
  'Gabon': { code: 'GAB', iso2: 'ga', tier: 'Hard' },
  'Togo': { code: 'TOG', iso2: 'tg', tier: 'Hard' },
  'Tunisia': { code: 'TUN', iso2: 'tn', tier: 'Hard' },
  'South Africa': { code: 'RSA', iso2: 'za', tier: 'Hard' },
  'Jamaica': { code: 'JAM', iso2: 'jm', tier: 'Hard' },
  'Costa Rica': { code: 'CRC', iso2: 'cr', tier: 'Hard' },
  'Canada': { code: 'CAN', iso2: 'ca', tier: 'Hard' },
  'Paraguay': { code: 'PAR', iso2: 'py', tier: 'Hard' },
  'Ecuador': { code: 'ECU', iso2: 'ec', tier: 'Hard' },
  'Peru': { code: 'PER', iso2: 'pe', tier: 'Hard' },
  'Venezuela': { code: 'VEN', iso2: 've', tier: 'Hard' },
  'Iran': { code: 'IRN', iso2: 'ir', tier: 'Hard' },
  'New Zealand': { code: 'NZL', iso2: 'nz', tier: 'Hard' },
};

export function getNationFlagUrl(nationality: string): string {
  const meta = NATION_CODES[nationality];
  if (meta?.iso2) {
    return `/assets/flags/${meta.iso2}.png`;
  }
  return '/assets/flags/un.png';
}

export const POSITION_META: Record<LinkUpPosition, { fullName: string; roleDesc: string; colorClass: string }> = {
  GK: {
    fullName: 'GOALKEEPER',
    roleDesc: 'Shot-Stopper / #1',
    colorClass: 'text-[#fbbf24] border-[#fbbf24]/50 bg-[#fbbf24]/15',
  },
  DEF: {
    fullName: 'DEFENDER',
    roleDesc: 'Centre-Back / Full-Back',
    colorClass: 'text-blue-400 border-blue-400/50 bg-blue-500/15',
  },
  MID: {
    fullName: 'MIDFIELDER',
    roleDesc: 'Engine Room / Playmaker',
    colorClass: 'text-[#ccff00] border-[#ccff00]/50 bg-[#ccff00]/15',
  },
  FWD: {
    fullName: 'FORWARD / ATTACKER',
    roleDesc: 'Striker / Winger / #9',
    colorClass: 'text-red-400 border-red-400/50 bg-red-500/15',
  },
};

export function getClubAbbreviation(clubName: string): string {
  const upper = clubName.toUpperCase();
  if (upper.includes('REAL MADRID')) return 'RMA';
  if (upper.includes('BARCELONA')) return 'FCB';
  if (upper.includes('ATLETICO') || upper.includes('ATLÉTICO')) return 'ATM';
  if (upper.includes('MANCHESTER UNITED')) return 'MUN';
  if (upper.includes('MANCHESTER CITY')) return 'MCI';
  if (upper.includes('LIVERPOOL')) return 'LIV';
  if (upper.includes('ARSENAL')) return 'ARS';
  if (upper.includes('CHELSEA')) return 'CHE';
  if (upper.includes('TOTTENHAM')) return 'TOT';
  if (upper.includes('BAYERN')) return 'BAY';
  if (upper.includes('DORTMUND')) return 'BVB';
  if (upper.includes('JUVENTUS')) return 'JUV';
  if (upper.includes('AC MILAN')) return 'ACM';
  if (upper.includes('INTER MILAN')) return 'INT';
  if (upper.includes('PARIS SAINT-GERMAIN')) return 'PSG';
  const words = upper.replace(/[^A-Z\s]/g, '').trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1].slice(0, 2)).toUpperCase();
  }
  return upper.slice(0, 3);
}
