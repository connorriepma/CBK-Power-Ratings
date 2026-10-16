"""Read-only: pull one past week of games from CBBD and compare team names to data/teams.json.
Writes nothing. Prints a short report."""
import json, os, re, urllib.parse, urllib.request, collections
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

KEY = os.environ["CBBD_API_KEY"]
URL = "https://api.collegebasketballdata.com/games?" + urllib.parse.urlencode({
    "season": 2026,                                   # = 2025-26 season (past, for testing only)
    "startDateRange": "2025-11-04T10:00:00Z",
    "endDateRange": "2025-11-11T10:00:00Z",
})
req = urllib.request.Request(URL, headers={"Authorization": "Bearer " + KEY})
games = json.load(urllib.request.urlopen(req, timeout=90))
print("games returned:", len(games))
print("status counts:", dict(collections.Counter(g["status"] for g in games)))

teams = json.load(open("data/teams.json"))
def norm(s):
    s = s.lower().replace("&", "and").replace("'", "").replace(".", "")
    s = re.sub(r"\bstate\b", "st", s); s = re.sub(r"\bsaint\b", "st", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()
exact = {t["team"] for t in teams}
nmap = {norm(t["team"]): t["team"] for t in teams}

names = collections.Counter()
for g in games:
    names[g["homeTeam"]] += 1; names[g["awayTeam"]] += 1
ok_exact = ok_norm = 0; bad = []
for n, c in names.items():
    if n in exact: ok_exact += 1
    elif norm(n) in nmap: ok_norm += 1; print("  name differs but matches:", repr(n), "->", nmap[norm(n)])
    else: bad.append((n, c))
print(f"team names: {len(names)} | exact match {ok_exact} | match after cleanup {ok_norm} | NOT matched {len(bad)}")
for n, c in sorted(bad): print("  UNMATCHED:", repr(n), f"({c} games)")

eastern, pacific = collections.Counter(), collections.Counter()
for g in games:
    t = datetime.fromisoformat(g["startDate"].replace("Z", "+00:00"))
    eastern[t.astimezone(ZoneInfo("America/New_York")).date().isoformat()] += 1
    pacific[t.astimezone(ZoneInfo("America/Los_Angeles")).date().isoformat()] += 1
print("games per day, Eastern:", dict(sorted(eastern.items())))
print("games per day, Pacific:", dict(sorted(pacific.items())))
print("sample neutral-site game:", next((json.dumps({k: g[k] for k in ("homeTeam","awayTeam","neutralSite","startDate","status")}) for g in games if g["neutralSite"]), None))
