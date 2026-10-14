const fs = require('fs');
const path = require('path');

// Load source prompts
const promptsFilePath = path.join(__dirname, '..', 'src', 'games', 'side-netting', 'promptsData.ts');
let rawContent = fs.readFileSync(promptsFilePath, 'utf8');
let stripped = rawContent
  .replace(/import type .*?;/g, '')
  .replace(/export const SIDE_NETTING_PROMPTS.*?=\s*/, '')
  .trim()
  .replace(/;$/, '');

const prompts = eval('(' + stripped + ')');
console.log('Loaded original prompts:', prompts.length);

// Load linkUpDatabase for senior cross-referencing
const linkUp = require('../src/data/linkUpDatabase.json');

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
    // Also add First Last if there's a middle name (e.g. Robin van Persie -> Robin Persie or Van Persie)
    if (parts.length === 3 && parts[1].toLowerCase() === 'van' || parts[1].toLowerCase() === 'de' || parts[1].toLowerCase() === 'da') {
      aliasesSet.add(`${parts[1]} ${parts[2]}`);
      aliasesSet.add(removeAccents(`${parts[1]} ${parts[2]}`));
    }
  }

  aliasesSet.delete(text);
  return Array.from(aliasesSet);
}

// 1. Resolve Duplicate Prompts
// Index 225 was a duplicate of both_bayern_and_dortmund
// Index 227 was a duplicate of both_arsenal_and_man_city
prompts.forEach((p, idx) => {
  if (p.id === 'both_bayern_and_dortmund' && idx > 150) {
    p.id = 'both_liverpool_and_man_utd';
    p.prompt = 'Name a footballer who played senior competitive matches for both Liverpool and Manchester United';
    p.category = 'Club Connections';
    p.targetCount = 4;
    p.timeSeconds = 30;
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
    p.targetCount = 5;
    p.timeSeconds = 30;
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
});

// 2. Lineup Prompt Updates (Permit substitutes who took the pitch)
prompts.forEach(p => {
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

console.log('Duplicate prompts resolved and lineup prompts updated.');
