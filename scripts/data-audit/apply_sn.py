"""Apply hand-audited Side Netting corrections (sn_manual.py + sn_2026.py) to promptsData.ts.
usage: python apply_sn.py <repo> <prompts.json dump> [--write]"""
import json, os, sys, re, unicodedata
sys.path.insert(0, os.path.dirname(__file__))
from sn_manual import EDITS, REPLACE
from sn_2026 import ADD_2026

ROOT, DUMP = sys.argv[1], sys.argv[2]
WRITE = '--write' in sys.argv
TS_PATH = os.path.join(ROOT, 'src/games/side-netting/promptsData.ts')
prompts = json.load(open(DUMP, encoding='utf-8'))
byid = {p['id']: p for p in prompts}

TIERS = {
    5: ('Tap-In', 80.0, 'Tap-in! Everyone in the stadium knew this one.'),
    30: ('Starter XI', 45.0, 'Solid pick straight out of the starting XI.'),
    50: ('Cult Hero', 20.0, 'Cult hero territory. Nice recall.'),
    85: ("Streets Won't Forget", 6.0, "Deep cut. The streets won't forget."),
    100: ("Ballon d'Or Knowledge", 1.5, "BALLON D'OR KNOWLEDGE! Frightening recall."),
}


def norm(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', s)


def keys(ans):
    return {norm(ans['text'])} | {norm(a) for a in ans.get('aliases') or []}


def parse(spec):
    out = []
    for item in [x.strip() for x in spec.split(';') if x.strip()]:
        parts = [x.strip() for x in item.split('|')]
        name, score = parts[0], int(parts[1])
        aliases = [a.strip() for a in parts[2].split('/')] if len(parts) > 2 and parts[2] else []
        tier, pick, comment = TIERS[score]
        out.append({'text': name, 'aliases': aliases, 'rarityScore': score, 'tier': tier,
                    'pickRatePct': pick, 'commentary': comment})
    return out


def add_answers(p, new):
    added = 0
    for a in new:
        if any(norm(a['text']) == norm(e['text']) or norm(a['text']) in keys(e) for e in p['answers']):
            continue
        p['answers'].append(a)
        added += 1
    return added


stats = {'removed': 0, 'added': 0, 'merged': 0, 'deduped': 0, 'replaced_prompts': 0}
missing = []
for pid, ed in EDITS.items():
    p = byid.get(pid)
    if not p:
        missing.append(pid)
        continue
    if 'prompt' in ed:
        p['prompt'] = ed['prompt']
    for r in ed.get('remove', []):
        before = len(p['answers'])
        p['answers'] = [a for a in p['answers'] if norm(r) not in {norm(a['text'])}]
        stats['removed'] += before - len(p['answers'])
    for keep, drop in ed.get('merge', []):
        k = next((a for a in p['answers'] if norm(a['text']) == norm(keep)), None)
        d = next((a for a in p['answers'] if norm(a['text']) == norm(drop)), None)
        if k and d and k is not d:
            k['aliases'] = sorted(set((k.get('aliases') or []) + [d['text']] + (d.get('aliases') or [])))
            p['answers'].remove(d)
            stats['merged'] += 1
    for text, al in ed.get('alias', {}).items():
        a = next((a for a in p['answers'] if norm(a['text']) == norm(text)), None)
        if a:
            a['aliases'] = sorted(set((a.get('aliases') or []) + al))
    if 'add' in ed:
        stats['added'] += add_answers(p, parse(ed['add']))

for pid, spec in REPLACE.items():
    p = byid.get(pid)
    if not p:
        missing.append(pid)
        continue
    old = {norm(a['text']): a for a in p['answers']}
    fresh = parse(spec)
    # keep hand-written commentary/tiers for answers that already existed
    p['answers'] = [old.get(norm(a['text']), a) for a in fresh]
    stats['replaced_prompts'] += 1

for pid, spec in ADD_2026.items():
    p = byid.get(pid)
    if not p:
        missing.append(pid)
        continue
    stats['added'] += add_answers(p, parse(spec))

# global de-duplication within every prompt (same person entered twice under different spellings)
for p in prompts:
    seen, kept = {}, []
    for a in p['answers']:
        k = norm(a['text'])
        if k in seen:
            tgt = seen[k]
            tgt['aliases'] = sorted(set((tgt.get('aliases') or []) + (a.get('aliases') or [])))
            stats['deduped'] += 1
            continue
        seen[k] = a
        kept.append(a)
    p['answers'] = kept

print(stats, 'missing ids:', missing)
if WRITE:
    header = "import type { SideNettingPrompt } from './types';\n\nexport const SIDE_NETTING_PROMPTS: SideNettingPrompt[] = "
    with open(TS_PATH, 'w', encoding='utf-8', newline='\n') as f:
        f.write(header + json.dumps(prompts, ensure_ascii=False, indent=2) + ';\n')
    print('written', TS_PATH)
