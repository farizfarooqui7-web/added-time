"""Background network job (Wikidata Action API only, throttled + cached):
 1) Side Netting: full answer pools for club-based prompts      -> sn_generated.json
 2) Link-Up expansion candidates from the major clubs            -> expansion_candidates.json
"""
import json, os, re, sys, time, unicodedata
sys.path.insert(0, os.path.dirname(__file__))
import wdapi

HERE = os.path.dirname(__file__)
wdapi_throttle = 3.0  # seconds between requests (anonymous API limits)
_orig_get = wdapi._get


def slow_get(params):
    time.sleep(wdapi_throttle)
    return _orig_get(params)


wdapi._get = slow_get

prompts = json.load(open(os.path.join(HERE, 'prompts.json'), encoding='utf-8'))
cmap = json.load(open(os.path.join(HERE, 'club_map.json'), encoding='utf-8'))
db = json.load(open(sys.argv[1] + '/src/data/linkUpDatabase.json', encoding='utf-8'))


def norm(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', s)


club_q = {}
for slug, m in cmap.items():
    if m.get('qid'):
        club_q.setdefault(norm(m['name']), m['qid'])
        if m.get('label'):
            club_q.setdefault(norm(m['label']), m['qid'])
club_q.update({norm('Barcelona'): club_q[norm('FC Barcelona')], norm('Inter'): club_q[norm('Inter Milan')]})

DEMONYM = {  # demonym -> (P1532 country ids, P27 citizenship ids)
    'Brazilian': (['Q155'], ['Q155']), 'Argentine': (['Q414'], ['Q414']), 'French': (['Q142'], ['Q142']),
    'Dutch': (['Q55', 'Q29999'], ['Q55', 'Q29999']), 'Spanish': (['Q29'], ['Q29']), 'Italian': (['Q38'], ['Q38']),
    'German': (['Q183', 'Q713750'], ['Q183', 'Q713750']), 'Portuguese': (['Q45'], ['Q45']),
    'English': (['Q21'], []), 'Croatian': (['Q224'], ['Q224']), 'Belgian': (['Q31'], ['Q31']),
    'Uruguayan': (['Q77'], ['Q77']),
}
FOOTBALLER = 'haswbstatement:P106=Q937857'


def club(name):
    q = club_q.get(norm(name)) or club_q.get(norm('FC ' + name)) or club_q.get(norm(name.replace('FC ', '')))
    return q


jobs = {}
for p in prompts:
    if p['category'] not in ('Club Connections', 'Nationality & Club', 'Position & Club'):
        continue
    t = p['prompt']
    m = re.search(r'for both (.+?) and (.+?)\s*$', t)
    if m:
        a, b = club(m.group(1)), club(m.group(2))
        if a and b:
            jobs[p['id']] = [f'{FOOTBALLER} haswbstatement:P54={a} haswbstatement:P54={b}']
        continue
    m = re.match(r'Name an? (\w+) footballer who (?:has )?played (?:senior competitive matches )?for (.+?)\s*$', t)
    if m and m.group(1) in DEMONYM:
        c = club(m.group(2))
        if c:
            sport, cit = DEMONYM[m.group(1)]
            qs = [f'{FOOTBALLER} haswbstatement:P54={c} haswbstatement:P1532={x}' for x in sport]
            qs += [f'{FOOTBALLER} haswbstatement:P54={c} haswbstatement:P27={x} -haswbstatement:P1532' for x in cit]
            jobs[p['id']] = qs
        continue
    m = re.match(r'Name a goalkeeper who made senior appearances for (.+?)\s*$', t)
    if m and club(m.group(1)):
        jobs[p['id']] = [f'haswbstatement:P413=Q201330 haswbstatement:P54={club(m.group(1))}']

print('side netting jobs', len(jobs), flush=True)
OUT = os.path.join(HERE, 'sn_generated.json')
gen = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
for i, (pid, qs) in enumerate(jobs.items()):
    if pid in gen:
        continue
    ids = []
    for q in qs:
        for x in wdapi.cirrus(q, limit=250):
            if x not in ids:
                ids.append(x)
    if not ids:
        print(f'sn {i + 1}/{len(jobs)} {pid}: no results (will retry on next run)', flush=True)
        continue
    ents = wdapi.entities(ids, props='labels|aliases|sitelinks')
    gen[pid] = [{'id': x, 'label': ents[x]['label'], 'aliases': ents[x]['aliases'][:4], 'links': ents[x]['links']}
                for x in ids if x in ents and ents[x].get('label')]
    json.dump(gen, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'sn {i + 1}/{len(jobs)} {pid}: {len(gen[pid])}', flush=True)

# ---- 2) Link-Up expansion candidates ----
have = {p['id'].replace('SPLIT_', '') for p in db}
tiers = {}
for p in db:
    for c in p['clubs']:
        tiers[c['slug']] = c.get('tier')
major = [m['qid'] for s, m in cmap.items() if m.get('qid') and tiers.get(s) in ('Easy', 'Medium')]
major = list(dict.fromkeys(major))
print('expansion clubs', len(major), flush=True)
EOUT = os.path.join(HERE, 'expansion_candidates.json')
cand = json.load(open(EOUT, encoding='utf-8')) if os.path.exists(EOUT) else {'clubs_done': [], 'ids': []}
for i, cq in enumerate(major):
    if cq in cand['clubs_done']:
        continue
    for x in wdapi.cirrus(f'{FOOTBALLER} haswbstatement:P54={cq}', limit=120):
        if x not in have and x not in cand['ids']:
            cand['ids'].append(x)
    cand['clubs_done'].append(cq)
    json.dump(cand, open(EOUT, 'w', encoding='utf-8'))
    print(f'exp clubs {i + 1}/{len(major)} candidates {len(cand["ids"])}', flush=True)

ents = wdapi.entities(cand['ids'], props='claims|sitelinks|labels|aliases')
print('expansion entities fetched', len(ents), flush=True)
print('ALL DONE', flush=True)
