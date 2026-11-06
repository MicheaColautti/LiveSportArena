"""Official World Cup standings, not the rolling World Cup Start List."""
from .diagnostics import logged_update, record
from urllib.parse import parse_qs, urlparse
from .common import SITE, CACHE, fetch_text, read_json, write_json, stamp
from .htmltree import Node, parse_html

DISCIPLINES = ("ALL", "DH", "SL", "GS", "SG")
def source_url(season, gender):
    return f"https://www.fis-ski.com/DB/alpine-skiing/cup-standings.html?sectorcode=AL&seasoncode={season}&cupcode=WC&disciplinecode=ALL&gendercode={gender}"

def parse_standings(html, season, gender, identities):
    root = parse_html(html)
    for name, value in {"seasoncode": str(season), "cupcode": "WC", "gendercode": gender, "disciplinecode": "ALL"}.items():
        control = root.one(tag="select", attr={"name": name})
        selected = [o.attrs.get("value") for o in control.find_all(tag="option") if "selected" in o.attrs] if control else []
        if selected != [value]:
            raise ValueError("Official standings filters do not match the requested season/cup/gender")
    body = root.one(cls="table__body")
    if body is None:
        raise ValueError("Standings table is missing")
    tables = {code: [] for code in DISCIPLINES}
    for row in body.find_all(tag="a", cls="table-row"):
        url = row.attrs.get("href", "")
        athlete = parse_qs(urlparse(url).query).get("competitorid", [None])[0]
        container = row.one(cls="g-row")
        if not athlete or container is None:
            continue
        cells = [c for c in container.children if isinstance(c, Node)]
        nation = row.one(cls="country__name-short")
        if not cells or nation is None:
            continue
        for block in row.find_all(cls="g-xs-24"):
            fields = [c for c in block.children if isinstance(c, Node)]
            if len(fields) < 6 or fields[1].text() not in tables:
                continue
            code = fields[1].text()
            rank = fields[3].text().replace("=", "").strip()
            points = fields[5].text().replace("'", "").replace("’", "").replace(" ", "")
            if not rank.isdigit() or not points.isdigit():
                continue
            identity = identities.get(athlete, {})
            tables[code].append({"rank": int(rank), "points": int(points), "competitorId": athlete,
                "fisCode": identity.get("fisCode"), "name": cells[0].text(), "country": nation.text(), "athleteUrl": url})
    for code in tables:
        tables[code].sort(key=lambda row: row["rank"])
    if not tables["ALL"] and body.find_all(tag="a", cls="table-row"):
        raise ValueError("Standings rows could not be decoded")
    return tables

@logged_update("alpine_standings")
def update(season):
    previous = read_json(CACHE / "alpine-standings.json", read_json(SITE / "data/alpine-standings.json", {}))
    if previous.get("season") != season:
        previous = {}
    identities = {}
    for race in read_json(SITE / "data/alpine.json", {}).get("races", []):
        for athlete in race.get("results", []):
            cid = parse_qs(urlparse(athlete.get("athleteUrl", "")).query).get("competitorid", [None])[0]
            if cid:
                identities[cid] = athlete
    groups = {}
    for gender in ("W", "M"):
        url = source_url(season, gender)
        try:
            tables = parse_standings(fetch_text(url), season, gender, identities)
            groups[gender] = {"status": "ok", "updatedAt": stamp(), "sourceUrl": url, "tables": tables}
        except Exception as exc:
            record("validation", outcome="error", source="FIS", endpoint=url, errorType=type(exc).__name__, error=str(exc))
            print(f"FIS standings {gender}: {exc}", flush=True)
            groups[gender] = {**previous.get("groups", {}).get(gender, {}), "status": "stale", "sourceUrl": url, "lastAttemptAt": stamp()}
    result = {"season": season, "source": "FIS", "checkedAt": stamp(), "groups": groups}
    write_json(SITE / "data/alpine-standings.json", result)
    write_json(CACHE / "alpine-standings.json", result)
    print("FIS standings: " + ", ".join(f"{g}: {len(v.get('tables', {}).get('ALL', []))} athletes ({v['status']})" for g, v in groups.items()), flush=True)
    return result

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", type=int, required=True)
    update(parser.parse_args().season)
