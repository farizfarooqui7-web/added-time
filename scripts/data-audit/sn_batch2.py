"""Side Netting batch 2 (Oct 2026): ~100 new prompts generated from Wikidata with complete answer pools.

  python sn_batch2.py <repo> plan            offline: build the candidate job list -> sn_batch2_jobs.json
  python sn_batch2.py <repo> sparql          one SPARQL query per club (~1 / min, resumable) -> sn_batch2_pools.json
  python sn_batch2.py <repo> fetch           slower Action API alternative (heavily 429-limited in Oct 2026)
  python sn_batch2.py <repo> apply [--write] pick the qualifying prompts and append them to promptsData.ts

Specific prompts: club pairs among 30 top clubs (8+ answers), nationality + club, goalkeeper + club.
Broad prompts (tagged "broad": true): big pools, capped to players with 3+ sitelinks.
Answers are tiered by fame exactly like apply_generated.py.
"""
import itertools, json, os, re, sys, time, unicodedata, collections, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(__file__))
import wdapi

HERE = os.path.dirname(__file__)
ROOT, MODE = sys.argv[1], sys.argv[2]
WRITE = '--write' in sys.argv
TS_PATH = os.path.join(ROOT, 'src/games/side-netting/promptsData.ts')
JOBS = os.path.join(HERE, 'sn_batch2_jobs.json')
POOLS = os.path.join(HERE, 'sn_batch2_pools.json')
FOOTBALLER = 'haswbstatement:P106=Q937857'
GOALKEEPER = 'haswbstatement:P413=Q201330'
MIN_LINKS = 3

TOP30 = ['real-madrid', 'fc-barcelona', 'atletico-madrid', 'sevilla', 'valencia', 'manchester-united',
         'manchester-city', 'liverpool', 'chelsea', 'arsenal', 'tottenham-hotspur', 'newcastle-united', 'everton',
         'aston-villa', 'juventus', 'inter-milan', 'ac-milan', 'as-roma', 'lazio', 'napoli', 'fiorentina',
         'bayern-munich', 'borussia-dortmund', 'paris-saint-germain', 'as-monaco', 'olympique-marseille', 'ajax',
         'psv-eindhoven', 'benfica', 'fc-porto']
DISPLAY = {'fc-barcelona': 'Barcelona'}
DEMONYM = {  # demonym -> (article, P1532 ids, P27 ids)  (same ids as net_jobs.py)
    'Brazilian': ('a', ['Q155'], ['Q155']), 'Argentine': ('an', ['Q414'], ['Q414']),
    'French': ('a', ['Q142'], ['Q142']), 'Dutch': ('a', ['Q55', 'Q29999'], ['Q55', 'Q29999']),
    'Spanish': ('a', ['Q29'], ['Q29']), 'Italian': ('an', ['Q38'], ['Q38']),
    'German': ('a', ['Q183', 'Q713750'], ['Q183', 'Q713750']), 'Portuguese': ('a', ['Q45'], ['Q45']),
    'Croatian': ('a', ['Q224'], ['Q224']), 'Belgian': ('a', ['Q31'], ['Q31']), 'Uruguayan': ('a', ['Q77'], ['Q77']),
}
NAT_CANDIDATES = {
    'Brazilian': ['juventus', 'as-roma', 'lazio', 'napoli', 'paris-saint-germain', 'fc-porto', 'benfica',
                  'bayern-munich', 'liverpool', 'arsenal', 'psv-eindhoven', 'as-monaco', 'valencia', 'sevilla'],
    'Argentine': ['real-madrid', 'juventus', 'napoli', 'as-roma', 'lazio', 'valencia', 'manchester-city',
                  'paris-saint-germain', 'benfica', 'fc-porto', 'ac-milan', 'sevilla', 'fiorentina'],
    'French': ['manchester-united', 'manchester-city', 'liverpool', 'newcastle-united', 'tottenham-hotspur',
               'real-madrid', 'fc-barcelona', 'inter-milan', 'ac-milan', 'bayern-munich', 'juventus'],
    'Dutch': ['fc-barcelona', 'ac-milan', 'manchester-united', 'arsenal', 'newcastle-united', 'inter-milan', 'chelsea'],
    'Portuguese': ['manchester-united', 'chelsea', 'inter-milan', 'valencia', 'fc-barcelona', 'paris-saint-germain',
                   'as-monaco', 'atletico-madrid'],
    'Spanish': ['manchester-united', 'tottenham-hotspur', 'everton', 'aston-villa', 'napoli', 'juventus'],
    'Italian': ['paris-saint-germain', 'real-madrid', 'manchester-city'],
    'German': ['arsenal', 'chelsea', 'inter-milan', 'juventus'],
    'Croatian': ['real-madrid', 'juventus', 'inter-milan'],
    'Belgian': ['chelsea', 'manchester-united', 'ajax', 'psv-eindhoven'],
    'Uruguayan': ['fc-barcelona', 'napoli', 'atletico-madrid', 'juventus', 'liverpool'],
}
PL6 = ['manchester-united', 'manchester-city', 'liverpool', 'chelsea', 'arsenal', 'tottenham-hotspur']
SA6 = ['juventus', 'inter-milan', 'ac-milan', 'as-roma', 'lazio', 'napoli']
LL3 = ['real-madrid', 'fc-barcelona', 'atletico-madrid']
BL3 = ['bayern-munich', 'borussia-dortmund', 'bayer-leverkusen']
GROUPS = {
    'pl6': ("a Premier League 'Big Six' club (Arsenal, Chelsea, Liverpool, Man City, Man Utd, Spurs)", PL6),
    'sa6': ('one of Juventus, Inter Milan, AC Milan, AS Roma, Lazio or Napoli', SA6),
    'll3': ('Real Madrid, Barcelona or Atlético Madrid', LL3),
    'bl3': ('Bayern Munich, Borussia Dortmund or Bayer Leverkusen', BL3),
}
BROAD_SINGLE = ['manchester-united', 'liverpool', 'chelsea', 'arsenal', 'real-madrid', 'fc-barcelona', 'juventus',
                'ac-milan', 'inter-milan', 'bayern-munich', 'ajax', 'paris-saint-germain', 'borussia-dortmund']
BROAD_NAT = [('Brazilian', 'pl6'), ('French', 'pl6'), ('Spanish', 'pl6'), ('Dutch', 'pl6'), ('Portuguese', 'pl6'),
             ('Argentine', 'pl6'), ('German', 'pl6'), ('Brazilian', 'sa6'), ('Argentine', 'sa6'), ('French', 'sa6'),
             ('Dutch', 'sa6'), ('Brazilian', 'll3'), ('Argentine', 'll3'), ('French', 'll3'), ('Brazilian', 'bl3')]
BROAD_GK = ['pl6', 'sa6']


def norm(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', s)


def load_prompts():
    raw = open(TS_PATH, encoding='utf-8').read()
    return json.loads(raw[raw.index('= ') + 2:].rstrip().rstrip(';'))


cmap = json.load(open(os.path.join(HERE, 'club_map.json'), encoding='utf-8'))
QID = {s: cmap[s]['qid'] for s in TOP30 + BL3}
NAME = {s: DISPLAY.get(s, cmap[s]['name']) for s in TOP30 + BL3}
name_to_q = {}
for s, m in cmap.items():
    if m.get('qid'):
        name_to_q.setdefault(norm(m['name']), m['qid'])
        if m.get('label'):
            name_to_q.setdefault(norm(m['label']), m['qid'])


def q_of(name):
    return name_to_q.get(norm(name)) or name_to_q.get(norm('FC ' + name)) or name_to_q.get(norm(name.replace('FC ', '')))


def nat_queries(dem, slugs, extra=''):
    _, sport, cit = DEMONYM[dem]
    qs = []
    for s in slugs:
        qs += [f'{FOOTBALLER} haswbstatement:P54={QID[s]} haswbstatement:P1532={x}{extra}' for x in sport]
        qs += [f'{FOOTBALLER} haswbstatement:P54={QID[s]} haswbstatement:P27={x} -haswbstatement:P1532{extra}' for x in cit]
    return qs


def plan():
    prompts = load_prompts()
    have_pairs, have_nat, have_gk, have_ids = set(), set(), set(), {p['id'] for p in prompts}
    for p in prompts:
        t = p['prompt']
        m = re.search(r'for both (.+?) and (.+?)\s*$', t)
        if m and q_of(m.group(1)) and q_of(m.group(2)):
            have_pairs.add(frozenset([q_of(m.group(1)), q_of(m.group(2))]))
        m = re.match(r'Name an? (\w+) footballer who (?:has )?played (?:senior competitive matches )?for (.+?)\s*$', t)
        if m and q_of(m.group(2)):
            have_nat.add((m.group(1), q_of(m.group(2))))
        m = re.match(r'Name a goalkeeper who made senior appearances for (.+?)\s*$', t)
        if m and q_of(m.group(1)):
            have_gk.add(q_of(m.group(1)))

    # Offline pre-screen for club pairs: overlap among already-known players (wd_players + cached entities)
    teams = collections.defaultdict(set)
    for qid, e in json.load(open(os.path.join(HERE, 'wd_players.json'), encoding='utf-8')).items():
        teams[qid].update(t['id'] for t in e['teams'])
    path, ents = wdapi._cache('claims|sitelinks|labels|aliases')
    for qid, e in ents.items():
        teams[qid].update(t['id'] for t in e['teams'])
    overlap = collections.Counter()
    for ts in teams.values():
        clubs = sorted(s for s in TOP30 if QID[s] in ts)
        for a, b in itertools.combinations(clubs, 2):
            overlap[(a, b)] += 1
    pairs = [(n, a, b) for (a, b), n in overlap.items() if frozenset([QID[a], QID[b]]) not in have_pairs]
    pairs.sort(reverse=True)

    jobs = []
    for n, a, b in pairs[:75]:
        jobs.append({'id': f'both_{a}_{b}'.replace('-', '_'), 'kind': 'pair', 'clubs': [a, b], 'known': n,
                     'queries': [f'{FOOTBALLER} haswbstatement:P54={QID[a]} haswbstatement:P54={QID[b]}']})
    for dem, slugs in NAT_CANDIDATES.items():
        for s in slugs:
            if (dem, QID[s]) in have_nat:
                continue
            jobs.append({'id': f'{norm(dem)}_played_for_{s}'.replace('-', '_'), 'kind': 'nat', 'dem': dem,
                         'clubs': [s], 'queries': nat_queries(dem, [s])})
    for s in TOP30:
        if QID[s] in have_gk:
            continue
        jobs.append({'id': f'goalkeepers_{s}'.replace('-', '_'), 'kind': 'gk', 'clubs': [s],
                     'queries': [f'{GOALKEEPER} haswbstatement:P54={QID[s]}']})
    for s in BROAD_SINGLE:
        jobs.append({'id': f'broad_any_{s}'.replace('-', '_'), 'kind': 'broad_club', 'clubs': [s],
                     'queries': [f'{FOOTBALLER} haswbstatement:P54={QID[s]}']})
    for dem, g in BROAD_NAT:
        jobs.append({'id': f'broad_{norm(dem)}_{g}', 'kind': 'broad_nat', 'dem': dem, 'group': g,
                     'clubs': GROUPS[g][1], 'queries': nat_queries(dem, GROUPS[g][1])})
    for g in BROAD_GK:
        jobs.append({'id': f'broad_goalkeepers_{g}', 'kind': 'broad_gk', 'group': g, 'clubs': GROUPS[g][1],
                     'queries': [f'{GOALKEEPER} haswbstatement:P54={QID[s]}' for s in GROUPS[g][1]]})
    jobs = [j for j in jobs if j['id'] not in have_ids]
    json.dump(jobs, open(JOBS, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print('jobs', collections.Counter(j['kind'] for j in jobs), 'queries', sum(len(j['queries']) for j in jobs))
    print('pair overlap range', pairs[0][0], pairs[min(74, len(pairs) - 1)][0])


def fetch():
    orig = wdapi._get

    def slow(params):
        time.sleep(3.0)
        return orig(params)

    wdapi._get = slow
    jobs = json.load(open(JOBS, encoding='utf-8'))
    pools = json.load(open(POOLS, encoding='utf-8')) if os.path.exists(POOLS) else {}
    for i, j in enumerate(jobs):
        if j['id'] in pools:
            continue
        ids = []
        for q in j['queries']:
            for x in wdapi.cirrus(q, limit=3000 if j['kind'].startswith('broad') else 500):
                if x not in ids:
                    ids.append(x)
        ents = wdapi.entities(ids, props='labels|aliases|sitelinks') if ids else {}
        pools[j['id']] = [{'id': x, 'label': ents[x]['label'], 'aliases': ents[x]['aliases'][:4],
                           'links': ents[x]['links']} for x in ids if x in ents and ents[x].get('label')]
        json.dump(pools, open(POOLS, 'w', encoding='utf-8'), ensure_ascii=False)
        print(f'{i + 1}/{len(jobs)} {j["id"]}: {len(pools[j["id"]])}', flush=True)
    print('ALL DONE', flush=True)


SPARQL_ROWS = os.path.join(HERE, 'sn_batch2_clubs.json')
SPARQL_QUERY = """SELECT ?p ?links (SAMPLE(?l) AS ?label) (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases)
  (GROUP_CONCAT(DISTINCT STRAFTER(STR(?s), "entity/"); separator="|") AS ?sport)
  (GROUP_CONCAT(DISTINCT STRAFTER(STR(?c), "entity/"); separator="|") AS ?cit)
  (MAX(?gk) AS ?isgk) (MAX(?fb) AS ?isfb) WHERE {
  ?p p:P54/ps:P54 wd:CLUB; wikibase:sitelinks ?links. FILTER(?links >= 3)
  BIND(EXISTS { ?p wdt:P413 wd:Q201330 } AS ?gk)
  BIND(EXISTS { ?p wdt:P106 wd:Q937857 } AS ?fb)
  FILTER(?gk || ?fb)
  OPTIONAL { ?p rdfs:label ?l FILTER(LANG(?l) = "en") }
  OPTIONAL { ?p skos:altLabel ?alias FILTER(LANG(?alias) = "en") }
  OPTIONAL { ?p wdt:P1532 ?s } OPTIONAL { ?p wdt:P27 ?c }
} GROUP BY ?p ?links"""


def sparql_club(qid):
    url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': SPARQL_QUERY.replace('CLUB', qid), 'format': 'json'})
    req = urllib.request.Request(url, headers={'User-Agent': 'TopBinsDataAudit/1.0 (local dev script)', 'Accept': 'application/sparql-results+json'})
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.load(r)
    rows = []
    for b in d['results']['bindings']:
        val = lambda k: b.get(k, {}).get('value', '')
        rows.append({'id': val('p').rsplit('/', 1)[-1], 'label': val('label'), 'links': int(val('links')),
                     'aliases': [a for a in val('aliases').split('|') if a][:4],
                     'sport': [x for x in val('sport').split('|') if x], 'cit': [x for x in val('cit').split('|') if x],
                     'gk': val('isgk') in ('true', '1'), 'fb': val('isfb') in ('true', '1')})
    return rows


def sparql():
    """One SPARQL query per club (the endpoint allows ~1 / minute), then every job's pool is computed locally."""
    data = json.load(open(SPARQL_ROWS, encoding='utf-8')) if os.path.exists(SPARQL_ROWS) else {}
    slugs = [s for s in TOP30 + BL3 if s not in data]
    for i, s in enumerate(slugs):
        for attempt in range(4):
            try:
                data[s] = sparql_club(QID[s])
                break
            except Exception as e:
                print(f'  {s} attempt {attempt + 1} failed: {e}', flush=True)
                time.sleep(90)
        json.dump(data, open(SPARQL_ROWS, 'w', encoding='utf-8'), ensure_ascii=False)
        print(f'club {i + 1}/{len(slugs)} {s}: {len(data.get(s, []))}', flush=True)
        if i + 1 < len(slugs):
            time.sleep(62)
    pools_from_rows(data)
    print('ALL DONE', flush=True)


def pools_from_rows(data):
    jobs = json.load(open(JOBS, encoding='utf-8'))
    members = {s: {r['id']: r for r in rows} for s, rows in data.items()}
    pools = {}
    for j in jobs:
        if any(s not in members for s in j['clubs']):
            continue
        if j['kind'] == 'pair':
            a, b = j['clubs']
            ids = [x for x in members[a] if x in members[b]]
            rows = [members[a][x] for x in ids if members[a][x]['fb']]
        else:
            seen = {}
            for s in j['clubs']:
                for r in members[s].values():
                    seen.setdefault(r['id'], r)
            rows = list(seen.values())
            if j['kind'] in ('gk', 'broad_gk'):
                rows = [r for r in rows if r['gk']]
            else:
                rows = [r for r in rows if r['fb']]
            if 'dem' in j:
                _, sport, cit = DEMONYM[j['dem']]
                rows = [r for r in rows if set(r['sport']) & set(sport) or (not r['sport'] and set(r['cit']) & set(cit))]
        pools[j['id']] = [{'id': r['id'], 'label': r['label'], 'aliases': r['aliases'], 'links': r['links']}
                          for r in rows if r['label']]
    json.dump(pools, open(POOLS, 'w', encoding='utf-8'), ensure_ascii=False)
    print('pools', len(pools), 'of', len(jobs))


def tier_for(links):  # identical to apply_generated.py
    if links >= 80:
        return 30, 'Starter XI', 45.0
    if links >= 40:
        return 50, 'Cult Hero', 20.0
    if links >= 15:
        return 85, "Streets Won't Forget", 6.0
    return 100, "Ballon d'Or Knowledge", 1.5


def build_answers(pool):
    out, have = [], set()
    for c in sorted(pool, key=lambda c: -c['links']):
        label = re.sub(r'\s*\(.*?\)\s*$', '', c['label'] or '').strip()
        if not label or norm(label) in have or c['links'] < MIN_LINKS:
            continue
        score, tier, pick = tier_for(c['links'])
        aliases = [a for a in c.get('aliases', []) if norm(a) != norm(label) and len(a) <= 40][:3]
        ans = {'text': label, 'rarityScore': score, 'tier': tier, 'pickRatePct': pick}
        if aliases:
            ans['aliases'] = aliases
        out.append(ans)
        have.add(norm(label))
        have.update(norm(a) for a in aliases)
    return out


def difficulty_for(answers):
    famous = sum(1 for a in answers if a['rarityScore'] <= 50)  # 40+ sitelinks
    return 'Easy' if famous >= 20 else 'Medium' if famous >= 8 else 'Hard'


def make_prompt(j, answers):
    clubs = [NAME[s] for s in j['clubs']]
    k = j['kind']
    if k == 'pair':
        p = {'prompt': f'Name a footballer who played competitive senior matches for both {clubs[0]} and {clubs[1]}',
             'category': 'Club Connections', 'description': f'Senior competitive appearances for both {clubs[0]} and {clubs[1]}.'}
    elif k == 'nat':
        art = DEMONYM[j['dem']][0]
        p = {'prompt': f"Name {art} {j['dem']} footballer who played senior competitive matches for {clubs[0]}",
             'category': 'Nationality & Club', 'description': f"{j['dem']} players who represented {clubs[0]}."}
    elif k == 'gk':
        p = {'prompt': f'Name a goalkeeper who made senior appearances for {clubs[0]}', 'category': 'Position & Club',
             'description': f'GK players who represented {clubs[0]}.'}
    elif k == 'broad_club':
        p = {'prompt': f'Name any footballer who played competitive senior matches for {clubs[0]}',
             'category': 'Club Connections', 'description': f'Every senior {clubs[0]} player with a Wikipedia article in 3+ languages.'}
    elif k == 'broad_nat':
        art = DEMONYM[j['dem']][0]
        p = {'prompt': f"Name {art} {j['dem']} footballer who played senior competitive matches for {GROUPS[j['group']][0]}",
             'category': 'Nationality & Club', 'description': f"{j['dem']} players with a Wikipedia article in 3+ languages."}
    else:
        p = {'prompt': f"Name a goalkeeper who made senior appearances for {GROUPS[j['group']][0]}",
             'category': 'Position & Club', 'description': 'Goalkeepers with a Wikipedia article in 3+ languages.'}
    out = {'id': j['id'], 'prompt': p['prompt'], 'category': p['category'], 'difficulty': difficulty_for(answers),
           'description': p['description']}
    if k.startswith('broad'):
        out['broad'] = True
    out['answers'] = answers
    return out


def apply():
    jobs = json.load(open(JOBS, encoding='utf-8'))
    pools = json.load(open(POOLS, encoding='utf-8'))
    prompts = load_prompts()
    have_ids = {p['id'] for p in prompts}
    built = collections.defaultdict(list)
    for j in jobs:
        if j['id'] not in pools or j['id'] in have_ids:
            continue
        answers = build_answers(pools[j['id']])
        if len(answers) < 8:
            continue
        built[j['kind']].append((j, answers))
    target = {'pair': 40, 'nat': 18, 'gk': 12}
    chosen = []
    for kind, n in target.items():
        # prefer the prompts with the most recognisable answers; keep each club/nation from dominating
        # alternate Easy / Medium / Hard so the rising Quick Match schedule has prompts for every tier
        fame = lambda x: -sum(1 for a in x[1] if a['rarityScore'] <= 50)
        tiers = [sorted([x for x in built[kind] if difficulty_for(x[1]) == d], key=fame) for d in ('Hard', 'Medium', 'Easy')]
        ranked = [x for group in itertools.zip_longest(*tiers) for x in group if x]
        use, per_club = [], collections.Counter()
        for j, ans in ranked:
            if len(use) >= n:
                break
            if any(per_club[c] >= (4 if kind == 'pair' else 2) for c in j['clubs']):
                continue
            per_club.update(j['clubs'])
            use.append((j, ans))
        chosen += use
    chosen += [x for k in ('broad_club', 'broad_nat', 'broad_gk') for x in built[k]]
    new = [make_prompt(j, a) for j, a in chosen]
    print('new prompts', len(new), collections.Counter(('broad' if p.get('broad') else 'specific', p['difficulty']) for p in new))
    print('answers', sum(len(p['answers']) for p in new), 'broad sizes', sorted(len(p['answers']) for p in new if p.get('broad')))
    for p in new[:3] + [p for p in new if p.get('broad')][:2]:
        print(' ', p['id'], p['difficulty'], len(p['answers']), '|', p['prompt'], '|', [a['text'] for a in p['answers'][:5]])
    if WRITE:
        header = "import type { SideNettingPrompt } from './types';\n\nexport const SIDE_NETTING_PROMPTS: SideNettingPrompt[] = "
        with open(TS_PATH, 'w', encoding='utf-8', newline='\n') as f:
            f.write(header + json.dumps(prompts + new, ensure_ascii=False, separators=(',', ':')) + ';\n')
        print('written', os.path.getsize(TS_PATH), 'bytes')


{'plan': plan, 'fetch': fetch, 'sparql': sparql, 'apply': apply}[MODE]()
