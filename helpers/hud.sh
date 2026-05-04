#!/bin/zsh
# helpers/hud.sh — render the status-right cost block when claude is focused.
# Output empty when no active claude or when CLI cost surface is missing.
#
# PF-1 finding (NOTES.md): the claude CLI has no public cost surface.
# We read the JSONL transcript at ~/.claude/projects/<encoded-cwd>/<uuid>.jsonl
# and sum input/output/cache token usage from the latest session for the cwd.

set -eu

CACHE_DIR="$HOME/.cache/adletic"
mkdir -p "$CACHE_DIR"

# Resolve cwd from the caller's tmux pane (helpers run from tmux status-right).
# Fall back to $PWD when not inside tmux.
if [[ -n "${TMUX:-}" ]] && command -v tmux >/dev/null 2>&1; then
  cwd=$(tmux -L adletic display-message -p '#{pane_current_path}' 2>/dev/null \
        || tmux display-message -p '#{pane_current_path}' 2>/dev/null \
        || print -- "$PWD")
else
  cwd="$PWD"
fi
[[ -z "$cwd" ]] && cwd="$PWD"

# Cache key: hash of cwd → 10s TTL (JSONL parse can be slow on big sessions).
HASH=$(print -- "$cwd" | md5)
CACHE="$CACHE_DIR/claude-cost-${HASH}.txt"

if [[ -f "$CACHE" ]]; then
  age=$(( $(date +%s) - $(stat -f %m "$CACHE") ))
  if (( age < 10 )); then
    cat "$CACHE"; exit 0
  fi
fi

read_claude_cost() {
  # Returns three space-separated fields: model in_tokens out_tokens
  # Or returns empty if no transcript exists for the current cwd.
  local encoded proj_dir latest
  encoded="${cwd//\//-}"   # replace / with -
  encoded="${encoded#-}"   # strip leading -
  proj_dir="$HOME/.claude/projects/-$encoded"
  [[ -d "$proj_dir" ]] || return 0

  latest=$(ls -t "$proj_dir"/*.jsonl 2>/dev/null | head -1)
  [[ -z "$latest" ]] && return 0

  python3 - "$latest" <<'PY'
import json, sys, pathlib
p = pathlib.Path(sys.argv[1])
model, in_t, out_t = "", 0, 0
try:
    text = p.read_text(errors="ignore")
except Exception:
    sys.exit(0)
for line in text.splitlines():
    line = line.strip()
    if not line:
        continue
    try:
        rec = json.loads(line)
    except Exception:
        continue
    msg = rec.get("message", {})
    if not isinstance(msg, dict):
        continue
    if msg.get("role") != "assistant":
        continue
    m = msg.get("model")
    if m:
        model = m
    u = msg.get("usage", {})
    if not isinstance(u, dict):
        continue
    in_t += int(u.get("input_tokens", 0) or 0)
    in_t += int(u.get("cache_creation_input_tokens", 0) or 0)
    in_t += int(u.get("cache_read_input_tokens", 0) or 0)
    out_t += int(u.get("output_tokens", 0) or 0)
if model:
    print(f"{model} {in_t} {out_t}")
PY
}

raw=$(read_claude_cost)

if [[ -z "$raw" ]]; then
  print -n -- "" >| "$CACHE"
  exit 0
fi

read_model="${raw%% *}"
rest="${raw#* }"
in_toks="${rest%% *}"
out_toks="${rest##* }"

if [[ -z "$read_model" || -z "$in_toks" || -z "$out_toks" ]]; then
  print -n -- "" >| "$CACHE"
  exit 0
fi

# Format token count: 12400 -> 12.4k
total_toks=$(( in_toks + out_toks ))
if (( total_toks >= 1000 )); then
  toks_fmt=$(awk -v t="$total_toks" 'BEGIN{printf "%.1fk", t/1000}')
else
  toks_fmt="${total_toks}"
fi

usd=$("$HOME/.config/adletic/helpers/pricing.sh" "$read_model" "$in_toks" "$out_toks" 2>/dev/null || print 0)
fx=$("$HOME/.config/adletic/helpers/fx.sh" 2>/dev/null || print 4.70)
myr=$(awk -v u="$usd" -v f="$fx" 'BEGIN{printf "%.2f", u*f}')

out="${read_model} · ${toks_fmt} tok · \$${usd} · RM${myr}"
print -n -- "$out" >| "$CACHE"
print -- "$out"
