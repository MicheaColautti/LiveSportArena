from .diagnostics import logged_update
import hashlib
import importlib
import json
import math
from datetime import datetime
from zoneinfo import ZoneInfo
from .common import ROOT, SITE, CACHE, read_json, write_json, stamp


def next_matchday(games, today):
    pending = [g for g in games if g["date"] >= today and g["status"] not in {"finished", "cancelled"}]
    if not pending:
        return None, [], False, None
    target = min(g["date"] for g in pending)
    fixtures = [g for g in games if g["date"] == target and g["status"] != "cancelled"]
    earlier = [g for g in games if g["date"] < target]
    prior_date = max((g["date"] for g in earlier), default=None)
    prior = [g for g in earlier if g["date"] == prior_date]
    # A calendar day, not an inferred official round: SIHF has staggered games.
    ready = bool(prior) and all(g["status"] == "finished" for g in prior)
    ready = ready and all(g["status"] == "scheduled" for g in fixtures)
    now = datetime.now(ZoneInfo("Europe/Zurich"))
    ready = ready and all(g.get("start") and datetime.fromisoformat(g["start"].replace("Z", "+00:00")) > now for g in fixtures)
    return target, fixtures, ready, prior_date


def validate_predictions(rows, fixtures):
    ids = {g["id"] for g in fixtures}
    seen = set()
    for row in rows:
        gid = str(row["gameId"])
        if gid not in ids or gid in seen:
            raise ValueError("Prediction must reference a unique game in the target matchday")
        seen.add(gid)
        home, away = row["homeProbability"], row["awayProbability"]
        if any(isinstance(p, bool) or not isinstance(p, (float, int)) or not math.isfinite(p) or not 0 <= p <= 1 for p in [home, away]):
            raise ValueError("Invalid probability")
        if abs(home + away - 1) > 0.0001:
            raise ValueError("Final winner probabilities must add to one")
    if seen != ids:
        raise ValueError("Model must return one prediction per target fixture")


@logged_update("predictions")
def update(hockey):
    config = read_json(ROOT / "models/hockey/config.json", {})
    target, fixtures, ready, prior = next_matchday(hockey.get("games", []), datetime.now(ZoneInfo("Europe/Zurich")).date().isoformat())
    data = {"status": "no_model", "targetDate": target, "previousDate": prior, "previousDayComplete": ready,
            "updatedAt": stamp(), "model": config.get("name"), "version": config.get("version"), "predictions": [],
            "matchdayDefinition": "Partite della stessa data nel fuso Europe/Zurich", "gameIds": [g["id"] for g in fixtures]}
    if config.get("enabled"):
        data["status"] = "waiting_for_results"
        if ready and hockey.get("status") == "ok":
            context = {"targetDate": target, "fixtures": fixtures,
                       "history": [g for g in hockey["games"] if g["date"] < target and g["status"] == "finished"],
                       "dataDirectory": str(ROOT / config.get("dataDirectory", "national_league_data"))}
            fingerprint = hashlib.sha256(json.dumps([context, config], sort_keys=True).encode()).hexdigest()
            previous = read_json(CACHE / "predictions.json", {})
            if previous.get("fingerprint") == fingerprint and previous.get("status") == "ready":
                data = previous
            else:
                module = importlib.import_module(config["entrypoint"])
                rows = module.predict(context)
                validate_predictions(rows, fixtures)
                data.update(status="ready", predictions=rows, fingerprint=fingerprint, generatedAt=stamp())
    write_json(SITE / "data/predictions.json", data)
    write_json(CACHE / "predictions.json", data)
    return data
