const fs = require('fs');
const path = require('path');

// 1. Read existing promptsData.ts
const promptsFilePath = path.join(__dirname, '..', 'src', 'games', 'side-netting', 'promptsData.ts');
let rawContent = fs.readFileSync(promptsFilePath, 'utf8');

let stripped = rawContent
  .replace(/import type .*?;/g, '')
  .replace(/export const SIDE_NETTING_PROMPTS.*?=\s*/, '')
  .trim()
  .replace(/;$/, '');

const originalPrompts = eval('(' + stripped + ')');
console.log('Original prompts count:', originalPrompts.length);

// 2. Load linkUpDatabase and curated expansion files
const linkUp = require('../src/data/linkUpDatabase.json');
const expMappings = require('./expansionData.cjs');
const c1 = require('./curatedExpansions.cjs');
const c2 = require('./curatedExpansionsPart2.cjs');
const c3 = require('./curatedExpansionsPart3.cjs');
const c4 = require('./curatedExpansionsPart4.cjs');

const ALL_CURATED = { ...c1, ...c2, ...c3, ...c4 };

// Helper functions
function normalize(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function removeAccents(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function enrichAliases(text, existingAliases = []) {
  const aliasesSet = new Set(existingAliases.map(a => a.trim()).filter(Boolean));
  const unaccented = removeAccents(text);
  if (unaccented !== text) {
    aliasesSet.add(unaccented);
  }

  const parts = text.split(' ');
  if (parts.length > 1) {
    const surname = parts[parts.length - 1];
    if (surname.length >= 3) {
      aliasesSet.add(surname);
      const unaccSurname = removeAccents(surname);
      if (unaccSurname !== surname) {
        aliasesSet.add(unaccSurname);
      }
    }
    // Prefix particles (van, de, da, dos, di, del, von)
    if (parts.length >= 3) {
      const lowerSecond = parts[1].toLowerCase();
      if (['van', 'de', 'da', 'di', 'del', 'dos', 'von'].includes(lowerSecond)) {
        const particleSurname = `${parts[1]} ${parts[2]}`;
        aliasesSet.add(particleSurname);
        aliasesSet.add(removeAccents(particleSurname));
      }
    }
  }

  // Remove the exact full text from aliases
  aliasesSet.delete(text);
  return Array.from(aliasesSet);
}

// Strict blacklist of false crossover / false nationality pairs (youth-only, uncompleted, manager-only)
const INVALID_PAIRS = new Set([
  'romario:both_ajax_and_barcelona',
  'luissuarez:both_atletico_and_inter',
  'luissuarez:both_ajax_and_inter_milan',
  'kierantrippier:both_atletico_and_man_city',
  'kierantrippier:both_man_city_and_tottenham',
  'danipacheco:both_atletico_and_barcelona',
  'danipacheco:both_liverpool_and_barcelona',
  'franmerida:both_atletico_and_barcelona',
  'danielopare:both_porto_and_real_madrid',
  'bernardosilva:both_benfica_and_real_madrid',
  'bernardosilva:portuguese_real_madrid',
  'davidsoria:both_sevilla_and_real_madrid',
  'davidsoria:goalkeepers_real_madrid',
  'davidsoria:spanish_real_madrid',
  'aleixvidal:both_sevilla_and_real_madrid',
  'aleixvidal:both_real_madrid_barcelona',
  'aleixvidal:spanish_real_madrid',
  'efrainjuarez:both_real_madrid_barcelona',
  'mohamedsissoko:both_valencia_and_real_madrid',
  'mohamedsissoko:both_juventus_and_real_madrid',
  'mohamedsissoko:both_real_madrid_and_juventus',
  'mohamedsissoko:both_liverpool_and_real_madrid',
  'deanhuijsen:both_juventus_and_real_madrid',
  'deanhuijsen:both_real_madrid_and_juventus',
  'deanhuijsen:spanish_real_madrid',
  'enzozidane:both_juventus_and_real_madrid',
  'enzozidane:both_real_madrid_and_juventus',
  'udolattek:both_bayern_and_dortmund',
  'udolattek:germans_played_for_bayern',
  'udolattek:both_barcelona_and_bayern',
  'kenanyildiz:both_bayern_and_juventus',
  'trentalexanderarnold:both_liverpool_and_real_madrid',
  'trentalexanderarnold:english_real_madrid',
  'nene:brazilians_played_for_real_madrid',
  'takefusakubo:both_barcelona_and_real_madrid',
  'takefusakubo:spanish_real_madrid',
  'alexanderisak:played_for_both_dortmund_and_liverpool',
  'pablomari:both_arsenal_and_man_city',
  'nonimadueke:both_chelsea_and_arsenal',
  'luisalberto:both_liverpool_and_barcelona',
  'kerlonmourasouza:both_ajax_and_inter_milan',
  'guilhermesiqueira:both_lazio_and_inter',
  'guilhermesiqueira:both_atletico_and_inter',
  'iagofalque:both_roma_and_juventus',
  'gianlucalapadula:both_parma_and_juventus',
  'ansufati:both_monaco_and_barcelona',
  'albertluque:both_ajax_and_barcelona',
  'guillermovarela:both_real_madrid_and_manchester_united',
]);

// 3. Resolve Duplicate Prompts and Lineup descriptions
originalPrompts.forEach((p, idx) => {
  delete p.targetCount;
  delete p.timeSeconds;
  if (p.id === 'both_bayern_and_dortmund' && idx > 150) {
    p.id = 'both_liverpool_and_man_utd';
    p.prompt = 'Name a footballer who played senior competitive matches for both Liverpool and Manchester United';
    p.category = 'Club Connections';
    p.answers = [
      { text: 'Michael Owen', aliases: ['Owen'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 91.2, commentary: 'Anfield wonderkid turned Old Trafford Premier League champion in 2011!' },
      { text: 'Paul Ince', aliases: ['Ince', 'The Guvnor'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.4, commentary: 'Two Premier League titles with United before captaining Liverpool in 1997!' },
      { text: 'Peter Beardsley', aliases: ['Beardsley'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 35.8, commentary: 'Starred for Liverpool (1987-91) after a brief stint at United in 1982!' },
      { text: 'Phil Chisnall', aliases: ['Chisnall'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 11.2, commentary: 'The last player to transfer DIRECTLY between the two clubs in April 1964!' },
      { text: 'Allenby Chilton', aliases: ['Chilton'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 2.1, commentary: 'Liverpool amateur who became United captain and 1952 league champion!' },
      { text: 'Thomas McNulty', aliases: ['McNulty'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 1.5, commentary: 'Won the 1952 title at United before signing for Liverpool in 1954!' },
      { text: 'Fred Hopkin', aliases: ['Hopkin'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 1.2, commentary: 'Left United for Liverpool in 1921, winning consecutive league titles!' },
      { text: 'Tom Chorlton', aliases: ['Chorlton'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 0.9, commentary: 'Historic defender who moved directly from Liverpool to Man United in 1912!' }
    ];
  }

  if (p.id === 'both_arsenal_and_man_city' && idx > 150) {
    p.id = 'both_chelsea_and_tottenham';
    p.prompt = 'Name a footballer who played senior competitive matches for both Chelsea and Tottenham Hotspur';
    p.category = 'Club Connections';
    p.answers = [
      { text: 'William Gallas', aliases: ['Gallas'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 88.5, commentary: 'Two Premier League titles with Chelsea before captaining Spurs!' },
      { text: 'Eiður Guðjohnsen', aliases: ['Eidur Gudjohnsen', 'Gudjohnsen'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 58.4, commentary: 'Two Premier League titles with Chelsea, later played on loan at Spurs!' },
      { text: 'Glenn Hoddle', aliases: ['Hoddle'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 61.2, commentary: 'Spurs legend who became Chelsea player-manager in 1993!' },
      { text: 'Gus Poyet', aliases: ['Poyet'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 44.1, commentary: 'FA Cup and Cup Winners Cup at Chelsea, then 49 league games for Spurs!' },
      { text: 'Scott Parker', aliases: ['Parker'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: 'Midfielder who won the league with Chelsea and FWA POTY before starring at Spurs!' },
      { text: 'Carlo Cudicini', aliases: ['Cudicini'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.5, commentary: 'Beloved Chelsea shot-stopper who later spent 4 years at White Hart Lane!' },
      { text: 'Jimmy Greaves', aliases: ['Greaves'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 49.3, commentary: 'Record 124 league goals for Chelsea, record 266 goals for Tottenham!' },
      { text: 'Clive Allen', aliases: ['Allen'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 15.6, commentary: 'Iconic 49-goal season at Spurs in 1986-87, later played for Chelsea in 1991!' },
      { text: 'Neil Sullivan', aliases: ['Sullivan'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 12.3, commentary: 'Goalkeeper for Spurs (2000-03) before serving as backup at Chelsea in 2003-04!' },
      { text: 'Gordon Durie', aliases: ['Durie'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 9.8, commentary: 'Scottish forward who scored freely for Chelsea (1986-91) and Spurs (1991-93)!' },
      { text: 'Jason Cundy', aliases: ['Cundy'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 10.4, commentary: 'Defender who played senior matches for both London rivals in the 1990s!' },
      { text: 'Micky Hazard', aliases: ['Hazard'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 8.7, commentary: 'UEFA Cup winner with Spurs, played 81 league games for Chelsea!' },
      { text: 'Terry Venables', aliases: ['Venables', 'El Tel'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 18.2, commentary: 'Over 170 appearances for Chelsea, FA Cup winner at Tottenham in 1967!' }
    ];
  }

  // Update finals lineup prompts to include players who took part (starters and subs)
  if (p.id === 'man_utd_1999_treble_starting_xi') {
    p.prompt = 'Name a footballer who played for Manchester United in the 1999 UEFA Champions League Final against Bayern Munich';
  }
  if (p.id === 'chelsea_2012_munich_final_xi') {
    p.prompt = 'Name a footballer who played for Chelsea in the 2012 UEFA Champions League Final against Bayern Munich';
  }
  if (p.id === 'liverpool_2005_istanbul_xi') {
    p.prompt = 'Name a footballer who played for Liverpool in the 2005 UEFA Champions League Final in Istanbul';
  }
  if (p.id === 'spain_2010_world_cup_final_xi') {
    p.prompt = 'Name a footballer who played for Spain in the 2010 FIFA World Cup Final against Netherlands';
  }
  if (p.id === 'germany_2014_world_cup_final_xi') {
    p.prompt = 'Name a footballer who played for Germany in the 2014 FIFA World Cup Final against Argentina';
  }
});

// Additional explicit verified football crossovers:
const ADDITIONAL_CURATED_PLAYERS = {
  both_arsenal_and_liverpool: [
    { text: 'Alex Oxlade-Chamberlain', aliases: ['Oxlade-Chamberlain', 'The Ox'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 76.0, commentary: '198 appearances for Arsenal, then won Premier League & UCL with Liverpool!' },
    { text: 'Yossi Benayoun', aliases: ['Benayoun'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 58.0, commentary: '134 appearances for Liverpool (hat-tricks in 3 comps) and loan spell at Arsenal!' },
    { text: 'Jermaine Pennant', aliases: ['Pennant'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 52.0, commentary: 'Debut hat-trick for Arsenal, started 2007 Champions League final for Liverpool!' },
    { text: 'Michael Thomas', aliases: ['Thomas'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 55.0, commentary: 'Immortal 1989 title winner at Anfield for Arsenal, later played 163 games for Liverpool!' },
    { text: 'Jimmy Carter', aliases: ['Carter'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 22.0, commentary: 'Winger played senior matches for both Liverpool and Arsenal in the 1990s!' }
  ],

  both_everton_and_liverpool: [
    { text: 'David Johnson', aliases: ['Johnson'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 45.0, commentary: 'Scored for Everton against Liverpool, then won 3 European Cups with Liverpool!' },
    { text: 'Kevin Sheedy', aliases: ['Sheedy'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 52.0, commentary: 'Started at Liverpool before becoming Everton legend, 369 games and 97 goals!' },
    { text: 'Dave Hickson', aliases: ['Hickson'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 24.0, commentary: '"I\'d break every bone in my body for any club I\'m playing for, but I\'d die for Everton" - played for both!' },
    { text: 'Don Hutchison', aliases: ['Hutchison'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 48.0, commentary: 'Midfielder played senior matches for both Merseyside rivals!' },
    { text: 'Conor Coady', aliases: ['Coady'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 51.0, commentary: 'Liverpool academy graduate (2 senior games), later played for Everton on loan in 2022-23!' }
  ],

  both_leicester_and_chelsea: [
    { text: 'Cesare Casadei', aliases: ['Casadei'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 44.0, commentary: 'Chelsea midfielder played 25 games on loan for Leicester in 2023-24 Championship title!' },
    { text: 'Kiernan Dewsbury-Hall', aliases: ['Dewsbury-Hall', 'KDH'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 74.0, commentary: 'Leicester academy star joined Chelsea in summer 2024 for £30m!' }
  ],

  both_sevilla_and_man_city: [
    { text: 'Fernando Reges', aliases: ['Fernando'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 58.0, commentary: '101 games for Man City (2016 League Cup), then 167 games and 2 Europa Leagues for Sevilla!' }
  ],

  dutch_real_madrid: [
    { text: 'John Metgod', aliases: ['Metgod'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 49.0, commentary: 'Dutch defender made 85 appearances for Real Madrid (1982-84), scoring in El Clásico!' }
  ],

  both_tottenham_and_real_madrid: [
    { text: 'Ricardo Rocha', aliases: ['Rocha'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 29.0, commentary: 'Portuguese defender played 18 senior matches for Spurs (2007-09) and was on Real Madrid\'s books!' }
  ],

  both_ajax_and_real_madrid: [
    { text: 'Ismael Urzaiz', aliases: ['Urzaiz'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 26.0, commentary: 'Real Madrid senior debut in 1989 Copa del Rey, later played for Ajax in 2007-08!' }
  ],

  portuguese_man_utd: [
    { text: 'Joel Pereira', aliases: ['Joel Castro Pereira'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 24.0, commentary: 'Portuguese goalkeeper made senior Premier League appearances under José Mourinho!' }
  ],

  portuguese_real_madrid: [
    { text: 'Carlos Secretário', aliases: ['Secretario', 'Carlos Secretario'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 25.0, commentary: 'Portuguese right-back made 13 La Liga appearances for Real Madrid in 1996-97!' }
  ]
};

// 4. Process each prompt
let totalAnswersBefore = 0;
let totalAnswersAfter = 0;

originalPrompts.forEach(p => {
  totalAnswersBefore += p.answers.length;

  const answersMap = new Map();

  function addAnswer(ans) {
    if (!ans || !ans.text) return;
    const norm = normalize(ans.text);
    if (!norm) return;

    // Check strict blacklist of false crossover / false nationality pairs
    const pairKey = `${norm}:${p.id}`;
    if (INVALID_PAIRS.has(pairKey)) {
      return; // Skip invalid false positive!
    }

    if (answersMap.has(norm)) {
      const existing = answersMap.get(norm);
      const combinedAliases = enrichAliases(existing.text, [...(existing.aliases || []), ...(ans.aliases || [])]);
      existing.aliases = combinedAliases;
      return;
    }

    // Auto-generate rich aliases
    const aliases = enrichAliases(ans.text, ans.aliases || []);

    let rarityScore = ans.rarityScore || 50;
    let tier = ans.tier || 'Cult Hero';
    let pickRatePct = ans.pickRatePct || 45.0;

    if (rarityScore === 5) {
      tier = 'Tap-In';
      if (!pickRatePct || pickRatePct < 80) pickRatePct = 88.0;
    } else if (rarityScore === 30) {
      tier = 'Starter XI';
      if (!pickRatePct || pickRatePct < 50 || pickRatePct > 80) pickRatePct = 68.0;
    } else if (rarityScore === 50) {
      tier = 'Cult Hero';
      if (!pickRatePct || pickRatePct < 30 || pickRatePct > 60) pickRatePct = 48.0;
    } else if (rarityScore === 85) {
      tier = "Streets Won't Forget";
      if (!pickRatePct || pickRatePct < 10 || pickRatePct > 35) pickRatePct = 22.0;
    } else if (rarityScore === 100) {
      tier = "Ballon d'Or Knowledge";
      if (!pickRatePct || pickRatePct > 15) pickRatePct = 4.5;
    }

    answersMap.set(norm, {
      text: ans.text,
      aliases,
      rarityScore,
      tier,
      pickRatePct,
      commentary: ans.commentary || 'Official senior competitive appearance!'
    });
  }

  // A. Add existing answers (filtering out any blacklisted false positives)
  p.answers.forEach(a => {
    const pairKey = `${normalize(a.text)}:${p.id}`;
    if (!INVALID_PAIRS.has(pairKey)) {
      addAnswer(a);
    }
  });

  // B. Merge curated additions
  if (ALL_CURATED[p.id]) {
    ALL_CURATED[p.id].forEach(a => addAnswer(a));
  }

  // C. Merge additional curated players
  if (ADDITIONAL_CURATED_PLAYERS[p.id]) {
    ADDITIONAL_CURATED_PLAYERS[p.id].forEach(a => addAnswer(a));
  }

  // Cross-reference special shared prompts:
  if (p.id === 'shirt_number_10_barcelona' && ALL_CURATED['barcelona_no_10']) {
    ALL_CURATED['barcelona_no_10'].forEach(a => addAnswer(a));
  }

  // D. Cross-reference linkUpDatabase for club crossovers
  if (expMappings.LINKUP_CROSSOVER_MAPPINGS[p.id]) {
    const [c1, c2] = expMappings.LINKUP_CROSSOVER_MAPPINGS[p.id];
    const matches = linkUp.filter(pl => {
      if (pl.name === 'Udo Lattek' || pl.commonName === 'Udo Lattek') return false;
      const slugs = pl.clubs.map(c => c.slug);
      return slugs.includes(c1) && slugs.includes(c2);
    });

    matches.forEach(pl => {
      const displayName = pl.commonName || pl.name;
      const norm = normalize(displayName);
      const pairKey = `${norm}:${p.id}`;
      if (INVALID_PAIRS.has(pairKey)) return;

      let rarity = 50;
      let tier = 'Cult Hero';
      let pickRate = 45.0;
      if (pl.difficulty === 'Easy') {
        rarity = 30;
        tier = 'Starter XI';
        pickRate = 65.0;
      } else if (pl.difficulty === 'Hard') {
        rarity = 85;
        tier = "Streets Won't Forget";
        pickRate = 22.0;
      }

      const allAliases = [...(pl.aliases || [])];
      if (pl.name && pl.name !== displayName) allAliases.push(pl.name);

      addAnswer({
        text: displayName,
        aliases: allAliases,
        rarityScore: rarity,
        tier: tier,
        pickRatePct: pickRate,
        commentary: `Played senior competitive matches for both clubs!`
      });
    });
  }

  // E. Cross-reference linkUpDatabase for nationality-at-club prompts
  if (expMappings.LINKUP_NATIONALITY_CLUB_MAPPINGS[p.id]) {
    const [nat, clubSlug] = expMappings.LINKUP_NATIONALITY_CLUB_MAPPINGS[p.id];
    const matches = linkUp.filter(pl => {
      if (pl.name === 'Udo Lattek' || pl.commonName === 'Udo Lattek') return false;
      const natMatch = (pl.nationality || '').toLowerCase() === nat.toLowerCase();
      const clubMatch = pl.clubs.some(c => c.slug === clubSlug);
      return natMatch && clubMatch;
    });

    matches.forEach(pl => {
      const displayName = pl.commonName || pl.name;
      const norm = normalize(displayName);
      const pairKey = `${norm}:${p.id}`;
      if (INVALID_PAIRS.has(pairKey)) return;

      let rarity = 50;
      let tier = 'Cult Hero';
      let pickRate = 45.0;
      if (pl.difficulty === 'Easy') {
        rarity = 30;
        tier = 'Starter XI';
        pickRate = 65.0;
      } else if (pl.difficulty === 'Hard') {
        rarity = 85;
        tier = "Streets Won't Forget";
        pickRate = 22.0;
      }

      const allAliases = [...(pl.aliases || [])];
      if (pl.name && pl.name !== displayName) allAliases.push(pl.name);

      addAnswer({
        text: displayName,
        aliases: allAliases,
        rarityScore: rarity,
        tier: tier,
        pickRatePct: pickRate,
        commentary: `${pl.nationality} international who played senior competitive matches for the club!`
      });
    });
  }

  // F. Finalize answers list
  p.answers = Array.from(answersMap.values());
  totalAnswersAfter += p.answers.length;
});

console.log('Total answers before:', totalAnswersBefore);
console.log('Total answers after clean comprehensive expansion:', totalAnswersAfter);
console.log('Total prompts:', originalPrompts.length);

// 5. Verification Checks
let zeroCount = 0;
let dupIdCount = 0;
const seenIds = new Set();
originalPrompts.forEach((p, pIdx) => {
  if (seenIds.has(p.id)) {
    console.error('DUPLICATE PROMPT ID FOUND:', p.id, 'at index', pIdx);
    dupIdCount++;
  }
  seenIds.add(p.id);

  const seenNorm = new Set();
  p.answers.forEach(a => {
    if (!a.rarityScore || a.rarityScore === 0) zeroCount++;
    const n = normalize(a.text);
    if (seenNorm.has(n)) {
      console.error('Duplicate answer in prompt:', p.id, '-->', a.text);
    }
    seenNorm.add(n);
  });
});

console.log('Verification:');
console.log('Zero rarity count:', zeroCount);
console.log('Duplicate prompt IDs:', dupIdCount);

if (dupIdCount === 0 && zeroCount === 0) {
  // 6. Serialize to TypeScript file
  const outputCode = `import type { SideNettingPrompt } from './types';\n\nexport const SIDE_NETTING_PROMPTS: SideNettingPrompt[] = ${JSON.stringify(originalPrompts, null, 2)};\n`;
  fs.writeFileSync(promptsFilePath, outputCode, 'utf8');
  console.log('Successfully wrote sanitized, expanded database to', promptsFilePath);
} else {
  console.error('Aborting write due to verification errors.');
}
