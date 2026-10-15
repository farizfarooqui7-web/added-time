"""Record Books audit (accuracy, not expansion).

  python rb_verify.py <repo> checks     offline consistency checks on recordBooksData.json
  python rb_verify.py <repo> wiki       top-15 goal counts vs each club's English Wikipedia records page
                                        (en.wikipedia API, 1 req / 2 s, cached in cache/wiki_*.json)
  python rb_verify.py <repo> members    every listed player vs the club's Wikidata squad membership (P54)
                                        (Wikidata Action API, ~1 req / 3 s, cached)
Reports go to rb_report_<mode>.json; only flagged items are printed.
"""
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request, collections
sys.path.insert(0, os.path.dirname(__file__))

HERE = os.path.dirname(__file__)
ROOT, MODE = sys.argv[1], sys.argv[2]
DATA = os.path.join(ROOT, 'src/data/recordBooksData.json')
UA = 'TopBinsDataAudit/1.0 (local dev script)'
clubs = json.load(open(DATA, encoding='utf-8'))


def norm(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', s)


def names_of(entry):
    return {norm(entry['name'])} | {norm(a) for a in entry.get('aliases') or []}


def checks():
    report = []
    for c in clubs:
        for metric in ('topGoals', 'topAssists'):
            rows = c.get(metric, [])
            counts = [r['count'] for r in rows]
            if counts != sorted(counts, reverse=True):
                report.append((c['name'], metric, 'not sorted descending'))
            seen = collections.Counter(norm(r['name']) for r in rows)
            for n, k in seen.items():
                if k > 1:
                    report.append((c['name'], metric, f'duplicate player {n}'))
            for r in rows:
                if not isinstance(r['count'], int) or r['count'] <= 0 or r['count'] > 800:
                    report.append((c['name'], metric, f"implausible count {r['name']} {r['count']}"))
            # an alias shared by two different players makes answers ambiguous
            owner = collections.defaultdict(set)
            for r in rows:
                for a in names_of(r):
                    owner[a].add(r['name'])
            for a, who in owner.items():
                if len(who) > 1 and len(a) > 2:
                    report.append((c['name'], metric, f'alias "{a}" shared by {sorted(who)}'))
        g = {norm(r['name']): r['count'] for r in c['topGoals']}
        a = {norm(r['name']): r['count'] for r in c.get('topAssists', [])}
        only_a = [n for n in a if n not in g]
        report.append((c['name'], 'info', f"goals {len(g)} assists {len(a)} assists-only {len(only_a)}"))
    json.dump(report, open(os.path.join(HERE, 'rb_report_checks.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    flagged = [r for r in report if r[1] != 'info']
    print('flagged', len(flagged))
    for r in flagged[:60]:
        print(' ', r)


_last = [0.0]


def wiki_get(params, cache_key):
    path = os.path.join(HERE, 'cache', f'wiki_{cache_key}.json')
    if os.path.exists(path):
        return json.load(open(path, encoding='utf-8'))
    wait = 2.0 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.time()
    url = 'https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': 2})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r:
                d = json.load(r)
            json.dump(d, open(path, 'w', encoding='utf-8'), ensure_ascii=False)
            return d
        except Exception:
            time.sleep(10 * (attempt + 1))
    return {}


LINK = re.compile(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]')
SORTNAME = re.compile(r'\{\{\s*sortname\s*\|([^|}]*)\|([^|}]*)', re.I)


def row_names(row):
    out = set()
    for target, text in LINK.findall(row):
        for s in (target, text):
            s = re.sub(r'\s*\(.*?\)\s*$', '', s or '')
            if s:
                out.add(norm(s))
    for a, b in SORTNAME.findall(row):
        out.add(norm(f'{a} {b}'))
        out.add(norm(b))
    return out


def row_numbers(row):
    row = re.sub(r'\b(18|19|20)\d\d\s*[–-]\s*(\d\d){1,2}\b', ' ', row)  # season / year ranges
    row = re.sub(r'\[\[[^\]]*\]\]|\{\{[^}]*\}\}|<ref[^>]*/>|<ref.*?</ref>', ' ', row, flags=re.S)
    return {int(x) for x in re.findall(r'(?<![\d.])(\d{1,3})(?![\d.])', row)}


def wiki():
    report = []
    for c in clubs:
        slug = c['slug']
        s = wiki_get({'action': 'query', 'list': 'search', 'srsearch': f"{c['name']} football club records and statistics",
                      'srlimit': 5}, f'search_{slug}')
        titles = [h['title'] for h in s.get('query', {}).get('search', [])]
        title = next((t for t in titles if 'record' in t.lower() or 'statistic' in t.lower()), None)
        if not title:
            report.append({'club': c['name'], 'status': 'no records page', 'titles': titles})
            continue
        p = wiki_get({'action': 'parse', 'page': title, 'prop': 'wikitext', 'redirects': 1}, f'parse_{slug}')
        text = p.get('parse', {}).get('wikitext', '')
        rows = re.split(r'\n\|-', text)
        indexed = [(row_names(r), r) for r in rows]
        checked = 0
        for e in c['topGoals'][:15]:
            keys = names_of(e)
            hits = [r for ns, r in indexed if ns & keys]
            if not hits:
                continue
            checked += 1
            nums = set().union(*(row_numbers(r) for r in hits))
            if e['count'] not in nums:
                near = sorted(nums, key=lambda n: abs(n - e['count']))[:4]
                report.append({'club': c['name'], 'player': e['name'], 'ours': e['count'], 'wiki_numbers_nearest': near,
                               'page': title})
        report.append({'club': c['name'], 'status': f'checked {checked}/15 on "{title}"'})
    json.dump(report, open(os.path.join(HERE, 'rb_report_wiki.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for r in report:
        print(' ', json.dumps(r, ensure_ascii=False))


def members():
    import wdapi
    orig = wdapi._get

    def slow(params):
        time.sleep(3.0)
        return orig(params)

    wdapi._get = slow
    cmap = json.load(open(os.path.join(HERE, 'club_map.json'), encoding='utf-8'))
    pools = {}
    pools_path = os.path.join(HERE, 'sn_batch2_pools.json')
    if os.path.exists(pools_path):  # the broad "any player for <club>" pools are full squad lists already
        for k, v in json.load(open(pools_path, encoding='utf-8')).items():
            if k.startswith('broad_any_'):
                pools[k[len('broad_any_'):].replace('_', '-')] = v
    out_path = os.path.join(HERE, 'rb_members.json')
    squads = json.load(open(out_path, encoding='utf-8')) if os.path.exists(out_path) else {}
    report = []
    for c in clubs:
        slug = c['slug']
        qid = (cmap.get(slug) or {}).get('qid')
        if slug not in squads:
            if slug in pools:
                squads[slug] = pools[slug]
            elif qid:
                ids = wdapi.cirrus(f'haswbstatement:P54={qid}', limit=4000)
                ents = wdapi.entities(ids, props='labels|aliases|sitelinks')
                squads[slug] = [{'id': x, 'label': ents[x]['label'], 'aliases': ents[x]['aliases'][:4],
                                 'links': ents[x]['links']} for x in ids if x in ents and ents[x].get('label')]
            else:
                report.append({'club': c['name'], 'status': 'no Wikidata club id'})
                continue
            json.dump(squads, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False)
            print('squad', slug, len(squads[slug]), flush=True)
        known, surnames = set(), collections.Counter()
        for m in squads[slug]:
            for s in [m['label']] + m['aliases']:
                s = re.sub(r'\s*\(.*?\)\s*$', '', s or '')
                known.add(norm(s))
            surnames[norm((m['label'] or '').split(' ')[-1])] += 1
        missing = []
        for metric in ('topGoals', 'topAssists'):
            for e in c[metric]:
                keys = names_of(e)
                if keys & known:
                    continue
                last = norm(e['name'].split(' ')[-1])
                if surnames.get(last):
                    continue  # spelling variant of a squad member's name: not conclusive, skip
                missing.append((metric[3:], e['name'], e['count']))
        report.append({'club': c['name'], 'squad_size': len(squads[slug]), 'not_found': missing})
    json.dump(report, open(os.path.join(HERE, 'rb_report_members.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('MEMBERS DONE', sum(len(r.get('not_found', [])) for r in report), 'unmatched entries', flush=True)


{'checks': checks, 'wiki': wiki, 'members': members}[MODE]()
