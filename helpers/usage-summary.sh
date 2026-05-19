#!/usr/bin/env bash
# Print a one-line usage summary for the tmux status bar.
# Format: "Today 393M · $977 · 32d"
#
# Reads from ~/.claude/projects/*/jsonl. Caches results for 30s so the
# status bar (refresh every 2s) doesn't reparse every tick.
set -euo pipefail

CACHE="$HOME/.aios/state/usage-summary.cache"
mkdir -p "$(dirname "$CACHE")"

# Use the cached value if it's fresh (<30s old).
if [[ -f "$CACHE" ]]; then
  now=$(date +%s)
  mtime=$(stat -f %m "$CACHE" 2>/dev/null || echo 0)
  if (( now - mtime < 30 )); then
    cat "$CACHE"
    exit 0
  fi
fi

# Compute fresh.
python3 - <<'PY' > "$CACHE.tmp"
import json, os
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

root = Path(os.path.expanduser("~/.claude/projects"))
if not root.is_dir():
    print("Usage: —")
    raise SystemExit

today = datetime.now().date()
tokens_today = 0
cost_today = 0.0
by_day: dict[str, int] = defaultdict(int)

def cost(model: str, inp: int, out: int, creation: int, read: int) -> float:
    m = (model or "").lower()
    if "opus" in m:
        return inp*15e-6 + out*75e-6 + read*1.5e-6 + creation*18.75e-6
    if "sonnet" in m:
        return inp*3e-6 + out*15e-6 + read*0.3e-6 + creation*3.75e-6
    if "haiku" in m:
        return inp*0.8e-6 + out*4e-6 + read*0.08e-6 + creation*1.0e-6
    return 0.0

for jsonl in root.rglob("*.jsonl"):
    try:
        with jsonl.open("r", errors="ignore") as f:
            for line in f:
                line=line.strip()
                if not line: continue
                try: rec=json.loads(line)
                except: continue
                ts_str = rec.get("timestamp","")
                try:
                    ts = datetime.fromisoformat(ts_str.replace("Z","+00:00"))
                except:
                    continue
                d = ts.astimezone().date()
                by_day[d.isoformat()] += 1
                if d == today:
                    msg = rec.get("message") or {}
                    u = msg.get("usage") or {}
                    inp = int(u.get("input_tokens",0) or 0)
                    out = int(u.get("output_tokens",0) or 0)
                    cre = int(u.get("cache_creation_input_tokens",0) or 0)
                    rd  = int(u.get("cache_read_input_tokens",0) or 0)
                    tokens_today += inp+out+cre+rd
                    cost_today += cost(msg.get("model",""), inp, out, cre, rd)
    except: pass

# streak — contiguous days back from today
streak = 0
d = today
while by_day.get(d.isoformat(), 0) > 0:
    streak += 1
    d = d - timedelta(days=1)

def compact(n):
    if n >= 1_000_000: return f"{n/1_000_000:.0f}M"
    if n >= 1_000: return f"{n/1_000:.0f}K"
    return str(n)

# orange tokens for the static info — these get inlined into the status string
# directly (no tmux #[...] needed; the parent context paints).
print(f"Today {compact(tokens_today)} · ${cost_today:.0f} · {streak}d")
PY
mv "$CACHE.tmp" "$CACHE"
cat "$CACHE"
