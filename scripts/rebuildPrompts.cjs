const fs = require('fs');
const path = require('path');

// 1. Read existing promptsData.ts
const promptsFilePath = path.join(__dirname, '..', 'src', 'games', 'side-netting', 'promptsData.ts');
let rawContent = fs.readFileSync(promptsFilePath, 'utf8');

// Strip TypeScript declaration to parse as JSON/JS
let stripped = rawContent
  .replace(/import type .*?;/g, '')
  .replace(/export const SIDE_NETTING_PROMPTS.*?=\s*/, '')
  .trim()
  .replace(/;$/, '');

const originalPrompts = eval('(' + stripped + ')');
console.log('Original prompts count:', originalPrompts.length);

// Helper function to normalize name for comparison and duplicate detection
function normalize(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9]/g, '');
}

function removeAccents(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Automatically generate rich aliases for football players/clubs
function enrichAliases(text, existingAliases = []) {
  const aliasesSet = new Set(existingAliases.map(a => a.trim()).filter(Boolean));
  const unaccented = removeAccents(text);
  if (unaccented !== text) {
    aliasesSet.add(unaccented);
  }

  const parts = text.split(' ');
  if (parts.length > 1) {
    // Add surname
    const surname = parts[parts.length - 1];
    if (surname.length >= 3) {
      aliasesSet.add(surname);
      const unaccSurname = removeAccents(surname);
      if (unaccSurname !== surname) {
        aliasesSet.add(unaccSurname);
      }
    }
  }

  // Remove the text itself from aliases if present
  aliasesSet.delete(text);
  return Array.from(aliasesSet);
}

// Non-football filler prompts to drop
const PROMPTS_TO_DROP = new Set([
  'things_found_inside_football_stadium',
  'official_lines_and_markings_on_football_pitch',
  'common_football_referee_equipment',
  'football_positions_traditional',
  'official_fifa_world_cup_match_balls',
  'football_shirt_sponsors_iconic',
]);

// 2. Curated database of missing answers and additions for existing questions
const BACKFILL_MAP = {
  // WC country ending in O
  wc_country_ending_in_o: [
    { text: 'Trinidad and Tobago', aliases: ['Trinidad & Tobago', 'Tobago'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 1.8, commentary: '2006 World Cup under Leo Beenhakker!' }
  ],
  // Club with City in name
  club_with_city_in_name: [
    { text: 'Birmingham City', aliases: ['Birmingham', 'Blues'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 9.4, commentary: 'Premier League regulars in the 2000s under Steve Bruce!' }
  ],
  // Belgian PL title winners
  belgian_players_premier_league: [
    { text: 'Michy Batshuayi', aliases: ['Batshuayi'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.5, commentary: 'Scored the 2016-17 title-winning goal for Chelsea at West Brom!' },
    { text: 'Ritchie De Laet', aliases: ['De Laet'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 2.1, commentary: 'HISTORIC MEDAL! 2015-16 Leicester City champion!' }
  ],
  // French 20+ PL goals
  french_scorers_pl_20: [
    { text: 'Alexandre Lacazette', aliases: ['Lacazette', 'Laca'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.0, commentary: '54 Premier League goals for Arsenal!' },
    { text: 'Sylvain Wiltord', aliases: ['Wiltord'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 32.5, commentary: '31 PL goals, famously sealed the 2002 title at Old Trafford!' },
    { text: 'Yohan Cabaye', aliases: ['Cabaye'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.2, commentary: 'Exactly 20 PL goals for Newcastle and Crystal Palace!' },
    { text: 'Laurent Robert', aliases: ['Robert'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 11.8, commentary: '22 rocket-strike goals for Newcastle!' },
    { text: 'David Ginola', aliases: ['Ginola'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 16.4, commentary: '21 Premier League goals for Newcastle, Spurs, and Villa!' }
  ],
  // African 30+ PL goals
  african_scorers_pl_30: [
    { text: 'Wilfried Zaha', aliases: ['Zaha'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 58.0, commentary: '68 Premier League goals for Crystal Palace!' },
    { text: 'Efan Ekoku', aliases: ['Ekoku'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 8.2, commentary: '52 Premier League goals for Norwich and Wimbledon!' },
    { text: 'Frédéric Kanouté', aliases: ['Kanoute', 'Freddie Kanoute'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 15.6, commentary: '43 PL goals for West Ham and Tottenham!' },
    { text: 'Benni McCarthy', aliases: ['McCarthy'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 16.8, commentary: '37 PL goals for Blackburn and West Ham!' },
    { text: 'Papiss Cissé', aliases: ['Cisse', 'Papiss Cisse'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 18.2, commentary: '37 PL goals, including that iconic Stamford Bridge volley!' }
  ],
  // Portuguese 10+ PL goals
  portuguese_scorers_pl_10: [
    { text: 'Bernardo Silva', aliases: ['Bernardo'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 64.0, commentary: 'Over 35 PL goals for Manchester City!' },
    { text: 'Pedro Neto', aliases: ['Neto'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 36.0, commentary: 'Crucial goalscorer for Wolves and Chelsea!' },
    { text: 'Luís Boa Morte', aliases: ['Boa Morte', 'Luis Boa Morte'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 11.2, commentary: '29 PL goals for Fulham, Southampton, and West Ham!' },
    { text: 'Daniel Podence', aliases: ['Podence'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 15.4, commentary: '12 Premier League goals for Wolves!' }
  ],
  // Portuguese Wolves
  portuguese_played_for_wolves: [
    { text: 'Nélson Semedo', aliases: ['Semedo', 'Nelson Semedo'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 52.0, commentary: 'Ever-present Portuguese right-back!' },
    { text: 'Daniel Podence', aliases: ['Podence'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 44.0, commentary: 'Tricky Portuguese winger!' },
    { text: 'Matheus Nunes', aliases: ['Nunes'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.0, commentary: 'Portuguese midfield dynamo before City move!' },
    { text: 'Gonçalo Guedes', aliases: ['Guedes', 'Goncalo Guedes'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 29.0, commentary: 'Portuguese international attacker!' },
    { text: 'Fábio Silva', aliases: ['Fabio Silva', 'Silva'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 26.0, commentary: 'Record young Portuguese striker!' },
    { text: 'Toti Gomes', aliases: ['Toti'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 16.0, commentary: 'Portuguese international defender!' },
    { text: 'Vitinha', aliases: ['Vitor Ferreira'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.5, commentary: 'Spent a season on loan at Molineux before PSG stardom!' },
    { text: 'Hélder Costa', aliases: ['Helder Costa'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 12.0, commentary: 'Championship promotion wizard!' },
    { text: 'Ivan Cavaleiro', aliases: ['Cavaleiro'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 10.0, commentary: 'Key Portuguese attacker in Wolves return!' },
    { text: 'Rúben Vinagre', aliases: ['Ruben Vinagre', 'Vinagre'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 9.0, commentary: 'Flying Portuguese wing-back!' },
    { text: 'Pedro Gonçalves', aliases: ['Pote', 'Pedro Goncalves'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 3.5, commentary: 'DEEP CUT! Came through Wolves youth and played senior cup game!' },
    { text: 'Roderick Miranda', aliases: ['Miranda'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 2.1, commentary: 'Central defender in Nuno Santo early squad!' }
  ],
  // Argentines PSG
  argentines_psg: [
    { text: 'Javier Pastore', aliases: ['Pastore', 'El Flaco'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: 'First marquee signing of the QSI era, pure magic!' },
    { text: 'Mauro Icardi', aliases: ['Icardi'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.0, commentary: 'Prolific Argentine striker in Paris!' },
    { text: 'Ezequiel Lavezzi', aliases: ['Lavezzi', 'Pocho'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 35.0, commentary: 'El Pocho! High-energy Argentine winger!' },
    { text: 'Leandro Paredes', aliases: ['Paredes'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 32.0, commentary: 'World Cup winner and combative midfielder!' },
    { text: 'Gabriel Heinze', aliases: ['Heinze'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 16.0, commentary: 'Cult hero Argentine defender before Man Utd move!' },
    { text: 'Juan Pablo Sorín', aliases: ['Sorin', 'Juan Pablo Sorin'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 9.5, commentary: 'Long-haired Argentine left-back legend!' },
    { text: 'Mauricio Pochettino', aliases: ['Pochettino'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.0, commentary: 'Captained PSG as a player in 2001-2003!' },
    { text: 'Marcelo Gallardo', aliases: ['Gallardo'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 4.0, commentary: 'Argentine playmaker wore the number 10 in 2007-08!' }
  ],
  // Brazilians PSG
  brazilians_psg: [
    { text: 'Marquinhos', aliases: ['Marcos Aoas Correa'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 82.0, commentary: 'All-time record appearance maker and captain!' },
    { text: 'Thiago Silva', aliases: ['O Monstro'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 78.0, commentary: 'O Monstro, legend of the Parc des Princes!' },
    { text: 'Lucas Moura', aliases: ['Moura'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 56.0, commentary: 'Electric Brazilian winger in Paris!' },
    { text: 'Dani Alves', aliases: ['Alves'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 52.0, commentary: 'Decorated Brazilian full-back!' },
    { text: 'Maxwell', aliases: ['Maxwell Scherrer'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 34.0, commentary: 'Silky Brazilian left-back!' },
    { text: 'Alex', aliases: ['Alex Rodrigo'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.0, commentary: 'The Tank! Cannonball free-kicks for PSG!' },
    { text: 'David Luiz', aliases: ['Luiz'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 41.0, commentary: 'Two Ligue 1 titles in Paris!' },
    { text: 'Raí', aliases: ['Rai'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 12.0, commentary: '1990s PSG legend and World Cup winner!' },
    { text: 'Leonardo', aliases: ['Leonardo Nascimento'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 9.0, commentary: 'Brazilian star before returning as sporting director!' },
    { text: 'Lucas Beraldo', aliases: ['Beraldo'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 8.0, commentary: 'Brazilian defender signed in 2024!' }
  ],
  // Both Arsenal and Liverpool
  both_arsenal_and_liverpool: [
    { text: 'Kolo Touré', aliases: ['Toure', 'Kolo Toure'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.0, commentary: 'Invincible with Arsenal, Europa League finalist with Liverpool!' },
    { text: 'Yossi Benayoun', aliases: ['Benayoun'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.0, commentary: 'Israeli maestro played for Liverpool then loaned to Arsenal!' },
    { text: 'Jermaine Pennant', aliases: ['Pennant'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 18.0, commentary: 'Hat-trick on Arsenal debut, started 2007 UCL final for Liverpool!' },
    { text: 'Ray Kennedy', aliases: ['Kennedy'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 4.5, commentary: 'LEGEND OF BOTH! 1971 Double with Arsenal, 3 European Cups with Liverpool!' },
    { text: 'Michael Thomas', aliases: ['Thomas'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.0, commentary: 'Scored Highbury 1989 Anfield clincher, later won FA Cup with Liverpool!' },
    { text: 'Geoff Strong', aliases: ['Strong'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 1.2, commentary: '1960s forward who transitioned from Arsenal to Shankly Liverpool!' }
  ],
  // Both Bayern and Man Utd
  both_bayern_and_man_utd: [
    { text: 'Matthijs de Ligt', aliases: ['De Ligt'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 68.0, commentary: 'Dutch defender traded Bayern for Old Trafford in 2024!' },
    { text: 'Noussair Mazraoui', aliases: ['Mazraoui'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 58.0, commentary: 'Moroccan full-back signed from Bayern in 2024!' },
    { text: 'Marcel Sabitzer', aliases: ['Sabitzer'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 36.0, commentary: 'Austrian midfielder loaned to Man Utd from Bayern in 2023!' },
    { text: 'Daley Blind', aliases: ['Blind'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 34.0, commentary: 'FA Cup winner with Man Utd, later won Bundesliga with Bayern!' },
    { text: 'Mark Hughes', aliases: ['Sparky'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 12.0, commentary: 'Iconic Welsh striker loaned to Bayern in 1987-88!' }
  ],
  // Both Dortmund and Arsenal
  both_dortmund_and_arsenal: [
    { text: 'Tomáš Rosický', aliases: ['Rosicky', 'Tomas Rosicky', 'Little Mozart'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 65.0, commentary: 'Little Mozart won Bundesliga in 2002 before Highbury glory!' },
    { text: 'Jens Lehmann', aliases: ['Lehmann'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 48.0, commentary: 'Invincible at Arsenal after winning Bundesliga with BVB in 2002!' },
    { text: 'Sokratis Papastathopoulos', aliases: ['Sokratis'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 36.0, commentary: 'Greek defender went from Westfalenstadion to Emirates!' }
  ],
  // Brazilians Arsenal
  brazilians_arsenal: [
    { text: 'Gabriel Jesus', aliases: ['Jesus'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 88.0, commentary: 'Brazilian number 9 at the Emirates!' },
    { text: 'Gabriel Magalhães', aliases: ['Gabriel', 'Gabriel Magalhaes'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 84.0, commentary: 'Rock solid Brazilian center-back!' },
    { text: 'David Luiz', aliases: ['Luiz'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.0, commentary: 'Won FA Cup in 2020 with Arsenal!' },
    { text: 'Willian', aliases: ['Willian Borges'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 54.0, commentary: 'Brazilian winger season in North London!' },
    { text: 'Sylvinho', aliases: ['Silvinho'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.0, commentary: 'First Brazilian to play for Arsenal in 1999!' },
    { text: 'Denílson', aliases: ['Denilson', 'Denilson Pereira Neves'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 16.5, commentary: 'Over 150 appearances under Arsène Wenger!' },
    { text: 'André Santos', aliases: ['Andre Santos'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 11.0, commentary: 'Cult left-back who scored at Stamford Bridge!' },
    { text: 'Júlio Baptista', aliases: ['Julio Baptista', 'The Beast'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 15.0, commentary: 'The Beast scored 4 goals at Anfield in the League Cup!' }
  ],
  // Brazilians Liverpool
  brazilians_liverpool: [
    { text: 'Fabinho', aliases: ['Fabio Henrique Tavares'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 85.0, commentary: 'The Lighthouse! Premier League and Champions League winner!' },
    { text: 'Lucas Leiva', aliases: ['Lucas'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 64.0, commentary: 'Unlucky! Cult hero with 346 Liverpool appearances!' },
    { text: 'Fábio Aurélio', aliases: ['Fabio Aurelio', 'Aurelio'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 18.0, commentary: 'Pinpoint free-kick master at Old Trafford and Chelsea!' },
    { text: 'Arthur Melo', aliases: ['Arthur'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 4.0, commentary: 'Loan spell from Juventus in 2022-23!' },
    { text: 'Diego Cavalieri', aliases: ['Cavalieri'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 2.2, commentary: 'Brazilian backup keeper under Benítez!' },
    { text: 'Doni', aliases: ['Alexander Doni'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 1.8, commentary: 'Former Roma keeper made senior appearances in 2012!' }
  ],
  // Dutch Liverpool
  dutch_liverpool: [
    { text: 'Cody Gakpo', aliases: ['Gakpo'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 86.0, commentary: 'Dutch forward signed in 2023!' },
    { text: 'Ryan Gravenberch', aliases: ['Gravenberch'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 82.0, commentary: 'Dutch midfield dynamo!' },
    { text: 'Boudewijn Zenden', aliases: ['Bolo Zenden', 'Zenden'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 18.0, commentary: 'Started 2007 Champions League final!' },
    { text: 'Sander Westerveld', aliases: ['Westerveld'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.5, commentary: '2001 Treble-winning goalkeeper!' },
    { text: 'Jan Kromkamp', aliases: ['Kromkamp'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 3.5, commentary: '2006 FA Cup final winner off the bench!' },
    { text: 'Erik Meijer', aliases: ['Meijer'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 2.5, commentary: 'Cult hero Dutch striker with the traveling fans in Dortmund!' }
  ],
  // Germans Arsenal
  germans_arsenal: [
    { text: 'Kai Havertz', aliases: ['Havertz'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 91.0, commentary: 'German international attacker at the Emirates!' },
    { text: 'Serge Gnabry', aliases: ['Gnabry'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 58.0, commentary: 'Made senior Premier League breakthrough under Wenger!' },
    { text: 'Shkodran Mustafi', aliases: ['Mustafi'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: 'World Cup winner with two FA Cups at Arsenal!' }
  ],
  // Germans Chelsea
  germans_chelsea: [
    { text: 'Timo Werner', aliases: ['Werner'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 68.0, commentary: '2021 Champions League winner!' },
    { text: 'André Schürrle', aliases: ['Andre Schurrle', 'Schurrle'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: 'Hat-trick vs Fulham and 2015 Premier League medal!' },
    { text: 'Robert Huth', aliases: ['Huth'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.0, commentary: 'The Berlin Wall began his career under Ranieri & Mourinho!' },
    { text: 'Marko Marin', aliases: ['Marin'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 4.8, commentary: 'The German Messi made competitive appearances in 2012-13!' }
  ],
  // Germans Liverpool
  germans_liverpool: [
    { text: 'Markus Babbel', aliases: ['Babbel'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 36.0, commentary: '2001 cup treble hero right-back!' },
    { text: 'Christian Ziege', aliases: ['Ziege'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 15.0, commentary: 'German wing-back with a deadly left foot!' },
    { text: 'Karl-Heinz Riedle', aliases: ['Riedle'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 12.0, commentary: 'World Cup winner scored 15 goals for Liverpool!' },
    { text: 'Loris Karius', aliases: ['Karius'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 44.0, commentary: 'German goalkeeper who played 49 matches!' }
  ],
  // Both Leicester and Chelsea
  both_leicester_and_chelsea: [
    { text: 'Wesley Fofana', aliases: ['Fofana'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.0, commentary: 'French center-back signed from Leicester for big money!' },
    { text: 'Kiernan Dewsbury-Hall', aliases: ['Dewsbury-Hall', 'KDH'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 56.0, commentary: 'Reunited with Maresca at Stamford Bridge in 2024!' },
    { text: 'Mark Schwarzer', aliases: ['Schwarzer'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.0, commentary: 'Won back-to-back Premier League medals with Chelsea & Leicester!' },
    { text: 'Frank Sinclair', aliases: ['Sinclair'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 12.5, commentary: 'FA Cup winner with Chelsea, League Cup winner with Leicester!' },
    { text: 'Dennis Wise', aliases: ['Wise'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 15.0, commentary: 'Legendary Chelsea captain spent a season at Filbert Street!' }
  ],
  // Both Bayern and PSG
  played_for_both_bayern_and_psg: [
    { text: 'Kingsley Coman', aliases: ['Coman'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 88.0, commentary: 'Scored 2020 UCL winner for Bayern against his boyhood club PSG!' },
    { text: 'Juan Bernat', aliases: ['Bernat'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: 'Spanish full-back played key roles for both giants!' },
    { text: 'Eric Maxim Choupo-Moting', aliases: ['Choupo-Moting', 'Choupo'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 64.0, commentary: 'Cult striker starred for both Paris and Munich!' },
    { text: 'Renato Sanches', aliases: ['Sanches'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.0, commentary: 'Golden Boy winner played for Bayern then PSG!' },
    { text: 'Lucas Hernandez', aliases: ['Hernandez'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 58.0, commentary: 'World Cup winner moved from Bayern to Paris in 2023!' },
    { text: 'Tanguy Nianzou', aliases: ['Kouassi', 'Nianzou'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 3.5, commentary: 'Young French defender went from PSG academy to Bayern Munich!' }
  ],
  // Both Sevilla and Man City
  both_sevilla_and_man_city: [
    { text: 'Samir Nasri', aliases: ['Nasri'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.0, commentary: 'Two Premier League titles with City, loaned to Sevilla!' },
    { text: 'Nolito', aliases: ['Manuel Agudo Duran'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 36.0, commentary: 'Spanish winger played for Guardiola then joined Sevilla!' },
    { text: 'Stevan Jovetić', aliases: ['Jovetic'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 32.0, commentary: 'Montenegrin striker scored for both City and Sevilla!' }
  ],
  // Both Valencia and Man City
  both_valencia_and_man_city: [
    { text: 'Ferran Torres', aliases: ['Ferran'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 65.0, commentary: 'Valencia academy graduate moved to City then Barcelona!' },
    { text: 'Nicolás Otamendi', aliases: ['Otamendi'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 58.0, commentary: 'Two Premier League titles with City after starring at the Mestalla!' },
    { text: 'Álvaro Negredo', aliases: ['Negredo', 'The Beast'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.0, commentary: 'The Beast scored 23 goals in his solitary City season!' }
  ],
  // Both Inter and Liverpool
  both_inter_and_liverpool: [
    { text: 'Mario Balotelli', aliases: ['Balotelli', 'Super Mario'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 64.0, commentary: 'Treble winner at Inter under Mourinho, signed by Rodgers in 2014!' },
    { text: 'Robbie Keane', aliases: ['Keane'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: 'Transferred to Lippi Inter in 2000, played for Liverpool in 2008!' },
    { text: 'Paul Ince', aliases: ['Ince', 'The Guvnor'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 18.0, commentary: 'The Guvnor spent two iconic seasons at the San Siro!' },
    { text: 'Xherdan Shaqiri', aliases: ['Shaqiri'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 45.0, commentary: 'Played for Inter in 2015 before winning UCL with Liverpool!' },
    { text: 'Daniele Padelli', aliases: ['Padelli'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 2.1, commentary: 'Italian goalkeeper played one match for Liverpool in 2007!' }
  ],
  // Both Milan and Liverpool
  both_milan_and_liverpool: [
    { text: 'Fernando Torres', aliases: ['El Nino', 'Torres'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 88.0, commentary: '81 goals for Liverpool, later played for the Rossoneri!' },
    { text: 'Suso', aliases: ['Jesus Joaquin Fernandez'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 36.0, commentary: 'Came through Liverpool youth before blossoming at San Siro!' },
    { text: 'Alberto Aquilani', aliases: ['Aquilani'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 32.0, commentary: 'Italian midfielder played for Liverpool and loaned to Milan!' },
    { text: 'Christian Ziege', aliases: ['Ziege'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.0, commentary: 'Won Scudetto with Milan in 1999, won treble with Liverpool in 2001!' },
    { text: 'Divock Origi', aliases: ['Origi'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 68.0, commentary: 'Champions League final hero moved to San Siro in 2022!' }
  ],
  // Both Atletico and Man City
  both_atletico_and_man_city: [
    { text: 'Stefan Savić', aliases: ['Savic', 'Stefan Savic'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: 'Won 2011-12 Premier League with City before becoming Atleti captain!' },
    { text: 'Martín Demichelis', aliases: ['Demichelis'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 18.0, commentary: 'Signed for Atlético on a free, then sold to City without playing!' }
  ],
  // Both Porto and Real Madrid
  both_porto_and_real_madrid: [
    { text: 'James Rodríguez', aliases: ['James', 'James Rodriguez'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 72.0, commentary: 'Won Europa League with Porto before 2014 Real Madrid Galáctico move!' },
    { text: 'Danilo', aliases: ['Danilo Luiz'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.0, commentary: 'Won two Champions Leagues with Real Madrid after Porto move!' },
    { text: 'Éder Militão', aliases: ['Militao', 'Eder Militao'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 68.0, commentary: 'Towering Brazilian center-back moved from Do Dragão to Bernabéu!' },
    { text: 'Ricardo Carvalho', aliases: ['Carvalho'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: '2004 Champions League winner at Porto, reunited with Mourinho at Madrid!' },
    { text: 'Casemiro', aliases: ['Carlos Henrique Casimiro'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 58.0, commentary: 'Crucial loan spell at Porto in 2014-15 before winning 5 UCLs at Madrid!' }
  ],
  // Both Benfica and Real Madrid
  both_benfica_and_real_madrid: [
    { text: 'Fábio Coentrão', aliases: ['Coentrao', 'Fabio Coentrao'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.0, commentary: 'Portuguese full-back won La Décima after Benfica move!' },
    { text: 'Javier Saviola', aliases: ['Saviola', 'El Conejo'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.0, commentary: 'El Conejo scored for both European giants!' },
    { text: 'Ezequiel Garay', aliases: ['Garay'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 34.0, commentary: 'Argentine center-back moved from Madrid to Benfica!' },
    { text: 'Raúl de Tomás', aliases: ['RDT', 'Raul de Tomas'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.0, commentary: 'Real Madrid academy product joined Benfica in 2019!' }
  ],
  // Both Sporting and Real Madrid
  both_sporting_and_real_madrid: [
    { text: 'Pedro Porro', aliases: ['Porro'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 12.0, commentary: 'Starred for Sporting CP after youth in Spain!' }
  ],
  // Both Ajax and Real Madrid
  both_ajax_and_real_madrid: [
    { text: 'Michael Laudrup', aliases: ['Laudrup'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: 'La Liga title with Real Madrid, finished career winning Eredivisie with Ajax!' },
    { text: 'Johnny Rep', aliases: ['Rep'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 2.8, commentary: 'European Cup winner with Ajax, later played in Spain!' }
  ],
};

// 3. New high-impact football trivia prompts to replace the 6 filler ones and expand the bank
const NEW_PROMPTS = [
  {
    id: 'champions_league_final_goalscorers',
    prompt: 'Name a footballer who has scored at least one goal in a UEFA Champions League Final (1993-present)',
    category: 'Trophy Vault',
    difficulty: 'Medium',
    description: 'Goalscorers on the grandest club stage in world football.',
    answers: [
      { text: 'Cristiano Ronaldo', aliases: ['CR7', 'Ronaldo'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 94.0, commentary: 'Scored in 2008, 2014, and two in 2017!' },
      { text: 'Lionel Messi', aliases: ['Messi'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 91.0, commentary: 'Headed home in 2009 in Rome, drilled home in 2011 at Wembley!' },
      { text: 'Gareth Bale', aliases: ['Bale'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 88.0, commentary: 'Iconic bicycle kick in 2018 Kyiv and extra-time header in 2014 Lisbon!' },
      { text: 'Zinedine Zidane', aliases: ['Zidane', 'Zizou'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 76.0, commentary: 'The greatest volley in Champions League history in 2002 Hampden Park!' },
      { text: 'Karim Benzema', aliases: ['Benzema'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 68.0, commentary: 'Intercepted Karius roll in 2018 Kyiv!' },
      { text: 'Vinícius Júnior', aliases: ['Vinicius Junior', 'Vini Jr', 'Vinicius'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 65.0, commentary: 'Scored the winning goals in both 2022 and 2024 UCL finals!' },
      { text: 'Didier Drogba', aliases: ['Drogba'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.0, commentary: '88th minute bullet header in 2012 Munich before winning penalty!' },
      { text: 'Sergio Ramos', aliases: ['Ramos'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 59.0, commentary: '92:48 header in Lisbon 2014, and scored again in Milan 2016!' },
      { text: 'Diego Milito', aliases: ['Milito'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 44.0, commentary: 'Both goals in the 2010 Bernabéu final to seal Inter treble!' },
      { text: 'Mario Mandžukić', aliases: ['Mandzukic', 'Mario Mandzukic'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.0, commentary: 'Scored for Bayern in 2013 and scored an outrageous overhead kick for Juve in 2017!' },
      { text: 'Hernán Crespo', aliases: ['Crespo', 'Hernan Crespo'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 34.0, commentary: 'Scored a magnificent brace for Milan in Istanbul 2005!' },
      { text: 'Steven Gerrard', aliases: ['Gerrard'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 41.0, commentary: 'Header sparked the Miracle of Istanbul in 2005!' },
      { text: 'Casemiro', aliases: ['Carlos Henrique Casimiro'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 28.0, commentary: 'Deflected rocket in Cardiff 2017 vs Juventus!' },
      { text: 'Kingsley Coman', aliases: ['Coman'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 26.0, commentary: 'Winning header against boyhood club PSG in Lisbon 2020!' },
      { text: 'Kai Havertz', aliases: ['Havertz'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 35.0, commentary: 'Rounded Ederson to seal the 2021 Champions League for Chelsea!' },
      { text: 'Rodri', aliases: ['Rodrigo Hernandez'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 39.0, commentary: 'Struck the historic treble-winning goal for Man City in Istanbul 2023!' },
      { text: 'Lars Ricken', aliases: ['Ricken'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 12.0, commentary: 'Sensational first-touch chip 16 seconds after coming on for Dortmund in 1997!' },
      { text: 'Dejan Savićević', aliases: ['Savicevic', 'Dejan Savicevic'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.0, commentary: 'Outrageous 35-yard lob over Zubizarreta in 1994 Athens!' },
      { text: 'Juliano Belletti', aliases: ['Belletti'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 16.0, commentary: 'His only ever goal for Barcelona won the 2006 final vs Arsenal in Paris!' },
      { text: 'Vladimir Šmicer', aliases: ['Smicer', 'Vladimir Smicer'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 9.0, commentary: 'Long-range drive in Istanbul 2005 on his final Liverpool appearance!' },
      { text: 'Steve McManaman', aliases: ['McManaman'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 15.0, commentary: 'Scissor volley in 2000 Paris against Valencia!' },
      { text: 'Daniele Massaro', aliases: ['Massaro'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 3.5, commentary: 'Brace for AC Milan in the 4-0 demolition of Cruyff Dream Team in 1994!' },
      { text: 'Basile Boli', aliases: ['Boli'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 2.1, commentary: 'Scored the only goal in Munich 1993 for Marseille vs Milan!' }
    ]
  },
  {
    id: 'world_cup_final_goalscorers',
    prompt: 'Name a male footballer who has scored a goal in a FIFA Men\'s World Cup Final',
    category: 'World Cup Legends',
    difficulty: 'Medium',
    description: 'Goalscorers on the ultimate international stage.',
    answers: [
      { text: 'Pelé', aliases: ['Pele', 'Edson Arantes'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 92.0, commentary: 'Brace as a 17-year-old in 1958, header in 1970 Mexico!' },
      { text: 'Kylian Mbappé', aliases: ['Kylian Mbappe', 'Mbappe'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 91.0, commentary: 'Scored in 2018 Moscow, historic hat-trick in 2022 Lusail!' },
      { text: 'Lionel Messi', aliases: ['Messi'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 89.0, commentary: 'Brace in Lusail 2022 to claim the ultimate crown!' },
      { text: 'Ronaldo Nazário', aliases: ['R9', 'Ronaldo', 'El Fenomeno'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 86.0, commentary: 'Yokohama 2002 double past Oliver Kahn!' },
      { text: 'Zinedine Zidane', aliases: ['Zidane'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 75.0, commentary: 'Two headers in 1998, panenka penalty in 2006!' },
      { text: 'Andrés Iniesta', aliases: ['Iniesta', 'Andres Iniesta'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 72.0, commentary: '116th minute extra-time half-volley in Johannesburg 2010!' },
      { text: 'Mario Götze', aliases: ['Gotze', 'Mario Gotze'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 66.0, commentary: '113th minute chest-and-volley winner in Maracanã 2014!' },
      { text: 'Geoff Hurst', aliases: ['Hurst'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 44.0, commentary: 'Historic 1966 hat-trick at Wembley for England!' },
      { text: 'Ángel Di María', aliases: ['Di Maria', 'Angel Di Maria'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.0, commentary: 'Swept home breathtaking team goal in 2022 Lusail!' },
      { text: 'Marco Materazzi', aliases: ['Materazzi'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.0, commentary: 'Headed equalizer in Berlin 2006 before the infamous headbutt!' },
      { text: 'Mario Mandžukić', aliases: ['Mandzukic'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 35.0, commentary: 'Scored for Croatia in Moscow 2018!' },
      { text: 'Ivan Perišić', aliases: ['Perisic', 'Ivan Perisic'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 32.0, commentary: 'Stunner into the corner in 2018 Moscow final!' },
      { text: 'Paul Pogba', aliases: ['Pogba'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: 'Curled home from outside the box in 2018 Moscow!' },
      { text: 'Antoine Griezmann', aliases: ['Griezmann'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 40.0, commentary: 'Cool penalty in Moscow 2018 final!' },
      { text: 'Gerd Müller', aliases: ['Gerd Muller', 'Muller'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 36.0, commentary: 'Winner in Munich 1974 vs Cruyff Netherlands!' },
      { text: 'Jorge Valdano', aliases: ['Valdano'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.0, commentary: 'Clinical counter-attack goal in Mexico 1986!' },
      { text: 'Jorge Burruchaga', aliases: ['Burruchaga'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 12.0, commentary: '84th-minute winner from Maradona through-ball in 1986!' },
      { text: 'Emmanuel Petit', aliases: ['Petit'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 18.0, commentary: 'Sealed 3-0 triumph in Paris 1998 with last kick!' },
      { text: 'Helmut Rahn', aliases: ['Rahn'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 2.2, commentary: 'The Miracle of Bern in 1954 brace vs Hungary!' },
      { text: 'Alcides Ghiggia', aliases: ['Ghiggia'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 1.5, commentary: 'Silenced 200,000 Brazilians in the 1950 Maracanaço!' }
    ]
  },
  {
    id: 'premier_league_100_goals',
    prompt: 'Name a footballer who has scored at least 100 Premier League goals',
    category: 'Goal Machines',
    difficulty: 'Easy',
    description: 'Members of the exclusive Premier League 100 Club.',
    answers: [
      { text: 'Alan Shearer', aliases: ['Shearer'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 96.0, commentary: 'All-time record holder with 260 goals!' },
      { text: 'Harry Kane', aliases: ['Kane'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 92.0, commentary: '213 Premier League goals!' },
      { text: 'Wayne Rooney', aliases: ['Rooney'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 91.0, commentary: '208 Premier League goals!' },
      { text: 'Sergio Agüero', aliases: ['Aguero', 'Sergio Aguero'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 89.0, commentary: '184 Premier League goals, highest scoring foreign player!' },
      { text: 'Thierry Henry', aliases: ['Henry'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 88.0, commentary: '175 goals in 258 appearances!' },
      { text: 'Mohamed Salah', aliases: ['Salah', 'Mo Salah'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 87.0, commentary: 'Surpassed 160+ Premier League goals!' },
      { text: 'Frank Lampard', aliases: ['Lampard'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 84.0, commentary: 'Highest scoring midfielder in PL history with 177 goals!' },
      { text: 'Robbie Fowler', aliases: ['Fowler', 'God'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.0, commentary: '163 goals for Liverpool, Leeds, and Man City!' },
      { text: 'Jermain Defoe', aliases: ['Defoe'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 59.0, commentary: '162 Premier League goals!' },
      { text: 'Michael Owen', aliases: ['Owen'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 56.0, commentary: '150 Premier League goals!' },
      { text: 'Les Ferdinand', aliases: ['Ferdinand', 'Sir Les'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 41.0, commentary: '149 Premier League goals!' },
      { text: 'Teddy Sheringham', aliases: ['Sheringham'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 44.0, commentary: '146 Premier League goals!' },
      { text: 'Robin van Persie', aliases: ['Van Persie', 'RVP'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 65.0, commentary: '144 Premier League goals for Arsenal and Man Utd!' },
      { text: 'Jamie Vardy', aliases: ['Vardy'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 68.0, commentary: 'Centurion with over 135+ PL goals!' },
      { text: 'Jimmy Floyd Hasselbaink', aliases: ['Hasselbaink'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.0, commentary: '127 Premier League goals!' },
      { text: 'Robbie Keane', aliases: ['Keane'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 36.0, commentary: '126 Premier League goals!' },
      { text: 'Nicolas Anelka', aliases: ['Anelka'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 35.0, commentary: '125 goals across 6 different Premier League clubs!' },
      { text: 'Dwight Yorke', aliases: ['Yorke'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 32.0, commentary: '123 Premier League goals!' },
      { text: 'Son Heung-min', aliases: ['Son', 'Heung-min Son'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 70.0, commentary: 'Centurion with 120+ goals for Spurs!' },
      { text: 'Romelu Lukaku', aliases: ['Lukaku'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 61.0, commentary: '121 Premier League goals!' },
      { text: 'Steven Gerrard', aliases: ['Gerrard'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 66.0, commentary: '120 Premier League goals from midfield!' },
      { text: 'Ian Wright', aliases: ['Wright', 'Wrighty'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 45.0, commentary: '113 Premier League goals!' },
      { text: 'Raheem Sterling', aliases: ['Sterling'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 58.0, commentary: 'Over 120+ PL goals for Liverpool, City, and Chelsea!' },
      { text: 'Sadio Mané', aliases: ['Mane', 'Sadio Mane'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 64.0, commentary: '111 Premier League goals!' },
      { text: 'Dion Dublin', aliases: ['Dublin'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 15.0, commentary: '111 goals for Coventry, Villa, and Man Utd!' },
      { text: 'Emile Heskey', aliases: ['Heskey'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 33.0, commentary: '110 Premier League goals!' },
      { text: 'Ryan Giggs', aliases: ['Giggs'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 37.0, commentary: '109 Premier League goals!' },
      { text: 'Peter Crouch', aliases: ['Crouch', 'Crouchy'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: '108 goals, record 53 headers!' },
      { text: 'Paul Scholes', aliases: ['Scholes'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 40.0, commentary: '107 Premier League goals!' },
      { text: 'Darren Bent', aliases: ['Bent'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 16.0, commentary: '106 Premier League goals!' },
      { text: 'Didier Drogba', aliases: ['Drogba'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 69.0, commentary: '104 Premier League goals for Chelsea!' },
      { text: 'Cristiano Ronaldo', aliases: ['CR7', 'Ronaldo'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 85.0, commentary: '103 Premier League goals for Manchester United!' },
      { text: 'Matt Le Tissier', aliases: ['Le Tissier', 'Le Tiss'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 18.0, commentary: '100 Premier League goals for Southampton, 47/48 penalties!' }
    ]
  },
  {
    id: 'both_chelsea_and_real_madrid',
    prompt: 'Name a footballer who played senior competitive matches for both Chelsea and Real Madrid',
    category: 'Club Connections',
    difficulty: 'Easy',
    description: 'Star ballers who represented both Kings of Europe.',
    answers: [
      { text: 'Eden Hazard', aliases: ['Hazard'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 92.0, commentary: 'Chelsea icon before historic 2019 Galáctico transfer!' },
      { text: 'Thibaut Courtois', aliases: ['Courtois'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 88.0, commentary: 'Two Premier Leagues with Chelsea, two UCLs with Real Madrid!' },
      { text: 'Antonio Rüdiger', aliases: ['Rudiger', 'Antonio Rudiger'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 85.0, commentary: 'UCL winner with Chelsea in 2021, UCL winner with Real Madrid in 2024!' },
      { text: 'Mateo Kovačić', aliases: ['Kovacic', 'Mateo Kovacic'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 66.0, commentary: 'Three Champions Leagues with Madrid, 2021 UCL with Chelsea!' },
      { text: 'Michael Essien', aliases: ['Essien', 'The Bison'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 58.0, commentary: 'Reunited with Mourinho at the Bernabéu on loan in 2012-13!' },
      { text: 'Ricardo Carvalho', aliases: ['Carvalho'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 52.0, commentary: 'Defensive rock for both Mourinho teams!' },
      { text: 'Claude Makélélé', aliases: ['Makelele', 'Claude Makelele'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.0, commentary: 'Defined the modern holding midfield role for both giants!' },
      { text: 'Álvaro Morata', aliases: ['Morata', 'Alvaro Morata'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 55.0, commentary: 'Academy graduate at Madrid, big-money striker for Chelsea in 2017!' },
      { text: 'Arjen Robben', aliases: ['Robben'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 60.0, commentary: 'Won back-to-back PL titles at Chelsea, La Liga in 2008 with Madrid!' },
      { text: 'Nicolas Anelka', aliases: ['Anelka'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 44.0, commentary: '1999-2000 UCL winner with Madrid, 2009-10 Double winner with Chelsea!' },
      { text: 'Kepa Arrizabalaga', aliases: ['Kepa'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 41.0, commentary: 'Loaned to Madrid in 2023-24 to cover Courtois injury, won UCL!' },
      { text: 'Marcos Alonso', aliases: ['Alonso'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 36.0, commentary: 'Chelsea wing-back came through Real Madrid academy and played senior game!' },
      { text: 'Geremi', aliases: ['Geremi Njitap'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 15.0, commentary: 'Two Champions Leagues with Real Madrid, two PL titles with Chelsea!' },
      { text: 'Christian Panucci', aliases: ['Panucci'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 4.0, commentary: '1998 Champions League winner with Madrid, brief Chelsea loan in 2000!' }
    ]
  },
  {
    id: 'both_barcelona_and_chelsea',
    prompt: 'Name a footballer who played senior competitive matches for both Barcelona and Chelsea',
    category: 'Club Connections',
    difficulty: 'Easy',
    description: 'Icons of the iconic Champions League European rivalry.',
    answers: [
      { text: 'Cesc Fàbregas', aliases: ['Fabregas', 'Cesc Fabregas'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 91.0, commentary: 'La Masia star returned home, then won two Premier Leagues with Chelsea!' },
      { text: 'Pedro', aliases: ['Pedro Rodriguez'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 68.0, commentary: 'Won everything with Guardiola, then Premier League & Europa League with Chelsea!' },
      { text: 'Samuel Eto\'o', aliases: ['Etoo', 'Samuel Etoo'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 65.0, commentary: 'Scored in two UCL finals for Barça, joined Mourinho at Chelsea in 2013!' },
      { text: 'Deco', aliases: ['Anderson Luis de Souza'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.0, commentary: '2006 Champions League with Barça, 2010 Double with Chelsea!' },
      { text: 'Pierre-Emerick Aubameyang', aliases: ['Aubameyang', 'Auba'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 58.0, commentary: '13 goals in 24 games for Barça in 2022 before Chelsea switch!' },
      { text: 'João Félix', aliases: ['Joao Felix', 'Felix'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 52.0, commentary: 'Loan spells at both Chelsea and Barcelona!' },
      { text: 'Marcos Alonso', aliases: ['Alonso'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 44.0, commentary: 'Won Premier League & UCL with Chelsea, moved to Barça in 2022!' },
      { text: 'Andreas Christensen', aliases: ['Christensen'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: '2021 Champions League winner with Chelsea, moved on free to Barça!' },
      { text: 'Eidur Gudjohnsen', aliases: ['Gudjohnsen'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.0, commentary: 'Two PL titles with Chelsea, 2009 Treble winner with Barcelona!' },
      { text: 'Juliano Belletti', aliases: ['Belletti'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 35.0, commentary: '2006 UCL final hero for Barça, won 2010 Double with Chelsea!' },
      { text: 'Mark Hughes', aliases: ['Sparky'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.0, commentary: 'Played under Terry Venables at Camp Nou in 1986, later starred for Chelsea!' },
      { text: 'Boudewijn Zenden', aliases: ['Bolo Zenden', 'Zenden'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 15.0, commentary: 'La Liga title with Barça in 1999, joined Chelsea in 2001!' },
      { text: 'Oriol Romeu', aliases: ['Romeu'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 16.0, commentary: 'La Masia graduate, won 2012 UCL with Chelsea, returned to Barça in 2023!' },
      { text: 'Albert Ferrer', aliases: ['Ferrer', 'Chapi Ferrer'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 11.0, commentary: '1992 European Cup winner with Dream Team, FA Cup with Chelsea!' },
      { text: 'Winston Bogarde', aliases: ['Bogarde'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 4.0, commentary: 'Famous Dutch defender played for van Gaal Barça then Chelsea!' },
      { text: 'Emmanuel Petit', aliases: ['Petit'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 33.0, commentary: 'Camp Nou in 2000-01, joined Chelsea in 2001!' }
    ]
  },
  {
    id: 'both_real_madrid_and_juventus',
    prompt: 'Name a footballer who played senior competitive matches for both Real Madrid and Juventus',
    category: 'Club Connections',
    difficulty: 'Easy',
    description: 'Legends who donned both the white of Madrid and bianconeri of Juve.',
    answers: [
      { text: 'Cristiano Ronaldo', aliases: ['CR7', 'Ronaldo'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 95.0, commentary: '450 goals for Real Madrid, 101 goals for Juventus!' },
      { text: 'Zinedine Zidane', aliases: ['Zidane', 'Zizou'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 91.0, commentary: 'Ballon d\'Or at Juventus in 1998, world record move to Real Madrid in 2001!' },
      { text: 'Gonzalo Higuaín', aliases: ['Higuain', 'Gonzalo Higuain', 'Pipita'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 70.0, commentary: 'Over 100 goals for Real Madrid, over 65 goals for Juventus!' },
      { text: 'Álvaro Morata', aliases: ['Morata', 'Alvaro Morata'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 68.0, commentary: 'Scored in 2015 UCL semi for Juve against Madrid, won UCL with both!' },
      { text: 'Ángel Di María', aliases: ['Di Maria', 'Angel Di Maria'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.0, commentary: 'La Décima hero in 2014, played season for Juve in 2022-23!' },
      { text: 'Fabio Cannavaro', aliases: ['Cannavaro'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 64.0, commentary: 'Won 2006 World Cup & Ballon d\'Or before moving from Juve to Madrid!' },
      { text: 'Sami Khedira', aliases: ['Khedira'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: '2014 UCL with Madrid, 5 Serie A titles with Juventus!' },
      { text: 'Michael Laudrup', aliases: ['Laudrup'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.0, commentary: 'Serie A title with Juve, 1995 La Liga title with Real Madrid!' },
      { text: 'Emerson', aliases: ['Emerson Ferreira'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.0, commentary: 'The Puma followed Capello from Juventus to Real Madrid in 2006!' },
      { text: 'Nicolas Anelka', aliases: ['Anelka'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 16.0, commentary: 'Brief loan spell at Juventus in 2013 won Serie A medal!' },
      { text: 'Juan Esnáider', aliases: ['Esnaider', 'Juan Esnaider'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 3.2, commentary: 'Argentine striker had spells at both Real Madrid and Juventus in 1990s!' }
    ]
  },
  {
    id: 'both_bayern_and_dortmund',
    prompt: 'Name a footballer who played senior competitive matches for both Bayern Munich and Borussia Dortmund',
    category: 'Club Connections',
    difficulty: 'Easy',
    description: 'Stars who crossed the fiery Der Klassiker divide.',
    answers: [
      { text: 'Robert Lewandowski', aliases: ['Lewandowski', 'Lewy'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 96.0, commentary: '103 goals for Dortmund, 344 goals for Bayern Munich!' },
      { text: 'Mario Götze', aliases: ['Gotze', 'Mario Gotze'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 88.0, commentary: 'Shock 2013 move before UCL final, later returned to Dortmund!' },
      { text: 'Mats Hummels', aliases: ['Hummels'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 86.0, commentary: 'Bayern youth, Dortmund legend, returned to Bayern 2016, back to BVB!' },
      { text: 'Niklas Süle', aliases: ['Sule', 'Niklas Sule'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.0, commentary: 'Moved directly from Bayern to Dortmund on a free transfer in 2022!' },
      { text: 'Sebastian Rode', aliases: ['Rode'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 34.0, commentary: 'Midfielder played for Bayern Munich then joined Dortmund in 2016!' },
      { text: 'Ivan Perišić', aliases: ['Perisic', 'Ivan Perisic'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 44.0, commentary: '2012 Double with Dortmund, 2020 Treble on loan with Bayern!' },
      { text: 'Torsten Frings', aliases: ['Frings'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 32.0, commentary: 'German midfield powerhouse played for BVB then Bayern in 2004-05!' },
      { text: 'Christian Nerlinger', aliases: ['Nerlinger'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 12.0, commentary: 'Over 150 games for Bayern before moving to Dortmund in 1998!' },
      { text: 'Thomas Helmer', aliases: ['Helmer'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.0, commentary: 'Controversial 1992 transfer via Lyon broke transfer records!' },
      { text: 'Michael Rummenigge', aliases: ['Rummenigge'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 3.5, commentary: 'Brother of Karl-Heinz played over 150 games for both clubs!' }
    ]
  },
  {
    id: 'both_liverpool_and_barcelona',
    prompt: 'Name a footballer who played senior competitive matches for both Liverpool and Barcelona',
    category: 'Club Connections',
    difficulty: 'Easy',
    description: 'Star ballers who represented Anfield and the Camp Nou.',
    answers: [
      { text: 'Luis Suárez', aliases: ['Suarez', 'Luis Suarez', 'El Pistolero'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 94.0, commentary: '31 goals in 2013-14 for Liverpool, 198 goals & treble for Barcelona!' },
      { text: 'Philippe Coutinho', aliases: ['Coutinho'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 90.0, commentary: 'Liverpool talisman before record-breaking 2018 Camp Nou move!' },
      { text: 'Javier Mascherano', aliases: ['Mascherano', 'El Jefecito'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 74.0, commentary: 'Midfield monster at Anfield, two Champions Leagues at center-back for Barça!' },
      { text: 'Jari Litmanen', aliases: ['Litmanen'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 36.0, commentary: 'Finnish playmaker played for van Gaal Barça then Houllier Liverpool!' },
      { text: 'Boudewijn Zenden', aliases: ['Bolo Zenden', 'Zenden'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 32.0, commentary: 'La Liga winner with Barça in 1999, UCL finalist with Liverpool in 2007!' },
      { text: 'Pepe Reina', aliases: ['Reina'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: 'La Masia graduate made 49 Barça appearances before legendary Anfield run!' },
      { text: 'Mauricio Pellegrino', aliases: ['Pellegrino'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.0, commentary: 'La Liga title with Barça 1999, reunited with Benítez at Liverpool 2005!' },
      { text: 'Arthur Melo', aliases: ['Arthur'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 18.0, commentary: 'Played 72 matches for Barcelona before brief Liverpool loan in 2022!' }
    ]
  },
  {
    id: 'both_arsenal_and_man_city',
    prompt: 'Name a footballer who played senior competitive matches for both Arsenal and Manchester City',
    category: 'Club Connections',
    difficulty: 'Easy',
    description: 'Modern Premier League rivals connected by marquee transfers.',
    answers: [
      { text: 'Gabriel Jesus', aliases: ['Jesus'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 92.0, commentary: '4 Premier League titles with City, moved to Arsenal in 2022!' },
      { text: 'Oleksandr Zinchenko', aliases: ['Zinchenko'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 89.0, commentary: '4 Premier League titles with City, moved to Arsenal alongside Jesus!' },
      { text: 'Samir Nasri', aliases: ['Nasri'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 86.0, commentary: 'Star winger at Arsenal before winning two PL titles with City!' },
      { text: 'Emmanuel Adebayor', aliases: ['Adebayor'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 88.0, commentary: 'Famous full-pitch knee-slide celebration in 2009!' },
      { text: 'Kolo Touré', aliases: ['Toure', 'Kolo Toure'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 70.0, commentary: 'Invincible with Arsenal, 2012 Premier League champion with City!' },
      { text: 'Gaël Clichy', aliases: ['Clichy', 'Gael Clichy'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.0, commentary: 'Youngest Invincible medal winner, two Premier League titles with City!' },
      { text: 'Bacary Sagna', aliases: ['Sagna'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 58.0, commentary: 'FA Cup winner at Arsenal, 3 seasons at the Etihad!' },
      { text: 'Patrick Vieira', aliases: ['Vieira'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 65.0, commentary: 'Arsenal captain legend finished his playing career winning 2011 FA Cup with City!' },
      { text: 'Nicolas Anelka', aliases: ['Anelka'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 48.0, commentary: 'Double winner with Arsenal in 1998, City top scorer in 2002-2004!' },
      { text: 'David Seaman', aliases: ['Seaman', 'Safe Hands'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: 'Over 500 games for Arsenal, finished career with Man City in 2003-04!' },
      { text: 'Niall Quinn', aliases: ['Quinn'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 15.0, commentary: '67 goals for Man City after starting his career with Arsenal!' },
      { text: 'Paul Dickov', aliases: ['Dickov'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 14.0, commentary: 'Arsenal youth, scored most famous goal in City history in 1999 play-off final!' }
    ]
  },
  {
    id: 'both_milan_and_juventus',
    prompt: 'Name a footballer who played senior competitive matches for both AC Milan and Juventus',
    category: 'Club Connections',
    difficulty: 'Easy',
    description: 'Italian giants whose histories are intertwined by iconic champions.',
    answers: [
      { text: 'Andrea Pirlo', aliases: ['Pirlo'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 95.0, commentary: 'Two Champions Leagues with Milan, 4 consecutive Scudetti with Juventus!' },
      { text: 'Zlatan Ibrahimović', aliases: ['Ibrahimovic', 'Zlatan'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 92.0, commentary: 'Scudetto with Juventus, two Scudetti across two Milan eras!' },
      { text: 'Leonardo Bonucci', aliases: ['Bonucci'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 86.0, commentary: '8 Serie A titles with Juventus, shock captaincy season at Milan in 2017-18!' },
      { text: 'Filippo Inzaghi', aliases: ['Inzaghi', 'Pippo'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 76.0, commentary: '89 goals for Juventus, 126 goals & two UCL finals for Milan!' },
      { text: 'Roberto Baggio', aliases: ['Baggio', 'Il Divin Codino'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 72.0, commentary: 'Ballon d\'Or with Juventus, 1996 Scudetto with AC Milan!' },
      { text: 'Gianluca Zambrotta', aliases: ['Zambrotta'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 60.0, commentary: 'World Cup winner played 7 seasons for Juve, 4 seasons for Milan!' },
      { text: 'Gonzalo Higuaín', aliases: ['Higuain', 'Gonzalo Higuain'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 64.0, commentary: '66 goals for Juventus, loan spell at Milan in 2018!' },
      { text: 'Edgar Davids', aliases: ['Davids', 'The Pitbull'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 44.0, commentary: 'Arrived in Italy with Milan before becoming Juve legendary engine!' },
      { text: 'Christian Vieri', aliases: ['Vieri', 'Bobo'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 40.0, commentary: 'Scudetto with Juventus in 1997, brief Milan spell in 2005!' },
      { text: 'Patrick Vieira', aliases: ['Vieira'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.0, commentary: 'Began in Italy with Milan in 1995, played for Juventus in 2005-06!' },
      { text: 'Mattia De Sciglio', aliases: ['De Sciglio'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 15.0, commentary: 'Milan academy graduate joined Juventus in 2017!' },
      { text: 'Alessandro Matri', aliases: ['Matri'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 18.0, commentary: '3 Scudetti with Juventus, Milan youth graduate!' }
    ]
  },
  {
    id: 'arsenal_no_14',
    prompt: 'Name a footballer who officially wore the number 14 shirt for Arsenal in the Premier League era',
    category: 'Iconic Shirts',
    difficulty: 'Medium',
    description: 'The legendary Highbury and Emirates shirt immortalized by Thierry Henry.',
    answers: [
      { text: 'Thierry Henry', aliases: ['Henry'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 98.0, commentary: 'The King! 228 goals, statue outside the Emirates, ultimate number 14.' },
      { text: 'Pierre-Emerick Aubameyang', aliases: ['Aubameyang', 'Auba'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 88.0, commentary: 'Carried the mantle with 92 goals and 2020 FA Cup heroics!' },
      { text: 'Theo Walcott', aliases: ['Walcott'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 82.0, commentary: 'Wore number 14 for a decade with over 100 Arsenal goals!' },
      { text: 'Eddie Nketiah', aliases: ['Nketiah'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.0, commentary: 'Took the iconic number 14 shirt in 2022, scored hat-trick vs Sheffield United!' },
      { text: 'Martin Keown', aliases: ['Keown'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 15.0, commentary: 'Wore number 14 in the mid-1990s before switching to number 5!' },
      { text: 'Paul Davis', aliases: ['Davis'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 3.5, commentary: 'Over 400 Arsenal matches, wore 14 in the 1992-93 inaugural Premier League season!' }
    ]
  },
  {
    id: 'real_madrid_no_9',
    prompt: 'Name a footballer who officially wore the number 9 shirt for Real Madrid',
    category: 'Iconic Shirts',
    difficulty: 'Medium',
    description: 'The legendary striker shirt of the Santiago Bernabéu.',
    answers: [
      { text: 'Karim Benzema', aliases: ['Benzema'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 96.0, commentary: 'Wore it for 13 legendary seasons on his way to 354 goals and Ballon d\'Or!' },
      { text: 'Ronaldo Nazário', aliases: ['R9', 'Ronaldo', 'El Fenomeno'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 92.0, commentary: 'Il Fenomeno wore 9 from 2003 after Morientes departure!' },
      { text: 'Kylian Mbappé', aliases: ['Kylian Mbappe', 'Mbappe'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 94.0, commentary: 'Inherited the legendary number 9 upon his arrival in 2024!' },
      { text: 'Cristiano Ronaldo', aliases: ['CR7', 'Ronaldo'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 88.0, commentary: 'Wore CR9 in his debut 2009-10 season while Raúl had number 7!' },
      { text: 'Alfredo Di Stéfano', aliases: ['Di Stefano', 'Alfredo Di Stefano'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 68.0, commentary: 'The Saeta Rubia, 5 consecutive European Cups with number 9 on his back!' },
      { text: 'Hugo Sánchez', aliases: ['Hugo Sanchez', 'Sanchez'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 58.0, commentary: 'Five Pichichi trophies, acrobatic bicycle-kick icon!' },
      { text: 'Fernando Morientes', aliases: ['Morientes'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 54.0, commentary: 'Three Champions League titles wearing number 9 in 1998, 2000, 2002!' },
      { text: 'Davor Šuker', aliases: ['Suker', 'Davor Suker'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.0, commentary: '1998 Champions League winner with Real Madrid wearing 9!' },
      { text: 'Santillana', aliases: ['Carlos Santillana'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 28.0, commentary: 'Over 280 goals for Real Madrid in the 1970s and 1980s!' },
      { text: 'Ivan Zamorano', aliases: ['Zamorano'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 18.0, commentary: 'Bam Bam won Pichichi with 28 goals in 1994-95 title season!' },
      { text: 'Roberto Soldado', aliases: ['Soldado'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 4.0, commentary: 'Wore the number 9 shirt in the 2007-08 season!' }
    ]
  },
  {
    id: 'barcelona_no_10',
    prompt: 'Name a footballer who officially wore the number 10 shirt for FC Barcelona in La Liga',
    category: 'Iconic Shirts',
    difficulty: 'Medium',
    description: 'The sacred Camp Nou camisa of creative geniuses.',
    answers: [
      { text: 'Lionel Messi', aliases: ['Messi', 'La Pulga'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 98.0, commentary: '672 goals, 35 trophies, the greatest player of all time.' },
      { text: 'Ronaldinho', aliases: ['Dinho', 'Ronaldinho Gaucho'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 92.0, commentary: 'Rebuilt Barcelona in 2003, Ballon d\'Or and Bernabéu standing ovation!' },
      { text: 'Rivaldo', aliases: ['Vitor Borba Ferreira'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 70.0, commentary: '1999 Ballon d\'Or, famous overhead kick vs Valencia in number 10!' },
      { text: 'Diego Maradona', aliases: ['Maradona', 'El Pibe de Oro'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 82.0, commentary: 'World record signing in 1982, Copa del Rey triumph at Camp Nou!' },
      { text: 'Ansu Fati', aliases: ['Ansu'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 62.0, commentary: 'Inherited the number 10 after Messi departure in 2021!' },
      { text: 'Romário', aliases: ['Romario'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 56.0, commentary: '1993-94 Pichichi with 30 goals in Cruyff Dream Team!' },
      { text: 'Hristo Stoichkov', aliases: ['Stoichkov'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: '1994 Ballon d\'Or winner wore 10 in multiple European campaigns!' },
      { text: 'Michael Laudrup', aliases: ['Laudrup'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 44.0, commentary: 'Architect of Cruyff 4 consecutive league titles!' },
      { text: 'Juan Román Riquelme', aliases: ['Riquelme', 'Juan Roman Riquelme'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 38.0, commentary: 'Argentine maestro wore number 10 in 2002-03!' },
      { text: 'Jari Litmanen', aliases: ['Litmanen'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 15.0, commentary: 'Wore number 10 in 1999-2000 season!' },
      { text: 'Roger García', aliases: ['Roger Garcia', 'Roger'], rarityScore: 100, tier: "Ballon d'Or Knowledge", pickRatePct: 2.5, commentary: 'La Masia midfielder wore the number 10 in the mid-1990s!' }
    ]
  },
  {
    id: 'countries_hosted_world_cup',
    prompt: 'Name a nation that has hosted or co-hosted at least one FIFA Men\'s World Cup tournament',
    category: 'World Cup & Nations',
    difficulty: 'Easy',
    description: 'Nations that have welcomed the world for football\'s biggest event.',
    answers: [
      { text: 'Brazil', aliases: ['Brasil'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 92.0, commentary: 'Hosted in 1950 and 2014!' },
      { text: 'Germany', aliases: ['Deutschland', 'West Germany'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 88.0, commentary: 'Hosted in 1974 (West Germany) and 2006!' },
      { text: 'France', aliases: ['France'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 86.0, commentary: 'Hosted in 1938 and 1998!' },
      { text: 'Italy', aliases: ['Italia'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 85.0, commentary: 'Hosted in 1934 and 1990!' },
      { text: 'United States', aliases: ['USA', 'United States of America', 'US'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 84.0, commentary: 'Hosted in 1994, co-hosting in 2026!' },
      { text: 'Qatar', aliases: ['State of Qatar'], rarityScore: 5, tier: 'Tap-In', pickRatePct: 89.0, commentary: 'Hosted the historic 2022 World Cup!' },
      { text: 'Russia', aliases: ['Russian Federation'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 74.0, commentary: 'Hosted the 2018 tournament!' },
      { text: 'South Africa', aliases: ['RSA'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 78.0, commentary: 'First African host nation in 2010!' },
      { text: 'Japan', aliases: ['Nippon'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 68.0, commentary: 'Co-hosted first Asian World Cup in 2002!' },
      { text: 'South Korea', aliases: ['Korea Republic', 'Korea'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 66.0, commentary: 'Co-hosted 2002, reaching the semi-finals!' },
      { text: 'England', aliases: ['Great Britain'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 75.0, commentary: 'Hosted and won in 1966!' },
      { text: 'Mexico', aliases: ['Mexico', 'Estados Unidos Mexicanos'], rarityScore: 30, tier: 'Starter XI', pickRatePct: 79.0, commentary: 'First nation to host three times (1970, 1986, 2026)!' },
      { text: 'Argentina', aliases: ['Argentine Republic'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 46.0, commentary: 'Hosted and lifted the trophy in 1978!' },
      { text: 'Spain', aliases: ['Espana', 'Spain'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 48.0, commentary: 'Hosted the 1982 World Cup with Naranjito!' },
      { text: 'Uruguay', aliases: ['Republica Oriental del Uruguay'], rarityScore: 50, tier: 'Cult Hero', pickRatePct: 42.0, commentary: 'Hosted the inaugural World Cup in 1930!' },
      { text: 'Chile', aliases: ['Republic of Chile'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 18.0, commentary: 'Hosted in 1962, Garrincha tournament!' },
      { text: 'Sweden', aliases: ['Sverige'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 16.0, commentary: 'Hosted in 1958, Pelé debut!' },
      { text: 'Switzerland', aliases: ['Schweiz', 'Suisse'], rarityScore: 85, tier: "Streets Won't Forget", pickRatePct: 15.0, commentary: 'Hosted in 1954, highest-scoring tournament in history!' }
    ]
  }
];

// 4. Clean, Deduplicate, and Enrich Prompts
const cleanedPrompts = [];
let removedInvalidCount = 0;
let mergedDuplicateCount = 0;

for (const prompt of originalPrompts) {
  // Check if we should drop this prompt
  if (PROMPTS_TO_DROP.has(prompt.id)) {
    console.log(`Dropping non-football filler prompt: ${prompt.id}`);
    continue;
  }

  // Filter out invalid answers (rarityScore === 0 or commentary indicating invalidity)
  const validAnswers = [];
  for (const ans of prompt.answers) {
    const isZero = ans.rarityScore === 0;
    const isInvalidComment = ans.commentary && (
      ans.commentary.toLowerCase().includes('invalid') ||
      ans.commentary.toLowerCase().includes('wait, invalid') ||
      ans.commentary.toLowerCase().includes('never played') ||
      ans.commentary.toLowerCase().includes('only 1 goal')
    );

    if (isZero || isInvalidComment) {
      console.log(`[${prompt.id}] Stripping invalid answer: ${ans.text} (${ans.commentary})`);
      removedInvalidCount++;
      continue;
    }
    validAnswers.push(ans);
  }

  // Add backfilled answers if available for this prompt
  if (BACKFILL_MAP[prompt.id]) {
    const existingNorms = new Set(validAnswers.map(a => normalize(a.text)));
    for (const addAns of BACKFILL_MAP[prompt.id]) {
      if (!existingNorms.has(normalize(addAns.text))) {
        validAnswers.push(addAns);
        existingNorms.add(normalize(addAns.text));
      }
    }
  }

  // Deduplicate answers by normalized name
  const dedupedAnswersMap = new Map();
  for (const ans of validAnswers) {
    const key = normalize(ans.text);
    if (dedupedAnswersMap.has(key)) {
      mergedDuplicateCount++;
      const existing = dedupedAnswersMap.get(key);
      // Merge aliases
      const combinedAliases = new Set([
        ...(existing.aliases || []),
        ...(ans.aliases || []),
        ans.text,
        existing.text
      ]);
      existing.aliases = enrichAliases(existing.text, Array.from(combinedAliases));
      // Keep highest priority/valid info
      if (ans.rarityScore > 0 && existing.rarityScore === 0) {
        existing.rarityScore = ans.rarityScore;
        existing.tier = ans.tier;
        existing.pickRatePct = ans.pickRatePct;
      }
    } else {
      ans.aliases = enrichAliases(ans.text, ans.aliases || []);
      dedupedAnswersMap.set(key, ans);
    }
  }

  const finalAnswers = Array.from(dedupedAnswersMap.values());

  // Ensure rarity scores and tiers are valid
  for (const ans of finalAnswers) {
    if (ans.rarityScore <= 10) {
      ans.rarityScore = 5;
      ans.tier = 'Tap-In';
    } else if (ans.rarityScore <= 35) {
      ans.rarityScore = 30;
      ans.tier = 'Starter XI';
    } else if (ans.rarityScore <= 65) {
      ans.rarityScore = 50;
      ans.tier = 'Cult Hero';
    } else if (ans.rarityScore <= 90) {
      ans.rarityScore = 85;
      ans.tier = "Streets Won't Forget";
    } else {
      ans.rarityScore = 100;
      ans.tier = "Ballon d'Or Knowledge";
    }
  }

  cleanedPrompts.push({
    ...prompt,
    answers: finalAnswers
  });
}

// 5. Append new prompts
for (const np of NEW_PROMPTS) {
  // Enrich aliases for new prompts too
  for (const ans of np.answers) {
    ans.aliases = enrichAliases(ans.text, ans.aliases || []);
  }
  cleanedPrompts.push(np);
}

console.log(`Finished processing:
- Cleaned Prompts Total: ${cleanedPrompts.length}
- Removed Invalid Entries: ${removedInvalidCount}
- Merged Duplicate Entries: ${mergedDuplicateCount}
`);

// 6. Output formatted TypeScript file
let outputCode = `import type { SideNettingPrompt } from './types';\n\n`;
outputCode += `export const SIDE_NETTING_PROMPTS: SideNettingPrompt[] = [\n`;

for (const p of cleanedPrompts) {
  outputCode += `  {\n`;
  outputCode += `    id: ${JSON.stringify(p.id)},\n`;
  outputCode += `    prompt: ${JSON.stringify(p.prompt)},\n`;
  if (p.category) outputCode += `    category: ${JSON.stringify(p.category)},\n`;
  if (p.difficulty) outputCode += `    difficulty: ${JSON.stringify(p.difficulty)},\n`;
  if (p.description) outputCode += `    description: ${JSON.stringify(p.description)},\n`;
  outputCode += `    answers: [\n`;
  for (const a of p.answers) {
    outputCode += `      {\n`;
    outputCode += `        text: ${JSON.stringify(a.text)},\n`;
    outputCode += `        aliases: ${JSON.stringify(a.aliases || [])},\n`;
    outputCode += `        rarityScore: ${a.rarityScore},\n`;
    outputCode += `        tier: ${JSON.stringify(a.tier)},\n`;
    outputCode += `        pickRatePct: ${a.pickRatePct},\n`;
    outputCode += `        commentary: ${JSON.stringify(a.commentary || '')},\n`;
    outputCode += `      },\n`;
  }
  outputCode += `    ],\n`;
  outputCode += `  },\n`;
}

outputCode += `];\n`;

fs.writeFileSync(promptsFilePath, outputCode, 'utf8');
console.log('Successfully wrote updated promptsData.ts with', cleanedPrompts.length, 'prompts.');
