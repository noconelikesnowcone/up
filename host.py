#!/usr/bin/env python3
"""Native messaging host. Writes the Nextup position list for the bar widget.

The browser extension is the only caller. This process adds a timestamp and
refuses oversized messages. It does not talk to Nextup itself.
"""

import json
import os
import struct
import sys
import time

MAX_MESSAGE = 65536
MAX_ROWS = 40


def state_path():
    override = os.environ.get("NEXTUP_UP_STATE")
    if override:
        return override
    base = os.environ.get("XDG_STATE_HOME") or os.path.join(
        os.path.expanduser("~"), ".local", "state"
    )
    return os.path.join(base, "omarchy", "giaodn.up.json")


def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        return None
    size = struct.unpack("<I", raw)[0]
    if size > MAX_MESSAGE:
        remaining = size
        while remaining:
            chunk = sys.stdin.buffer.read(min(remaining, 65536))
            if not chunk:
                break
            remaining -= len(chunk)
        return {"drop": True}
    body = sys.stdin.buffer.read(size)
    if len(body) < size:
        return None
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError):
        return {"drop": True}


def write_message(payload):
    body = json.dumps(payload).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(body)))
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


def clip(value, limit):
    if not isinstance(value, str):
        value = "" if value is None else str(value)
    if "<" in value or ">" in value:
        return ""
    return value[:limit]


def accept(message):
    rows = []
    open_board = False
    if isinstance(message, dict) and not message.get("drop"):
        open_board = message.get("open") is True
        source = message.get("rows")
        if isinstance(source, list):
            for row in source[:MAX_ROWS]:
                if not isinstance(row, dict):
                    continue
                name = clip(row.get("name"), 80).strip()
                if not name:
                    continue
                rows.append(
                    {
                        "name": name,
                        "time": clip(row.get("time"), 24).strip(),
                        "point": row.get("point") is True,
                    }
                )
    return {
        "updated": int(time.time() * 1000),
        "open": open_board,
        "rows": rows,
    }


def save(payload):
    path = state_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False)
        handle.write("\n")
    os.replace(temporary, path)


def main():
    while True:
        message = read_message()
        if message is None:
            break
        save(accept(message))
        write_message({"ok": True})


if __name__ == "__main__":
    main()
