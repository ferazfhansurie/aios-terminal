#!/bin/zsh
# helpers/hud.sh — render the status-right cost block when claude is focused.
# Output empty when no active claude or when CLI cost surface is missing.
#
# Called from tmux status-right with the focused pane's path:
#   #(~/.config/adletic/helpers/hud.sh #{pane_current_path})
#
# PF-1 finding (NOTES.md): the claude CLI has no public cost surface.
# We read the JSONL transcript at ~/.claude/projects/<encoded-cwd>/<uuid>.jsonl
# and sum input/output/cache token usage from the latest session for the cwd.

set -eu

# Ensure helpers can find python3 / awk / etc when tmux strips PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

CACHE_DIR="$HOME/.cache/adletic"
mkdir -p "$CACHE_DIR"

# cwd from arg (passed by tmux), fallback to $PWD.
cwd="${1:-$PWD}"
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
  # Returns space-separated: model session_in session_out ctx_used
  #   session_in/out → cumulative across the whole transcript (session size)
  #   ctx_used       → token count active in the LATEST assistant turn (the
  #                    number that matters for "how full is the window")
  # Empty when no transcript exists for the current cwd.
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
last_ctx = 0
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
    cur_in = int(u.get("input_tokens", 0) or 0) \
           + int(u.get("cache_creation_input_tokens", 0) or 0) \
           + int(u.get("cache_read_input_tokens", 0) or 0)
    cur_out = int(u.get("output_tokens", 0) or 0)
    in_t += cur_in
    out_t += cur_out
    last_ctx = cur_in + cur_out
if model:
    print(f"{model} {in_t} {out_t} {last_ctx}")
PY
}

raw=$(read_claude_cost)

if [[ -z "$raw" ]]; then
  print -n -- "" >| "$CACHE"
  exit 0
fi

typeset -a _f
_f=(${=raw})
read_model="${_f[1]}"
in_toks="${_f[2]}"
out_toks="${_f[3]}"
ctx_used="${_f[4]:-0}"

if [[ -z "$read_model" || -z "$in_toks" || -z "$out_toks" ]]; then
  print -n -- "" >| "$CACHE"
  exit 0
fi

fmt_toks() {
  local n=$1
  if (( n >= 1000000 )); then
    awk -v t="$n" 'BEGIN{printf "%.1fM", t/1000000}'
  elif (( n >= 1000 )); then
    awk -v t="$n" 'BEGIN{printf "%.1fk", t/1000}'
  else
    print -- "$n"
  fi
}

# Context window. Default to 1M for Opus 4.x (the 1M-context variants are
# what we run); 200k otherwise. The model field in JSONL doesn't carry a
# "1m" suffix, so we infer from the family. Override via $ADLETIC_CONTEXT_MAX.
if [[ -n "${ADLETIC_CONTEXT_MAX:-}" ]]; then
  ctx_max="$ADLETIC_CONTEXT_MAX"
elif [[ "$read_model" == claude-opus-4-* ]]; then
  ctx_max=1000000
else
  ctx_max=200000
fi
ctx_max_fmt=$(fmt_toks "$ctx_max")
ctx_used_fmt=$(fmt_toks "$ctx_used")

ctx_pct=$(awk -v c="$ctx_used" -v m="$ctx_max" 'BEGIN{p=(m>0)?(c*100/m):0; if(p>100)p=100; printf "%d", p}')
filled=$(( ctx_pct / 10 ))
(( filled > 10 )) && filled=10
empty=$(( 10 - filled ))
bar=""
for ((i=0; i<filled; i++)); do bar="${bar}▰"; done
for ((i=0; i<empty;  i++)); do bar="${bar}▱"; done
if (( ctx_pct >= 70 )); then
  bar_seg="#[fg=#f26522]${bar} ${ctx_pct}%#[fg=#a0a0a0]"
else
  bar_seg="#[fg=#666666]${bar} #[fg=#a0a0a0]${ctx_pct}%"
fi

# Display: model · used/max · bar pct
# `used` = tokens consumed by the most recent assistant turn (active context).
# Cumulative session tokens are intentionally NOT shown — with prompt caching
# they balloon into tens of millions and don't reflect anything actionable.
out="${read_model} · ${ctx_used_fmt}/${ctx_max_fmt} · ${bar_seg}"
print -n -- "$out" >| "$CACHE"
print -- "$out"
