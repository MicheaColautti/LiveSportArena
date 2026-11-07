"""SIHF adapter, using the same library as the user's notebook."""
from .diagnostics import logged_update, sihf_call
import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from .common import SITE, CACHE, read_json, write_json, stamp


def records(frame):
    if "row_type" in frame:
        frame = frame.loc[frame.row_type.eq("data")]
    return json.loads(frame.to_json(orient="records", date_format="iso"))


def publish_csv(raw, details):
    """Publish the notebook's five CSV outputs for the current season."""
    import pandas as pd
    from .hockey_csv import prepare_matches, make_features, save_csv
    directory = SITE / "data/csv"
    directory.mkdir(parents=True, exist_ok=True)
    matches = prepare_matches(pd.DataFrame(raw))
    stats = pd.DataFrame([row for d in details.values() for row in d.get("stats", [])])
    players = pd.DataFrame([row for d in details.values() for row in d.get("players", [])])
    if stats.empty:
        stats = pd.DataFrame(columns=["game_id", "statistic", "home_value", "away_value"])
    if players.empty:
        players = pd.DataFrame(columns=["game_id", "team_side", "player_id"])
    features = make_features(matches, stats)
    for name, frame in [("matches", matches), ("game_stats", stats), ("player_stats", players), ("team_features", features), ("ml_dataset", features)]:
        save_csv(frame, directory / (name + ".csv"))


def live_projection(standings, games):
    """Provisional points only when completed games reproduce the official base.

    This guard prevents duplicate live points and projections across inconsistent
    snapshots or playoff tables. Equal points preserve the official base order.
    """
    live = [g for g in games if g["status"] == "live"]
    if not live:
        return []
    rows = {str(r["team_id"]): dict(r) for r in standings}
    totals = {tid: {"games": 0, "points": 0} for tid in rows}
    for game in games:
        if game["status"] != "finished":
            continue
        home, away = game["home"], game["away"]
        hs, aws = game.get("homeScore"), game.get("awayScore")
        if home not in totals or away not in totals or hs is None or aws is None or hs == aws:
            return []
        overtime = game.get("decision") in {"OT", "SO"}
        winner, loser = (home, away) if hs > aws else (away, home)
        totals[winner]["points"] += 2 if overtime else 3
        totals[loser]["points"] += 1 if overtime else 0
        totals[home]["games"] += 1
        totals[away]["games"] += 1
    if any(totals[tid]["games"] != r["games_played"] or totals[tid]["points"] != r["points"] for tid, r in rows.items()):
        return []
    for game in live:
        home, away = game["home"], game["away"]
        hs, aws = game.get("homeScore"), game.get("awayScore")
        if home not in rows or away not in rows or hs is None or aws is None:
            return []
        # At a draw each team has one provisional point, the winning extra
        # point is not awarded before an actual leader exists.
        overtime = len(game.get("homePeriods") or []) > 3 or game.get("decision") in {"OT", "SO"}
        hp, ap = ((1, 1) if hs == aws else ((2, 1) if hs > aws else (1, 2))) if overtime or hs == aws else ((3, 0) if hs > aws else (0, 3))
        for tid, points in ((home, hp), (away, ap)):
            rows[tid]["points"] += points
            rows[tid]["livePoints"] = points
        for tid, scored, conceded in ((home, hs, aws), (away, aws, hs)):
            row = rows[tid]
            row['games_played'] += 1
            row['goals_for'] += scored
            row['goals_against'] += conceded
            row['goals_difference'] = row['goals_for'] - row['goals_against']
            if scored != conceded:
                outcome = 'won' if scored > conceded else 'lost'
                phase = 'penalty' if game.get('decision') == 'SO' else 'extra_time' if overtime else 'in_time'
                key = 'games_' + outcome + '_' + phase
                row[key] = (row.get(key) or 0) + 1
    ordered = sorted(rows.values(), key=lambda r: (-r["points"], r["rank"]))
    for rank, row in enumerate(ordered, 1):
        row["rank"] = rank
    return ordered


@logged_update("hockey")
def update(season, detail_limit=8):
    from sportsdataverse.hockey import sihf
    from sportsdataverse.hockey.sihf import sihf_api_web_parsers as parsers
    call = lambda fn, **kw: records(sihf_call(fn, return_as_pandas=True, language="en", **kw))
    raw = call(sihf.sihf_results, season=season, league_id=1)
    if not raw or any(int(m["season"]) != season for m in raw):
        raise ValueError("Missing or mismatched SIHF season")
    standings = call(sihf.sihf_standings, season=season, league_id=1)
    games, teams = [], {}
    for m in raw:
        for side in ("home", "away"):
            tid = str(m[side + "_team_id"])
            teams[tid] = {"id": tid, "name": m[side + "_team_name"], "short": m[side + "_team_acronym"]}
        status_id = m.get("status_id")
        status = "cancelled" if m.get("status_canceled") else ("finished" if status_id == 12 else ("scheduled" if status_id == 0 else "live"))
        start = m.get("start_date_time")
        if not start and m.get("time"):
            start = datetime.fromisoformat(m["date"][:10] + "T" + m["time"]).replace(tzinfo=ZoneInfo("Europe/Zurich")).isoformat()
        games.append({"id": str(m["game_id"]), "date": m["date"][:10], "start": start,
                      "home": str(m["home_team_id"]), "away": str(m["away_team_id"]),
                      "homeScore": m.get("score_home"), "awayScore": m.get("score_away"),
                      "homePeriods": m.get("score_per_period_home"), "awayPeriods": m.get("score_per_period_away"),
                      "status": status, "statusId": status_id, "statusText": m.get("status_name"),
                      "decision": m.get("decision"), "broadcasts": m.get("broadcasts"),
                      "sourceUpdatedAt": m.get("update_date_time"),
                      "sourceUrl": f"https://www.sihf.ch/de/game-center/game/{m['game_id']}"})
    games.sort(key=lambda g: (g["date"], g["start"] or "", g["id"]))
    old = read_json(CACHE / "hockey.json", read_json(SITE / "data/hockey.json", {}))
    details = old.get("details", {}) if old.get("season") == season else {}
    today = datetime.now(ZoneInfo("Europe/Zurich")).date().isoformat()
    candidates = [g for g in games if g["status"] == "live" or g["date"] == today]
    recent = [g for g in games if g["status"] == "finished"][-detail_limit:]
    upcoming = [g for g in games if g["date"] >= today and g["status"] == "scheduled"]
    if upcoming:
        candidates.extend([g for g in upcoming if g["date"] == upcoming[0]["date"]])
    candidates.extend(reversed(recent))
    # Migrate one older saved lineup per update without fetching the entire archive.
    legacy = next((g for g in reversed(games) if g["status"] == "finished"
                   and details.get(g["id"], {}).get("lineups")
                   and "topScorers" not in details[g["id"]]), None)
    if legacy:
        candidates.append(legacy)
    seen = set()
    for game in candidates:
        gid = game["id"]
        if gid in seen:
            continue
        seen.add(gid)
        cached = details.get(gid)
        if cached and cached.get("sourceUpdatedAt") == game["sourceUpdatedAt"] and cached.get("complete") and "topScorers" in cached and game["status"] == "finished":
            continue
        print(f"SIHF details: {gid}", flush=True)
        # All five views come from the same SIHF game report.
        try:
            report = sihf_call(sihf.sihf_game_info, game_id=int(gid), language="en", return_parsed=False)
            if str(report.get("gameId")) != gid:
                raise ValueError(f"SIHF game report does not match {gid}")
        except Exception as exc:
            print(f"SIHF report {gid}: {exc}", flush=True)
            continue
        detail = dict(cached or {}, sourceUpdatedAt=game["sourceUpdatedAt"], updatedAt=stamp(), complete=True)
        routes = {"info": parsers.parse_sihf_game_info, "stats": parsers.parse_sihf_game_team_stats,
                  "events": parsers.parse_sihf_pbp, "lineups": parsers.parse_sihf_game_lineups,
                  "players": parsers.parse_sihf_game_player_stats}
        for key, parse in routes.items():
            try:
                detail[key] = records(parse(report, return_as_pandas=True))
                if key == "lineups":
                    lineups = report.get("lineUps") or {}
                    detail["topScorers"] = sorted({
                        str(tag["id"]) for side in ("homeTeam", "awayTeam")
                        for tag in ((lineups.get(side) or {}).get("taggedPlayers") or [])
                        if tag.get("type") == "pftopscorer" and tag.get("id")
                    })
            except Exception as exc:
                detail[key] = (cached or {}).get(key, [])
                detail["complete"] = False
                print(f"SIHF {key} {gid}: {exc}", flush=True)
        details[gid] = detail
    # Keep the current season's previously fetched details for browsing results.
    valid_ids = {g["id"] for g in games}
    details = {gid: d for gid, d in details.items() if gid in valid_ids}
    leaders = []
    try:
        leaders = call(sihf.sihf_player_stats, season=season, league_id=1)
    except Exception as exc:
        print(f"SIHF player leaders: {exc}", flush=True)
    data = {"season": season, "seasonLabel": f"{season-1}/{str(season)[-2:]}", "updatedAt": stamp(),
            "source": "SIHF", "sourceUrl": "https://www.sihf.ch/de/game-center/liga/1-1", "status": "ok",
            "liveStandings": live_projection(standings, games), "games": games, "teams": list(teams.values()), "standings": standings, "leaders": leaders, "details": details}
    write_json(SITE / "data/hockey.json", data)
    write_json(CACHE / "hockey.json", data)
    publish_csv(raw, details)
    print(f"SIHF: {len(games)} games, {len(teams)} teams", flush=True)
    return data
