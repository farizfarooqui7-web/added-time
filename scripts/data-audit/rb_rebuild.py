"""Rebuild Record Books as LEAGUE goals from English Wikipedia infoboxes (Oct 2026 decision).

For every player already listed for a club (goals or assists list), the infobox cache from rb_infobox.py is
used to confirm a senior spell at that club; the count becomes the sum of infobox league goals over those
spells. Players without a confirmed spell are dropped, entries that resolve to the same Wikipedia page are
merged (e.g. "Ronaldo" / "Ronaldo Nazário"), zero-goal players are dropped, and the Assists lists are removed
(no reliable source). No new players are added.

  python rb_rebuild.py <repo> [--write]
"""
import json, os, re, sys, collections

sys.argv = [sys.argv[0], sys.argv[1], 'report'] + sys.argv[2:]
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'rb_infobox.py'), encoding='utf-8').read().replace("{'fetch': fetch, 'report': report}[MODE]()", '')
ns = {'__file__': os.path.join(HERE, 'rb_infobox.py')}
exec(compile(src, 'rb_infobox', 'exec'), ns)
clubs, resolve, club_matches, norm = ns['clubs'], ns['resolve'], ns['club_matches'], ns['norm']
cache = json.load(open(ns['CACHE'], encoding='utf-8'))
WRITE = '--write' in sys.argv
LATIN = re.compile(r"^[\w\s.'’\-()]+$")


def clean_aliases(aliases, name):
    out = []
    for a in aliases:
        a = (a or '').strip()
        if not a or norm(a) == norm(name) or a.islower() or not LATIN.match(a):
            continue  # drops junk such as "magical" or non-Latin scraps
        if any(ord(ch) > 0x24F for ch in a):
            continue
        if norm(a) not in {norm(x) for x in out}:
            out.append(a)
    return out


stats = collections.Counter()
new_clubs = []
for c in clubs:
    by_page = {}
    order = 0
    for metric in ('topGoals', 'topAssists'):
        for e in c[metric]:
            order += 1
            title, page = resolve(c['name'], e, cache)
            if not title:
                stats['dropped_not_at_club'] += 1
                continue
            key = page['title']
            league = sum(s['goals'] or 0 for s in page['spells'] if club_matches(c['name'], s['club']))
            rec = by_page.get(key)
            if rec:
                stats['merged_duplicates'] += metric == 'topGoals'
                rec['aliases'] += [e['name']] + (e.get('aliases') or [])
                continue
            by_page[key] = {'name': e['name'], 'count': league, 'aliases': list(e.get('aliases') or []), 'page': key, 'order': order}
    rows = []
    for rec in by_page.values():
        if rec['count'] <= 0:
            stats['dropped_zero_league_goals'] += 1
            continue
        # prefer a display name that is the page title itself (no disambiguation suffix) when it differs by accents only
        title = re.sub(r'\s*\(.*?\)\s*$', '', rec['page'])
        name = title if norm(title) == norm(rec['name']) else rec['name']
        aliases = clean_aliases(rec['aliases'] + ([title] if norm(title) != norm(name) else []), name)
        rows.append({'name': name, 'count': rec['count'], 'aliases': [name] + aliases, '_order': rec['order']})
    rows.sort(key=lambda r: (-r['count'], r['_order']))
    for r in rows:
        del r['_order']
    stats['kept'] += len(rows)
    out = {k: v for k, v in c.items() if k not in ('topGoals', 'topAssists')}
    out['topGoals'] = rows
    new_clubs.append(out)

print(dict(stats))
print('per-club size min/median/max', min(len(c['topGoals']) for c in new_clubs),
      sorted(len(c['topGoals']) for c in new_clubs)[len(new_clubs) // 2], max(len(c['topGoals']) for c in new_clubs))
for c in new_clubs[:3] + [x for x in new_clubs if x['name'] in ('AC Milan', 'Borussia Dortmund')]:
    print(c['name'], [(r['name'], r['count']) for r in c['topGoals'][:6]])
small = [(c['name'], len(c['topGoals'])) for c in new_clubs if len(c['topGoals']) < 25]
print('clubs under 25 players', small)
if WRITE:
    with open(os.path.join(ns['ROOT'], 'src/data/recordBooksData.json'), 'w', encoding='utf-8') as f:
        json.dump(new_clubs, f, ensure_ascii=False, indent=2)
    print('written')
