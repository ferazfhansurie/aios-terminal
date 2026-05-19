#!/usr/bin/env bash
# browser-bookmarks.example.sh — fzf bookmark picker → open in default browser.
# On first install, copy this to browser-bookmarks.sh and edit the BOOKMARKS
# heredoc below. The real file is gitignored so your personal URLs stay local.
# Format: label<TAB>url
# Keys: enter=open · esc=cancel · ctrl-n=paste a custom URL

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Generic starter list — replace these with your own.
BOOKMARKS=$(cat <<'EOF'
claude.ai	https://claude.ai
claude.ai usage	https://claude.ai/settings/usage
github	https://github.com
vercel dashboard	https://vercel.com/dashboard
gmail	https://mail.google.com
google calendar	https://calendar.google.com
linear	https://linear.app
notion	https://notion.so
hacker news	https://news.ycombinator.com
EOF
)

PICK=$(printf '%s\n' "$BOOKMARKS" | column -t -s $'\t' \
  | fzf --prompt 'browser> ' \
        --header 'enter=open · ctrl-n=custom URL · esc=cancel' \
        --no-mouse --reverse \
        --expect=ctrl-n) || exit 0

KEY=$(printf '%s' "$PICK" | sed -n '1p')
ROW=$(printf '%s' "$PICK" | sed -n '2p')

if [[ "$KEY" == "ctrl-n" ]]; then
  printf 'URL (empty cancels): ' >&2
  read -r URL
  [[ -z "${URL:-}" ]] && exit 0
  [[ "$URL" == *"://"* ]] || URL="https://${URL}"
  open "$URL"
  exit 0
fi

[[ -z "${ROW:-}" ]] && exit 0
LABEL=$(printf '%s' "$ROW" | awk '{$NF=""; sub(/[ \t]+$/, ""); print}')
URL=$(printf '%s' "$BOOKMARKS" | awk -F'\t' -v l="$LABEL" '$1==l {print $2; exit}')
[[ -z "$URL" ]] && URL=$(printf '%s' "$ROW" | awk '{print $NF}')
[[ -z "$URL" ]] && exit 0
open "$URL"
