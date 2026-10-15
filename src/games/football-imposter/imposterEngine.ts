import rawLinkUpPlayers from '../../data/linkUpDatabase.json';
import { getClubCrestUrl, getNationFlagUrl } from '../link-up/clubAssets';
import { levenshteinDistance, normalizeSearchText } from '../link-up/puzzleEngine';
import type {
  ImposterCategory,
  ImposterParticipant,
  ImposterRolePreference,
  ImposterSecretPlayer,
} from './types';

interface RawLinkUpPlayer {
  id: string;
  name: string;
  commonName?: string;
  aliases?: string[];
  position: string;
  nationality: string;
  clubs: Array<{ name: string; slug: string }>;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

const LINK_UP_DB = rawLinkUpPlayers as RawLinkUpPlayer[];

const PREMIER_LEAGUE_SLUGS = new Set([
  'arsenal',
  'chelsea',
  'liverpool',
  'manchester-united',
  'manchester-city',
  'tottenham-hotspur',
  'newcastle-united',
  'aston-villa',
  'everton',
  'west-ham-united',
  'leeds-united',
  'leicester-city',
  'blackburn-rovers',
  'bolton-wanderers',
  'sunderland',
  'fulham',
  'crystal-palace',
  'brighton',
  'southampton',
  'wolverhampton-wanderers',
  'nottingham-forest',
  'middlesbrough',
  'portsmouth',
  'stoke-city',
  'swansea-city',
  'queens-park-rangers',
  'watford',
  'bournemouth',
  'brentford',
  'burnley',
]);

const SOUTH_AMERICAN_NATIONS = new Set([
  'Brazil',
  'Argentina',
  'Uruguay',
  'Colombia',
  'Chile',
  'Paraguay',
  'Ecuador',
  'Peru',
  'Venezuela',
]);

const AFRICAN_NATIONS = new Set([
  'Senegal',
  'Ivory Coast',
  'Nigeria',
  'Ghana',
  'Cameroon',
  'Morocco',
  'Egypt',
  'Algeria',
  'Mali',
  'Guinea',
  'Burkina Faso',
  'DR Congo',
  'Gabon',
  'Togo',
  'Tunisia',
  'South Africa',
]);

/**
 * Generates ONE very vague clue for the Imposter (no shirt numbers, no Ballon d'Or, no specific finals).
 */
function buildVeryVagueImposterClue(p: RawLinkUpPlayer): string {
  const clubSlugs = (p.clubs || []).map((c) => c.slug);
  const vagueOptions: string[] = [];

  if (SOUTH_AMERICAN_NATIONS.has(p.nationality)) {
    vagueOptions.push('Has South American roots');
  } else if (AFRICAN_NATIONS.has(p.nationality)) {
    vagueOptions.push('Represented an African nation');
  } else {
    vagueOptions.push('Competed in top European leagues');
  }

  if (clubSlugs.some((s) => PREMIER_LEAGUE_SLUGS.has(s))) {
    vagueOptions.push('Featured in English football');
  }
  if (
    clubSlugs.some((s) =>
      [
        'real-madrid',
        'fc-barcelona',
        'atletico-madrid',
        'sevilla',
        'valencia',
        'villarreal',
        'real-betis',
        'real-sociedad',
        'athletic-bilbao',
      ].includes(s)
    )
  ) {
    vagueOptions.push('Spent time in Spanish football');
  }
  if (
    clubSlugs.some((s) =>
      [
        'juventus',
        'ac-milan',
        'inter-milan',
        'as-roma',
        'napoli',
        'lazio',
        'fiorentina',
        'atalanta',
        'parma',
      ].includes(s)
    )
  ) {
    vagueOptions.push('Played in Italian top-flight football');
  }

  if (p.position === 'FWD') {
    vagueOptions.push('Operates in attacking areas');
  } else if (p.position === 'MID') {
    vagueOptions.push('Involved in midfield link-up play');
  } else if (p.position === 'DEF') {
    vagueOptions.push('Known for defensive duties');
  } else if (p.position === 'GK') {
    vagueOptions.push('Commands the penalty area');
  }

  if ((p.clubs || []).length >= 3) {
    vagueOptions.push('Played for several different clubs');
  }

  return vagueOptions[Math.floor(Math.random() * vagueOptions.length)] || 'Experienced top-flight footballer';
}

/**
 * Generates realistic subtle clues for Crew bots based on the player's real clubs/nationality/position.
 */
function buildCrewCluesForPlayer(p: RawLinkUpPlayer): string[] {
  const clubs = p.clubs || [];
  const clues: string[] = [];

  if (clubs.length >= 2) {
    clues.push(`Played in ${clubs[0].name} and ${clubs[1].name} colors`);
    clues.push(`Moved from ${clubs[0].name} during his career`);
  }
  if (clubs.length >= 3) {
    clues.push(`Also had a spell at ${clubs[clubs.length - 1].name}`);
  }
  if (clubs.length === 1 && clubs[0]) {
    clues.push(`Loyal servant at ${clubs[0].name}`);
  }

  clues.push(`${p.nationality} international`);

  if (p.position === 'FWD') {
    clues.push('Always dangerous in the final third');
    clues.push('Clinical when given space in the box');
  } else if (p.position === 'MID') {
    clues.push('Dictates the tempo in the middle of the park');
    clues.push('Always looking for the killer pass');
  } else if (p.position === 'DEF') {
    clues.push('Reads the game well at the back');
    clues.push('Tough to beat in one-on-one duels');
  } else {
    clues.push('Reliable presence between the posts');
    clues.push('Big saves when the team needs it');
  }

  clues.push(`Known by fans from his ${clubs[0]?.name || p.nationality} days`);
  return clues;
}

const GENERIC_IMPOSTER_BLUFF_CLUES = [
  'Always turns up when the lights are brightest',
  'Unbelievable technical quality on the ball',
  'Streets will never forget his prime seasons',
  'Proper fan favorite at his peak',
  'Had that elite mentality every manager loves',
  'Made it look effortless on his day',
  'Always knew where to be on the pitch',
  'One of the cleanest touches in his position',
];

function convertRawPlayerToSecret(
  p: RawLinkUpPlayer,
  category: ImposterCategory
): ImposterSecretPlayer {
  const primaryClubObj =
    p.clubs && p.clubs.length > 0
      ? p.clubs[Math.min(1, p.clubs.length - 1)]
      : { name: 'Free Agent', slug: 'real-madrid' };

  return {
    id: p.id || p.name,
    name: p.name,
    position: p.position || 'MID',
    nationality: p.nationality || 'Spain',
    flagUrl: getNationFlagUrl(p.nationality || 'Spain'),
    primaryClub: primaryClubObj.name,
    crestUrl: getClubCrestUrl(primaryClubObj.slug),
    careerClubs: (p.clubs || []).map((c) => c.name),
    category,
    imposterVagueClue: buildVeryVagueImposterClue(p),
    crewClues: buildCrewCluesForPlayer(p),
    imposterBluffClues: GENERIC_IMPOSTER_BLUFF_CLUES,
  };
}

const HISTORIC_LEGEND_NAMES = new Set([
  'Pelé', 'Diego Maradona', 'Zinedine Zidane', 'Johan Cruyff', 'Ronaldo', 'Ronaldinho',
  'David Beckham', 'Thierry Henry', 'Wayne Rooney', 'Miroslav Klose', 'Kaká',
  'Robin van Persie', 'Gianluigi Buffon', 'Andrea Pirlo', 'Roberto Baggio', 'Wesley Sneijder',
  'Frank Lampard', 'Mesut Özil', 'Zlatan Ibrahimović', 'Franz Beckenbauer', 'Gerd Müller',
  'Lev Yashin', 'Paolo Maldini', 'Franco Baresi', 'Michel Platini', 'George Best',
  'Eusébio', 'Ruud Gullit', 'Marco van Basten', 'Lothar Matthäus', 'Xavi', 'Andrés Iniesta',
  'Carles Puyol', 'Steven Gerrard', 'Paul Scholes', 'Didier Drogba', 'Andriy Shevchenko',
  'Dennis Bergkamp', 'Eric Cantona', 'Raúl', 'Iker Casillas', 'Alessandro Del Piero',
  'Francesco Totti', 'Javier Zanetti', 'Pavel Nedvěd', 'Luís Figo', 'Rivaldo', 'Cafu',
  'Roberto Carlos', 'Rio Ferdinand', 'Nemanja Vidić', 'John Terry', 'Petr Čech',
  'Philipp Lahm', 'Bastian Schweinsteiger', 'Arjen Robben', 'Franck Ribéry', 'Ruud van Nistelrooy',
  'Samuel Eto\'o', 'Michael Owen', 'Michael Ballack', 'Patrick Vieira',
  'Roy Keane', 'Clarence Seedorf', 'Edgar Davids', 'Alessandro Nesta', 'Fabio Cannavaro',
  'Oliver Kahn', 'Edwin van der Sar', 'Peter Schmeichel', 'Gary Neville', 'Ashley Cole',
  'Sol Campbell', 'Claude Makélélé', 'Hernán Crespo', 'Gabriel Batistuta', 'Juan Román Riquelme',
  'Hristo Stoichkov', 'Gheorghe Hagi', 'Romário', 'Dunga', 'Bebeto',
  'Fernando Redondo', 'Jürgen Klinsmann', 'Karl-Heinz Rummenigge', 'Kenny Dalglish',
  'Ian Rush', 'Graeme Souness', 'Alan Shearer', 'Ian Wright', 'Paul Gascoigne',
  'Matt Le Tissier', 'David Trezeguet', 'Laurent Blanc', 'Marcel Desailly', 'Lilian Thuram',
  'Bixente Lizarazu', 'Youri Djorkaeff', 'Robert Pires', 'Robert Pirès', 'Emmanuel Petit',
  'Davor Šuker', 'Predrag Mijatović', 'Dejan Savićević', 'Zvonimir Boban'
]);

const MODERN_SUPERSTAR_NAMES = new Set([
  'Kylian Mbappé', 'Erling Haaland', 'Jude Bellingham', 'Vinicius Junior', 'Vinícius Júnior',
  'Kevin De Bruyne', 'Mohamed Salah', 'Harry Kane', 'Robert Lewandowski', 'Bukayo Saka',
  'Phil Foden', 'Rodri', 'Lamine Yamal', 'Cole Palmer', 'Florian Wirtz', 'Jamal Musiala',
  'Antoine Griezmann', 'Luka Modrić', 'Bernardo Silva', 'Bruno Fernandes', 'Son Heung-min',
  'Virgil van Dijk', 'Alisson', 'Thibaut Courtois', 'Declan Rice', 'Martin Ødegaard',
  'Federico Valverde', 'Pedri', 'Gavi', 'Eduardo Camavinga', 'Aurélien Tchouaméni',
  'Rafael Leão', 'Victor Osimhen', 'Lautaro Martínez', 'Julián Álvarez', 'Khvicha Kvaratskhelia',
  'Ousmane Dembélé', 'Raphinha', 'Marcus Rashford', 'Trent Alexander-Arnold', 'Joshua Kimmich',
  'Alphonso Davies', 'William Saliba', 'Rúben Dias', 'Theo Hernández', 'Neymar',
  'Cristiano Ronaldo', 'Lionel Messi', 'Gianluigi Donnarumma',
  'Achraf Hakimi', 'Nicolò Barella', 'Alessandro Bastoni', 'Moisés Caicedo', 'Enzo Fernández',
  'Alejandro Garnacho', 'Kobbie Mainoo', 'Arda Güler', 'Endrick', 'Alexander Isak',
  'Bruno Guimarães', 'Dominik Szoboszlai', 'Alexis Mac Allister', 'Darwin Núñez',
  'Luis Díaz', 'Cody Gakpo', 'Kai Havertz', 'Gabriel Martinelli', 'Gabriel Magalhães',
  'David Raya', 'Ederson', 'Joško Gvardiol', 'Manuel Akanji',
  'Kyle Walker', 'John Stones', 'Jack Grealish', 'Jérémy Doku', 'Savinho',
  'Marc Guéhi', 'Eberechi Eze', 'Ollie Watkins', 'Leon Bailey', 'Emiliano Martínez',
  'Amadou Onana', 'Youri Tielemans', 'Lucas Paquetá', 'Jarrod Bowen', 'Mohammed Kudus',
  'Pedro Neto', 'Nicolas Jackson', 'Noni Madueke', 'Malo Gusto', 'Christopher Nkunku',
  'Marc Cucurella', 'Robert Sánchez', 'Levi Colwill', 'Micky van de Ven', 'Cristian Romero',
  'Pedro Porro', 'Destiny Udogie', 'James Maddison', 'Dejan Kulusevski', 'Richarlison',
  'Brennan Johnson', 'Guglielmo Vicario', 'Anthony Gordon', 'Sandro Tonali', 'Harvey Barnes',
  'Tino Livramento', 'Nick Pope', 'Kieran Trippier', 'Dan Burn', 'Fabian Schär',
  'Sean Longstaff', 'Lewis Hall', 'Morgan Gibbs-White', 'Anthony Elanga', 'Murillo',
  'Matheus Cunha', 'João Gomes', 'Rayan Aït-Nouri', 'Mario Lemina', 'Hwang Hee-chan',
  'Kaoru Mitoma', 'Simon Adingra', 'João Pedro', 'Carlos Baleba', 'Lewis Dunk',
  'Bart Verbruggen', 'Bryan Mbeumo', 'Yoane Wissa', 'Mathias Jensen', 'Christian Nørgaard',
  'Ethan Pinnock', 'Vitaly Janelt', 'Mark Flekken', 'Antonee Robinson', 'Alex Iwobi',
  'Rodrigo Muniz', 'Andreas Pereira', 'Emile Smith Rowe', 'Saša Lukić', 'Adama Traoré',
  'Bernd Leno', 'Dean Henderson', 'Tyrick Mitchell', 'Daniel Muñoz',
  'Maxence Lacroix', 'Adam Wharton', 'Will Hughes', 'Jefferson Lerma', 'Daichi Kamada',
  'Jean-Philippe Mateta', 'Eddie Nketiah', 'Ismaïla Sarr', 'Jordan Pickford', 'James Tarkowski',
  'Jarrad Branthwaite', 'Vitalii Mykolenko', 'Idrissa Gueye', 'Abdoulaye Doucouré', 'Dwight McNeil',
  'Jack Harrison', 'Dominic Calvert-Lewin', 'Iliman Ndiaye', 'Jesper Lindstrøm', 'Tim Iroegbunam',
  'Illan Meslier', 'Milos Kerkez', 'Illia Zabarnyi', 'Marcos Senesi', 'Lewis Cook',
  'Ryan Christie', 'Marcus Tavernier', 'Antoine Semenyo', 'Justin Kluivert', 'Evanilson',
  'Dango Ouattara', 'Enes Ünal', 'Kepa Arrizabalaga', 'Taylor Harwood-Bellis', 'Jan Bednarek',
  'Kyle Walker-Peters', 'Flynn Downes', 'Joe Aribo', 'Mateus Fernandes', 'Adam Lallana',
  'Tyler Dibling', 'Cameron Archer', 'Paul Onuachu', 'Ben Brereton Díaz', 'Aaron Ramsdale',
  'Mads Hermansen', 'Wout Faes', 'Caleb Okoli', 'Victor Kristiansen', 'James Justin',
  'Harry Winks', 'Wilfred Ndidi', 'Boubakary Soumaré', 'Facundo Buonanotte', 'Stephy Mavididi',
  'Abdul Fatawu', 'Jordan Ayew', 'Jamie Vardy', 'Patson Daka', 'Bobby De Cordova-Reid',
  'Dara O Shea', 'Jacob Greaves', 'Leif Davis', 'Axel Tuanzebe', 'Sam Morsy',
  'Kalvin Phillips', 'Jens Cajuste', 'Jack Clarke', 'Wes Burns', 'Omari Hutchinson',
  'Conor Chaplin', 'Sammie Szmodics', 'Liam Delap', 'George Hirst', 'Arijanet Muric'
]);

export function pickSecretPlayer(
  category: ImposterCategory,
  excludeIds: string[] = [],
  options: { wellKnownOnly?: boolean } = {}
): ImposterSecretPlayer {
  const excluded = new Set(excludeIds);
  let candidates: RawLinkUpPlayer[] = [];

  if (category === 'All Players') {
    candidates = LINK_UP_DB;
  } else if (category === 'Premier League Icons') {
    candidates = LINK_UP_DB.filter(
      (p) =>
        p.clubs &&
        p.clubs.some((c) => PREMIER_LEAGUE_SLUGS.has(c.slug)) &&
        (p.difficulty === 'Easy' || p.difficulty === 'Medium')
    );
  } else if (category === 'Cult Heroes') {
    candidates = LINK_UP_DB.filter(
      (p) => p.difficulty === 'Medium' || p.difficulty === 'Hard'
    );
  } else if (category === 'Modern Superstars') {
    candidates = LINK_UP_DB.filter(
      (p) =>
        MODERN_SUPERSTAR_NAMES.has(p.name) ||
        (p.aliases && p.aliases.some((a) => MODERN_SUPERSTAR_NAMES.has(a)))
    );
    if (candidates.length === 0) {
      candidates = LINK_UP_DB.filter(
        (p) => p.difficulty === 'Easy' && !HISTORIC_LEGEND_NAMES.has(p.name)
      );
    }
  } else {
    // All-Time Legends
    candidates = LINK_UP_DB.filter(
      (p) =>
        HISTORIC_LEGEND_NAMES.has(p.name) ||
        (p.aliases && p.aliases.some((a) => HISTORIC_LEGEND_NAMES.has(a)))
    );
    if (candidates.length === 0) {
      candidates = LINK_UP_DB.filter(
        (p) => p.difficulty === 'Easy' && !MODERN_SUPERSTAR_NAMES.has(p.name)
      );
    }
  }

  // Quick Match: keep the secret footballer recognisable (Easy/Medium Link-Up tier or a named superstar)
  if (options.wellKnownOnly) {
    const wellKnown = candidates.filter(
      (p) =>
        p.difficulty === 'Easy' ||
        p.difficulty === 'Medium' ||
        MODERN_SUPERSTAR_NAMES.has(p.name) ||
        (p.aliases && p.aliases.some((a) => MODERN_SUPERSTAR_NAMES.has(a)))
    );
    if (wellKnown.length > 0) candidates = wellKnown;
  }

  const fresh = candidates.filter((p) => !excluded.has(p.id || p.name));
  const pool = fresh.length > 0 ? fresh : candidates.length > 0 ? candidates : LINK_UP_DB;
  const chosen = pool[Math.floor(Math.random() * pool.length)];

  return convertRawPlayerToSecret(chosen, category);
}

const BOT_PROFILES = [
  {
    name: 'TACTICAL PEP',
    initials: 'TP',
    title: 'ANALYST',
    avatarBg: 'bg-sky-500/20 border-sky-400/60',
    avatarText: 'text-sky-400',
    reactionBadgeClass: 'bg-sky-500/25 border-sky-400 text-sky-200 shadow-[0_10px_30px_rgba(56,189,248,0.35)]',
  },
  {
    name: 'SCOUT FABRIZIO',
    initials: 'SF',
    title: 'INSIDER',
    avatarBg: 'bg-amber-500/20 border-amber-400/60',
    avatarText: 'text-amber-400',
    reactionBadgeClass: 'bg-amber-500/25 border-amber-400 text-amber-200 shadow-[0_10px_30px_rgba(251,191,36,0.35)]',
  },
  {
    name: 'ULTRA RIO',
    initials: 'UR',
    title: 'PUNDIT',
    avatarBg: 'bg-purple-500/20 border-purple-400/60',
    avatarText: 'text-purple-400',
    reactionBadgeClass: 'bg-purple-500/25 border-purple-400 text-purple-200 shadow-[0_10px_30px_rgba(192,132,252,0.35)]',
  },
  {
    name: 'GAFFER CARLO',
    initials: 'GC',
    title: 'TACTICIAN',
    avatarBg: 'bg-emerald-500/20 border-emerald-400/60',
    avatarText: 'text-emerald-400',
    reactionBadgeClass: 'bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow-[0_10px_30px_rgba(52,211,153,0.35)]',
  },
  {
    name: 'KING THIERRY',
    initials: 'KT',
    title: 'LEGEND',
    avatarBg: 'bg-rose-500/20 border-rose-400/60',
    avatarText: 'text-rose-400',
    reactionBadgeClass: 'bg-rose-500/25 border-rose-400 text-rose-200 shadow-[0_10px_30px_rgba(251,113,133,0.35)]',
  },
];

export function generateSquadParticipants(
  botCount: 3 | 4 | 5,
  rolePreference: ImposterRolePreference
): ImposterParticipant[] {
  const participants: ImposterParticipant[] = [
    {
      id: 'user_player',
      name: 'YOU (CAPTAIN)',
      isUser: true,
      isImposter: false,
      avatarBg: 'bg-[#ccff00]/20 border-[#ccff00]/60',
      avatarText: 'text-[#ccff00]',
      reactionBadgeClass: 'bg-[#ccff00]/25 border-[#ccff00] text-[#ccff00] shadow-[0_10px_30px_rgba(204,255,0,0.35)]',
      initials: 'YOU',
      title: 'CAPTAIN',
    },
  ];

  const selectedBots = BOT_PROFILES.slice(0, botCount);
  selectedBots.forEach((b, i) => {
    participants.push({
      id: `bot_${i + 1}`,
      name: b.name,
      isUser: false,
      isImposter: false,
      avatarBg: b.avatarBg,
      avatarText: b.avatarText,
      reactionBadgeClass: b.reactionBadgeClass,
      initials: b.initials,
      title: b.title,
    });
  });

  // Assign Imposter role
  let imposterIndex = 0;
  if (rolePreference === 'imposter') {
    imposterIndex = 0;
  } else if (rolePreference === 'crew') {
    imposterIndex = 1 + Math.floor(Math.random() * selectedBots.length);
  } else {
    imposterIndex = Math.floor(Math.random() * participants.length);
  }

  participants[imposterIndex].isImposter = true;
  return participants;
}

export function generateBotClue(
  participant: ImposterParticipant,
  secretPlayer: ImposterSecretPlayer,
  usedClues: Set<string>
): string {
  const bank = participant.isImposter
    ? secretPlayer.imposterBluffClues
    : secretPlayer.crewClues;

  const available = bank.filter((c) => !usedClues.has(c));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  return bank[Math.floor(Math.random() * bank.length)] || 'Quality footballer';
}

export const BOT_DISCUSSION_LINES = [
  'Hold on, that clue felt way too generic 👀',
  'Some of you are giving way too much away, keep it subtle!',
  'Wait who dropped that vague clue? That screams Imposter 🧢',
  'I know who has the real player based on that club hint 💡',
  'Somebody here is definitely bluffing their way through this round 🤔',
  'That last clue was ice cold, only real ball knowers get that 🥶',
];

export interface AutocorrectCheckResult {
  hasCorrection: boolean;
  suggestedName: string;
}

/**
 * Checks if the user's raw input is a slight typo or surname of a real footballer,
 * returning the canonical full name so the UI can ask "Did you mean ...?" without auto-sending.
 */
export function findDidYouMeanPlayer(
  rawInput: string,
  secretPlayer: ImposterSecretPlayer
): AutocorrectCheckResult {
  const cleanInput = normalizeSearchText(rawInput);
  if (!cleanInput || cleanInput.length < 3) {
    return { hasCorrection: false, suggestedName: '' };
  }

  // 1. Check against the secret player
  const secretNorm = normalizeSearchText(secretPlayer.name);
  const secretParts = secretNorm.split(' ');
  const secretSurname = secretParts[secretParts.length - 1] || secretNorm;

  if (cleanInput === secretNorm) {
    return { hasCorrection: false, suggestedName: secretPlayer.name };
  }

  if (cleanInput === secretSurname && cleanInput !== secretNorm) {
    return { hasCorrection: true, suggestedName: secretPlayer.name };
  }

  const distSecretFull = levenshteinDistance(cleanInput, secretNorm);
  const distSecretSurname = levenshteinDistance(cleanInput, secretSurname);
  if (
    (cleanInput.length >= 4 && distSecretSurname <= (cleanInput.length >= 7 ? 2 : 1)) ||
    (distSecretFull <= (cleanInput.length >= 7 ? 2 : 1) && cleanInput !== secretNorm)
  ) {
    return { hasCorrection: true, suggestedName: secretPlayer.name };
  }

  // 2. Check across entire LINK_UP_DB
  let bestCandidate = '';
  let bestDist = 999;
  for (const p of LINK_UP_DB) {
    const pNorm = normalizeSearchText(p.name);
    const pParts = pNorm.split(' ');
    const pSurname = pParts[pParts.length - 1] || pNorm;

    if (cleanInput === pNorm) {
      return { hasCorrection: false, suggestedName: p.name };
    }

    if (cleanInput === pSurname && cleanInput !== pNorm) {
      return { hasCorrection: true, suggestedName: p.name };
    }

    const dFull = levenshteinDistance(cleanInput, pNorm);
    const dSur = levenshteinDistance(cleanInput, pSurname);
    const minD = Math.min(dFull, dSur);
    if (minD < bestDist && minD <= (cleanInput.length >= 6 ? 2 : 1)) {
      bestDist = minD;
      bestCandidate = p.name;
    }
  }

  if (bestCandidate && normalizeSearchText(bestCandidate) !== cleanInput) {
    return { hasCorrection: true, suggestedName: bestCandidate };
  }

  return { hasCorrection: false, suggestedName: '' };
}

/**
 * Evaluates whether the Imposter's final guess correctly identifies the secret player.
 */
export function isCorrectImposterGuess(
  rawInput: string,
  secretPlayer: ImposterSecretPlayer
): boolean {
  const cleanInput = normalizeSearchText(rawInput);
  const secretNorm = normalizeSearchText(secretPlayer.name);
  if (!cleanInput || !secretNorm) return false;

  if (cleanInput === secretNorm) return true;

  const parts = secretNorm.split(' ');
  const surname = parts[parts.length - 1] || secretNorm;
  if (cleanInput === surname) return true;

  const maxTypos = cleanInput.length >= 7 ? 2 : 1;
  if (
    levenshteinDistance(cleanInput, secretNorm) <= maxTypos ||
    levenshteinDistance(cleanInput, surname) <= maxTypos
  ) {
    return true;
  }

  return false;
}

/**
 * Generates the simulated Bot Imposter's last-stand guess.
 */
export function generateBotLastStandGuess(
  secretPlayer: ImposterSecretPlayer
): { guessName: string; isCorrect: boolean } {
  // 35% chance the bot figures out the secret player from the clues
  const isCorrect = Math.random() < 0.35;
  if (isCorrect) {
    return { guessName: secretPlayer.name, isCorrect: true };
  }

  const pool = LINK_UP_DB.filter(
    (p) => normalizeSearchText(p.name) !== normalizeSearchText(secretPlayer.name)
  );
  const candidate = pool[Math.floor(Math.random() * pool.length)] || {
    name: 'Cristiano Ronaldo',
  };
  return { guessName: candidate.name, isCorrect: false };
}

