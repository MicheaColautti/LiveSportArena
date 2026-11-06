"""python -m backend.refresh --season 2027; no paid service or secrets required."""
from .diagnostics import logged_update
import argparse
from datetime import datetime
from zoneinfo import ZoneInfo
from . import alpine, hockey, predictions, alpine_standings, hockey_statistics, hockey_calendar
from .common import SITE, CACHE, read_json, write_json, stamp


@logged_update("refresh")
def main():
    now = datetime.now(ZoneInfo("Europe/Zurich"))
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, default=now.year + (now.month >= 7))
    parser.add_argument("--only", choices=["alpine", "hockey", "all"], default="all")
    parser.add_argument("--details", type=int, default=6)
    args = parser.parse_args()
    failures = []
    for name, provider in [("alpine", alpine), ("hockey", hockey)]:
        if args.only not in ["all", name]:
            continue
        try:
            data = provider.update(args.season, **({"detail_limit": args.details} if name == "hockey" else {}))
        except Exception as exc:
            print(f"{name}: {exc}", flush=True)
            failures.append(name)
            previous = read_json(CACHE / (name + ".json"), read_json(SITE / "data" / (name + ".json"), {}))
            previous.update(status="stale", lastAttemptAt=stamp(), error="La fonte non è disponibile; sono mostrati gli ultimi dati verificati.")
            write_json(SITE / "data" / (name + ".json"), previous)
            if name == "alpine" and previous.get("events"):
                path = SITE / "calendars/alpine-world-cup.ics"
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(alpine.calendar(previous["events"]).encode("utf-8"))
    if args.only in ("all", "alpine"):
        cups = alpine_standings.update(args.season)
        if any(group.get("status") != "ok" for group in cups["groups"].values()):
            failures.append("alpine-standings")
    if args.only in ("all", "hockey"):
        try:
            hockey_statistics.update(args.season)
        except Exception as exc:
            print(f"Hockey statistics: {exc}", flush=True)
            failures.append("hockey-statistics")
    h = read_json(SITE / "data/hockey.json", {})
    if args.only in ("all", "hockey"):
        hockey_calendar.update(h)
    try:
        predictions.update(h)
    except Exception as exc:
        print(f"predictions: {exc}", flush=True)
        write_json(SITE / "data/predictions.json", {"status": "error", "updatedAt": stamp(), "predictions": [], "gameIds": []})
        failures.append("predictions")
    write_json(SITE / "data/status.json", {"checkedAt": stamp(), "failures": failures, "season": args.season})
    # Keep the last valid source visible; the workflow also exposes this summary.
    if failures:
        print("::warning::Some sources could not be refreshed: " + ", ".join(failures))
    if not read_json(SITE / "data/alpine.json", {}).get("races") and not h.get("games"):
        raise SystemExit("No usable source data; refusing an empty publication")


if __name__ == "__main__":
    main()
