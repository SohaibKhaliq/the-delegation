#!/usr/bin/env python3
"""Post a milestone event to the WebSocket realtime endpoint.

Near-realtime companion to scripts/publish-muse-event.py (git-based
bridge). This script does NOT write any file and does NOT push to git:
it POSTs one event to POST /api/muse-events on the deployed Delegation
server, which validates it, updates its in-memory live feed, and
broadcasts it to all connected WebSocket clients within milliseconds.
The dashboard also keeps its 10s GitHub-raw polling as a fallback, so
a failed POST here never breaks the feed — the git bridge remains the
durable record; use that script for events that must survive a server
restart (this endpoint's state is in-memory only).

AUTH (token is a parent/owner step, never invented here):
  * Server env var MUSE_EVENT_TOKEN must be set in Coolify for the
    Delegation app. If it is not set, the server rejects ALL posts (403).
  * This script reads the SAME token ONLY from its own environment
    variable MUSE_EVENT_TOKEN. It never accepts --token (that would leak
    into shell history / process lists) and never prints the token.
  * How to set it without sharing it in chat: the parent agent sets the
    env var in Coolify and arranges for the publisher's environment to
    hold the same value through the approved secure channel — see
    README "WebSocket realtime: token setup" before using this script.

Usage:
    MUSE_EVENT_TOKEN=<token-from-env-only> python3 scripts/post-muse-event-ws.py \
        --url https://agents.zentacode.com \
        --type milestone --workspace the-delegation --agent sonia \
        --task muse-event-bridge --report "Short milestone report"

What is posted: metadata only — ids, statuses, file paths, short
reports (max 500 chars). NEVER passwords, keys, tokens, sessions,
private chat content, or full file contents. Any argument that looks
like a secret is refused and nothing is posted.
"""

import argparse
import json
import os
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
import uuid

EVENT_TYPES = ("started", "milestone", "file_changed", "commit", "done", "blocked")
STATUSES = ("idle", "running", "done", "blocked", "pending")
MAX_REPORT_LEN = 500
SECRET_ASSIGN_RE = re.compile(
    r"(?i)(api[_-]?key|token|password|passwd|secret|session|bearer|private[_-]?key)\s*[:=]\s*\S+"
)
LONG_TOKEN_RE = re.compile(r"\b[A-Za-z0-9_\-]{40,}\b")


def refuse(field, value):
    if value and (SECRET_ASSIGN_RE.search(value) or LONG_TOKEN_RE.search(value)):
        print(f"REFUSED: --{field} looks like a secret. Metadata only.", file=sys.stderr)
        sys.exit(2)


def main(argv=None):
    p = argparse.ArgumentParser(description="POST a milestone event to /api/muse-events (WebSocket realtime).")
    p.add_argument("--url", default="https://agents.zentacode.com",
                   help="Deployed Delegation base URL (default: https://agents.zentacode.com).")
    p.add_argument("--type", dest="type", required=True, choices=EVENT_TYPES)
    p.add_argument("--workspace", required=True)
    p.add_argument("--agent", default="")
    p.add_argument("--task", default="")
    p.add_argument("--report", required=True)
    p.add_argument("--files", default="", help="Comma-separated relative file paths, if any.")
    p.add_argument("--agent-status", default="", choices=[""] + list(STATUSES))
    p.add_argument("--task-status", default="", choices=[""] + list(STATUSES))
    p.add_argument("--dry-run", action="store_true", help="Print the payload, do not POST.")
    args = p.parse_args(argv)

    token = os.environ.get("MUSE_EVENT_TOKEN", "")
    if not token and not args.dry_run:
        print("ERROR: MUSE_EVENT_TOKEN is not set in this environment. "
              "Read README 'WebSocket realtime: token setup' first; "
              "never pass a token as a command-line argument.", file=sys.stderr)
        return 2
    if len(args.report) > MAX_REPORT_LEN:
        print(f"REFUSED: --report exceeds {MAX_REPORT_LEN} characters.", file=sys.stderr)
        return 2
    for field in ("workspace", "agent", "task", "report"):
        refuse(field, getattr(args, field))
    files = [f.strip() for f in args.files.split(",") if f.strip()] if args.files else []
    for f in files:
        refuse("files", f)
        if f.startswith("/") or ".." in f.split("/"):
            print(f"REFUSED: --files entries must be relative paths, got: {f}", file=sys.stderr)
            return 2

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    payload = {
        "event": {
            "id": f"evt-{datetime.now(timezone.utc):%Y%m%dT%H%M%S}-{uuid.uuid4().hex[:6]}",
            "timestamp": now,
            "type": args.type,
            "workspaceId": args.workspace,
            "agentId": args.agent or None,
            "taskId": args.task or None,
            "report": args.report,
            "filesChanged": files,
        },
        "agentStatus": args.agent_status or None,
        "taskStatus": args.task_status or None,
    }
    if args.dry_run:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        print("Dry run: nothing posted.")
        return 0

    req = urllib.request.Request(
        args.url.rstrip("/") + "/api/muse-events",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"POST failed: HTTP {e.code} {e.read().decode('utf-8', 'replace')[:500]}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"POST failed: {e}", file=sys.stderr)
        return 1
    print(f"Posted event {body.get('event', {}).get('id')} ({args.type}) -> {args.url} (broadcast to WebSocket clients)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
