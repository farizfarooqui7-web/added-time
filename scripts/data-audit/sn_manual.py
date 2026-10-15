"""Hand-audited corrections for Side Netting knowledge prompts (awards, trophies, World Cups...).

Each entry:  remove = answers that are wrong; add = 'Name|score|alias/alias' separated by ';'
score: 5 Tap-In, 30 Starter XI, 50 Cult Hero, 85 Streets Won't Forget, 100 Ballon d'Or Knowledge
2026 World Cup and 2025-26 season results are added from web-verified sources (see sn_2026.py).
"""

EDITS = {
    'arsenal_invincibles': {
        'add': 'Jermaine Pennant|85',
        'merge': [('Freddie Ljungberg', 'Fredrik Ljungberg'), ('Edu', 'Edu Gaspar')],
    },
    'puskas_award_winners': {
        'remove': ['Hamid Altıntop'],
        'add': 'Alejandro Garnacho|30|Garnacho',
    },
    'italian_clubs_won_serie_a': {
        'prompt': 'Name an Italian football club that has won the Italian league title (the Scudetto)',
        'merge': [('AS Roma', 'Roma')],
        'add': 'Spezia|100',
    },
    'ucl_with_two_clubs': {
        'add': ('Marcel Desailly|50; Didier Deschamps|50; Christian Panucci|85; Frank Rijkaard|50; '
                'Ronald Koeman|50; Vladimir Jugović|100|Jugovic; Jimmy Rimmer|100; Owen Hargreaves|50; '
                'Paulo Ferreira|85; José Bosingwa|85|Bosingwa; David Alaba|30|Alaba; Antonio Rüdiger|30|Rudiger; '
                'Thiago Motta|85; Thiago Alcântara|50|Thiago'),
    },
    'wc_host_nations': {
        'add': 'Italy|5; England|5; Argentina|30; Spain|5; Canada|50; West Germany|50',
    },
    'countries_hosted_world_cup': {
        'add': 'Canada|50',
    },
    'world_cup_hat_trick': {
        'add': ('Bert Patenaude|100; Guillermo Stábile|100|Stabile; Pedro Cea|100; Angelo Schiavio|100; '
                'Oldřich Nejedlý|100|Nejedly; Edmund Conen|100; Leônidas|100|Leonidas; Ernst Willimowski|100; '
                'Gyula Zsengellér|100|Zsengeller; Gustav Wetterström|100|Wetterstrom; Ademir|100|Ademir de Menezes; '
                'Óscar Míguez|100|Oscar Miguez/Miguez; Max Morlock|100; Flórián Albert|100|Florian Albert; '
                'Dušan Bajević|100|Bajevic; Dieter Müller|100|Dieter Muller; Karl-Heinz Rummenigge|85|Rummenigge; '
                'Preben Elkjær|100|Elkjaer/Preben Elkjaer Larsen; Míchel|100|Michel/Míchel González; '
                'Tomáš Skuhravý|100|Skuhravy'),
    },
    'african_champions_league_winners': {
        'add': ('Abedi Pelé|85|Abedi Pele/Abedi Ayew; Samuel Kuffour|85|Kuffour; Benni McCarthy|85; '
                'Djimi Traoré|85|Djimi Traore; Seydou Keita|50; Naby Keïta|50|Naby Keita; Joël Matip|30|Matip; '
                'Édouard Mendy|50|Edouard Mendy; Hakim Ziyech|30|Ziyech; Achraf Hakimi|30|Hakimi; '
                'Brahim Díaz|50|Brahim Diaz; Bouna Sarr|100; McDonald Mariga|100|Mariga'),
    },
    'euros_winning_nations': {
        'alias': {'Germany': ['West Germany']},
    },
    'treble_winning_clubs_europe': {
        'add': 'Paris Saint-Germain|30|PSG',
    },
    'ballon_dor_countries': {
        'add': 'Czechoslovakia|100',
        'alias': {'Germany': ['West Germany']},
    },
    'wc_winning_captains': {
        'add': ('José Nasazzi|100|Nasazzi; Gianpiero Combi|100|Combi; Giuseppe Meazza|85|Meazza; '
                'Fritz Walter|85; Hilderaldo Bellini|100|Bellini; Mauro Ramos|100; Bobby Moore|30; '
                'Carlos Alberto|50|Carlos Alberto Torres; Franz Beckenbauer|30|Beckenbauer'),
    },
    'south_american_ballon_dor_podium': {
        'remove': ['Radamel Falcao'],
        'add': 'Alfredo Di Stéfano|85|Di Stefano; Omar Sívori|100|Sivori',
    },
    'managers_ucl_winners': {
        'add': ('Luis Enrique|30; Roberto Di Matteo|50; Ottmar Hitzfeld|50; Marcello Lippi|50; Louis van Gaal|50; '
                'Fabio Capello|50; Arrigo Sacchi|50; Raymond Goethals|100; Johan Cruyff|30; Guus Hiddink|50; '
                'Giovanni Trapattoni|85; Udo Lattek|100; Dettmar Cramer|100; Joe Fagan|100; Tony Barton|100; '
                'Rinus Michels|85; Miguel Muñoz|100|Miguel Munoz; Helenio Herrera|85; Béla Guttmann|100|Bela Guttmann; '
                'Matt Busby|85|Sir Matt Busby; Jock Stein|85; Nereo Rocco|100; José Villalonga|100; Luis Carniglia|100; '
                'Emerich Jenei|100; Artur Jorge|100; Ljupko Petrović|100|Ljupko Petrovic'),
    },
    'french_scorers_pl_20': {
        'remove': ['Dimitri Payet', 'Hatem Ben Arfa', 'Odsonne Édouard'],
        'add': 'Djibril Cissé|50|Cisse; Jean-Philippe Mateta|50|Mateta',
    },
    'world_cup_final_scorers': {
        'add': ('Pablo Dorado|100; Pedro Cea|100; Santos Iriarte|100; Héctor Castro|100|Hector Castro; '
                'Carlos Peucelle|100; Guillermo Stábile|100|Stabile; Raimundo Orsi|100; Angelo Schiavio|100; '
                'Antonín Puč|100|Antonin Puc; Gino Colaussi|100; Silvio Piola|85; Pál Titkos|100|Pal Titkos; '
                'György Sárosi|100|Gyorgy Sarosi; Juan Alberto Schiaffino|85|Schiaffino; Alcides Ghiggia|85|Ghiggia; '
                'Friaça|100|Friaca; Max Morlock|100; Helmut Rahn|85; Ferenc Puskás|50|Puskas; Zoltán Czibor|100|Czibor; '
                'Vavá|85|Vava; Mário Zagallo|85|Zagallo; Nils Liedholm|85; Agne Simonsson|100; Amarildo|100; Zito|100; '
                'Josef Masopust|100; Martin Peters|85; Helmut Haller|100; Wolfgang Weber|100; Gérson|85|Gerson; '
                'Jairzinho|50; Carlos Alberto|50; Roberto Boninsegna|100; Gerd Müller|30|Gerd Muller; '
                'Mario Kempes|50|Kempes; Daniel Bertoni|100; Dick Nanninga|100; Alessandro Altobelli|85; '
                'José Luis Brown|100|Jose Luis Brown; Jorge Valdano|85; Karl-Heinz Rummenigge|85; Rudi Völler|85|Rudi Voller; '
                'Emmanuel Petit|50; Antoine Griezmann|30; Paul Pogba|30'),
    },
    'world_cup_final_goalscorers': {
        'add': ('Pablo Dorado|100; Pedro Cea|100; Santos Iriarte|100; Héctor Castro|100|Hector Castro; '
                'Carlos Peucelle|100; Guillermo Stábile|100|Stabile; Raimundo Orsi|100; Angelo Schiavio|100; '
                'Antonín Puč|100|Antonin Puc; Gino Colaussi|100; Silvio Piola|85; Pál Titkos|100|Pal Titkos; '
                'György Sárosi|100|Gyorgy Sarosi; Juan Alberto Schiaffino|85|Schiaffino; Friaça|100|Friaca; '
                'Max Morlock|100; Ferenc Puskás|50|Puskas; Zoltán Czibor|100|Czibor; Vavá|85|Vava; '
                'Mário Zagallo|85|Zagallo; Nils Liedholm|85; Agne Simonsson|100; Amarildo|100; Zito|100; '
                'Josef Masopust|100; Martin Peters|85; Helmut Haller|100; Wolfgang Weber|100; Gérson|85|Gerson; '
                'Jairzinho|50; Carlos Alberto|50; Roberto Boninsegna|100; Paul Breitner|85; Johan Neeskens|85; '
                'Mario Kempes|50|Kempes; Daniel Bertoni|100; Dick Nanninga|100; Paolo Rossi|50; Marco Tardelli|85; '
                'Alessandro Altobelli|85; José Luis Brown|100|Jose Luis Brown; Karl-Heinz Rummenigge|85; '
                'Rudi Völler|85|Rudi Voller; Andreas Brehme|50'),
    },
    'african_scorers_pl_30': {
        'remove': ['El Hadji Diouf', 'Henri Camara'],
        'add': 'Wilfried Bony|50|Bony; Peter Odemwingie|50|Odemwingie',
    },
    'uefa_cup_europa_league_winners': {
        'add': ('Borussia Mönchengladbach|50|Gladbach/Monchengladbach; PSV Eindhoven|50|PSV; Anderlecht|50; '
                'Real Madrid|30; Bayer Leverkusen|50|Leverkusen; Napoli|30; Ajax|30; Bayern Munich|30|Bayern; '
                'Schalke 04|50|Schalke; Galatasaray|50; Valencia|30; CSKA Moscow|85; Zenit Saint Petersburg|85|Zenit'),
    },
    'both_world_cup_and_ucl_winners': {
        'add': ('Bixente Lizarazu|50|Lizarazu; Marcel Desailly|50; Fabien Barthez|50|Barthez; Benjamin Pavard|50|Pavard; '
                'Lucas Hernandez|50; Corentin Tolisso|85|Tolisso; Olivier Giroud|30|Giroud; N\'Golo Kanté|30|Kante; '
                'Ousmane Dembélé|30|Dembele; Presnel Kimpembe|85|Kimpembe; Fernando Torres|30; Jürgen Kohler|85|Jurgen Kohler; '
                'Andreas Möller|85|Andreas Moller; Stefan Reuter|100; Karl-Heinz Riedle|85; Rudi Völler|85|Rudi Voller; '
                'Bodo Illgner|85; Andrea Pirlo|30; Gennaro Gattuso|30; Alessandro Nesta|30; Filippo Inzaghi|30; '
                'Alberto Gilardino|85; Marco Materazzi|50; Alessandro Del Piero|30; Massimo Oddo|85; Angelo Peruzzi|85; '
                'Paolo Rossi|50; Marco Tardelli|85; Antonio Cabrini|85; Gaetano Scirea|85; Daniele Massaro|85; '
                'Franco Baresi|50; Edmílson|85|Edmilson; Lúcio|50|Lucio; Bobby Charlton|30; Nobby Stiles|85'),
    },
    'fa_cup_winners_outside_big_six': {
        'add': ('Wanderers|100; Royal Engineers|100; Oxford University|100; Clapham Rovers|100; Old Etonians|100; '
                'Blackburn Olympic|100; Notts County|85; Sheffield United|50; Ipswich Town|50; Crystal Palace|30|Palace'),
    },
    'portuguese_scorers_pl_10': {
        'remove': ['Deco', 'Fábio Silva', 'Ricardo Vaz Te', 'João Félix'],
        'merge': [('Luis Boa Morte', 'Boa Morte')],
    },
    'international_goals_50_plus': {
        'add': ('Ali Mabkhout|100; Kunishige Kamamoto|100; Majed Abdullah|100; Robbie Keane|50; Ronaldo Nazário|30|Ronaldo/R9; '
                'Romário|50|Romario; Gabriel Batistuta|50|Batistuta; Edinson Cavani|30|Cavani; Hakan Şükür|85|Hakan Sukur; '
                'Sándor Kocsis|100|Sandor Kocsis; Jan Koller|85; Kiatisuk Senamuang|100; Carlos Ruiz|100; Stern John|100; '
                'Samuel Eto\'o|30|Eto\'o; Hossam Hassan|100; Kylian Mbappé|5|Mbappe'),
    },
    'ucl_knockout_hat_tricks': {
        'remove': ['Layvin Kurzawa', 'Sylvain Wiltord', 'Gerard Lopez', 'Pierre-Emerick Aubameyang'],
        'add': 'Erling Haaland|30|Haaland; Ronaldo Nazário|50|Ronaldo/R9',
    },
    'argentine_ucl_scorers_15_plus': {
        'add': 'Julián Álvarez|50|Julian Alvarez',
    },
    'famous_stadiums_capacity_over_70k': {
        'add': 'Luzhniki Stadium|50|Luzhniki; Atatürk Olympic Stadium|85|Ataturk Olympic Stadium',
    },
    'spain_2010_world_cup_final_xi': {
        'merge': [('Xavi Hernández', 'Xavi')],
    },
    'world_cup_winners_surnames_ending_in_i': {
        'add': ('Francesco Totti|30|Totti; Filippo Inzaghi|30|Inzaghi; Marco Materazzi|30|Materazzi; '
                'Angelo Peruzzi|85|Peruzzi; Andrea Barzagli|50|Barzagli; Luca Toni|30|Toni; Gabriele Oriali|100|Oriali; '
                'Giuseppe Bergomi|85|Bergomi; Giancarlo Antognoni|100|Antognoni; Francesco Graziani|100|Graziani; '
                'Giampiero Marini|100|Marini; Franco Selvaggi|100|Selvaggi; Giovanni Galli|100; Gianpiero Combi|100|Combi; '
                'Luigi Allemandi|100|Allemandi; Luis Monti|100|Monti; Raimundo Orsi|100|Orsi; Giovanni Ferrari|100; '
                'Luigi Bertolini|100|Bertolini; Anfilogino Guarisi|100|Guarisi; Armando Castellazzi|100|Castellazzi; '
                'Alfredo Foni|100|Foni; Ugo Locatelli|100|Locatelli; Pietro Serantoni|100|Serantoni; '
                'Amedeo Biavati|100|Biavati; Gino Colaussi|100|Colaussi; Aldo Olivieri|100|Olivieri; '
                'Franco Armani|85|Armani; Nicolás Otamendi|50|Otamendi; Gerónimo Rulli|85|Rulli; Ricardo Giusti|100|Giusti; '
                'Oscar Ruggeri|85|Ruggeri; Ricardo Bochini|100|Bochini; Claudio Borghi|100|Borghi; Pedro Pasculli|100|Pasculli; '
                'Marcelo Trobbiani|100|Trobbiani; Daniel Bertoni|100|Bertoni; Alberto Tarantini|100|Tarantini; '
                'Blaise Matuidi|50|Matuidi; Adil Rami|85|Rami; Samuel Umtiti|50|Umtiti; Hilderaldo Bellini|100|Bellini; '
                'Didi|85; Karl Mai|100|Mai; Jürgen Grabowski|100|Grabowski; Pierre Littbarski|85|Littbarski; '
                'Shkodran Mustafi|85|Mustafi; Roque Máspoli|100|Maspoli; José Nasazzi|100|Nasazzi; '
                'Ernesto Mascheroni|100|Mascheroni; Juliano Belletti|85|Belletti; Rogério Ceni|85|Rogerio Ceni/Ceni'),
    },
    'top_flight_football_boots_brands': {
        'add': ('Joma|50; Hummel|50; Reebok|30; Kappa|50; Asics|50; Concave|100; Warrior|85; '
                'Le Coq Sportif|85; Patrick|100; Penalty|100; Valsport|100'),
    },
    'champions_league_winning_goalkeepers': {
        'add': ('Fabien Barthez|50|Barthez; Angelo Peruzzi|85|Peruzzi; Stefan Klos|100|Klos; César Sánchez|100|Cesar Sanchez; '
                'Vítor Baía|85|Vitor Baia; Marc-André ter Stegen|30|ter Stegen; Édouard Mendy|50|Edouard Mendy; '
                'Gianluigi Donnarumma|30|Donnarumma; Andoni Zubizarreta|85|Zubizarreta'),
    },
    'played_in_pl_la_liga_serie_a': {
        'remove': ['Nico Gonzalez'],
    },
    'world_cup_golden_boot_winners': {
        'add': ('Guillermo Stábile|100|Stabile; Oldřich Nejedlý|100|Nejedly; Leônidas|100|Leonidas; Ademir|100; '
                'Sándor Kocsis|100|Sandor Kocsis; Garrincha|50; Vavá|85|Vava; Leonel Sánchez|100|Leonel Sanchez; '
                'Flórián Albert|100|Florian Albert; Valentin Ivanov|100; Dražan Jerković|100|Drazan Jerkovic; '
                'Gerd Müller|30|Gerd Muller; Grzegorz Lato|85|Lato; Mario Kempes|50|Kempes'),
    },
    'premier_league_player_of_the_season_winners': {
        'add': ('Alan Shearer|30; Peter Schmeichel|50; Dennis Bergkamp|30; David Ginola|50; Kevin Phillips|85; '
                'Teddy Sheringham|50; Ruud van Nistelrooy|30; Frank Lampard|30; John Terry|30; Vincent Kompany|30; '
                'Jamie Vardy|30; Rúben Dias|50|Ruben Dias'),
    },
    'world_cup_finalists_nations': {
        'remove': ['Czech Republic'],
        'add': 'Czechoslovakia|85|Czech Republic',
        'alias': {'Germany': ['West Germany']},
    },
    'premier_league_20_goals_season_english': {
        'remove': ['Michael Owen', 'Ollie Watkins', 'Chris Sutton', 'Marcus Stewart', 'Dion Dublin'],
        'add': ('Ivan Toney|50; Danny Ings|50; Stan Collymore|85; Peter Beardsley|85; Andy Johnson|85; '
                'James Beattie|85; Frank Lampard|50'),
    },
    'managers_won_premier_league': {
        'add': 'Arne Slot|30|Slot',
    },
    'shirt_number_10_real_madrid': {
        'add': 'Kylian Mbappé|30|Mbappe',
    },
    'shirt_number_10_barcelona': {
        'add': 'Lamine Yamal|5|Yamal',
    },
    'barcelona_no_10': {
        'add': 'Lamine Yamal|5|Yamal',
    },
    'goalkeepers_with_over_100_premier_league_clean_sheets': {
        'merge': [('Thomas Sørensen', 'Thomas Sorensen')],
    },
    'champions_league_final_referees': {
        'remove': ['Pierluigi Collina'],
        'add': ('Stefano Braschi|100; Urs Meier|85; Markus Merk|85; Manuel Mejuto González|100|Mejuto Gonzalez; '
                'Terje Hauge|100; Herbert Fandel|100; Ľuboš Micheľ|100|Lubos Michel; Massimo Busacca|100; '
                'Viktor Kassai|100; Pedro Proença|100|Pedro Proenca; Milorad Mažić|100|Milorad Mazic; '
                'Damir Skomina|100; Daniele Orsato|85; Antonio Mateu Lahoz|50|Mateu Lahoz; Clément Turpin|85|Clement Turpin; '
                'István Kovács|100|Istvan Kovacs'),
    },
    'champions_league_final_goalscorers': {
        'add': ('Stefan Effenberg|85|Effenberg; Gaizka Mendieta|85|Mendieta; Khvicha Kvaratskhelia|50|Kvaratskhelia; '
                'Désiré Doué|50|Desire Doue/Doue; Achraf Hakimi|50|Hakimi; Senny Mayulu|100|Mayulu'),
    },
    'arsenal_no_14': {
        'remove': ['Paul Rideout'],
        'add': 'Viktor Gyökeres|30|Gyokeres',
    },
}

# Full replacement answer sets for prompts whose original list was far from complete.
REPLACE = {
    'scored_2010_world_cup': (
        # Group A
        'Siphiwe Tshabalala|85; Rafael Márquez|50|Rafa Marquez; Diego Forlán|30|Forlan; Álvaro Pereira|85|Alvaro Pereira; '
        'Javier Hernández|30|Chicharito; Cuauhtémoc Blanco|50|Cuauhtemoc Blanco; Luis Suárez|5|Suarez; '
        'Florent Malouda|50; Bongani Khumalo|100; Katlego Mphela|100; '
        # Group B
        'Gabriel Heinze|50; Lee Jung-soo|100; Park Ji-sung|30; Dimitris Salpingidis|100; Vasilis Torosidis|85; '
        'Kalu Uche|100; Gonzalo Higuaín|5|Higuain; Lee Chung-yong|85; Yakubu|50|Yakubu Aiyegbeni; '
        'Park Chu-young|85; Martín Demichelis|50|Demichelis; Martín Palermo|50|Palermo; '
        # Group C
        'Steven Gerrard|30; Clint Dempsey|50; Robert Koren|100; Valter Birsa|85; Zlatan Ljubijankić|100|Ljubijankic; '
        'Landon Donovan|30; Michael Bradley|50; Jermain Defoe|30; '
        # Group D
        'Asamoah Gyan|30; Lukas Podolski|30; Miroslav Klose|5; Thomas Müller|5|Thomas Muller; Cacau|85; '
        'Milan Jovanović|85|Milan Jovanovic; Brett Holman|85; Mesut Özil|30|Ozil; Tim Cahill|50; Marko Pantelić|100|Pantelic; '
        # Group E
        'Dirk Kuyt|30; Keisuke Honda|50; Wesley Sneijder|5|Sneijder; Samuel Eto\'o|30|Eto\'o; Nicklas Bendtner|50; '
        'Dennis Rommedahl|85; Jon Dahl Tomasson|85; Yasuhito Endō|85|Yasuhito Endo; Shinji Okazaki|50; '
        'Robin van Persie|30; Klaas-Jan Huntelaar|50|Huntelaar; '
        # Group F
        'Daniele De Rossi|30; Antolín Alcaraz|85|Antolin Alcaraz; Winston Reid|85; Róbert Vittek|50|Robert Vittek; '
        'Enrique Vera|100; Cristian Riveros|100; Vincenzo Iaquinta|85; Shane Smeltz|100; Kamil Kopúnek|100|Kopunek; '
        'Antonio Di Natale|50; Fabio Quagliarella|50; '
        # Group G
        'Maicon|30; Elano|50; Ji Yun-nam|100; Luís Fabiano|50|Luis Fabiano; Didier Drogba|30; Raul Meireles|50; '
        'Simão|50|Simao Sabrosa; Hugo Almeida|85; Tiago|85|Tiago Mendes; Liédson|85|Liedson; Cristiano Ronaldo|5; '
        'Yaya Touré|30|Yaya Toure; Romaric|100; Salomon Kalou|50; '
        # Group H
        'Jean Beausejour|85; Gelson Fernandes|85; Mark González|100|Mark Gonzalez; David Villa|5; Andrés Iniesta|5|Iniesta; '
        'Rodrigo Millar|100; '
        # Knockouts
        'Kevin-Prince Boateng|50; Matthew Upson|85; Carlos Tevez|30; Arjen Robben|30; Juan|85|Juan Silveira dos Santos; '
        'Robinho|30; Sulley Muntari|50; Arne Friedrich|85; Giovanni van Bronckhorst|50|Van Bronckhorst; '
        'Maxi Pereira|85; Carles Puyol|30|Puyol; Marcell Jansen|85; Sami Khedira|50; Edinson Cavani|30'
    ),
}
