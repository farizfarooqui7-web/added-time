"""Club slug -> Wikidata team id without SPARQL (WDQS is rate-limited during an outage).
1) keep strict co-occurrence matches from club_map.json
2) match against every team label already seen in wd_players.json
3) Wikidata API search (wbsearchentities + wbgetentities P31 check) for the rest"""
import json, os, re, time, unicodedata, urllib.parse, urllib.request, collections

HERE = os.path.dirname(__file__)
UA = 'TopBinsDataAudit/1.0 (local dev script)'
cmap = json.load(open(os.path.join(HERE, 'club_map.json'), encoding='utf-8'))
wd = json.load(open(os.path.join(HERE, 'wd_players.json'), encoding='utf-8'))

HINTS = {
    'barcelona': 'FC Barcelona', 'nice': 'OGC Nice', 'rennes': 'Stade Rennais FC', 'lens': 'RC Lens', 'monaco': 'AS Monaco FC',
    'porto': 'FC Porto', 'basel': 'FC Basel', 'twente': 'FC Twente', 'nantes': 'FC Nantes', 'qpr': 'Queens Park Rangers F.C.',
    'wolfsburg': 'VfL Wolfsburg', 'nacional': 'Club Nacional de Football', 'junior': 'Atlético Junior',
    'red-star': 'Red Star FC', 'vitoria': 'Esporte Clube Vitória', 'audax': 'Audax Italiano', 'lyn': 'FK Lyn Oslo',
    'river-plate-uruguay': 'Club Atlético River Plate (Montevideo)', 'inter-miami': 'Inter Miami CF',
    'cardiff-city': 'Cardiff City F.C.', 'athletic-bilbao': 'Athletic Club', 'chievo': 'AC ChievoVerona',
    'como': 'Como 1907', 'hearts': 'Heart of Midlothian F.C.', 'morton': 'Greenock Morton F.C.',
    'brndby': 'Brøndby IF', 'strmsgodset': 'Strømsgodset IF', 'gent': 'K.A.A. Gent', 'aix': "Pays d'Aix FC",
    'internacional': 'Sport Club Internacional', 'botafogo': 'Botafogo de Futebol e Regatas', 'bahia': 'Esporte Clube Bahia',
    'excelsior': 'Excelsior Rotterdam', 'olympique-lyonnais': 'Olympique Lyonnais', 'afc-bournemouth': 'AFC Bournemouth',
    'bournemouth': 'AFC Bournemouth', '1899-hoffenheim': 'TSG 1899 Hoffenheim', 'hoffenheim': 'TSG 1899 Hoffenheim',
    'fc-nantes': 'FC Nantes', 'rc-lens': 'RC Lens', 'ogc-nice': 'OGC Nice', 'stade-rennais': 'Stade Rennais FC',
    'az-alkmaar': 'AZ Alkmaar', 'psv-eindhoven': 'PSV Eindhoven', 'sporting-cp': 'Sporting CP',
}

GENERIC = {'fc', 'cf', 'ac', 'as', 'sc', 'cd', 'club', 'de', 'calcio', 'football', 'f', 'c', 'the', 'afc', 'a', 'cp',
           'sv', 'vfl', 'vfb', 'rc', 'ogc', 'us', 'ss', 'ssc', 'acf', 'osc', 'aj', 'ud', 'sd', 'rcd', 'tsg', 'sk', 'fk', 'kv',
           'krc', '1', 'futebol', 'futbol', 'clube', 'de', 'and', 'of', 'cs', 'pfc', 'bv', 'sl'}


def toks(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower()
    return {t for t in re.split(r'[^a-z0-9]+', s) if t} - GENERIC


YOUTH = re.compile(r'(u-?\d\d\b|under-?\d\d|youth|reserve|\bii\b|\bb\b|primavera|juvenil|castilla|academy|amateur|women|olympic)', re.I)

# All team labels we have seen, with how often they appear
seen = collections.Counter()
labels = {}
for e in wd.values():
    for t in e['teams']:
        if t['national']:
            continue
        seen[t['id']] += 1
        labels[t['id']] = t['label'] or ''


def same_club(name, label):
    a, b = toks(name), toks(label)
    return bool(a) and bool(b) and (a <= b or b <= a)


phase2 = 0
for slug, m in cmap.items():
    if m.get('qid'):
        continue
    target = HINTS.get(slug, m['name'])
    best, best_n = None, 0
    for tid, n in seen.items():
        lab = labels[tid]
        if YOUTH.search(lab) and not YOUTH.search(target):
            continue
        if same_club(target, lab) and toks(target) == toks(lab) and n > best_n:
            best, best_n = tid, n
    if best:
        m.update(qid=best, label=labels[best], via='label')
        phase2 += 1
print('phase2 label matches', phase2, flush=True)


def get(url):
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            print('  retry', e, flush=True)
            time.sleep(4 * (attempt + 1))
    return {}


FOOTBALL_CLUB_TYPES = {'Q476028', 'Q15944511', 'Q1194951', 'Q103229495', 'Q28140340', 'Q2367225', 'Q17156793'}
todo = [s for s, m in cmap.items() if not m.get('qid')]
print('phase3 search', len(todo), flush=True)
for i, slug in enumerate(todo):
    m = cmap[slug]
    target = HINTS.get(slug, m['name'])
    res = get('https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'wbsearchentities', 'search': target, 'language': 'en', 'type': 'item', 'limit': 8, 'format': 'json'}))
    ids = [r['id'] for r in res.get('search', [])]
    if not ids:
        continue
    ents = get('https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'wbgetentities', 'ids': '|'.join(ids), 'props': 'labels|claims|sitelinks', 'languages': 'en', 'format': 'json'})).get('entities', {})
    best, best_score = None, -1
    for qid in ids:
        e = ents.get(qid) or {}
        p31 = {c['mainsnak'].get('datavalue', {}).get('value', {}).get('id') for c in e.get('claims', {}).get('P31', [])}
        has_sport = any(c['mainsnak'].get('datavalue', {}).get('value', {}).get('id') == 'Q2736'
                        for c in e.get('claims', {}).get('P641', []))
        if not (p31 & FOOTBALL_CLUB_TYPES or has_sport):
            continue
        lab = e.get('labels', {}).get('en', {}).get('value', '')
        if not (same_club(target, lab) or same_club(m['name'], lab)):
            continue
        score = len(e.get('sitelinks', {}))
        if score > best_score:
            best, best_score = qid, score
    if best:
        m.update(qid=best, label=ents[best]['labels']['en']['value'], via='search')
    if i % 25 == 0:
        print(f'{i}/{len(todo)}', flush=True)
        json.dump(cmap, open(os.path.join(HERE, 'club_map.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    time.sleep(0.15)

json.dump(cmap, open(os.path.join(HERE, 'club_map.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('mapped', sum(1 for m in cmap.values() if m.get('qid')), 'of', len(cmap))
print('unmapped:', [(s, m['name'], m['players']) for s, m in cmap.items() if not m.get('qid')])
