#!/usr/bin/env python3
"""Token Observer for the view-only Delegation fork.

Keeps the dashboard's Token Usage panel in step with ALL of Muse's
chats -- including chats from before today -- without ever inventing
a count and without double-counting.

Source of truth (read by the caller, NOT by this script): the
muse.db table agent.agent_message_token_usage (agent_id, message_id,
input_tokens, output_tokens, created_at as epoch seconds). The
agent.token_usage table is empty and must NOT be used. There is no
cached-input column in that table, so cached is always 0 here.

WHY THE RESIDUAL METHOD: the dashboard panel computes its totals as
the SUM over token fields on the events currently in the feed (max
200 events). If this observer appended a new event on every run,
old deltas would age out after 200 events and the totals would fall.
So this script maintains exactly ONE observer event in the feed
(id "token-observer") whose token fields are:

    residual = (DB totals) - (sum of token fields on ALL OTHER events)

and sets feed.tokenUsage to the DB totals themselves. On each run
it UPDATEs that one event in place -- it never appends an event,
never touches workspaces/agents/tasks, and if the computed residual
already equals the current observer event values (and tokenUsage
already equals the DB totals), it writes NOTHING, so a run with no
new tokens produces no push.

HONESTY (the panel note in src/interface/ProjectView.tsx says this
too): input tokens in agent_message_token_usage are PER-TURN CONTEXT
size (200k-5M per message), not new tokens written -- summing them
gives context tokens processed. Price at Muse Spark 1.3 Standard
rates ($1.25/1M input, $4.25/1M output, $0.15/1M cached) is therefore
an ESTIMATE, not a Meta bill, and the cached breakdown is unknown
(cached shown as 0). Never present the total as a bill.

Usage (the caller supplies the DB totals; this script never queries
a database itself and never holds a credential):
    python3 scripts/token-observer.py \
        --db-input 4939806017 --db-output 26150433
    python3 scripts/token-observer.py --db-json /tmp/db-totals.json
    python3 scripts/token-observer.py --db-input 100 --db-output 50 \
        --feed /tmp/feed-copy.json   # test copy; real feed untouched
    python3 scripts/token-observer.py --db-input 100 --db-output 50 \
        --dry-run                     # prints, writes nothing

DB JSON format (if --db-json is used): keys input_tokens /
output_tokens / cached_input_tokens, or inputTokens / outputTokens /
cachedInputTokens. CLI arguments override JSON values when given.

What is written: metadata only -- counts, never passwords, API keys,
tokens, session values, or private chat content. Any argument that
looks like a secret is refused and nothing is written, exactly like
scripts/publish-muse-event.py. The caller (parent cron) then commits
only public/muse-data.json and pushes to main when this script
changed the file; a no-change run needs no commit and no push.
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

OBSERVER_EVENT_ID = "token-observer"
OBSERVER_WORKSPACE = "the-delegation"
OBSERVER_AGENT = "sonia"
OBSERVER_REPORT = (
    "Token observer: cumulative totals from all Muse chats, "
    "updated from muse.db"
)
LIVE_LABEL = (
    "LIVE — real Muse event feed, updated via the git-based bridge. "
    "View-only: control stays in Muse chat."
)

# Refuse anything that looks like a credential: an explicit key/token/
# password/secret assignment, or a single long token-like string.
# Mirrors scripts/publish-muse-event.py (counts themselves are numbers
# and are never checked against this pattern).
SECRET_ASSIGN_RE = re.compile(
    r"(?i)(api[_-]?key|token|password|passwd|secret|session|bearer|private[_-]?key)\s*[:=]\s*\S+"
)
LONG_TOKEN_RE = re.compile(r"\b[A-Za-z0-9_\-]{40,}\b")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def refuse_secret(field: str, value: str) -> None:
    if SECRET_ASSIGN_RE.search(value) or LONG_TOKEN_RE.search(value):
        print(
            f"REFUSED: --{field} looks like a secret (key/token/password or "
            "long token-like string). Nothing was written. Counts only: "
            "numbers, never credentials.",
            file=sys.stderr,
        )
        sys.exit(2)


def nonneg_int(value, field: str) -> int:
    """Coerce a token field to a non-negative int (missing -> 0)."""
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0
    return max(0, number)


def load_db_totals(args) -> dict:
    totals = {"inputTokens": None, "outputTokens": None, "cachedInputTokens": 0}
    if args.db_json:
        refuse_secret("db-json", args.db_json)
        try:
            raw = json.loads(Path(args.db_json).read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            print(f"REFUSED: cannot read --db-json: {exc}", file=sys.stderr)
            sys.exit(2)
        if not isinstance(raw, dict):
            print("REFUSED: --db-json must be a JSON object.", file=sys.stderr)
            sys.exit(2)
        totals["inputTokens"] = raw.get("input_tokens", raw.get("inputTokens"))
        totals["outputTokens"] = raw.get("output_tokens", raw.get("outputTokens"))
        totals["cachedInputTokens"] = raw.get(
            "cached_input_tokens", raw.get("cachedInputTokens", 0)
        )
    if args.db_input is not None:
        totals["inputTokens"] = args.db_input
    if args.db_output is not None:
        totals["outputTokens"] = args.db_output
    if args.db_cached is not None:
        totals["cachedInputTokens"] = args.db_cached
    if totals["inputTokens"] is None or totals["outputTokens"] is None:
        print(
            "REFUSED: DB totals need --db-input and --db-output, or a "
            "--db-json file carrying input_tokens/output_tokens.",
            file=sys.stderr,
        )
        sys.exit(2)
    return {
        "inputTokens": nonneg_int(totals["inputTokens"], "input"),
        "outputTokens": nonneg_int(totals["outputTokens"], "output"),
        "cachedInputTokens": nonneg_int(totals["cachedInputTokens"], "cached"),
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Update the single token-observer event in the Muse feed."
    )
    parser.add_argument(
        "--feed",
        default="public/muse-data.json",
        help="Feed JSON to update (default: public/muse-data.json).",
    )
    parser.add_argument("--db-input", type=int, default=None,
                        help="DB total input tokens (non-negative).")
    parser.add_argument("--db-output", type=int, default=None,
                        help="DB total output tokens (non-negative).")
    parser.add_argument("--db-cached", type=int, default=None,
                        help="DB total cached input tokens (default 0: "
                        "agent_message_token_usage has no cached column).")
    parser.add_argument("--db-json", default=None,
                        help="JSON file with DB totals (see script header).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print the computed values, write nothing.")
    args = parser.parse_args(argv)

    for attr, label in (("feed", "feed"), ("db_json", "db-json")):
        value = getattr(args, attr)
        if value:
            refuse_secret(label, value)
    for field in ("db_input", "db_output", "db_cached"):
        value = getattr(args, field)
        if value is not None and value < 0:
            print(f"REFUSED: --{field.replace('_', '-')} must not be negative.",
                  file=sys.stderr)
            return 2

    db = load_db_totals(args)
    feed_path = Path(args.feed)
    try:
        feed = json.loads(feed_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"REFUSED: cannot read feed {feed_path}: {exc}", file=sys.stderr)
        return 2
    if not isinstance(feed, dict):
        print("REFUSED: feed must be a JSON object.", file=sys.stderr)
        return 2
    events = feed.get("events")
    if not isinstance(events, list):
        print("REFUSED: feed has no events list.", file=sys.stderr)
        return 2

    # Sum token fields on ALL OTHER events only -- the observer event
    # itself must never be counted, or the residual would chase itself.
    other = {"inputTokens": 0, "outputTokens": 0, "cachedInputTokens": 0}
    observer = None
    for event in events:
        if not isinstance(event, dict):
            continue
        if event.get("id") == OBSERVER_EVENT_ID:
            observer = event
            continue
        for key in other:
            other[key] += nonneg_int(event.get(key), key)

    # Residual, floored at 0: if other events ever carry more than the
    # DB totals (stale DB read, or a miscount), the observer goes to 0
    # rather than negative, and the panel still shows the DB totals
    # via feed.tokenUsage.
    residual = {
        key: max(0, db[key] - other[key]) for key in other
    }

    old_observer = (
        {
            "inputTokens": nonneg_int(observer.get("inputTokens"), "input"),
            "outputTokens": nonneg_int(observer.get("outputTokens"), "output"),
            "cachedInputTokens": nonneg_int(
                observer.get("cachedInputTokens"), "cached"
            ),
        }
        if observer is not None
        else None
    )
    old_usage = feed.get("tokenUsage") or {}
    old_usage = {
        "inputTokens": nonneg_int(old_usage.get("inputTokens"), "input"),
        "outputTokens": nonneg_int(old_usage.get("outputTokens"), "output"),
        "cachedInputTokens": nonneg_int(
            old_usage.get("cachedInputTokens"), "cached"
        ),
    }

    if old_observer == residual and old_usage == db:
        print("No change: observer event and feed.tokenUsage already match "
              "the DB totals. Nothing written, no commit needed.")
        print(f"  DB totals:      {db}")
        print(f"  other events:   {other}")
        print(f"  observer event: {old_observer}")
        return 0

    if args.dry_run:
        print("Dry run: nothing written.")
        print(f"  DB totals:      {db}")
        print(f"  other events:   {other}")
        print(f"  residual:       {residual}")
        print(f"  old observer:   {old_observer}")
        print(f"  old tokenUsage: {old_usage}")
        return 0

    if observer is None:
        observer = {
            "id": OBSERVER_EVENT_ID,
            "type": "milestone",
            "workspaceId": OBSERVER_WORKSPACE,
            "agentId": OBSERVER_AGENT,
            "report": OBSERVER_REPORT,
        }
        events.append(observer)
    observer.update(
        {
            "timestamp": now_iso(),
            "type": "milestone",
            "workspaceId": OBSERVER_WORKSPACE,
            "agentId": OBSERVER_AGENT,
            "report": OBSERVER_REPORT,
            "inputTokens": residual["inputTokens"],
            "outputTokens": residual["outputTokens"],
            "cachedInputTokens": residual["cachedInputTokens"],
        }
    )
    feed["events"] = events
    feed["tokenUsage"] = dict(db)
    feed["source"] = "live"
    if not feed.get("sourceLabel"):
        feed["sourceLabel"] = LIVE_LABEL
    feed["generatedAt"] = now_iso()

    feed_path.write_text(
        json.dumps(feed, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    # Re-read to prove the written file is valid JSON.
    json.loads(feed_path.read_text(encoding="utf-8"))
    print(f"Updated observer event {OBSERVER_EVENT_ID} in {feed_path}")
    print(f"  DB totals:      {db}")
    print(f"  other events:   {other}")
    print(f"  residual:       {residual}")
    print(f"  old observer:   {old_observer}")
    print(f"  feed.tokenUsage now: {db}")
    print("Next step (parent/cron only): git add public/muse-data.json, "
          "commit it alone, push to main.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
