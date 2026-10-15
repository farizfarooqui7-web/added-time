"""Offline apply of net_jobs.py results.
 - Side Netting: add every missing notable answer to club-based prompts (tiered by fame)
 - Link-Up: add the expansion players
usage: python apply_generated.py <repo> [--write]"""
import json, os, re, sys, unicodedata, collections
sys.path.insert(0, os.path.dirname(__file__))
import wdapi
from nations import team_country

ROOT = sys.argv[1]
WRITE = '--write' in sys.argv
HERE = os.path.dirname(__file__)
TS_PATH = os.path.join(ROOT, 'src/games/side-netting/promptsData.ts')
DB_PATH = os.path.join(ROOT, 'src/data/linkUpDatabase.json')
MAX_NEW_PER_PROMPT = 120
MAX_NEW_PLAYERS = 1500


def norm(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', s)


def tier_for(links):
    if links >= 80:
        return 30, 'Starter XI', 45.0
    if links >= 40:
        return 50, 'Cult Hero', 20.0
    if links >= 15:
        return 85, "Streets Won't Forget", 6.0
    return 100, "Ballon d'Or Knowledge", 1.5


# ---------------- Side Netting ----------------
raw = open(TS_PATH, encoding='utf-8').read()
body = raw[raw.index('= ') + 2:].rstrip().rstrip(';')
prompts = json.loads(body)
gen = json.load(open(os.path.join(HERE, 'sn_generated.json'), encoding='utf-8'))
sn_added = 0
for p in prompts:
    pool = gen.get(p['id'])
    if not pool:
        continue
    have = set()
    for a in p['answers']:
        have.add(norm(a['text']))
        have.update(norm(x) for x in a.get('aliases') or [])
    added = 0
    for c in sorted(pool, key=lambda c: -c['links']):
        if added >= MAX_NEW_PER_PROMPT:
            break
        label = re.sub(r'\s*\(.*?\)\s*$', '', c['label'] or '').strip()
        if not label or norm(label) in have or c['links'] < 3:
            continue
        score, tier, pick = tier_for(c['links'])
        aliases = [a for a in c.get('aliases', []) if norm(a) != norm(label) and len(a) <= 40][:3]
        ans = {'text': label, 'rarityScore': score, 'tier': tier, 'pickRatePct': pick}
        if aliases:
            ans['aliases'] = aliases
        p['answers'].append(ans)
        have.add(norm(label))
        have.update(norm(a) for a in aliases)
        added += 1
    sn_added += added
print('side netting answers added', sn_added)

# ---------------- Link-Up expansion ----------------
db = json.load(open(DB_PATH, encoding='utf-8'))
cmap = json.load(open(os.path.join(HERE, 'club_map.json'), encoding='utf-8'))
wd_known = json.load(open(os.path.join(HERE, 'wd_players.json'), encoding='utf-8'))
cand = json.load(open(os.path.join(HERE, 'expansion_candidates.json'), encoding='utf-8'))
ents = wdapi.entities(cand['ids'], props='claims|sitelinks|labels|aliases')

canon = {}
tier_of, name_of = {}, {}
for p in db:
    for c in p['clubs']:
        tier_of[c['slug']] = c['tier']
        name_of[c['slug']] = c['name']
for slug, m in cmap.items():
    if m.get('qid') and slug in tier_of:
        cur = canon.get(m['qid'])
        if not cur or m['players'] > cmap[cur]['players']:
            canon[m['qid']] = slug

# national team labels: from the earlier SPARQL pull, then the API for anything unseen
nat_label = {}
for e in wd_known.values():
    for t in e['teams']:
        if t['national']:
            nat_label[t['id']] = t['label']
picked = []
for qid, e in ents.items():
    if not e.get('label') or e['links'] < 25 or not e['birth'] or int(e['birth']) < 1950 or 'Q937857' not in e['p106']:
        continue
    clubs = [canon[t['id']] for t in sorted(e['teams'], key=lambda t: t['start'] or '0000') if t['id'] in canon]
    clubs = list(dict.fromkeys(clubs))
    if len(clubs) < 2:
        continue
    picked.append((e['links'], qid, clubs))
picked.sort(reverse=True)
picked = picked[:MAX_NEW_PLAYERS]

unknown_teams = {t['id'] for _, qid, _ in picked for t in ents[qid]['teams'] if t['id'] not in canon and t['id'] not in nat_label}
team_labels = wdapi.labels(sorted(unknown_teams)) if unknown_teams else {}
pos_ids = {x for _, qid, _ in picked for x in ents[qid]['p413']}
pos_labels = wdapi.labels(sorted(pos_ids)) if pos_ids else {}
country_ids = {x for _, qid, _ in picked for x in ents[qid]['p1532'] + ents[qid]['p27']}
country_labels = wdapi.labels(sorted(country_ids)) if country_ids else {}

POS = [(r'goalkeeper', 'GK'), (r'(defender|back\b|full-?back|wing-?back|sweeper|libero)', 'DEF'),
       (r'(midfielder|playmaker|regista)', 'MID'), (r'(forward|striker|winger|attacker)', 'FWD')]
NON_FIFA = {'Catalonia', 'Galicia', 'Basque Country', 'Corsica', 'Andalusia', 'Asturias', 'United Kingdom', 'Great Britain'}
names = {p['name'] for p in db}
new_players = []
for links, qid, clubs in picked:
    e = ents[qid]
    seniors = []
    for t in sorted(e['teams'], key=lambda t: t['start'] or '0000'):
        lab = nat_label.get(t['id']) or team_labels.get(t['id'])
        c = team_country(lab) if lab else None
        if c and c not in NON_FIFA and c not in seniors:
            seniors.append(c)
    nat = seniors[-1] if seniors else next((country_labels.get(x) for x in e['p1532'] + e['p27'] if country_labels.get(x)), None)
    if not nat:
        continue
    cats = []
    for x in e['p413']:
        lab = pos_labels.get(x, '')
        for rx, cat in POS:
            if re.search(rx, lab, re.I):
                if cat not in cats:
                    cats.append(cat)
                break
    if not cats:
        continue
    name = e['label']
    if name in names:
        name = f"{name} ({e['birth']})"
    names.add(name)
    surname = e['label'].split(' ')[-1]
    aliases = [a for a in e['aliases'] if len(a) <= 40][:3]
    if surname != e['label'] and surname not in aliases:
        aliases.append(surname)
    rec = {
        'id': qid, 'name': name, 'commonName': e['label'], 'aliases': aliases,
        'position': cats[0], 'nationality': nat,
        'clubs': [{'name': name_of[s], 'slug': s, 'tier': tier_of[s]} for s in clubs],
        'difficulty': 'Easy' if links >= 80 else 'Medium' if links >= 40 else 'Hard',
    }
    if len(cats) > 1 and 'GK' not in cats[:2]:
        rec['secondaryPosition'] = cats[1]
    if len(seniors) > 1:
        rec['secondaryNationality'] = next(s for s in seniors if s != nat)
        rec['nationalTeams'] = seniors
    new_players.append(rec)

print('link-up players added', len(new_players), collections.Counter(p['difficulty'] for p in new_players))
if WRITE:
    header = "import type { SideNettingPrompt } from './types';\n\nexport const SIDE_NETTING_PROMPTS: SideNettingPrompt[] = "
    with open(TS_PATH, 'w', encoding='utf-8', newline='\n') as f:
        f.write(header + json.dumps(prompts, ensure_ascii=False, separators=(',', ':')) + ';\n')
    with open(DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(db + new_players, f, ensure_ascii=False, separators=(',', ':'))
    print('written')
