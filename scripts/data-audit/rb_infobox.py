"""Record Books: check every entry against the player's English Wikipedia infobox.

The infobox lists each senior club spell with LEAGUE apps/goals, so for every (player, club) entry:
  - not_at_club: no senior spell at that club in the infobox -> wrong player / never played there
  - too_low:     our all-competition goals < infobox league goals at the club (impossible)
  - too_high:    our goals > 1.9 x league goals + 8 (far beyond any cup/European share)
Assists cannot be checked this way (infoboxes carry no assists); only membership is checked for them.

  python rb_infobox.py <repo> fetch     en.wikipedia API, 50 pages / request, ~1 req / s, cached
  python rb_infobox.py <repo> report    -> rb_report_infobox.json + summary
"""
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request, collections

HERE = os.path.dirname(__file__)
ROOT, MODE = sys.argv[1], sys.argv[2]
DATA = os.path.join(ROOT, 'src/data/recordBooksData.json')
CACHE = os.path.join(HERE, 'cache', 'wiki_infobox.json')
UA = 'TopBinsDataAudit/1.0 (local dev script)'
clubs = json.load(open(DATA, encoding='utf-8'))


def norm(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', s)


# club -> (substring keys, exact-only keys)
CLUB_KEYS = {
    'Inter Milan': (['internazionale', 'intermilan'], []), 'Atletico Madrid': (['atleticomadrid', 'atleticodemadrid'], []),
    'Bayern Munich': (['bayernmunich', 'bayernmunchen'], []), 'Paris Saint-Germain': (['parissaintgermain'], []),
    'AS Roma': (['asroma'], ['roma']), 'Lazio': (['lazio'], []), 'Napoli': (['napoli'], []),
    'Sporting CP': (['sportingcp', 'sportingclubedeportugal', 'sportinglisbon'], []),
    'Olympique Lyonnais': (['olympiquelyonnais'], ['lyon']), 'Olympique de Marseille': (['olympiquedemarseille'], ['marseille']),
    'AS Monaco': (['asmonaco'], ['monaco']), 'PSV Eindhoven': (['psveindhoven'], ['psv']), 'Ajax': (['afcajax'], ['ajax']),
    'Bayer Leverkusen': (['bayerleverkusen', 'bayer04leverkusen'], []), 'Athletic Bilbao': (['athleticbilbao'], ['athleticclub']),
    'Valencia': (['valenciacf'], ['valencia']), 'Celtic': ([], ['celtic', 'celticfc']), 'Rangers': ([], ['rangers', 'rangersfc']),
    'Everton': ([], ['everton', 'evertonfc']), 'Liverpool': ([], ['liverpool', 'liverpoolfc']),
    'Arsenal': ([], ['arsenal', 'arsenalfc']), 'Chelsea': ([], ['chelsea', 'chelseafc']), 'Barcelona': (['fcbarcelona'], ['barcelona']),
    'Sevilla': (['sevillafc'], ['sevilla']), 'Wolfsburg': (['vflwolfsburg'], ['wolfsburg']), 'Villarreal': (['villarrealcf'], ['villarreal']),
    'Real Sociedad': (['realsociedad'], []), 'Fiorentina': (['fiorentina'], []), 'Juventus': (['juventus'], []),
}
EXCLUDE = ['castilla', 'reserve', 'academy', 'nextgen', 'u23', 'u21', 'u19', 'youth', 'women', 'ladies', 'primavera',
           'jong', 'mestalla', 'bilbaoathletic', 'barcelonaatletic', 'sevillaatletico', 'barcelonasc']


def club_matches(club, target):
    t = norm(target)
    if not t or any(x in t for x in EXCLUDE):
        return False
    subs, exact = CLUB_KEYS.get(club, ([norm(club)], []))
    if t in exact:
        return True
    for k in subs:
        if k in t:
            rest = t.split(k, 1)[1]
            return rest in ('', 'fc', 'cf', 'afc', '1913', '1926', 'milano', 'fcdeportugal') or not re.fullmatch(r'(b|c|ii|iii)', rest)
    return False


def infobox_spells(text):
    """[(club_target, caps, goals)] for senior club spells in {{Infobox football biography}}."""
    m = re.search(r'\{\{\s*Infobox football biography', text, re.I)
    if not m:
        return None
    box = text[m.start():m.start() + 20000]
    fields = {}
    for m in re.finditer(r'\|\s*(clubs\d+|caps\d+|goals\d+)\s*=\s*', box):
        k, v = m.group(1), box[m.end():].split('\n', 1)[0]
        depth, end = 0, len(v)  # the value ends at the first "|" outside [[...]] / {{...}}
        for i, ch in enumerate(v):
            if v[i:i + 2] in ('[[', '{{'):
                depth += 1
            elif v[i:i + 2] in (']]', '}}'):
                depth -= 1
            elif ch == '|' and depth <= 0:
                end = i
                break
        fields[k] = v[:end]
    spells = []
    for k, v in fields.items():
        if not k.startswith('clubs'):
            continue
        n = k[5:]
        link = re.search(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]', v)
        target = link.group(1) if link else v
        loan = '→' in v or '(loan)' in v.lower()
        def num(x):
            mm = re.search(r'\d+', re.sub(r'<[^>]+>|\{\{[^}]*\}\}', '', x or ''))
            return int(mm.group()) if mm else None
        spells.append({'club': target.strip(), 'caps': num(fields.get('caps' + n)), 'goals': num(fields.get('goals' + n)), 'loan': loan})
    return spells


_last = [0.0]


def api(params):
    wait = 1.0 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    url = 'https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': 2})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=90) as r:
                return json.load(r)
        except Exception as e:
            time.sleep(10 * (attempt + 1))
    return {}


def fetch_titles(titles, cache):
    """Resolve titles (following redirects) and cache {asked_title: {'title', 'disambig', 'spells'}}."""
    need = [t for t in dict.fromkeys(titles) if t not in cache]
    for i in range(0, len(need), 50):
        chunk = need[i:i + 50]
        d = api({'action': 'query', 'prop': 'revisions', 'rvprop': 'content', 'rvslots': 'main', 'titles': '|'.join(chunk),
                 'redirects': 1})
        q = d.get('query', {})
        alias = {}
        for r in q.get('normalized', []) + q.get('redirects', []):
            alias[r['from']] = r['to']
        pages = {p['title']: p for p in q.get('pages', [])}
        for t in chunk:
            final = t
            for _ in range(3):
                final = alias.get(final, final)
            p = pages.get(final)
            if not p or p.get('missing') or not p.get('revisions'):
                cache[t] = {'title': final, 'missing': True}
                continue
            text = p['revisions'][0]['slots']['main']['content']
            dis = bool(re.search(r'\{\{\s*(disambiguation|hndis|set index|surname|given name)', text, re.I))
            cache[t] = {'title': final, 'disambig': dis, 'spells': infobox_spells(text)}
        json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
        print(f'  pages {min(i + 50, len(need))}/{len(need)}', flush=True)


def entries():
    for c in clubs:
        for metric in ('topGoals', 'topAssists'):
            for e in c[metric]:
                yield c['name'], metric, e


def candidates(e):
    out = [e['name']] + [a for a in e.get('aliases') or [] if ' ' in a]
    return list(dict.fromkeys(out))


def resolve(club, e, cache):
    for t in candidates(e) + [f"{n} (footballer)" for n in candidates(e)]:
        r = cache.get(t)
        if r and not r.get('missing') and not r.get('disambig') and r.get('spells'):
            if any(club_matches(club, s['club']) for s in r['spells']):
                return t, r
    s = cache.get('search::' + club + '::' + e['name'])
    for hit in (s or {}).get('hits') or []:  # the right page is often not the first hit (club page, namesakes)
        r = cache.get(hit)
        if r and r.get('spells') and any(club_matches(club, x['club']) for x in r['spells']):
            return hit, r
    return None, None


def fetch():
    cache = json.load(open(CACHE, encoding='utf-8')) if os.path.exists(CACHE) else {}
    print('round 1: names and full-name aliases', flush=True)
    fetch_titles([t for _, _, e in entries() for t in candidates(e)], cache)
    print('round 2: "(footballer)" titles', flush=True)
    fetch_titles([f"{t} (footballer)" for club, _, e in entries() if not resolve(club, e, cache)[0] for t in candidates(e)], cache)
    print('round 3: search', flush=True)
    todo = [(club, e) for club, _, e in entries() if not resolve(club, e, cache)[0]]
    todo = list({(club, e['name']): (club, e) for club, e in todo}.values())
    found = []
    for k, (club, e) in enumerate(todo):
        key = 'search::' + club + '::' + e['name']
        if key in cache:
            continue
        d = api({'action': 'query', 'list': 'search', 'srsearch': f'{e["name"]} footballer {club}', 'srlimit': 3, 'srprop': ''})
        hits = [h['title'] for h in d.get('query', {}).get('search', [])]
        cache[key] = {'title': hits[0] if hits else None, 'hits': hits}
        if hits:
            found.append(hits[0])
        if k % 50 == 0:
            json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
            print(f'  search {k}/{len(todo)}', flush=True)
    fetch_titles(found, cache)
    print('round 4: every search hit of still-unresolved entries', flush=True)
    fetch_titles([h for club, _, e in entries() if not resolve(club, e, cache)[0]
                  for h in (cache.get('search::' + club + '::' + e['name']) or {}).get('hits') or []], cache)
    json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
    print('INFOBOX FETCH DONE', flush=True)


def report():
    cache = json.load(open(CACHE, encoding='utf-8'))
    rows, stats = [], collections.Counter()
    for club, metric, e in entries():
        title, r = resolve(club, e, cache)
        rec = {'club': club, 'metric': metric[3:], 'name': e['name'], 'ours': e['count']}
        if not title:
            rec['flag'] = 'not_at_club'
        else:
            rec['page'] = r['title']
            spells = [s for s in r['spells'] if club_matches(club, s['club'])]
            league = sum(s['goals'] or 0 for s in spells)
            rec['league_goals'] = league
            if metric == 'topGoals':
                if e['count'] < league - 2:
                    rec['flag'] = 'too_low'
                elif e['count'] > league * 1.9 + 8:
                    rec['flag'] = 'too_high'
        stats[(metric[3:], rec.get('flag', 'ok'))] += 1
        rows.append(rec)
    json.dump(rows, open(os.path.join(HERE, 'rb_report_infobox.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(sorted(stats.items()))
    by_club = collections.Counter((r['club'], r.get('flag')) for r in rows if r.get('flag'))
    print(sorted(by_club.items(), key=lambda x: -x[1])[:25])


{'fetch': fetch, 'report': report}[MODE]()
