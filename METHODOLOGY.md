# Methodology

Every rating is a point-spread number. A rating of 0 is an average Division I team (KenPom style). The difference between two teams' ratings, plus home court, is the predicted margin.

Ratings are displayed on a shifted scale (rating + 80, rounded to the nearest 0.5) so that no team shows a negative value.

## Part 1: How the preseason rating is built

The preseason rating has three layers: a seed from last season's KenPom rating, a blend toward the conference mean, and a manual roster adjustment.

### 1. Seed

Last season's final KenPom net rating (AdjEM) × 0.7. The 0.7 converts it to a point-spread scale.

### 2. Shrinkage toward the conference mean

```
regressed = 0.6 × seed + 0.4 × conference_mean
```

The conference mean is the average seed of that conference's teams, with a few exclusions:

- **Air Force** is excluded (no portal or NIL) and is not regressed.
- **Saint Francis (PA)** is excluded because it dropped to D-III.
- **West Florida** is excluded because it has no prior D-I data, so its rating is fixed by hand at -13.

This layer uses only last season's rating and the conference average. It does not use returning players or recruiting. The 0.6/0.4 weights are chosen, not fitted to data, so this is shrinkage rather than a regression.

### 3. Roster adjustment

This is the only place returning players, transfers and recruiting enter.

```
rating = regressed + adjustment
```

The adjustment is a half-point judgment, usually between -3 and +3. It measures only how this year's roster compares to last year's roster for the same program, because the team's overall strength is already in the baseline. It is scored from per-game stat lines for who left, who stayed and who arrived, plus these rules:

- Production from JUCO, NAIA and D-II transfers is discounted relative to D-I production leaving.
- Injuries and eligibility delays are priced as real subtractions.
- Retained stars count for more than lost depth.
- Recruits count only when they are notably ranked or have credible pro production.
- Coaching changes are noted but handled case by case.

### Example: Winthrop

- Seed: 1.31 × 0.7 = 0.92
- Conference mean: -5.12
- Regressed: 0.6 × 0.92 + 0.4 × (-5.12) = -1.50
- Winthrop lost a star but reloaded with several D-I transfers, so the adjustment is -1
- Final: -2.50, displayed as 77.5

A small number of ratings have been moved by hand after the preseason build when major news broke, such as a head coach retiring or a serious eligibility question. These are flagged in the `notes` column of the data file, and the `manual_adjustment` column still shows the original preseason adjustment.

Home-court advantage is stored per team.

## Part 2: How a rating updates after a game

After a game, the model compares the actual margin to the predicted margin and moves both teams by a fraction of the difference.

```
predicted margin = home rating + home court rating (0 if neutral) - away rating

**Modified home court.** A few "neutral" games are really near one team's campus. A game in `data/schedule.json` can carry `"hcaMod": {"team": ..., "pct": ...}`. That team gets `pct` x its home court rating added to its side of that one game (spread, win %, sims and the rating replay all use it). Tiers by drive time from campus to the arena: 20 min or less 75%, 21 to 75 min 50%, 76 to 125 min 25%, over 125 min 0% (no tag). `hcaMod` can be a list when both teams are near the site (the bonuses offset). Each entry records `mins`, and `est: true` marks drive times that were estimated rather than measured. Games with a tag show a double dagger on the site.
miss = actual margin - predicted margin
rating change = K × miss
```

The home team gains `K × miss` and the away team loses the same amount. If the home team beats the spread, it goes up and its opponent goes down by the same amount.

### What drives the size of the change

1. **How wrong the prediction was.** A team that wins but fails to cover still goes down. A team that loses but beats the spread goes up. The margin only matters relative to the spread.
2. **K, which depends on how many games each team has played.** Early in the season ratings are least certain, so they move the most.

   | Team's rated games | K |
   |---|---|
   | 1-8 | 0.08 |
   | 9-18 | 0.05 |
   | 19+ | 0.03 |

   Each team's K comes from its own game count, so a veteran team and a new team can move by different amounts in the same game.
3. **Caps.** A single game's miss is capped at 30 points, or 25 when the predicted spread is 25 or more. This stops one blowout from swinging a rating.
4. **Skipped games.** Games against non-Division I opponents are ignored. They do not change ratings and do not count toward a team's game total.

### Example

Utah State (90.79, home court 4.0) hosts Denver (79.30) in game 1 for both teams.

- Predicted margin: 90.79 + 4.0 - 79.30 = **Utah State by 15.49**
- Actual: Utah State wins 86-76, a margin of 10
- Miss: 10 - 15.49 = **-5.49**
- Change: 0.08 × -5.49 = **-0.44**

Utah State goes from 90.79 to 90.35 and Denver from 79.30 to 79.74, because Utah State won but by less than expected.

### Display

Ratings are stored at full precision and shown to the nearest 0.5, so small changes can move the exact rating without moving the displayed one.

## Known limitations

- Conference-mean shrinkage over-regresses strong programs in weak conferences (Gonzaga is the clearest case). Replacing it with each program's own multi-year baseline was considered and shelved.
- The adjustment is subjective, and there is no minutes-weighted or portal-ranking model behind it.
- Fifth-year eligibility cases are tracked but held until the legal picture settles.
- The ratings have not been backtested yet. The plan is to fit a compression factor against closing lines once games start.

**Preseason lock.** A team's preseason rating (`data/teams.json`) can be edited until its first rated game is entered. After that it is recorded in `data/preseason_locks.json` and must not change, since every rating is replayed from it. Run `python src/lock_preseason.py` after scores are entered: it adds locks for teams that now have a game and fails if a locked rating was edited. The unit tests run the same check.
