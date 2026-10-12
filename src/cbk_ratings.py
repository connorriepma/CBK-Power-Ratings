"""CBK Power Ratings engine.

Replays every stored game result, in order, on top of the preseason ratings to
produce current ratings. Nothing about current ratings is stored: they are
always recomputed from the preseason ratings plus the full results list.

See METHODOLOGY.md for the model itself.

Usage:
    python src/cbk_ratings.py            # reads data/, writes data/current_ratings.json
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# Typical miss of the predicted margin, in points. Used only for win
# probability, never for rating updates.
SIGMA = 11.0


@dataclass(frozen=True)
class Config:
    """Rating-update settings, loaded from data/rating_config.json."""

    k_tiers: tuple[tuple[float, float], ...]  # (up_to_game_number, k)
    mismatch_spread: float
    miss_cap_normal: float
    miss_cap_mismatch: float

    @classmethod
    def from_dict(cls, raw: dict) -> "Config":
        tiers = tuple(
            (math.inf if t["upTo"] is None else float(t["upTo"]), float(t["k"]))
            for t in raw["kTiers"]
        )
        return cls(
            k_tiers=tiers,
            mismatch_spread=float(raw["mismatchSpread"]),
            miss_cap_normal=float(raw["missCap"]["normal"]),
            miss_cap_mismatch=float(raw["missCap"]["mismatch"]),
        )


def k_for(games_before: int, cfg: Config) -> float:
    """K for a team's next game, based on how many rated games it has played."""
    game_number = games_before + 1
    for up_to, k in cfg.k_tiers:
        if game_number <= up_to:
            return k
    return cfg.k_tiers[-1][1]


def predicted_margin(home: float, away: float, home_court: float, neutral: bool) -> float:
    """Predicted home margin: home rating + home court (0 if neutral) - away rating."""
    return home + (0.0 if neutral else home_court) - away


def round_half(x: float) -> float:
    """Round to the nearest 0.5, with ties going up (the display rule on the site)."""
    return math.floor(x * 2 + 0.5) / 2


def spread(margin: float) -> float:
    """Displayed spread: exact margin rounded once to 0.5, ties away from zero."""
    return math.copysign(math.floor(abs(margin) * 2 + 0.5) / 2, margin)


def win_probability(margin: float, sigma: float = SIGMA) -> float:
    """Home win probability for a predicted home margin (normal model). Display only."""
    return 0.5 * (1 + math.erf(margin / sigma / math.sqrt(2)))


def game_id(date: str, a: str, b: str) -> str:
    """Order-independent id for a game: date plus the two team keys, sorted."""
    x, y = sorted((a, b))
    return f"{date}_{x}_{y}"


def home_bonus(game_mods: dict | None, g: dict) -> float:
    """Extra points for the home side of game `g` from a modified home court, else 0.

    game_mods maps game_id -> (team key, points). Positive when the boosted team
    is the home team of the row, negative when it is the away team.
    """
    if not game_mods:
        return 0.0
    mod = game_mods.get(game_id(g["date"], g["home"], g["away"]))
    if not mod:
        return 0.0
    team, pts = mod
    return pts if team == g["home"] else -pts if team == g["away"] else 0.0


def build_game_mods(schedule: list[dict], teams: list[dict]) -> dict:
    """Modified home-court games from schedule.json (the optional hcaMod field).

    hcaMod = {"team": name, "pct": share of that team's home-court rating}. The extra
    points are pct x the team's home_court, and apply to that team only.
    """
    key = {t["team"]: t["key"] for t in teams}
    hc = {t["key"]: t["home_court"] for t in teams}
    mods = {}
    for g in schedule:
        m = g.get("hcaMod")
        if m:
            k = key[m["team"]]
            mods[game_id(g["date"], key[g["home"]], key[g["away"]])] = (k, m["pct"] * hc[k])
    return mods


def replay(
    start: dict[str, float],
    home_court: dict[str, float],
    results: list[dict],
    cfg: Config,
    game_mods: dict | None = None,
) -> tuple[dict[str, float], dict[str, int]]:
    """Replay results onto preseason ratings.

    Args:
        start: team key -> preseason rating.
        home_court: team key -> home-court rating.
        results: dicts with date, home, away, neutral, homeScore, awayScore.
            home and away are team keys.
        cfg: rating-update settings.
        game_mods: optional modified home courts from build_game_mods.

    Returns:
        (current ratings, rated games played) keyed by team key. Games where
        either team is not in `start` (e.g. non-Division I opponents) are
        skipped: no rating change and no effect on the game count.
    """
    ratings = dict(start)
    played = {team: 0 for team in start}

    ordered = sorted(results, key=lambda g: (g["date"], g["home"] + g["away"]))
    for g in ordered:
        home, away = g["home"], g["away"]
        if home not in ratings or away not in ratings:
            continue

        margin = predicted_margin(
            ratings[home], ratings[away], home_court[home], bool(g.get("neutral"))
        ) + home_bonus(game_mods, g)
        cap = cfg.miss_cap_mismatch if abs(margin) >= cfg.mismatch_spread else cfg.miss_cap_normal
        actual = g["homeScore"] - g["awayScore"]
        miss = max(-cap, min(cap, actual - margin))

        k_home = k_for(played[home], cfg)
        k_away = k_for(played[away], cfg)
        ratings[home] += k_home * miss
        ratings[away] -= k_away * miss
        played[home] += 1
        played[away] += 1

    return ratings, played


def load_json(name: str):
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


def build_current_ratings(results: list[dict] | None = None) -> list[dict]:
    """Load the data files, replay results and return one row per team.

    Uses data/results.json unless `results` is given.
    """
    teams = load_json("teams.json")
    cfg = Config.from_dict(load_json("rating_config.json"))
    if results is None:
        results = load_json("results.json")

    start = {t["key"]: t["preseason_rating"] for t in teams}
    home_court = {t["key"]: t["home_court"] for t in teams}
    game_mods = build_game_mods(load_json("schedule.json"), teams)
    current, played = replay(start, home_court, results, cfg, game_mods)

    rows = []
    for t in teams:
        key = t["key"]
        rows.append(
            {
                "key": key,
                "team": t["team"],
                "conference": t["conference"],
                "preseason": round(start[key], 4),
                "current": round(current[key], 4),
                "change": round(current[key] - start[key], 4),
                "display": round_half(current[key]),
                "games": played[key],
            }
        )
    rows.sort(key=lambda r: -r["current"])
    return rows


def main() -> None:
    rows = build_current_ratings()
    out = DATA_DIR / "current_ratings.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=1)
        f.write("\n")
    print(f"Wrote {len(rows)} teams to {out}")


if __name__ == "__main__":
    main()
