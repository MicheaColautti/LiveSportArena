import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from .diagnostics import response_log

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
CACHE = ROOT / ".cache"


def stamp():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def read_json(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def fetch_text(url, ttl=0):
    started = time.perf_counter()
    cache = CACHE / "http" / (hashlib.sha256(url.encode()).hexdigest() + ".txt")
    if cache.exists() and time.time() - cache.stat().st_mtime < ttl:
        content = cache.read_text(encoding="utf-8")
        response_log(url, started, body=content, outcome="cache", source="FIS")
        return content
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "Accept": "text/html,text/calendar,application/json"})
    try:
        with urlopen(req, timeout=30) as response:
            content = response.read().decode("utf-8-sig")
            response_log(url, started, response.status, content, source="FIS")
    except HTTPError as exc:
        try:
            body = exc.read(65536)
        except Exception:
            body = "Error body unavailable"
        response_log(url, started, exc.code, body, source="FIS", error=str(exc))
        raise
    except Exception as exc:
        response_log(url, started, source="FIS", errorType=type(exc).__name__, error=str(exc))
        raise
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(content, encoding="utf-8")
    return content
