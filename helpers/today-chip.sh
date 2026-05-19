#!/usr/bin/env bash
# today-chip.sh — count today's Claude Code activity from local JSONL.
# Counts assistant turns across all projects in ~/.claude/projects/.
# Cached for 30s — cheap but not free (scans transcripts).

set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

CACHE_DIR="$HOME/.cache/adletic"
CACHE="$CACHE_DIR/today.txt"
TTL=30
mkdir -p "$CACHE_DIR"

if [[ -f "$CACHE" ]] && (( $(date +%s) - $(stat -f %m "$CACHE") < TTL )); then
  cat "$CACHE"
  exit 0
fi

OUT=$(python3 - <<'PY'
import json, time
from datetime import datetime, timezone, timedelta
from pathlib import Path
cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
cutoff_ts = cutoff.timestamp()
turns = 0
sess = set()
root = Path.home() / ".claude" / "projects"
if root.exists():
    for jsonl in root.glob("*/*.jsonl"):
        try:
            if jsonl.stat().st_mtime < cutoff_ts:
                continue
            with jsonl.open() as f:
                for line in f:
                    line = line.strip()
                    if not line: continue
                    try: rec = json.loads(line)
                    except Exception: continue
                    msg = rec.get("message") or {}
                    if not isinstance(msg, dict): continue
                    if msg.get("role") != "assistant": continue
                    ts = rec.get("timestamp", "")
                    try:
                        t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    except Exception:
                        continue
                    if t < cutoff: continue
                    turns += 1
                    sid = rec.get("sessionId") or rec.get("session_id") or ""
                    if sid: sess.add(sid)
        except Exception:
            continue
if turns:
    if turns >= 10000:
        label = f"{turns/1000:.0f}k"
    elif turns >= 1000:
        label = f"{turns/1000:.1f}k"
    else:
        label = str(turns)
    print(f"#[fg=#a0a0a0]{label} turns")
PY
)

printf '%s' "$OUT" > "$CACHE"
printf '%s' "$OUT"
