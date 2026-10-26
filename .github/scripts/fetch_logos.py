"""One-time job: match ESPN's team list to our teams and save logo links to data/team_logos.json.
Writes only data/team_logos.json and data/team_logos_report.txt. Never touches scores or ratings."""
import json, re, sys, urllib.request

URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=500"

ALIASES = {  # our name (normalized) -> ESPN name (normalized); add fixes here after reading the report
    "uconn": "connecticut",
}

def norm(s):
    s = s.lower().replace("&", " and ")
    s = re.sub(r"\(([a-z]+)\)", r" \1", s)          # Miami (OH) -> miami oh
    s = re.sub(r"[.'’\-]", "", s)
    s = re.sub(r"\bsaint\b", "st", s)
    s = re.sub(r"\bstate\b", "st", s)
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def match(ours, espn_teams):
    by = {}
    for t in espn_teams:
        logo = (t.get("logos") or [{}])[0].get("href")
        if not logo:
            continue
        for k in ("location", "displayName", "shortDisplayName"):
            if t.get(k):
                by.setdefault(norm(t[k]), logo)
    out, missing = {}, []
    for t in ours:
        n = norm(t["team"])
        hit = by.get(ALIASES.get(n, n))
        if hit:
            out[t["key"]] = hit
        else:
            missing.append(t["team"])
    return out, missing

def main():
    ours = json.load(open("data/teams.json"))
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    data = json.load(urllib.request.urlopen(req, timeout=60))
    espn = [x["team"] for x in data["sports"][0]["leagues"][0]["teams"]]
    out, missing = match(ours, espn)
    with open("data/team_logos.json", "w") as f:
        json.dump(dict(sorted(out.items())), f, indent=0)
        f.write("\n")
    report = "ESPN teams: %d\nOur teams: %d\nMatched: %d\nNo logo found (%d): %s\n" % (
        len(espn), len(ours), len(out), len(missing), ", ".join(missing) or "none")
    open("data/team_logos_report.txt", "w").write(report)
    print(report)

if __name__ == "__main__":
    main()
