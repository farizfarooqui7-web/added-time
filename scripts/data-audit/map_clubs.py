"""Map every Link-Up club slug to a Wikidata team id by co-occurrence voting + label similarity."""
import json, os, sys, re, unicodedata, collections

ROOT = sys.argv[1]
HERE = os.path.dirname(__file__)
players = json.load(open(os.path.join(ROOT, 'src/data/linkUpDatabase.json'), encoding='utf-8'))
wd = json.load(open(os.path.join(HERE, 'wd_players.json'), encoding='utf-8'))

STOP = {'fc', 'cf', 'ac', 'as', 'sc', 'cd', 'rcd', 'afc', 'club', 'de', 'calcio', 'football', 'futbol', 'futebol',
        'ssc', 'ss', 'us', 'acf', 'sv', 'vfl', 'vfb', 'tsg', 'bv', 'sl', 'ogc', 'rc', 'aj', 'osc', 'krc', 'ud', 'sd',
        'real', 'the', 'and', 'of', 'cp', 'sk', 'fk', 'nk', 'pfc', '1', 'f', 'c', 'a', 'cs', 'tsv', 'spvgg', 'kv', 'k',
        'city', 'united', 'town', 'athletic', 'rovers', 'county', 'wanderers', 'albion', 'sporting', 'atletico', 'club',
        'racing', 'olympique', 'inter', 'internacional', 'deportivo', 'stade', 'borussia', 'dynamo', 'dinamo', 'cd'}


def toks(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower()
    return [t for t in re.split(r'[^a-z0-9]+', s) if t]


def sim(a, b):
    ta, tb = set(toks(a)) - STOP, set(toks(b)) - STOP
    if not ta or not tb:
        ta, tb = set(toks(a)), set(toks(b))
    return len(ta & tb) / max(1, min(len(ta), len(tb)))


YOUTH = re.compile(r'\b(u-?\d\d|under-?\d\d|youth|reserves?|ii\b|b\b|primavera|juvenil|castilla|atl[eè]tic|academy|amateur|olympic|women)', re.I)

votes = collections.defaultdict(collections.Counter)
labels = {}
slug_names = collections.defaultdict(collections.Counter)
for p in players:
    w = wd.get(p['id'])
    for cl in p['clubs']:
        slug_names[cl['slug']][cl['name']] += 1
    if not w:
        continue
    for cl in p['clubs']:
        for t in w['teams']:
            if t['national']:
                continue
            labels[t['id']] = t['label']
            votes[cl['slug']][t['id']] += 1

mapping, report = {}, []
for slug, names in slug_names.items():
    name = names.most_common(1)[0][0]
    best, best_score = None, 0
    for tid, n in votes[slug].most_common(25):
        lab = labels.get(tid) or ''
        if YOUTH.search(lab) and not YOUTH.search(name):
            continue
        s = sim(name, lab) + (0.35 if sim(slug.replace('-', ' '), lab) >= 1 else 0)
        score = n * (0.25 + s)
        if s >= 1 and score > best_score:
            best, best_score = tid, score
    mapping[slug] = {'name': name, 'qid': best, 'label': labels.get(best), 'votes': votes[slug][best] if best else 0,
                     'players': sum(names.values())}
    if not best:
        report.append((slug, name, sum(names.values())))

json.dump(mapping, open(os.path.join(HERE, 'club_map.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('mapped', sum(1 for m in mapping.values() if m['qid']), 'of', len(mapping))
print('unmapped (slug, name, players):')
for r in sorted(report, key=lambda r: -r[2])[:60]:
    print('  ', r)
# label sanity: show mappings whose label differs a lot from name
print('weak label matches:')
for slug, m in sorted(mapping.items(), key=lambda kv: -kv[1]['players']):
    if m['qid'] and sim(m['name'], m['label']) < 1:
        print('  ', slug, '|', m['name'], '->', m['label'], m['qid'], m['votes'])
