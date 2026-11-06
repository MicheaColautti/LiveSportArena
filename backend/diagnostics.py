"""Bounded, redacted diagnostics for collectors; never published with Pages."""
import fcntl
import json
import re
import time
import traceback
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

LOG_DIR = Path(__file__).resolve().parents[1] / '.cache' / 'logs'
MAX_FILE_BYTES = 2 * 1024 * 1024
BACKUPS = 4
BODY_LIMIT = 16000
CONTEXT = ContextVar('update_context', default={})
SECRET = re.compile(r'token|secret|password|passwd|authorization|cookie|credential|api.?key|session.?id|email', re.I)


def clean_url(value):
    try:
        parts = urlsplit(str(value))
        host = parts.netloc.rsplit('@', 1)[-1]
        query = urlencode([(k, '[REDACTED]' if SECRET.search(k) else v) for k, v in parse_qsl(parts.query, keep_blank_values=True)])
        return urlunsplit((parts.scheme, host, parts.path, query, ''))
    except ValueError:
        return '[invalid URL]'


def redact(value):
    if isinstance(value, dict):
        return {str(k): '[REDACTED]' if SECRET.search(str(k)) else redact(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact(v) for v in value]
    if isinstance(value, str):
        value = re.sub(r'https?://[^\s<>"\']+', lambda m: clean_url(m[0]), value)
        value = re.sub(r'(?i)\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+', r'\1 [REDACTED]', value)
        value = re.sub(r'(?i)((?:token|secret|password|passwd|authorization|cookie|credential|api[_-]?key|session[_-]?id)[\w-]*["\']?\s*[:=]\s*)(?:"[^"]*"|\'[^\']*\'|[^\s,;&<>]+)', r'\1[REDACTED]', value)
        value = re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', '[REDACTED]', value)
        return value
    return value


def body_preview(body):
    if isinstance(body, bytes):
        body = body.decode('utf-8', errors='replace')
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except (ValueError, TypeError):
            # Strip scripts, forms and hidden inputs before retaining HTML text.
            body = re.sub(r'<(script|style|form)\b[^>]*>.*?</\1\s*>', '', body, flags=re.I | re.S)
            body = re.sub(r'<[^>]+>', ' ', body)
    safe = redact(body)
    text = safe if isinstance(safe, str) else json.dumps(safe, ensure_ascii=False, default=str)
    return {'body': text[:BODY_LIMIT], 'bodyTruncated': len(text) > BODY_LIMIT, 'bodyCharacters': len(text)}


def record(kind, **fields):
    """Serialize one line; an advisory lock also covers concurrent local workers."""
    try:
        entry = redact({'timestamp': datetime.now(timezone.utc).isoformat(), **CONTEXT.get(), 'kind': kind, **fields})
        line = (json.dumps(entry, ensure_ascii=False, default=str) + '\n').encode('utf-8')
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        with (LOG_DIR / '.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            path = LOG_DIR / 'updates.jsonl'
            if path.exists() and path.stat().st_size + len(line) > MAX_FILE_BYTES:
                (LOG_DIR / f'updates.jsonl.{BACKUPS}').unlink(missing_ok=True)
                for index in range(BACKUPS - 1, 0, -1):
                    source = LOG_DIR / f'updates.jsonl.{index}'
                    if source.exists():
                        source.replace(LOG_DIR / f'updates.jsonl.{index + 1}')
                path.replace(LOG_DIR / 'updates.jsonl.1')
            with path.open('ab') as output:
                output.write(line)
    except Exception:
        # Diagnostics must not prevent publishing usable source data.
        print('Warning: unable to write update diagnostics', flush=True)


def response_log(url, started, status=None, body='', outcome=None, **extra):
    record('response', endpoint=clean_url(url), httpStatus=status,
           durationMs=round((time.perf_counter() - started) * 1000),
           outcome=outcome or ('ok' if status and 200 <= status < 400 else 'error'),
           **body_preview(body), **extra)


def logged_update(name):
    """Pair every operation's start with its result, including caught partial errors."""
    def decorate(fn):
        @wraps(fn)
        def wrapped(*args, **kwargs):
            parent = CONTEXT.get()
            token = CONTEXT.set({'operation': name, 'operationId': uuid.uuid4().hex,
                                 'parentOperationId': parent.get('operationId')})
            started = time.perf_counter()
            record('update', outcome='started')
            try:
                value = fn(*args, **kwargs)
                payload = value if isinstance(value, dict) else {}
                children = list(payload.get('tables', {}).values()) + list(payload.get('groups', {}).values())
                partial = payload.get('status') in ('stale', 'error') or any(v.get('status') in ('stale', 'error') for v in children)
                record('update', outcome='partial' if partial else 'ok',
                       durationMs=round((time.perf_counter()-started)*1000),
                       status=payload.get('status'), outputKeys=list(payload))
                return value
            except BaseException as exc:
                record('update', outcome='error', durationMs=round((time.perf_counter()-started)*1000),
                       errorType=type(exc).__name__, error=str(exc)[:4000],
                       traceback=traceback.format_exc(limit=6)[-8000:])
                raise
            finally:
                CONTEXT.reset(token)
        return wrapped
    return decorate


def _sihf_response(response, *args, **kwargs):
    """Observe the library's existing transport without changing retries or pacing."""
    started = time.perf_counter() - response.elapsed.total_seconds()
    try:
        response_log(response.url, started, response.status_code, response.text,
                     source='SIHF', method=response.request.method)
    except Exception as exc:
        record('response', source='SIHF', endpoint=clean_url(response.url), httpStatus=response.status_code,
               outcome='error', errorType=type(exc).__name__, error='Response body could not be read')
    return response


def sihf_call(fn, **kwargs):
    # sportsdataverse is pinned in requirements.txt; use its shared, polite session.
    from sportsdataverse.hockey.euro_hockey_runtime import SESSION
    if _sihf_response not in SESSION.hooks['response']:
        SESSION.hooks['response'].append(_sihf_response)

    @logged_update('SIHF.' + fn.__name__)
    def invoke():
        record('request', source='SIHF', function=fn.__name__, parameters=kwargs)
        result = fn(**kwargs)
        try:
            preview = json.loads(result.head(30).to_json(orient='records', date_format='iso'))
            record('parsed-response', source='SIHF', outcome='ok', rows=len(result), **body_preview(preview))
        except Exception:
            record('parsed-response', source='SIHF', outcome='ok', note='Parsed preview unavailable')
        return result
    return invoke()
