#!/bin/zsh
# Adletic link picker — extracts every URL and file path from the current
# tmux pane's scrollback, deduped, picks one via fzf, opens it.
#
# Bound to:  ⌘L (Alacritty) → tmux Prefix+o → this script

emulate -L zsh -o NO_NOMATCH
[[ -r /etc/zprofile ]] && source /etc/zprofile
[[ -r "$HOME/.zprofile" ]] && source "$HOME/.zprofile"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"

EDITOR_APP="Visual Studio Code"

# Grab everything in the calling pane's scrollback (up to 100k lines back).
# `-J` joins wrapped lines so URLs broken across rows still match.
# When invoked from a tmux popup, $TMUX_CALLER_PANE points at the pane that
# triggered us. Without it we'd capture the popup's empty pane.
TARGET="${TMUX_CALLER_PANE:-}"
if [[ -n "$TARGET" ]]; then
  SCROLL=$(tmux capture-pane -p -J -S -100000 -t "$TARGET" 2>/dev/null)
else
  SCROLL=$(tmux capture-pane -p -J -S -100000 2>/dev/null)
fi
[[ -z "$SCROLL" ]] && { echo "no scrollback in current pane"; sleep 1; exit 0; }

items=$(
  print -r -- "$SCROLL" | python3 -c '
import re, sys, os
text = sys.stdin.read()
seen = set()
out = []

# URLs
url_re = re.compile(r"\b(?:ipfs:|ipns:|magnet:|mailto:|gemini://|gopher://|https?://|news:|file:|git://|ssh:|ftp://)[^\s<>\"`{}|^]+")
for m in url_re.findall(text):
    m = m.rstrip(".,;:!?)]}>")
    if m not in seen:
        seen.add(m)
        out.append(("url", m))

# File paths: absolute, ~/, ./, ../, or bare relative
path_re = re.compile(r"(?:~/|\.{1,2}/|/)[\w\-./]+\.[\w]+(?::\d+(?::\d+)?)?|(?:[\w\-]+/)+[\w\-]+\.[\w]+(?::\d+(?::\d+)?)?")
for m in path_re.findall(text):
    if m in seen:
        continue
    bare = m.split(":")[0]
    bare_expanded = os.path.expanduser(bare)
    if os.path.exists(bare_expanded):
        seen.add(m)
        out.append(("file", m))

out.sort(key=lambda x: (x[0] != "url", x[1]))
for kind, val in out:
    icon = "L" if kind == "url" else "F"
    print(f"{icon}  {val}")
'
)

if [[ -z "$items" ]]; then
  echo "no links or file paths found in this pane"
  sleep 1
  exit 0
fi

count=$(print -r -- "$items" | wc -l | tr -d ' ')

selected=$(print -r -- "$items" | fzf \
  --reverse \
  --prompt="open → " \
  --header="$count links / paths in this pane (L=URL, F=file)" \
  --height=100%)

[[ -z "$selected" ]] && exit 0

# Strip the leading "L  " or "F  " marker
target=${selected#*  }
target=${target## }

case "$target" in
  http://*|https://*|ipfs:*|ipns:*|magnet:*|mailto:*|gemini://*|gopher://*|news:*|file:*|git://*|ssh:*|ftp://*)
    open "$target"
    ;;
  *)
    bare="${target%%:*}"
    bare="${bare/#\~/$HOME}"
    if [[ -e "$bare" ]]; then
      open -a "$EDITOR_APP" "$bare"
    else
      echo "not found: $bare"
      sleep 1
    fi
    ;;
esac
