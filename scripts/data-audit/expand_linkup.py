"""Link-Up expansion pass 2 (Oct 2026).

apply_generated.py only merged candidates with 25+ sitelinks, born 1950+, and 2+ known clubs, and it detected
existing players by Wikidata id. Hand-made records use other ids ("m-lionel-messi"), so 222 stars were added a
second time as "Name (birth year)". This pass:
  1) folds those duplicates back into the original record (club lists merged), and
  2) merges the remaining candidates with relaxed filters: 10+ sitelinks, any birth year, 1+ known club.
     A candidate whose name matches an existing player with shared clubs is merged, not added.
Tiers follow apply_generated.py: Easy 80+ sitelinks, Medium 40+, Hard below.

  python expand_linkup.py <repo> [--write]
"""
import json, os, re, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wdapi
from nations import team_country

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = sys.argv[1]
WRITE = '--write' in sys.argv
DB_PATH = os.path.join(ROOT, 'src/data/linkUpDatabase.json')
MIN_LINKS = 10

orig_get = wdapi._get


def slow_get(params):  # only used for labels that are not cached yet
    import time
    time.sleep(3.0)
    return orig_get(params)


wdapi._get = slow_get

db = json.load(open(DB_PATH, encoding='utf-8'))
cmap = json.load(open(os.path.join(HERE, 'club_map.json'), encoding='utf-8'))
wd_known = json.load(open(os.path.join(HERE, 'wd_players.json'), encoding='utf-8'))
cand = json.load(open(os.path.join(HERE, 'expansion_candidates.json'), encoding='utf-8'))
_, ents = wdapi._cache('claims|sitelinks|labels|aliases')

tier_of, name_of = {}, {}
for p in db:
    for c in p['clubs']:
        tier_of[c['slug']] = c['tier']
        name_of[c['slug']] = c['name']
canon = {}
for slug, m in cmap.items():
    if m.get('qid') and slug in tier_of:
        cur = canon.get(m['qid'])
        if not cur or m['players'] > cmap[cur]['players']:
            canon[m['qid']] = slug


def club_entry(slug):
    return {'name': name_of[slug], 'slug': slug, 'tier': tier_of[slug]}


def is_same_player(a_clubs, b):
    shared = set(a_clubs) & {c['slug'] for c in b['clubs']}
    return len(shared) >= 2 or (len(shared) >= 1 and len(a_clubs) <= 2 and len(b['clubs']) <= 2)


def merge_clubs(target, slugs):
    have = {c['slug'] for c in target['clubs']}
    for s in slugs:
        if s not in have and s in tier_of:
            target['clubs'].append(club_entry(s))
            have.add(s)


stats = collections.Counter()

# ---- 1) fold earlier "(year)" duplicates back into the original record ----
by_name = collections.defaultdict(list)
for p in db:
    by_name[p['name']].append(p)
drop = set()
for p in db:
    m = re.match(r'^(.*) \((\d{4})\)$', p['name'])
    if not m:
        continue
    for q in by_name.get(m.group(1), []):
        if q is not p and is_same_player([c['slug'] for c in p['clubs']], q):
            merge_clubs(q, [c['slug'] for c in p['clubs']])
            q['aliases'] = list(dict.fromkeys((q.get('aliases') or []) + [a for a in p.get('aliases') or [] if a != q['name']]))
            for k in ('secondaryPosition', 'secondaryNationality', 'nationalTeams'):
                if k in p and k not in q:
                    q[k] = p[k]
            drop.add(id(p))
            stats['folded_duplicates'] += 1
            break
db = [p for p in db if id(p) not in drop]
for p in db:  # every record carries the optional arrays the engines expect
    p.setdefault('aliases', [])
    if not p.get('difficulty'):
        e = ents.get(p['id'])
        p['difficulty'] = 'Easy' if e and e['links'] >= 80 else 'Medium' if e and e['links'] >= 40 else 'Hard'
        stats['difficulty_filled'] += 1

# ---- 2) remaining candidates ----
have_ids = {p['id'].replace('SPLIT_', '') for p in db}
by_name = collections.defaultdict(list)
for p in db:
    by_name[p['name']].append(p)
    by_name[p.get('commonName') or p['name']].append(p)
picked = []
for qid in cand['ids']:
    e = ents.get(qid)
    if qid in have_ids or not e or not e.get('label'):
        continue
    if e['links'] < MIN_LINKS or ('Q937857' not in e['p106'] and not e['p413']):
        stats['skipped_obscure_or_not_player'] += 1
        continue
    clubs = list(dict.fromkeys(canon[t['id']] for t in sorted(e['teams'], key=lambda t: t['start'] or '0000') if t['id'] in canon))
    if not clubs:
        stats['skipped_no_known_club'] += 1
        continue
    same = next((q for q in by_name.get(e['label'], []) if is_same_player(clubs, q)), None)
    if same:
        merge_clubs(same, clubs)
        stats['merged_into_existing'] += 1
        continue
    picked.append((e['links'], qid, clubs))
picked.sort(reverse=True)

nat_label = {t['id']: t['label'] for e in wd_known.values() for t in e['teams'] if t['national']}
lab_cache = {**{k: v.get('label') or '' for k, v in wdapi._cache('labels|claims')[1].items()}}
need = set()
for _, qid, _ in picked:
    e = ents[qid]
    need |= {t['id'] for t in e['teams'] if t['id'] not in canon and t['id'] not in nat_label}
    need |= set(e['p413']) | set(e['p1532']) | set(e['p27'])
need -= set(lab_cache)
print('labels to fetch', len(need), flush=True)
if need:
    lab_cache.update(wdapi.labels(sorted(need)))

POS = [(r'goalkeeper', 'GK'), (r'(defender|back\b|full-?back|wing-?back|sweeper|libero)', 'DEF'),
       (r'(midfielder|playmaker|regista)', 'MID'), (r'(forward|striker|winger|attacker)', 'FWD')]
NON_FIFA = {'Catalonia', 'Galicia', 'Basque Country', 'Corsica', 'Andalusia', 'Asturias', 'United Kingdom', 'Great Britain'}
names = {p['name'] for p in db}
new_players = []
for links, qid, clubs in picked:
    e = ents[qid]
    seniors = []
    for t in sorted(e['teams'], key=lambda t: t['start'] or '0000'):
        lab = nat_label.get(t['id']) or lab_cache.get(t['id'])
        c = team_country(lab) if lab else None
        if c and c not in NON_FIFA and c not in seniors:
            seniors.append(c)
    nat = seniors[-1] if seniors else next((lab_cache.get(x) for x in e['p1532'] + e['p27'] if lab_cache.get(x)), None)
    cats = []
    for x in e['p413']:
        for rx, cat in POS:
            if re.search(rx, lab_cache.get(x, ''), re.I):
                if cat not in cats:
                    cats.append(cat)
                break
    if not nat or not cats:
        stats['skipped_no_nation_or_position'] += 1
        continue
    name = e['label'] if e['label'] not in names else f"{e['label']} ({e['birth'] or qid})"
    names.add(name)
    surname = e['label'].split(' ')[-1]
    aliases = [a for a in e['aliases'] if len(a) <= 40][:3]
    if surname != e['label'] and surname not in aliases:
        aliases.append(surname)
    rec = {'id': qid, 'name': name, 'commonName': e['label'], 'aliases': aliases, 'position': cats[0], 'nationality': nat,
           'clubs': [club_entry(s) for s in clubs],
           'difficulty': 'Easy' if links >= 80 else 'Medium' if links >= 40 else 'Hard'}
    if len(cats) > 1 and 'GK' not in cats[:2]:
        rec['secondaryPosition'] = cats[1]
    if len(seniors) > 1:
        rec['secondaryNationality'] = next(s for s in seniors if s != nat)
        rec['nationalTeams'] = seniors
    new_players.append(rec)

stats['added'] = len(new_players)
print(dict(stats))
print('added by tier', collections.Counter(p['difficulty'] for p in new_players))
print('sample', [(p['name'], p['nationality'], p['position'], [c['slug'] for c in p['clubs']][:3]) for p in new_players[:6]])
print('total players', len(db) + len(new_players))
if WRITE:
    with open(DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(db + new_players, f, ensure_ascii=False, separators=(',', ':'))
    print('written', os.path.getsize(DB_PATH), 'bytes')
