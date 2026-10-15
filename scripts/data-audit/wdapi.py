"""Small cached client for the Wikidata Action API (not WDQS) + entity -> player-entry conversion."""
import json, os, re, time, urllib.parse, urllib.request

HERE = os.path.dirname(__file__)
UA = 'TopBinsDataAudit/1.0 (local dev script)'
CACHE_DIR = os.path.join(HERE, 'cache')
os.makedirs(CACHE_DIR, exist_ok=True)
_caches = {}


def _cache(props):
    """Separate cache per props set, so a light (labels-only) fetch never masks a full one."""
    key = re.sub(r'[^a-z]+', '_', props)
    if key not in _caches:
        path = os.path.join(CACHE_DIR, f'entities_{key}.jsonl')
        data = {}
        if os.path.exists(path):
            with open(path, encoding='utf-8') as f:
                for line in f:
                    try:
                        e = json.loads(line)
                        data[e['id']] = e
                    except Exception:
                        pass
        _caches[key] = (path, data)
    return _caches[key]


_last = [0.0]


def _get(params):
    url = 'https://www.wikidata.org/w/api.php?' + urllib.parse.urlencode({**params, 'format': 'json'})
    for attempt in range(10):
        wait = 0.35 - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                data = json.load(r)
            if 'error' in data and data['error'].get('code') == 'maxlag':
                time.sleep(5)
                continue
            return data
        except Exception as e:
            time.sleep(min(60, 5 * (attempt + 1)))
    return {}


def search(text, limit=10):
    d = _get({'action': 'wbsearchentities', 'search': text, 'language': 'en', 'type': 'item', 'limit': limit})
    return [r['id'] for r in d.get('search', [])]


def cirrus(query, limit=500, sort='incoming_links_desc'):
    """Full-text search with haswbstatement filters; returns Q-ids ordered by notability."""
    out, offset = [], 0
    while len(out) < limit:
        d = _get({'action': 'query', 'list': 'search', 'srsearch': query, 'srlimit': min(500, limit - len(out)),
                  'sroffset': offset, 'srprop': '', 'srsort': sort, 'srnamespace': 0})
        hits = [h['title'] for h in d.get('query', {}).get('search', [])]
        out += hits
        if 'continue' not in d or not hits:
            break
        offset = d['continue']['sroffset']
    return out


def entities(ids, props='claims|sitelinks|labels|aliases'):
    """Fetch (and cache) entities. Returns {qid: compact entity}."""
    path, _ents = _cache(props)
    need = [i for i in dict.fromkeys(ids) if i not in _ents]
    for k in range(0, len(need), 50):
        chunk = need[k:k + 50]
        d = _get({'action': 'wbgetentities', 'ids': '|'.join(chunk), 'props': props, 'languages': 'en'})
        with open(path, 'a', encoding='utf-8') as f:
            for qid, e in d.get('entities', {}).items():
                if 'missing' in e:
                    continue
                c = compact(qid, e)
                _ents[qid] = c
                f.write(json.dumps(c, ensure_ascii=False) + '\n')
    return {i: _ents[i] for i in ids if i in _ents}


def _id(snak):
    v = snak.get('datavalue', {}).get('value')
    return v.get('id') if isinstance(v, dict) else None


def _time(qs, prop):
    for q in qs.get(prop, []):
        t = q.get('datavalue', {}).get('value', {}).get('time')
        if t:
            return t[1:5]
    return ''


def compact(qid, e):
    claims = e.get('claims', {})
    teams = []
    for c in claims.get('P54', []):
        tid = _id(c['mainsnak'])
        if tid:
            qs = c.get('qualifiers', {})
            teams.append({'id': tid, 'start': _time(qs, 'P580'), 'end': _time(qs, 'P582')})
    birth = ''
    for c in claims.get('P569', []):
        t = c['mainsnak'].get('datavalue', {}).get('value', {}).get('time')
        if t:
            birth = t[1:5]
            break
    return {
        'id': qid,
        'label': e.get('labels', {}).get('en', {}).get('value'),
        'aliases': [a['value'] for a in e.get('aliases', {}).get('en', [])],
        'links': len(e.get('sitelinks', {})),
        'enwiki': 'enwiki' in e.get('sitelinks', {}),
        'p31': [x for x in (_id(c['mainsnak']) for c in claims.get('P31', [])) if x],
        'p106': [x for x in (_id(c['mainsnak']) for c in claims.get('P106', [])) if x],
        'p27': [x for x in (_id(c['mainsnak']) for c in claims.get('P27', [])) if x],
        'p1532': [x for x in (_id(c['mainsnak']) for c in claims.get('P1532', [])) if x],
        'p413': [x for x in (_id(c['mainsnak']) for c in claims.get('P413', [])) if x],
        'teams': teams,
        'birth': birth,
    }


def labels(ids):
    """Labels (and P31) for arbitrary items such as teams / positions / countries."""
    ents = entities(ids, props='labels|claims')
    return {i: ents[i].get('label') or '' for i in ents}
