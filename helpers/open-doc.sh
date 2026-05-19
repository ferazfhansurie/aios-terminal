#!/usr/bin/env bash
# open-doc.sh — sibling to drop-doc.sh.
# drop-doc: pick file → paste @path into the terminal (for claude).
# open-doc: pick file → open it in the default macOS app (or VS Code if it's
#           a code-y extension).
# Triggered by clicking the [ open ] button in the tmux status bar.

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

PICKED=$(/usr/bin/osascript <<'OSA' 2>/dev/null || true
try
  set theFile to choose file with prompt "Open a document:" with multiple selections allowed
  set out to ""
  repeat with f in theFile
    set out to out & POSIX path of f & linefeed
  end repeat
  return out
on error
  return ""
end try
OSA
)

PICKED="${PICKED%$'\n'}"
if [[ -z "$PICKED" ]]; then
  exit 0
fi

# Code-y extensions → open in VS Code so Firaz lands in his editor.
# Everything else → default macOS app (preview for pdf/img, etc).
CODE_EXT='\.(ts|tsx|js|jsx|mjs|cjs|json|md|mdx|toml|yaml|yml|sh|zsh|bash|py|rs|go|java|kt|swift|c|h|cpp|hpp|html|css|scss|sql|conf|env|gitignore|dockerfile|prisma)$'

while IFS= read -r p; do
  [[ -z "$p" ]] && continue
  if [[ "$p" =~ $CODE_EXT ]] || [[ "${p,,}" == *"/dockerfile" ]]; then
    /usr/bin/open -a "Visual Studio Code" "$p" 2>/dev/null || /usr/bin/open "$p"
  else
    /usr/bin/open "$p"
  fi
done <<< "$PICKED"
