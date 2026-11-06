"""Official FIS calendar. Every run is a separate, stable calendar event."""
from .diagnostics import logged_update
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

from .common import SITE, CACHE, fetch_text, read_json, stamp, write_json
from .htmltree import Node, parse_html

DISCIPLINES = {"Downhill": ("DH", "Discesa libera"), "Slalom": ("SL", "Slalom speciale"),
               "Giant Slalom": ("GS", "Slalom gigante"), "Super G": ("SG", "Super-G"), "Super-G": ("SG", "Super-G")}


def feed_url(season):
    return f"https://www.fis-ski.com/DB/services/public/icalendar-feed-fis-events.html?seasoncode={season}&sectorcode=AL&categorycode=WC&disciplinecode=DH%2CSL%2CGS%2CSG"


def parse_ical(text):
    text = re.sub(r"\r?\n[ \t]", "", text)
    events, item = [], None
    for line in text.splitlines():
        if line == "BEGIN:VEVENT":
            item = {}
        elif line == "END:VEVENT" and item is not None:
            events.append(item)
            item = None
        elif item is not None and ":" in line:
            key, value = line.split(":", 1)
            item[key.split(";")[0]] = value
            item[key.split(";")[0] + "_params"] = key
    return events


def decode_ical(value):
    return value.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")


def utc(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def run_times(event, race_timezone):
    """Never interpret local DESCRIPTION clocks as Swiss time.

    DTSTART is the UTC anchor. Convert the date at the venue, then interpret
    both local clocks in its IANA timezone (including DST). Missing clocks
    remain unknown. An inconsistent official anchor is rejected.
    """
    description = decode_ical(event.get("DESCRIPTION", ""))
    clocks = {int(n): clock for n, clock in re.findall(r"Run\s+(\d+)\s+loc:\s*(\d{1,2}:\d{2})", description)}
    raw = event.get("DTSTART", "")
    anchor = datetime.strptime(raw, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc) if raw.endswith("Z") else None
    if not clocks.get(1) or anchor is None:
        return raw[:8], {}, clocks
    venue = ZoneInfo(race_timezone)
    local = anchor.astimezone(venue)
    if local.strftime("%H:%M") != clocks[1].zfill(5):
        raise ValueError(f"FIS DTSTART/local time mismatch: {event['UID']} ({race_timezone})")
    times = {1: iso(anchor)}
    if 2 in clocks:
        hour, minute = map(int, clocks[2].split(":"))
        second = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if second < local:
            second += timedelta(days=1)
        times[2] = iso(second)
    return local.strftime("%Y%m%d"), times, clocks


def race_page(html):
    root = parse_html(html)
    dates = root.find_all(attr={"data-timezone": None})
    zone = dates[0].attrs["data-timezone"] if dates else None
    documents = [{"name": n.attrs["data-ga-download"], "url": n.attrs.get("data-link", "")}
                 for n in root.find_all(attr={"data-ga-download": None}) if n.attrs.get("data-link", "").startswith("https://")]
    live = next((n.attrs["href"] for n in root.find_all(tag="a", attr={"href": None}) if n.attrs["href"].startswith("https://live.fis-ski.com/")), None)
    live_active = any("event-status_live" in n.attrs.get("class", "").split() for n in root.find_all(tag="a"))
    cancelled = any("event-status_cancelled" in n.attrs.get("class", "").split() for n in root.find_all())
    body = root.one(attr={"id": "events-info-results"})
    rows = []
    if body:
        for row in body.find_all(tag="a", cls="table-row"):
            group = row.one(cls="justify-sb")
            if not group:
                continue
            cells = [n for n in group.children if isinstance(n, Node)]
            name_cell = next((n for n in cells if n.one(cls="athlete-name")), None)
            values = [n.text() for n in cells]
            # FIS grid: rank, bib, code, athlete, birth year, nation,
            # one/two run times, total, difference, points.
            if len(values) < 8:
                continue
            name_node = row.one(cls="athlete-name")
            country_node = row.one(cls="country__name-short")
            rows.append({"rank": values[0], "bib": values[1], "fisCode": values[2],
                         "name": name_node.text() if name_node else values[3],
                         "country": country_node.text() if country_node else values[5],
                         "values": values[6:], "athleteUrl": row.attrs["href"]})
    return {"timezone": zone, "documents": documents, "liveUrl": live,
            "isLive": live_active, "cancelled": cancelled, "results": rows}


def escape(value):
    return str(value).replace("\\", "\\\\").replace("\n", "\\n").replace(";", "\\;").replace(",", "\\,")


def folded(line):
    chunks, chunk = [], ""
    for char in line:
        if len((chunk + char).encode("utf-8")) > 75:
            chunks.append(chunk)
            chunk = " "
        chunk += char
    return "\r\n".join(chunks + [chunk])


def calendar(events):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Live Sport Arena//FIS World Cup//IT", "CALSCALE:GREGORIAN",
             "METHOD:PUBLISH", "X-WR-CALNAME:Live Sport Arena · Coppa del Mondo", "X-WR-TIMEZONE:Europe/Zurich",
             "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"]
    for event in events:
        lines.extend(["BEGIN:VEVENT", "UID:" + event["id"] + "@sportarenalive",
                      "SEQUENCE:" + str(event["sequence"]), "DTSTAMP:" + utc(event["modified"]).strftime("%Y%m%dT%H%M%SZ"),
                      "LAST-MODIFIED:" + utc(event["modified"]).strftime("%Y%m%dT%H%M%SZ")])
        if event["start"]:
            lines.append("DTSTART:" + utc(event["start"]).strftime("%Y%m%dT%H%M%SZ"))
            # The feed supplies start times; do not invent an official finish.
        else:
            lines.append("DTSTART;VALUE=DATE:" + event["date"].replace("-", ""))
        description = "Orario convertito dal fuso della gara. Visualizzazione consigliata: Europe/Zurich."
        if not event["start"]:
            description = "Orario non ancora pubblicato da FIS. Questo evento verrà aggiornato."
        if event["status"] == "removed":
            description = "Gara rimossa dal feed FIS. Verifica il programma ufficiale."
        lines.extend(["SUMMARY:" + escape(event["title"]), "LOCATION:" + escape(event["venue"] + ", " + event["country"]),
                      "DESCRIPTION:" + escape(description + "\nFonte: " + event["sourceUrl"]), "URL:" + event["sourceUrl"],
                      "STATUS:" + ("CANCELLED" if event["status"] in {"cancelled", "removed"} else "CONFIRMED"),
                      "TRANSP:TRANSPARENT", "END:VEVENT"])
    return "\r\n".join(folded(line) for line in lines + ["END:VCALENDAR", ""])


def reconcile(events, old_events):
    previous = {e["id"]: e for e in old_events}
    now = stamp()
    for event in events:
        old = previous.pop(event["id"], None)
        keys = ["start", "date", "title", "venue", "country", "status", "sourceModified"]
        changed = old is None or any(old.get(k) != event.get(k) for k in keys)
        # Time-based revisions survive a lost Actions cache without restarting
        # at zero. Seconds since 2020 fit the iCalendar integer range.
        revision = int((utc(now) - datetime(2020, 1, 1, tzinfo=timezone.utc)).total_seconds())
        event["sequence"] = max(revision, old.get("sequence", 0) + 1 if old else 0) if changed else old["sequence"]
        event["modified"] = now if changed else old["modified"]
    for old in previous.values():
        if old["status"] != "removed":
            revision = int((utc(now) - datetime(2020, 1, 1, tzinfo=timezone.utc)).total_seconds())
            old = {**old, "status": "removed", "sequence": max(revision, old["sequence"] + 1), "modified": now}
        events.append(old)
    return sorted(events, key=lambda e: (e["date"], e["start"] or "", e["id"]))


@logged_update("alpine")
def update(season):
    raw = parse_ical(fetch_text(feed_url(season)))
    if len(raw) < 40:
        raise ValueError("FIS calendar is unexpectedly incomplete; preserving the previous calendar")
    now = datetime.now(timezone.utc)
    old = read_json(CACHE / "alpine.json", read_json(SITE / "data/alpine.json", {}))
    previous_races = {race["id"]: race for race in old.get("races", [])} if old.get("season") == season else {}

    def enrich(item):
        description = decode_ical(item.get("DESCRIPTION", "")).replace("\\Event:", "\nEvent:")
        url_match = re.search(r"https://www\.fis-ski\.com/DB/general/results\.html[^\s\\]+", description)
        if not url_match:
            raise ValueError("Missing official FIS race URL")
        url = url_match.group()
        raw_date = item["DTSTART"][:8]
        day = datetime.strptime(raw_date, "%Y%m%d").replace(tzinfo=timezone.utc)
        race_id = parse_qs(urlparse(url).query)["raceid"][0]
        previous = previous_races.get(race_id)
        distance = (day - now).total_seconds()
        settled = distance < -172800 and previous and previous.get("status") in {"finished", "cancelled"}
        # The calendar feed carries revised run times; only nearby or new races need a detail-page request.
        reuse_details = previous and previous.get("timezone") and (distance > 172800 or settled)
        if reuse_details:
            details = {"timezone": previous["timezone"], "documents": previous.get("documents", []),
                       "liveUrl": previous.get("liveUrl"), "isLive": False,
                       "cancelled": previous.get("status") == "cancelled", "results": previous.get("results", [])}
        else:
            details = race_page(fetch_text(url, ttl=0))
        details["cancelled"] = details["cancelled"] or item.get("STATUS", "").upper() in {"CANCELLED", "CANCELED"}
        if not details["timezone"]:
            raise ValueError(f"Missing official timezone for {item['UID']}")
        local_date, times, clocks = run_times(item, details["timezone"])
        discipline_name = re.search(r"Event:\s*([^\n]+)", description).group(1).strip()
        if discipline_name not in DISCIPLINES:
            return None
        code, label = DISCIPLINES[discipline_name]
        gender = "W" if "Gender: Women" in description else "M"
        venue = decode_ical(item.get("LOCATION", ""))
        country_match = re.search(r"\(([A-Z]{3})\)", item.get("SUMMARY", ""))
        date = f"{local_date[:4]}-{local_date[4:6]}-{local_date[6:8]}"
        status = "cancelled" if details["cancelled"] else ("live" if details["isLive"] else ("finished" if details["results"] else "scheduled"))
        race = {"id": race_id, "venue": venue, "country": country_match.group(1) if country_match else "",
                "date": date, "discipline": code, "disciplineName": label, "gender": gender,
                "timezone": details["timezone"], "sourceUrl": url, "status": status,
                "runs": [], **{k: details[k] for k in ["documents", "liveUrl", "results"]}}
        events = []
        for run in range(1, 3 if code in {"SL", "GS"} else 2):
            run_label = f"{run}ª manche" if code in {"SL", "GS"} else "Gara"
            start = times.get(run)
            event = {"id": f"fis-al-{race_id}-run-{run}", "raceId": race_id, "season": season,
                     "date": utc(start).astimezone(ZoneInfo("Europe/Zurich")).date().isoformat() if start else date,
                     "start": start, "run": run, "runLabel": run_label, "venue": venue,
                     "country": race["country"], "discipline": code, "gender": gender,
                     "title": f"{venue} · {label} {'donne' if gender == 'W' else 'uomini'} · {run_label}",
                     "sourceUrl": url, "status": "cancelled" if details["cancelled"] else "scheduled"}
            event["sourceModified"] = item.get("LAST-MODIFIED", "")
            events.append(event)
            race["runs"].append({"number": run, "label": run_label, "start": start, "localTime": clocks.get(run)})
        return race, events

    with ThreadPoolExecutor(max_workers=4) as executor:
        enriched = [r for r in executor.map(enrich, raw) if r is not None]
    old_events = old.get("events", []) if old.get("season") == season else []
    events = reconcile([e for _, group in enriched for e in group], old_events)
    data = {"season": season, "seasonLabel": f"{season-1}/{str(season)[-2:]}", "updatedAt": stamp(),
            "source": "FIS", "sourceUrl": feed_url(season), "status": "ok", "timezone": "Europe/Zurich",
            "races": sorted([r for r, _ in enriched], key=lambda r: (r["date"], r["gender"])), "events": events}
    write_json(SITE / "data/alpine.json", data)
    write_json(CACHE / "alpine.json", data)
    path = SITE / "calendars/alpine-world-cup.ics"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(calendar(events).encode("utf-8"))
    print(f"FIS: {len(data['races'])} races, {len(events)} separate run events", flush=True)
    return data
