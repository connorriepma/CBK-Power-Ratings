"""How long the score job should keep checking, in seconds, if it starts right now.

Windows are in Pacific time (so daylight saving is handled): Mon-Fri and Sun evenings, and most of
Saturday, when games run from noon Eastern until late. Outside a window the job checks once.
A single job is capped at 335 minutes (GitHub's limit is 360); the next scheduled start carries on.
"""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")
CAP_MINUTES = 335
# weekday (Mon=0) -> (start hour, end hour) in Pacific time; end hour 24 = midnight
WINDOWS = {0: (17, 22), 1: (17, 22), 2: (17, 22), 3: (17, 22), 4: (17, 22), 5: (9, 24), 6: (17, 22)}


def seconds_to_loop(now=None) -> int:
    now = (now or datetime.now(timezone.utc)).astimezone(PACIFIC)
    start_h, end_h = WINDOWS[now.weekday()]
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start, end = day + timedelta(hours=start_h), day + timedelta(hours=end_h)
    if not (start - timedelta(minutes=10) <= now < end):   # 10 min of slack: GitHub starts jobs a bit early/late
        return 0
    return int(min((end - now).total_seconds(), CAP_MINUTES * 60))


if __name__ == "__main__":
    print(seconds_to_loop())
