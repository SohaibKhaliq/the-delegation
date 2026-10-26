#!/usr/bin/env python3
"""Publish a milestone event to the view-only Muse feed.

Git-based live bridge for the view-only Delegation fork (see README:
"Live bridge"). This script only edits public/muse-data.json in this
repo. It does NOT deploy anything, does NOT call any API, and does NOT
execute anything. The publisher must commit the changed file and push
to main; Coolify then builds/deploys it and the dashboard's 30s polling
shows source "live" instead of "seed".

Usage:
    python3 scripts/publish-muse-event.py \
        --type milestone --workspace ade --agent sonia \
        --task muse-event-bridge --task-status done \
        --report "Short milestone report" \
        --input-tokens 1200 --output-tokens 300 --cached-tokens 0

Token counts (optional, integers, never negative): real Muse token
counts for the session/step this event reports, published WITH the
event. The dashboard panel re-computes its totals on every feed poll
from the token fields on the events in the feed, so counts move
regularly as new events are published. There is no auto-counter, no
estimation from text length, and no live Muse token API: if no counts
are passed, the event carries 0 and the panel honestly stays at 0
until a count-bearing event is published. Token counts are counts,
never secrets, and are never passed as a credential.

What is published: metadata only -- agent/task/workspace ids and names,
statuses, file paths, and a short report. NEVER passwords, API keys,
tokens, session values, private chat content, or full file contents.
Any argument that looks like a secret is refused and nothing is written.

Schema (version 1, see README): feed has version, source, sourceLabel,
generatedAt, note, workspaces, agents, tasks, events. This script sets
source="live" on every publish, because a published event is, by
definition, a real Muse event -- never publish a fake/seed event with it.

Matching: --workspace, --agent and --task accept an id OR a name/title
(case-insensitive). Unknown workspaces/agents are created with a
slugified id so a new workspace (e.g. "the-delegation") can appear
without hand-editing JSON. Unknown tasks are refused unless
--task-title is given, in which case the task is created.
"""

import argparse
import json
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FEED = REPO_ROOT / "public" / "muse-data.json"

EVENT_TYPES = ("started", "milestone", "file_changed", "commit", "done", "blocked")
STATUSES = ("idle", "running", "done", "blocked", "pending")
LIVE_LABEL = "LIVE — real Muse event feed, updated via the git-based bridge. View-only: control stays in Muse chat."
MAX_EVENTS = 200
MAX_REPORT_LEN = 500

# Refuse anything that looks like a credential: an explicit key/token/
# password/secret assignment, or a single long token-like string.
SECRET_ASSIGN_RE = re.compile(
    r"(?i)(api[_-]?key|token|password|passwd|secret|session|bearer|private[_-]?key)\s*[:=]\s*\S+"
)
LONG_TOKEN_RE = re.compile(r"\b[A-Za-z0-9_\-]{40,}\b")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "item"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def refuse_secret(field: str, value: str) -> None:
    if SECRET_ASSIGN_RE.search(value) or LONG_TOKEN_RE.search(value):
        print(
            f"REFUSED: --{field} looks like a secret (key/token/password or "
            "long token-like string). Nothing was written. Publish metadata "
            "only: names, statuses, file paths, short reports.",
            file=sys.stderr,
        )
        sys.exit(2)


def check_all(args: argparse.Namespace) -> None:
    for field in ("workspace", "agent", "task", "report", "task_title"):
        value = getattr(args, field, None)
        if value:
            refuse_secret(field, value)
    for path in args.files or []:
        refuse_secret("files", path)
        if path.startswith("/") or ".." in Path(path).parts:
            print(f"REFUSED: --files entries must be relative paths, got: {path}",
                  file=sys.stderr)
            sys.exit(2)


def find_entry(entries, value):
    """Find by id, then by case-insensitive name/title."""
    if not value:
        return None
    for entry in entries:
        if entry.get("id") == value:
            return entry
    lowered = value.strip().lower()
    for entry in entries:
        if str(entry.get("name", "")).strip().lower() == lowered:
            return entry
        if str(entry.get("title", "")).strip().lower() == lowered:
            return entry
    return None


def validate(feed: dict) -> None:
    if feed.get("version") != 1:
        raise ValueError("feed version must be 1")
    for key in ("source", "workspaces", "agents", "tasks", "events"):
        if key not in feed:
            raise ValueError(f"feed is missing required key: {key}")
    if feed["source"] not in ("seed", "live"):
        raise ValueError('feed source must be "seed" or "live"')
    for section in ("workspaces", "agents", "tasks", "events"):
        if not isinstance(feed[section], list):
            raise ValueError(f"feed.{section} must be a list")
        for entry in feed[section]:
            if not isinstance(entry, dict) or "id" not in entry:
                raise ValueError(f"feed.{section} entries must be objects with an id")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Publish a milestone event to public/muse-data.json (metadata only)."
    )
    parser.add_argument("--type", dest="type", required=True, choices=EVENT_TYPES,
                        help="Event type: started, milestone, file_changed, commit, done, blocked.")
    parser.add_argument("--workspace", required=True,
                        help="Workspace id or name (created if unknown).")
    parser.add_argument("--agent", default="",
                        help="Agent id or name, e.g. sonia / S.O.N.I.A (created if unknown).")
    parser.add_argument("--task", default="",
                        help="Task id or title (created only if --task-title is given).")
    parser.add_argument("--task-title", default="",
                        help="Title to use when creating a new task.")
    parser.add_argument("--report", required=True,
                        help="Short report (max 500 chars, metadata only, no secrets).")
    parser.add_argument("--files", default="",
                        help="Comma-separated relative file paths changed, if any.")
    parser.add_argument("--agent-status", default="", choices=[""] + list(STATUSES),
                        help="New status for the agent (optional).")
    parser.add_argument("--task-status", default="", choices=[""] + list(STATUSES),
                        help="New status for the task (optional).")
    parser.add_argument("--event-id", default="",
                        help="Explicit event id (default: generated).")
    parser.add_argument("--input-tokens", type=int, default=0,
                        help="Real Muse input tokens for this event (default 0, never negative).")
    parser.add_argument("--output-tokens", type=int, default=0,
                        help="Real Muse output tokens for this event (default 0, never negative).")
    parser.add_argument("--cached-tokens", type=int, default=0,
                        help="Real Muse cached input tokens for this event (default 0, never negative).")
    parser.add_argument("--feed", default=str(DEFAULT_FEED),
                        help="Feed JSON path (default: public/muse-data.json).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate and print the event, do not write the file.")
    args = parser.parse_args(argv)

    if len(args.report) > MAX_REPORT_LEN:
        print(f"REFUSED: --report exceeds {MAX_REPORT_LEN} characters.", file=sys.stderr)
        return 2
    for field in ("input_tokens", "output_tokens", "cached_tokens"):
        if getattr(args, field) < 0:
            print(f"REFUSED: --{field.replace('_', '-')} must not be negative.", file=sys.stderr)
            return 2
    check_all(args)

    feed_path = Path(args.feed)
    try:
        feed = json.loads(feed_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: cannot read valid feed JSON at {feed_path}: {exc}", file=sys.stderr)
        return 1
    try:
        validate(feed)
    except ValueError as exc:
        print(f"ERROR: feed validation failed: {exc}", file=sys.stderr)
        return 1

    # Workspace: match by id/name, else create.
    workspace = find_entry(feed["workspaces"], args.workspace)
    if workspace is None:
        workspace = {
            "id": slugify(args.workspace),
            "name": args.workspace,
            "description": f"Work tracked via the Muse event bridge.",
        }
        feed["workspaces"].append(workspace)

    # Agent: match by id/name, else create.
    agent = None
    if args.agent:
        agent = find_entry(feed["agents"], args.agent)
        if agent is None:
            agent = {
                "id": slugify(args.agent),
                "name": args.agent,
                "role": "builder",
                "workspaceId": workspace["id"],
                "status": args.agent_status or "idle",
                "currentTask": args.task or None,
                "lastReport": args.report,
            }
            feed["agents"].append(agent)
    if agent is not None:
        if args.agent_status:
            agent["status"] = args.agent_status
        if args.task:
            task_for_agent = find_entry(feed["tasks"], args.task)
            agent["currentTask"] = task_for_agent["id"] if task_for_agent else slugify(args.task)
        agent["lastReport"] = args.report
        agent["workspaceId"] = workspace["id"]

    # Task: match, else create only with --task-title, else refuse.
    task = None
    if args.task:
        task = find_entry(feed["tasks"], args.task)
        if task is None:
            if not args.task_title:
                print(
                    f"ERROR: unknown task {args.task!r}. Pass --task-title to "
                    "create it, or use an existing task id/title.",
                    file=sys.stderr,
                )
                return 1
            task = {
                "id": slugify(args.task),
                "title": args.task_title,
                "workspaceId": workspace["id"],
                "agentId": agent["id"] if agent else None,
                "status": args.task_status or "pending",
                "report": args.report,
                "filesChanged": [],
            }
            feed["tasks"].append(task)
        if args.task_status:
            task["status"] = args.task_status
        task["report"] = args.report
        if args.files:
            task["filesChanged"] = [f for f in (p.strip() for p in args.files.split(",")) if f]

    files = [f for f in (p.strip() for p in args.files.split(",")) if f] if args.files else []
    event = {
        "id": args.event_id or f"evt-{datetime.now(timezone.utc):%Y%m%dT%H%M%S}-{uuid.uuid4().hex[:6]}",
        "timestamp": now_iso(),
        "type": args.type,
        "workspaceId": workspace["id"],
        "agentId": agent["id"] if agent else None,
        "taskId": task["id"] if task else None,
        "report": args.report,
        "filesChanged": files,
        "inputTokens": args.input_tokens,
        "outputTokens": args.output_tokens,
        "cachedInputTokens": args.cached_tokens,
    }

    if args.dry_run:
        print(json.dumps(event, indent=2, ensure_ascii=False))
        print("Dry run: nothing written.")
        return 0

    feed["events"].append(event)
    feed["events"] = feed["events"][-MAX_EVENTS:]
    # Feed totals = sum of token fields on the events currently in the
    # feed (so totals move regularly with each published event, and can
    # only fall if old events age out of the 200-event cap — documented).
    feed["tokenUsage"] = {
        "inputTokens": sum(int(e.get("inputTokens") or 0) for e in feed["events"]),
        "outputTokens": sum(int(e.get("outputTokens") or 0) for e in feed["events"]),
        "cachedInputTokens": sum(int(e.get("cachedInputTokens") or 0) for e in feed["events"]),
    }
    feed["source"] = "live"
    feed["sourceLabel"] = LIVE_LABEL
    feed["generatedAt"] = now_iso()

    feed_path.write_text(json.dumps(feed, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
                         encoding="utf-8")
    # Re-read to prove the written file is valid JSON.
    json.loads(feed_path.read_text(encoding="utf-8"))
    print(f"Published event {event['id']} ({event['type']})")
    print(f"  workspace: {workspace['id']}  agent: {event['agentId']}  task: {event['taskId']}")
    if args.agent_status:
        print(f"  agent status -> {args.agent_status}")
    if args.task_status:
        print(f"  task status -> {args.task_status}")
    print(f"  feed: {feed_path}  source: live  events: {len(feed['events'])}")
    print(f"  token totals: {feed['tokenUsage']}")
    print("Next step: git add public/muse-data.json, commit it alone, push to main.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
