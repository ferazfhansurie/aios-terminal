#!/usr/bin/env bash
# session-picker.sh — fzf picker over tmux sessions on adletic socket.
# Each row shows: session_name · ●current-marker · last-prompt-preview
# Keys: enter=switch · ctrl-x=kill · ctrl-r=rename · ctrl-n=new · esc=cancel
# aios-oracle-* sessions are pinned to the top.

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

SOCKET="adletic"
PEERS="$HOME/.aios/state/peers"
T() { tmux -L "$SOCKET" "$@"; }

# Walk parents of a pid until we find one that owns a tmux pane.
# Args: $1=pid, returns tmux session name on stdout (or empty).
session_for_pid() {
  local pid="$1"
  local cur="$pid"
  for _ in 1 2 3 4 5 6 7 8; do
    [[ -z "$cur" || "$cur" == "1" ]] && return
    local sess
    sess=$(T list-panes -a -F '#{pane_pid} #{session_name}' 2>/dev/null \
      | awk -v p="$cur" '$1==p {print $2; exit}')
    if [[ -n "$sess" ]]; then printf '%s' "$sess"; return; fi
    cur=$(ps -o ppid= -p "$cur" 2>/dev/null | tr -d ' ')
  done
}

# Build session → preview map. Sources, in priority:
#   1. aios-oracle-<phone>     → hardcoded "🤖 WA bot · <person>"
#   2. peer-state JSONs        → claude's last_prompt for that tmux session
#   3. tmux pane title/cmd     → fallback so EVERY session has a label
build_session_meta() {
  python3 - "$SOCKET" "$PEERS" << 'PY'
import json, glob, os, subprocess, sys

socket, peers_dir = sys.argv[1], sys.argv[2]

# Phone → person map for oracle labels. Edit here when new tenants come on.
PHONE_NAMES = {
    '601121677522': 'firaz',
    '60102883131':  'musa (papa)',
    '60162089049':  'putri',
    '60900000099':  'test phone',
    '60900000001':  'synth',
}

def run(*a):
    try: return subprocess.run(a, capture_output=True, text=True).stdout
    except: return ''

# tmux pane_pid → session_name + pane info
pane_lines = run('tmux','-L',socket,'list-panes','-a',
                 '-F','#{pane_pid}\t#{session_name}\t#{pane_current_command}\t#{pane_title}').strip().split('\n')
pid_to_sess = {}
sess_to_pane_info = {}  # session → (cmd, title)
for line in pane_lines:
    if not line.strip(): continue
    parts = line.split('\t')
    if len(parts) < 2: continue
    pid = int(parts[0]); sess = parts[1]
    cmd = parts[2] if len(parts) > 2 else ''
    title = parts[3] if len(parts) > 3 else ''
    pid_to_sess[pid] = sess
    # Prefer non-shell pane info if multiple panes
    cur = sess_to_pane_info.get(sess, ('', ''))
    if cmd and cmd not in ('zsh','bash','sh','login') and not cur[0]:
        sess_to_pane_info[sess] = (cmd, title)
    elif not cur[0]:
        sess_to_pane_info[sess] = (cmd, title)

def parent(pid):
    try: return int(run('ps','-o','ppid=','-p',str(pid)).strip())
    except: return None
def session_for(pid):
    cur = pid
    for _ in range(8):
        if cur in pid_to_sess: return pid_to_sess[cur]
        p = parent(cur)
        if not p or p == 1: return None
        cur = p
    return None

# 1) peer-state pass
session_meta = {}  # session → (rank, label, last_active)
for f in glob.glob(os.path.join(peers_dir, '*.json')):
    try: d = json.load(open(f))
    except: continue
    pid = d.get('pid')
    if not pid: continue
    sess = session_for(pid)
    if not sess: continue
    pc = d.get('prompts_count', 0)
    la = d.get('last_active', '')
    lp = (d.get('last_prompt') or '').replace('\n', ' ').replace('\t', ' ').strip()
    label = lp[:60] if lp else ''
    cur = session_meta.get(sess)
    if cur is None or pc > cur[0] or la > cur[2]:
        session_meta[sess] = (pc, label, la)

# 2) fill in any session we missed using pane info
all_sessions = set(pid_to_sess.values())
for sess in all_sessions:
    if sess in session_meta and session_meta[sess][1]:
        continue
    # 2a) oracle? hardcode by phone
    if sess.startswith('aios-oracle-'):
        phone = sess[len('aios-oracle-'):]
        person = PHONE_NAMES.get(phone, phone)
        session_meta[sess] = (0, f'🤖 WA bot · {person}', '')
        continue
    # 2b) fall back to pane command + title
    cmd, title = sess_to_pane_info.get(sess, ('', ''))
    label = ''
    if cmd and cmd not in ('zsh','bash','sh','login'):
        label = f'[{cmd}] {title}'.strip()
    elif title and title != os.uname().nodename:
        label = title
    session_meta[sess] = (0, label[:60], '')

for s, (_, label, _) in session_meta.items():
    print(f"{s}\t{label}")
PY
}

# Build the picker list. Format: <sort_rank>\t<display_line>\t<session_name>
build_list() {
  local current
  current=$(T display-message -p '#{session_name}' 2>/dev/null || echo '')
  # Meta map → associative array (zsh) / file (portable)
  local meta_file
  meta_file=$(mktemp)
  build_session_meta > "$meta_file"
  local row
  while IFS= read -r session; do
    [[ -z "$session" ]] && continue
    local preview
    preview=$(awk -F'\t' -v s="$session" '$1==s {print $2}' "$meta_file" | head -1)
    local marker="·"
    [[ "$session" == "$current" ]] && marker="●"
    # Truncate preview to fit
    local short_preview="${preview:0:55}"
    local rank=1
    [[ "$session" == aios-oracle-* ]] && rank=0
    # Embed session name as a tab-delimited hidden field at the end so parsing
    # is robust regardless of marker / preview content. fzf will display the
    # visible columns; we recover the session via the hidden tail field.
    printf "%d\t%s %-30s  %s\t%s\n" "$rank" "$marker" "$session" "${short_preview:-—}" "$session"
  done < <(T list-sessions -F '#{session_name}' 2>/dev/null)
  rm -f "$meta_file"
}

while true; do
  # Lines from build_list look like:  <rank>\t<visible>\t<session_name>
  # We sort by rank, then strip the rank field. fzf is told to hide the
  # trailing session_name field via --with-nth=1 and to use it as the
  # accept-value via --delimiter=$'\t' --accept-nth=2.
  RAW=$(build_list | sort -k1,1 -k3,3 | cut -f2-)
  if [[ -z "$RAW" ]]; then
    T display-message "no sessions"
    exit 0
  fi

  HEADER=$(printf "%s\n%s\n%s" \
    "enter=switch · ctrl-x=kill · ctrl-r=rename · ctrl-n=new · esc=cancel" \
    "● = current session · aios-oracle-* pinned on top" \
    "preview = last prompt to the claude in that session")

  # --delimiter tab, --with-nth=1 (show only visible col), --accept-nth=2
  # (return only the session name on accept). This makes parsing rock-solid
  # regardless of marker/preview content.
  RESULT=$(printf '%s\n' "$RAW" \
    | fzf --prompt 'aios session> ' \
          --header "$HEADER" \
          --no-mouse --reverse \
          --delimiter=$'\t' --with-nth=1 --accept-nth=2 \
          --expect=ctrl-x,ctrl-r,ctrl-n) || exit 0

  KEY=$(printf '%s' "$RESULT" | sed -n '1p')
  PICK=$(printf '%s' "$RESULT" | sed -n '2p')

  case "$KEY" in
    "")
      [[ -n "$PICK" ]] && T switch-client -t "$PICK"
      exit 0
      ;;
    ctrl-x)
      [[ -z "$PICK" ]] && exit 0
      CURRENT=$(T display-message -p '#{session_name}' 2>/dev/null || echo '')
      if [[ "$PICK" == "$CURRENT" ]]; then
        T display-message "can't kill the session you're attached to"
        continue
      fi
      CONFIRM=$(printf 'yes\nno' | fzf --prompt "kill '$PICK'? > " --no-mouse --reverse --header "select yes to delete · esc to cancel") || continue
      if [[ "$CONFIRM" == "yes" ]]; then
        T kill-session -t "$PICK" 2>/dev/null && T display-message "killed $PICK"
      fi
      continue
      ;;
    ctrl-r)
      [[ -z "$PICK" ]] && exit 0
      printf "new name for '%s' (empty cancels): " "$PICK" >&2
      read -r NEW_NAME
      if [[ -n "${NEW_NAME:-}" ]]; then
        if T rename-session -t "$PICK" "$NEW_NAME" 2>/dev/null; then
          T display-message "renamed $PICK → $NEW_NAME"
        else
          T display-message "rename failed (name taken?)"
        fi
      fi
      continue
      ;;
    ctrl-n)
      printf "new session name (empty cancels): " >&2
      read -r NEW_NAME
      if [[ -n "${NEW_NAME:-}" ]]; then
        if T new-session -d -s "$NEW_NAME" -c "$HOME" 2>/dev/null; then
          T switch-client -t "$NEW_NAME"
          exit 0
        else
          T display-message "create failed (name taken?)"
        fi
      fi
      continue
      ;;
  esac
done
