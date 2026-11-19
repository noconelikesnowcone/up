#!/usr/bin/env python3
"""Read the Nextup position list once a minute.

The username and password stay in 1Password. This process asks the 1Password
CLI for them when it has to sign in, then forgets them. It writes names,
and the top person's turn-end time, and nothing else.
"""

import html.parser
import http.cookiejar
import json
import os
import signal
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

ORIGIN = "https://login.thenextup.com"
HOST = "login.thenextup.com"
BODY_MAX = 1_500_000
INTERVAL = 60
RETRY = 15

PLUGIN = os.path.dirname(os.path.abspath(__file__))
POSITION_JS = os.path.join(PLUGIN, "extension", "position.js")
READER = os.path.join(PLUGIN, "reader.json")

NODE_ORDER = r"""
const fs = require("fs")
const { peopleFromPayload } = require(process.env.POSITION_JS)
const input = JSON.parse(fs.readFileSync(0, "utf8"))
const rows = peopleFromPayload(input.payload, input.reps, input.shift)
process.stdout.write(rows ? JSON.stringify(rows) : "null")
"""

stop = False


class ReaderError(Exception):
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


class OffHost(Exception):
    pass


class PageParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.inputs = {}
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        data = {key.lower(): value for key, value in attrs}
        if tag.lower() == "input":
            key = data.get("id") or data.get("name")
            if key:
                self.inputs[key] = data.get("value") or ""
        elif tag.lower() == "a":
            href = data.get("href") or ""
            if href:
                self.hrefs.append(href)


class SameHost(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlparse(newurl).hostname != HOST:
            raise OffHost()
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def state_dir():
    base = os.environ.get("XDG_STATE_HOME") or os.path.join(os.path.expanduser("~"), ".local", "state")
    path = os.path.join(base, "omarchy", "giaodn.up")
    os.makedirs(path, mode=0o700, exist_ok=True)
    os.chmod(path, 0o700)
    return path


def state_file():
    override = os.environ.get("NEXTUP_UP_STATE")
    if override:
        return override
    base = os.environ.get("XDG_STATE_HOME") or os.path.join(os.path.expanduser("~"), ".local", "state")
    return os.path.join(base, "omarchy", "giaodn.up.json")


def session_file():
    return os.path.join(state_dir(), "session.txt")


def code_file():
    return os.path.join(state_dir(), "code")


def board_file():
    return os.path.join(state_dir(), "board-path")


def phase_file():
    return os.path.join(state_dir(), "phase")


def cooldown_file():
    return os.path.join(state_dir(), "cooldown")


def read_note(path):
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read().strip()
    except FileNotFoundError:
        return ""


def write_note(path, value):
    if not value:
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        return
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(value)


def cooled():
    stamp = read_note(cooldown_file())
    try:
        return time.time() >= float(stamp)
    except ValueError:
        return True


def cool_for(seconds):
    write_note(cooldown_file(), str(time.time() + seconds))


def as_refs(value):
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return value
    return []


def references():
    with open(READER, encoding="utf-8") as handle:
        data = json.load(handle)
    username = as_refs(data.get("username"))
    password = as_refs(data.get("password"))
    if not username or not password:
        raise ReaderError("item")
    return username, password, as_refs(data.get("code"))


def op_reason(stderr):
    text = (stderr or "").lower()
    if any(word in text for word in (
        "integrate with 1password",
        "not configured",
        "connecting to desktop",
        "authorization",
        "locked",
        "biometric",
        "not signed in",
    )):
        return "locked"
    if any(word in text for word in (
        "isn't an item",
        "not found",
        "could not find",
        "no item",
        "multiple items",
    )):
        return "item"
    return "signin"


def op_read(ref):
    try:
        proc = subprocess.run(
            ["op", "read", ref],
            check=False,
            capture_output=True,
            text=True,
            timeout=90,
            env={**os.environ, "OP_BIOMETRIC_UNLOCK_ENABLED": "true"},
        )
    except subprocess.TimeoutExpired as exc:
        raise ReaderError("locked") from exc
    if proc.returncode != 0:
        raise ReaderError(op_reason(proc.stderr))
    value = proc.stdout
    if value.endswith("\n"):
        value = value[:-1]
    if not value:
        raise ReaderError("item")
    return value


def read_login():
    user_refs, pass_refs, _code_refs = references()
    username = first_secret(user_refs)
    password = first_secret(pass_refs)
    return username, password


def read_saved_code():
    _user_refs, _pass_refs, code_refs = references()
    for ref in code_refs:
        try:
            return op_read(ref)
        except ReaderError as exc:
            if exc.reason == "locked":
                raise
    return ""


def first_secret(refs):
    last = "item"
    for ref in refs:
        try:
            return op_read(ref)
        except ReaderError as exc:
            if exc.reason == "locked":
                raise
            last = exc.reason
    raise ReaderError(last)


def parse_page(text):
    parser = PageParser()
    parser.feed(text)
    parser.close()
    return parser


def classify_verify(body):
    text = (body or "").strip()
    if text.startswith('"') and text.endswith('"'):
        try:
            text = json.loads(text)
        except json.JSONDecodeError:
            text = text.strip('"')
    if not isinstance(text, str):
        text = str(text)
    folded = text.strip()
    if folded == "Account doesn't exist!":
        return "signin"
    if folded.lower() == "false":
        return "code"
    return "password"


def peek_code():
    try:
        with open(code_file(), encoding="utf-8") as handle:
            code = handle.read().strip()
    except FileNotFoundError:
        return ""
    if len(code) < 4 or len(code) > 12 or not code.isalnum():
        return ""
    return code


def take_code():
    code = peek_code()
    try:
        os.remove(code_file())
    except FileNotFoundError:
        pass
    return code


def public_rows(rows):
    clean = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        name = row.get("name")
        if not isinstance(name, str) or not name or "<" in name or ">" in name:
            continue
        clock = row.get("time") if isinstance(row.get("time"), str) else ""
        clean.append({"name": name[:80], "time": clock[:24], "point": row.get("point") is True})
        if len(clean) >= 40:
            break
    return clean


def save_state(open_board, rows, reason):
    payload = {
        "updated": int(time.time() * 1000),
        "open": open_board is True,
        "reason": reason if reason in ("ok", "locked", "code", "signin", "item", "offline") else "offline",
        "rows": public_rows(rows) if open_board else [],
    }
    path = state_file()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False)
        handle.write("\n")
    os.replace(temporary, path)


def build_opener(jar):
    return urllib.request.build_opener(
        SameHost(),
        urllib.request.HTTPCookieProcessor(jar),
    )


def load_jar():
    jar = http.cookiejar.MozillaCookieJar(session_file())
    if os.path.exists(jar.filename):
        try:
            jar.load(ignore_discard=True, ignore_expires=True)
        except (OSError, http.cookiejar.LoadError):
            pass
    return jar


def store_jar(jar):
    path = session_file()
    jar.save(path, ignore_discard=True, ignore_expires=True)
    os.chmod(path, 0o600)


def request(opener, url, data=None, headers=None, method=None):
    parsed = urllib.parse.urlparse(url)
    if parsed.hostname != HOST or parsed.scheme != "https":
        raise OffHost()
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with opener.open(req, timeout=20) as response:
            if urllib.parse.urlparse(response.geturl()).hostname != HOST:
                raise OffHost()
            body = response.read(BODY_MAX + 1)
            if len(body) > BODY_MAX:
                raise ReaderError("offline")
            return response.geturl(), response.status, body.decode("utf-8", "replace")
    except OffHost:
        raise
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise ReaderError("signin") from exc
        raise ReaderError("offline") from exc
    except urllib.error.URLError as exc:
        raise ReaderError("offline") from exc
    except TimeoutError as exc:
        raise ReaderError("offline") from exc


def form_token(page):
    token = parse_page(page).inputs.get("__RequestVerificationToken", "")
    if not token:
        raise ReaderError("offline")
    return token


def submit_login(opener, username, secret, reset):
    url, _status, page = request(opener, ORIGIN + "/Account/Login?ReturnUrl=%2F")
    token = form_token(page)
    fields = {
        "__RequestVerificationToken": token,
        "UserName": username,
        "Password": secret,
        "PasswordReset": "true" if reset else "false",
    }
    body = urllib.parse.urlencode(fields).encode("utf-8")
    _final, _status, landed = request(
        opener,
        ORIGIN + "/Account/Login?ReturnUrl=%2F",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    return landed


def sign_in(opener):
    username, password = read_login()
    try:
        _url, _status, verify_page = request(opener, ORIGIN + "/Account/Login?ReturnUrl=%2F")
        _token = form_token(verify_page)
        raw = json.dumps({"userName": username}).encode("utf-8")
        _url, _status, verdict = request(
            opener,
            ORIGIN + "/Account/VerifyUserName",
            data=raw,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json, text/plain, */*",
                "X-Requested-With": "XMLHttpRequest",
            },
            method="POST",
        )
        kind = classify_verify(verdict)
        if kind == "signin":
            raise ReaderError("signin")
        if kind == "code":
            code = take_code() or read_saved_code()
            if not code:
                raise ReaderError("code")
            landed = submit_login(opener, username, code, True)
        else:
            landed = submit_login(opener, username, password, False)
    finally:
        password = ""
        username = ""
    if still_login(landed):
        raise ReaderError("signin")
    return landed


def still_login(page):
    parsed = parse_page(page)
    return "UserName" in parsed.inputs and not parsed.inputs.get("UplistConfigId")


def board_params(page):
    fields = parse_page(page).inputs
    config = (fields.get("UplistConfigId") or "").strip()
    if not config:
        return None
    time_offset = fields.get("TimeOffset") or fields.get("txbTimeOffset") or ""
    reps = fields.get("RepsOnPoint") or "1"
    shift = fields.get("ShiftTypeId") or "0"
    return {
        "upListConfigId": config,
        "timeOffset": time_offset,
        "isShowNonOpp": "true" if fields.get("IsShowNonOpp") == "True" else "false",
        "deviceTypeId": fields.get("txbDeviceType") or "2",
        "selViewType": "1",
        "strDate": "",
        "viewId": str(int(fields.get("ViewId") or "0") if (fields.get("ViewId") or "0").lstrip("-").isdigit() else 0),
        "cache": "false",
        "reps": reps,
        "shift": shift,
    }


def same_origin_path(href):
    if not href or href.startswith(("#", "javascript:", "mailto:")):
        return ""
    parsed = urllib.parse.urlparse(href)
    if parsed.scheme and parsed.scheme not in ("https", ""):
        return ""
    if parsed.hostname and parsed.hostname != HOST:
        return ""
    if not parsed.path.startswith("/"):
        return ""
    return parsed.path


def candidate_paths(page, remembered):
    found = []
    if remembered:
        found.append(remembered)
    for href in parse_page(page).hrefs:
        path = same_origin_path(href)
        if path and path not in found:
            found.append(path)
    for path in ("/", "/Dv", "/Dv/Index", "/Home", "/Home/Index"):
        if path not in found:
            found.append(path)
    return found[:12]


def remember_board(path):
    with open(board_file(), "w", encoding="utf-8") as handle:
        handle.write(path)


def remembered_board():
    try:
        with open(board_file(), encoding="utf-8") as handle:
            path = handle.read().strip()
    except FileNotFoundError:
        return ""
    if path.startswith("/") and "://" not in path and ".." not in path:
        return path
    return ""


def choose_device(devices):
    if not isinstance(devices, list) or not devices:
        return None
    desktops = []
    for device in devices:
        if not isinstance(device, dict) or not device.get("DeviceKey"):
            continue
        try:
            kind = int(device.get("DeviceTypeId") or 0)
        except (TypeError, ValueError):
            kind = 0
        if kind == 2:
            desktops.append(device)
    pool = desktops or [device for device in devices if isinstance(device, dict) and device.get("DeviceKey")]
    for device in pool:
        if str(device.get("UpListName") or "").lower() == "new":
            return device
    return pool[0] if pool else None


def find_board(opener, landed=""):
    page = landed
    if not page or "txbAccordion" not in parse_page(page).inputs and not board_params(page or ""):
        _final, _status, page = request(opener, ORIGIN + "/")
    if still_login(page):
        raise ReaderError("signin")
    params = board_params(page)
    if params:
        return params
    fields = parse_page(page).inputs
    raw = fields.get("txbAccordion") or ""
    if not raw:
        return None
    try:
        devices = json.loads(raw)
    except json.JSONDecodeError:
        return None
    device = choose_device(devices)
    if not device:
        return None
    controller = "Dv3" if "dv3" in (fields.get("hdnBeta") or "").lower() else "Dv"
    query = urllib.parse.urlencode({
        "deviceType": device.get("DeviceTypeId") or 2,
        "deviceKey": device.get("DeviceKey"),
    })
    _final, _status, board = request(opener, ORIGIN + "/" + controller + "?" + query)
    if still_login(board):
        raise ReaderError("signin")
    return board_params(board)


def order_rows(payload, reps, shift):
    proc = subprocess.run(
        ["node", "-e", NODE_ORDER],
        input=json.dumps({"payload": payload, "reps": reps, "shift": shift}),
        text=True,
        capture_output=True,
        timeout=10,
        env={**os.environ, "POSITION_JS": POSITION_JS},
        check=False,
    )
    if proc.returncode != 0:
        raise ReaderError("offline")
    text = proc.stdout.strip()
    if text == "null" or not text:
        return None
    rows = json.loads(text)
    if not isinstance(rows, list):
        return None
    clean = []
    for row in rows[:40]:
        if not isinstance(row, dict):
            continue
        name = row.get("name")
        if not isinstance(name, str) or not name or "<" in name or ">" in name:
            continue
        clock = row.get("time") if isinstance(row.get("time"), str) else ""
        clean.append({"name": name[:80], "time": clock[:24], "point": row.get("point") is True})
    return clean


def fetch_rows(opener):
    params = find_board(opener)
    if not params:
        return None
    reps = params.pop("reps")
    shift = params.pop("shift")
    query = urllib.parse.urlencode(params)
    _url, status, body = request(
        opener,
        ORIGIN + "/Dv/GetDisplayViewUpListConfig?" + query,
        headers={
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
        },
    )
    if still_login(body):
        raise ReaderError("signin")
    if status != 200:
        return None
    return order_rows(body, reps, shift)


def has_auth(jar):
    return any(cookie.name == ".ASPXAUTH" and cookie.value for cookie in jar)


def publish(opener, jar):
    rows = fetch_rows(opener)
    if rows is None:
        save_state(False, [], "offline")
        print("offline", flush=True)
        return RETRY
    store_jar(jar)
    write_note(phase_file(), "")
    write_note(cooldown_file(), "")
    save_state(True, rows, "ok")
    print("rows", len(rows), flush=True)
    return INTERVAL


def finish_code(opener, jar):
    code = peek_code() or read_saved_code()
    if not code:
        save_state(False, [], "code")
        print("code", flush=True)
        return RETRY
    user_refs, _password_refs, _code_refs = references()
    username = first_secret(user_refs)
    if peek_code():
        code = take_code()
    try:
        landed = submit_login(opener, username, code, True)
    finally:
        username = ""
        code = ""
    if still_login(landed):
        write_note(phase_file(), "")
        cool_for(300)
        save_state(False, [], "signin")
        print("signin", flush=True)
        return 300
    return publish(opener, jar)


def cycle():
    jar = load_jar()
    opener = build_opener(jar)
    if has_auth(jar):
        try:
            return publish(opener, jar)
        except ReaderError as exc:
            if exc.reason != "signin":
                save_state(False, [], exc.reason)
                print(exc.reason, flush=True)
                return RETRY
            try:
                os.remove(session_file())
            except FileNotFoundError:
                pass
            jar = http.cookiejar.MozillaCookieJar(session_file())
            opener = build_opener(jar)
        except OffHost:
            save_state(False, [], "offline")
            print("offline", flush=True)
            return RETRY
    if read_note(phase_file()) == "code":
        try:
            return finish_code(opener, jar)
        except ReaderError as exc:
            save_state(False, [], exc.reason)
            print(exc.reason, flush=True)
            return 60 if exc.reason == "locked" else RETRY
        except OffHost:
            save_state(False, [], "offline")
            print("offline", flush=True)
            return RETRY
    if not cooled():
        return 60
    try:
        sign_in(opener)
        return publish(opener, jar)
    except ReaderError as exc:
        if exc.reason == "code":
            write_note(phase_file(), "code")
        if exc.reason == "signin":
            cool_for(300)
        delay = 60 if exc.reason in ("locked", "item", "signin") else RETRY
        save_state(False, [], exc.reason)
        print(exc.reason, flush=True)
        return delay
    except OffHost:
        save_state(False, [], "offline")
        print("offline", flush=True)
        return RETRY


def wait(seconds):
    end = time.monotonic() + seconds
    while not stop and time.monotonic() < end:
        time.sleep(min(1, end - time.monotonic()))
    return stop


def main():
    def handle(_signum, _frame):
        global stop
        stop = True

    signal.signal(signal.SIGTERM, handle)
    signal.signal(signal.SIGINT, handle)
    state_dir()
    while not stop:
        try:
            delay = cycle()
        except Exception:
            print("cycle failed", flush=True)
            delay = RETRY
        if wait(delay):
            break


if __name__ == "__main__":
    main()
