"""Record Books name pass (run after rb_rebuild.py): name every entry after the Wikipedia page its count came
from, and keep only aliases that belong to that player.

The source data carried some wrong aliases (e.g. "Morgan Rogers" listed under Jamal Musiala), so an entry could
resolve to another player's page. The count is that page's, so the name must be too.
  python rb_names.py <repo> [--write]
"""
import json, os, re, sys, collections

sys.argv = [sys.argv[0], sys.argv[1], 'report'] + sys.argv[2:]
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'rb_infobox.py'), encoding='utf-8').read()
src = src.replace("{'fetch': fetch, 'report': report}[MODE]()", '').replace("for metric in ('topGoals', 'topAssists'):", "for metric in ('topGoals',):")
ns = {'__file__': os.path.join(HERE, 'rb_infobox.py')}
exec(compile(src, 'rb_infobox', 'exec'), ns)
clubs, resolve, norm = ns['clubs'], ns['resolve'], ns['norm']
cache = json.load(open(ns['CACHE'], encoding='utf-8'))
WRITE = '--write' in sys.argv


def tokens(s):
    return {norm(t) for t in re.split(r'[\s\-.]+', re.sub(r'\(.*?\)', '', s or '')) if len(norm(t)) > 1}


stats = collections.Counter()
for c in clubs:
    merged = {}
    for e in c['topGoals']:
        title, page = resolve(c['name'], e, cache)
        if not title:
            stats['unresolved_kept'] += 1
            merged[('keep', e['name'])] = e
            continue
        canon = re.sub(r'\s*\(.*?\)\s*$', '', page['title']).strip()
        tt = tokens(page['title'])
        # Trusted: the entry's own name is (or Wikipedia redirects it to) this page, e.g. a nickname redirect.
        # Untrusted: the page was reached through an alias or a search hit and shares no name token.
        own = title in (e['name'], e['name'] + ' (footballer)')
        name_ok = own or bool(tokens(e['name']) & tt)
        anchor = tt | (tokens(e['name']) if name_ok else set())
        keep = [a for a in ([e['name']] if name_ok else []) + (e.get('aliases') or [])
                if tokens(a) & anchor or (name_ok and len(tokens(a)) <= 1)]  # single-word nicknames stay
        if not name_ok:
            stats['renamed_wrong_player'] += 1
            print(f"  {c['name']}: '{e['name']}' -> '{canon}' ({e['count']})")
        elif e['name'] != canon:
            stats['renamed_to_page_title'] += 1
        key = page['title']
        if key in merged:
            stats['merged'] += 1
            merged[key]['aliases'] += keep
            continue
        merged[key] = {'name': canon, 'count': e['count'], 'aliases': keep}
    rows = []
    for r in merged.values():
        seen, aliases = set(), []
        for a in [r['name']] + r['aliases']:
            if norm(a) and norm(a) not in seen:
                seen.add(norm(a))
                aliases.append(a)
        rows.append({'name': r['name'], 'count': r['count'], 'aliases': aliases})
    rows.sort(key=lambda r: -r['count'])
    c['topGoals'] = rows
print(dict(stats))
if WRITE:
    with open(os.path.join(ns['ROOT'], 'src/data/recordBooksData.json'), 'w', encoding='utf-8') as f:
        json.dump(clubs, f, ensure_ascii=False, indent=2)
    print('written')
