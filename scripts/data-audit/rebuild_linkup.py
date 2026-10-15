"""Rebuild Link-Up player records from Wikidata ground truth (offline, using wd_players.json).

usage: python rebuild_linkup.py <repo> [--write]
"""
import json, os, re, sys, collections
sys.path.insert(0, os.path.dirname(__file__))
from nations import team_country

ROOT = sys.argv[1]
WRITE = '--write' in sys.argv
HERE = os.path.dirname(__file__)
DB_PATH = os.path.join(ROOT, 'src/data/linkUpDatabase.json')
players = json.load(open(DB_PATH, encoding='utf-8'))
wd = json.load(open(os.path.join(HERE, 'wd_players.json'), encoding='utf-8'))
cmap = json.load(open(os.path.join(HERE, 'club_map.json'), encoding='utf-8'))

# Regional / non-FIFA selections are not national teams for the game
NON_FIFA = {'Catalonia', 'Galicia', 'Basque Country', 'Corsica', 'Andalusia', 'Asturias', 'United Kingdom',
            'Great Britain', 'Turkey A2', 'Canadian', 'Brittany', 'Occitania', 'Padania', 'Sápmi', 'Tibet', 'Kurdistan',
            'Northern Cyprus', 'Zanzibar', 'Réunion', 'Martinique', 'Guadeloupe', 'French Guiana', 'Mayotte',
            'Western Sahara', 'Gibraltar XI', 'Jersey', 'Guernsey', 'Isle of Man', 'Greenland', 'Monaco', 'Vatican City'}

# ---- canonical club registry: one entry per Wikidata club (duplicate slugs merged) ----
by_qid = collections.defaultdict(list)
for slug, m in cmap.items():
    if m.get('qid'):
        by_qid[m['qid']].append((m['players'], slug))
slug_tier, slug_name = {}, {}
for p in players:
    for c in p['clubs']:
        slug_tier.setdefault(c['slug'], c.get('tier') or 'Hard')
        slug_name.setdefault(c['slug'], c['name'])
canon_slug = {}  # qid -> canonical slug
for qid, lst in by_qid.items():
    canon_slug[qid] = sorted(lst, reverse=True)[0][1]
slug_to_canon = {}
for slug, m in cmap.items():
    slug_to_canon[slug] = canon_slug[m['qid']] if m.get('qid') else slug
TIER_RANK = {'Easy': 0, 'Medium': 1, 'Hard': 2}
canon_tier = {}
for slug, canon in slug_to_canon.items():
    t = slug_tier.get(slug, 'Hard')
    if canon not in canon_tier or TIER_RANK[t] < TIER_RANK[canon_tier[canon]]:
        canon_tier[canon] = t
NAME_FIX = {'rb-leipzig': 'RB Leipzig', 'az-alkmaar': 'AZ Alkmaar', 'atletico-madrid': 'Atlético Madrid',
            'fenerbahce': 'Fenerbahçe', 'queens-park-rangers': 'Queens Park Rangers'}


def club_entry(canon):
    return {'name': NAME_FIX.get(canon, slug_name.get(canon, canon)), 'slug': canon, 'tier': canon_tier.get(canon, 'Hard')}


# ---- positions ----
POS_MAP = [
    (re.compile(r'goalkeeper', re.I), 'GK'),
    (re.compile(r'(defender|back\b|centre-back|center back|full-?back|wing-?back|sweeper|libero|stopper)', re.I), 'DEF'),
    (re.compile(r'(midfielder|playmaker|regista|mezzala|box-to-box|trequartista)', re.I), 'MID'),
    (re.compile(r'(forward|striker|false nine|second striker|centre-forward|center forward|attacker)', re.I), 'FWD'),
]


def pos_cats(labels):
    cats, winger = [], False
    for lab in labels:
        if re.search(r'winger|wide', lab, re.I):
            winger = True
        for rx, cat in POS_MAP:
            if rx.search(lab):
                if cat not in cats:
                    cats.append(cat)
                break
    return cats, winger


# Clubs the named player shares with the namesake (Wikidata attributes them to the namesake's id)
SPLIT_EXTRA = {
    'Luis Suárez': ['fc-barcelona', 'nacional', 'groningen', 'gremio'],
    'Jorginho': ['flamengo'],
}

report = collections.defaultdict(list)
out = []
extra_namesakes = []
existing_names = {p['name'] for p in players}

for p in players:
    rec = json.loads(json.dumps(p))
    w = wd.get(p['id'])
    if not w:
        # not linked to Wikidata: only normalise club slugs (merge duplicates)
        rec['clubs'] = list({slug_to_canon.get(c['slug'], c['slug']): club_entry(slug_to_canon.get(c['slug'], c['slug']))
                             if c['slug'] in cmap else c for c in p['clubs']}.values())
        out.append(rec)
        continue

    club_teams = [t for t in w['teams'] if not t['national']]
    wd_ids = {t['id'] for t in club_teams}
    seniors = []
    for t in sorted(w['teams'], key=lambda t: t.get('start') or '0000'):
        if t['national']:
            c = team_country(t['label'])
            if c and c not in NON_FIFA and c not in seniors:
                seniors.append(c)

    db_mapped = [(c, cmap[c['slug']]['qid']) for c in p['clubs'] if cmap.get(c['slug'], {}).get('qid')]
    db_unmapped = [c for c in p['clubs'] if not cmap.get(c['slug'], {}).get('qid')]
    inside = [c for c, q in db_mapped if q in wd_ids]
    outside = [c for c, q in db_mapped if q not in wd_ids]
    # Two people fused under one id: several clubs on each side AND the stored nation is not the namesake's.
    merged = len(outside) >= 3 and len(inside) >= 2 and bool(seniors) and p['nationality'] not in seniors

    if merged:
        # Two people fused under one id: the record's name/nation belong to one player, the Wikidata id
        # (and the overlapping clubs) to a namesake. Keep this record as the named player (clubs Wikidata
        # does NOT attribute to the namesake), and add the namesake as a separate player.
        rec['id'] = 'SPLIT_' + p['id']
        keep = [slug_to_canon[c['slug']] for c in outside] + SPLIT_EXTRA.get(p['name'], [])
        rec['clubs'] = [club_entry(s) for s in dict.fromkeys(keep)] + db_unmapped
        report['split_namesake'].append({'name': p['name'], 'kept': [c['name'] for c in outside],
                                         'moved_to_namesake': [c['name'] for c in inside], 'wd': w['label']})
        ns_clubs = [club_entry(canon_slug[t['id']]) for t in sorted(club_teams, key=lambda t: t.get('start') or '0000')
                    if t['id'] in canon_slug]
        ns_clubs = list({c['slug']: c for c in ns_clubs}.values())
        if ns_clubs and seniors:
            nm = w['label'] or p['name']
            if nm in existing_names:
                nm = f"{nm} ({(w.get('birth') or '')[:4] or 'II'})"
            cats, _ = pos_cats(w['positions'])
            extra_namesakes.append({
                'id': p['id'], 'name': nm, 'commonName': nm, 'aliases': [w['label']] if w['label'] else [],
                'position': cats[0] if cats else p['position'], 'nationality': seniors[-1],
                **({'secondaryNationality': seniors[0]} if len(seniors) > 1 else {}),
                **({'nationalTeams': seniors} if len(seniors) > 1 else {}),
                'clubs': ns_clubs, 'difficulty': 'Hard',
            })
            existing_names.add(nm)
        out.append(rec)
        continue

    # ---- clubs ----
    new_slugs = []
    for t in sorted(club_teams, key=lambda t: t.get('start') or '0000'):
        if t['id'] in canon_slug:
            new_slugs.append(canon_slug[t['id']])
    trusted = len(club_teams) >= 3
    if not trusted:
        new_slugs += [slug_to_canon[c['slug']] for c in outside]
    elif outside:
        report['clubs_removed'].append({'name': p['name'], 'removed': [c['name'] for c in outside]})
    new_slugs = list(dict.fromkeys(new_slugs))
    before = {slug_to_canon.get(c['slug'], c['slug']) for c in p['clubs']}
    added = [s for s in new_slugs if s not in before]
    if added:
        report['clubs_added'].append({'name': p['name'], 'added': [club_entry(s)['name'] for s in added]})
    rec['clubs'] = [club_entry(s) for s in new_slugs] + db_unmapped
    if not rec['clubs']:
        rec['clubs'] = p['clubs']

    # ---- nationality ----
    if seniors:
        if p['nationality'] not in seniors:
            report['nationality_fixed'].append({'name': p['name'], 'was': p['nationality'], 'now': seniors[-1],
                                                'senior_teams': seniors})
            rec['nationality'] = seniors[-1]
        others = [s for s in seniors if s != rec['nationality']]
        if others:
            rec['secondaryNationality'] = others[0]
            rec['nationalTeams'] = seniors
            if p.get('secondaryNationality') != others[0]:
                report['dual_nation_added'].append({'name': p['name'], 'nations': seniors})
        else:
            rec.pop('secondaryNationality', None)
            rec.pop('nationalTeams', None)

    # ---- position (only flat contradictions) ----
    cats, winger = pos_cats(w['positions'])
    ok_pos = set(cats) | ({'MID', 'FWD'} if winger else set())
    # Wikidata positions are too noisy to overwrite ours (e.g. it lists a defender as a goalkeeper);
    # they only contribute a secondary outfield role when our primary role is among them.
    if ok_pos and p['position'] not in ok_pos:
        report['position_conflict'].append({'name': p['name'], 'ours': p['position'], 'wd': w['positions']})
    elif len(cats) > 1 and not rec.get('secondaryPosition'):
        sec = next((c for c in cats if c != rec['position']), None)
        if sec and not (rec['position'] == 'GK' or sec == 'GK'):
            rec['secondaryPosition'] = sec
    out.append(rec)

out += extra_namesakes
summary = {k: len(v) for k, v in report.items()}
summary['players_before'] = len(players)
summary['players_after'] = len(out)
summary['namesakes_added'] = len(extra_namesakes)
json.dump({'summary': summary, **report}, open(os.path.join(HERE, 'linkup_report.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print(json.dumps(summary, indent=1))
if WRITE:
    with open(DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('written', DB_PATH)
