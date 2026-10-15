"""Shared helpers: turn Wikidata national-team memberships into canonical Link-Up nation names."""
import re

YOUTH = re.compile(r'(under-?\s?\d\d|\bu-?\d\d\b|youth|olympic|\bb\b|amateur|futsal|beach|women|national b |reserve|universiade|military|legends|xi\b|students?)', re.I)
STRIP = re.compile(r"\s*(men'?s\s+)?national\s+(association\s+)?(football|soccer)\s+team.*$", re.I)

# Wikidata country label -> Link-Up canonical nation name
CANON = {
    'West Germany': 'Germany', 'Germany': 'Germany', 'German': 'Germany',
    'United States': 'United States', 'United States of America': 'United States', 'USA': 'United States',
    "Côte d'Ivoire": 'Ivory Coast', 'Ivory Coast': 'Ivory Coast',
    'Republic of Ireland': 'Republic of Ireland', 'Ireland': 'Republic of Ireland',
    'Korea Republic': 'South Korea', 'South Korea': 'South Korea',
    'Czechia': 'Czech Republic', 'Czech Republic': 'Czech Republic',
    'DR Congo': 'DR Congo', 'Democratic Republic of the Congo': 'DR Congo', 'Zaire': 'DR Congo',
    'Republic of the Congo': 'Congo', 'Congo': 'Congo',
    'Bosnia and Herzegovina': 'Bosnia and Herzegovina',
    'North Macedonia': 'North Macedonia', 'Macedonia': 'North Macedonia', 'FYR Macedonia': 'North Macedonia',
    'Türkiye': 'Turkey', 'Turkey': 'Turkey',
    'Serbia and Montenegro': 'Serbia', 'FR Yugoslavia': 'Serbia',
    'Cape Verde': 'Cape Verde', 'Cabo Verde': 'Cape Verde',
    'People\'s Republic of China': 'China', 'China PR': 'China',
    'IR Iran': 'Iran',
}


def team_country(label):
    """'Italy national association football team' -> 'Italy'. None for youth/B/olympic teams."""
    if not label or YOUTH.search(label):
        return None
    if not re.search(r'national\s+(association\s+)?(football|soccer)\s+team', label, re.I):
        return None
    c = STRIP.sub('', label).strip()
    return CANON.get(c, c)


def senior_nations(entry):
    """Ordered (most recent last) list of senior national teams a player represented."""
    out = []
    teams = sorted(entry.get('teams', []), key=lambda t: (t.get('start') or '0000'))
    for t in teams:
        if not t.get('national'):
            continue
        c = team_country(t.get('label'))
        if c and c not in out:
            out.append(c)
    return out
